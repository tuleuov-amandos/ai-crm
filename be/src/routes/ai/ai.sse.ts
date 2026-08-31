import { Response } from 'express'
import { Logger } from '@nestjs/common'
import type { Redis } from 'ioredis'
import { createRedis } from '../../common/providers/redis.provider'

type Subscriber = { res: Response; interval: NodeJS.Timeout }

const log = new Logger('AiSse')

// Redis Pub/Sub channel used to relay AI events emitted by the standalone
// worker process to the HTTP process(es) that actually hold the SSE
// connections. SSE subscribers live in the in-process `subscribers` map, so a
// worker running in a separate process cannot reach them directly.
const SSE_BRIDGE_CHANNEL = 'ai:sse-bridge'

type BridgeMessage = {
  tenantId: string
  dealId: string
  event: string
  payload: unknown
}

const subscribers = new Map<string, Set<Subscriber>>()

function keyFor(tenantId: string, dealId: string) {
  return `${tenantId}:${dealId}`
}

function sendEvent(res: Response, event: string, data: unknown) {
  try {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  } catch (err) {
    log.warn('Failed to write SSE event', err)
  }
}

export function subscribeToAiStream(tenantId: string, dealId: string, res: Response) {
  const k = keyFor(tenantId, dealId)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  // disable nginx buffering
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  // send connected event
  sendEvent(res, 'ai-connected', { message: 'connected' })

  const interval = setInterval(() => {
    sendEvent(res, 'heartbeat', { ts: Date.now() })
  }, 15_000)

  const sub: Subscriber = { res, interval }
  const set = subscribers.get(k) ?? new Set()
  set.add(sub)
  subscribers.set(k, set)

  const cleanup = () => {
    clearInterval(interval)
    const s = subscribers.get(k)
    if (s) {
      s.delete(sub)
      if (s.size === 0) subscribers.delete(k)
    }
  }

  res.on('close', () => {
    cleanup()
  })

  return cleanup
}

export function publishAiEvent(tenantId: string, dealId: string, event: string, payload: unknown) {
  const k = keyFor(tenantId, dealId)
  const set = subscribers.get(k)
  if (!set || set.size === 0) return false
  for (const sub of set) {
    sendEvent(sub.res, event, payload)
    if (event === 'ai-complete' || event === 'ai-error') {
      try {
        sub.res.end()
      } catch (e) {
        // ignore
      }
      clearInterval(sub.interval)
    }
  }
  // remove all subscribers for this key after complete/error
  if (event === 'ai-complete' || event === 'ai-error') subscribers.delete(k)
  return true
}

export function getSubscriberCount(tenantId: string, dealId: string) {
  const k = keyFor(tenantId, dealId)
  return subscribers.get(k)?.size ?? 0
}

// ─── Cross-process bridge (worker → HTTP) ────────────────────────────────────

let bridgePublisher: Redis | null = null

/**
 * Publishes an AI event over Redis so it can be delivered to SSE clients that
 * are connected to a different process (the HTTP API). Use this from the
 * standalone worker instead of `publishAiEvent`, which only reaches subscribers
 * in the current process.
 */
export function publishAiEventRemote(tenantId: string, dealId: string, event: string, payload: unknown) {
  if (!bridgePublisher) {
    bridgePublisher = createRedis()
    bridgePublisher.on('error', (err) => log.warn('SSE bridge publisher error', err))
  }
  const message: BridgeMessage = { tenantId, dealId, event, payload }
  return bridgePublisher.publish(SSE_BRIDGE_CHANNEL, JSON.stringify(message))
}

/**
 * Subscribes the current (HTTP) process to the Redis bridge channel and relays
 * every received event to local SSE subscribers. Call this once during
 * application bootstrap. Returns the subscriber connection so callers can close
 * it on shutdown if desired.
 */
export function initAiSseBridge(): Redis {
  const sub = createRedis()

  sub.on('error', (err) => log.warn('SSE bridge subscriber error', err))

  sub.subscribe(SSE_BRIDGE_CHANNEL, (err) => {
    if (err) {
      log.error(`Failed to subscribe to ${SSE_BRIDGE_CHANNEL}`, err.stack)
    } else {
      log.log(`AI SSE bridge active on channel "${SSE_BRIDGE_CHANNEL}"`)
    }
  })

  sub.on('message', (channel, raw) => {
    if (channel !== SSE_BRIDGE_CHANNEL) return
    try {
      const { tenantId, dealId, event, payload } = JSON.parse(raw) as BridgeMessage
      publishAiEvent(tenantId, dealId, event, payload)
    } catch (err) {
      log.warn('Failed to relay SSE bridge message', err)
    }
  })

  return sub
}

export default { subscribeToAiStream, publishAiEvent, publishAiEventRemote, initAiSseBridge, getSubscriberCount }
