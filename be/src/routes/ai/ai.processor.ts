import { Worker } from 'bullmq'
import { Sentry, isConnectionError, captureThrottled } from '../../instrument'
import { rootLogger } from '../../common/logger/root-logger'
import { createRedis } from '../../common/providers/redis.provider'
import { AI_QUEUE_NAME } from './ai.queue'
import { PrismaService } from '../../common/services/prisma.service'
import { saveAiResultAtomic } from './ai.service'
// Runs in the standalone worker process, which has no local SSE subscribers,
// so events are pushed to the HTTP process over Redis Pub/Sub.
import { publishAiEventRemote as publishAiEvent } from './ai.sse'
import { z } from 'zod'
import { openai, AI_MODEL } from './ai.client'

const log = rootLogger.child({ context: 'AiProcessor' })
const OPENAI_TIMEOUT_MS = 30_000
// A Redis outage makes the worker emit `error` continuously while it retries.
// Log every one (useful locally) but only forward one to Sentry per 5 min per
// error code, so a blip doesn't burn the monthly quota on identical events.
const WORKER_CONN_ERROR_SENTRY_WINDOW_MS = 300_000

const AiResponseSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        dueDate: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
  emailDraft: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
})

type AiResponseType = z.infer<typeof AiResponseSchema>

class CustomAiError extends Error {
  code?: string
  raw?: unknown
  details?: { first: string; retry: string }
  status?: number
}

function withTimeout<T>(promise: Promise<T>, ms = OPENAI_TIMEOUT_MS) {
  return Promise.race([promise, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('OpenAI timeout')), ms))])
}

const MODEL = AI_MODEL

async function callOpenAiAndParse(meetingNote: string): Promise<AiResponseType> {
  const prompt = `
    You are an assistant that extracts actionable items from a meeting note.
    \nReturn ONLY a single valid JSON object (no explanation) with keys:
    \n{\n  "tasks": [
    { 
      "title": "<string>",
      "dueDate": "<ISO-8601 or null>" 
    }],
  "emailDraft": "<string>",
  "summary": "<string>"\n}\nNote: You MUST write a detailed follow-up email draft in Vietnamese under "emailDraft", and a brief summary in Vietnamese under "summary". Do not set them to null.\nMeeting Note:\n"""${meetingNote}"""\n`

  const doCall = async () => {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0,
      max_tokens: 800,
    })
    const content = resp.choices?.[0]?.message?.content
    if (!content) throw new Error('No content from OpenAI')
    return String(content)
  }

  let text: string
  try {
    text = await withTimeout(doCall())
  } catch (err) {
    const e = new CustomAiError('OpenAI timeout or network error')
    e.code = 'OPENAI_TIMEOUT'
    e.raw = err
    throw e
  }

  const extractJson = (s: string) => {
    const m = s.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('No JSON object found in model output')
    return JSON.parse(m[0])
  }

  try {
    const parsed = extractJson(text)
    const validated = AiResponseSchema.parse(parsed)
    return validated
  } catch (firstErr) {
    try {
      const retryPrompt = `
      The previous output was not valid JSON. 
      Reply with only a single valid JSON object matching schema 
      {
        "tasks": [
          {"title":"string","dueDate":"ISO-8601 or null"}
        ],
        "emailDraft":"string",
        "summary":"string"
      }. 
      All texts must be written in Vietnamese. Meeting note:\n"""${meetingNote}"""
      `
      const retryResp = await withTimeout(
        openai.chat.completions.create({
          model: MODEL,
          messages: [{ role: 'user', content: retryPrompt }],
          temperature: 0.0,
          max_tokens: 800,
        }),
      )
      const retryText = String(retryResp.choices?.[0]?.message?.content || '')
      const parsed2 = extractJson(retryText)
      const validated2 = AiResponseSchema.parse(parsed2)
      return validated2
    } catch (secondErr) {
      const e = new CustomAiError('OpenAI returned invalid JSON after retry')
      e.details = { first: (firstErr as Error).message, retry: (secondErr as Error).message }
      throw e
    }
  }
}

/**
 * Creates and starts the BullMQ worker for the AI analysis queue.
 *
 * This is invoked explicitly from the standalone worker entrypoint
 * (`src/worker.ts`) instead of running as an import side effect inside the
 * HTTP process, so the API and the worker can be deployed and scaled as
 * independent services.
 */
export function startAiWorker(): Worker {
  const connection = createRedis()
  const prisma = new PrismaService()

  const worker = new Worker(
    AI_QUEUE_NAME,
    async (job) => {
      const { jobId, dealId, tenantId, meetingNote } = job.data as {
        jobId: string
        dealId: string
        tenantId: string
        meetingNote: string
      }

      // Per-job child logger — `jobId` is the correlation id for the queue
      // path (the equivalent of `requestId` on the HTTP path). The meeting
      // note itself is user content and is deliberately never logged.
      const jobLog = log.child({ jobId, dealId, tenantId })

      let aiResult: AiResponseType | null = null
      try {
        aiResult = await callOpenAiAndParse(meetingNote)
      } catch (err) {
        const error = err as CustomAiError
        const rawErrorObj = error.raw as Record<string, any> | undefined
        const status = rawErrorObj?.status || error.status
        let reason = error.code || status || 'OPENAI_ERROR'

        if (error.code === 'OPENAI_TIMEOUT') {
          jobLog.error({ reason: 'OPENAI_TIMEOUT', err: error.raw }, 'OpenAI timeout')
          reason = 'OPENAI_TIMEOUT'
          // Fire-and-forget: this is the remote (Redis Pub/Sub) publisher, so it
          // returns a promise. A failed notify must not mask the original AI
          // error we are about to rethrow — just log it. The job still fails and
          // BullMQ will surface it.
          publishAiEvent(tenantId, dealId, 'ai-error', {
            message: 'Phân tích AI mất quá nhiều thời gian. Vui lòng thử lại.',
            jobId,
            reason,
          }).catch((e) => {
            jobLog.error({ err: e }, 'Failed to publish SSE ai-error for timeout')
          })
          throw new Error(reason)
        }

        if (status === 401 || status === 403) {
          jobLog.error({ status, reason: 'OPENAI_AUTH_ERROR', message: error.message }, 'OpenAI auth error')
          Sentry.captureException(err, { tags: { area: 'ai-processor', jobId, dealId, reason: 'OPENAI_AUTH_ERROR' } })
          reason = 'OPENAI_AUTH_ERROR'
          publishAiEvent(tenantId, dealId, 'ai-error', {
            message: 'Dịch vụ AI tạm thời không khả dụng. Vui lòng liên hệ admin.',
            jobId,
            reason,
          }).catch((e) => {
            jobLog.error({ err: e }, 'Failed to publish SSE ai-error for auth')
          })
          throw new Error(reason)
        }

        if (status === 429) {
          jobLog.warn({ status, reason: 'OPENAI_RATE_LIMIT' }, 'OpenAI rate limit')
          reason = 'OPENAI_RATE_LIMIT'
          publishAiEvent(tenantId, dealId, 'ai-error', {
            message: 'Dịch vụ AI tạm thời không khả dụng. Vui lòng thử lại sau vài phút.',
            jobId,
            reason,
          }).catch((e) => {
            jobLog.error({ err: e }, 'Failed to publish SSE ai-error for rate limit')
          })
          throw new Error(reason)
        }

        jobLog.error({ message: error.message, details: error.details }, 'OpenAI parse/response error')
        Sentry.captureException(err, { tags: { area: 'ai-processor', jobId, dealId, reason: String(reason) } })
        publishAiEvent(tenantId, dealId, 'ai-error', {
          message: 'Dịch vụ AI tạm thời không khả dụng. Vui lòng thử lại.',
          jobId,
          reason,
        }).catch((e) => {
          jobLog.error({ err: e }, 'Failed to publish SSE ai-error for generic OpenAI error')
        })
        throw err
      }

      try {
        await saveAiResultAtomic(prisma, aiResult, jobId, tenantId, dealId, meetingNote)
        await connection.incr(`cache:tenant_version:${tenantId}`)
        // Publish ai-complete to any SSE subscribers. The DB write already
        // succeeded, so a failed notify is non-fatal — the client will still get
        // the result on its next poll/refetch. Log it and let the job succeed.
        publishAiEvent(tenantId, dealId, 'ai-complete', {
          tasks: aiResult.tasks ?? [],
          emailDraft: aiResult.emailDraft ?? null,
          summary: aiResult.summary ?? null,
          jobId,
        }).catch((e) => {
          jobLog.error({ err: e }, 'Failed to publish SSE ai-complete')
        })

        jobLog.info({ taskCount: aiResult.tasks?.length ?? 0 }, 'AI job completed')
        return { ok: true }
      } catch (err) {
        jobLog.error({ err }, 'DB transaction failed')
        Sentry.captureException(err, { tags: { area: 'ai-processor', jobId, dealId, reason: 'DB_TRANSACTION_FAILED' } })
        publishAiEvent(tenantId, dealId, 'ai-error', {
          message: 'Lưu kết quả AI thất bại. Vui lòng thử lại.',
          jobId,
        }).catch((e) => {
          jobLog.error({ err: e }, 'Failed to publish SSE ai-error')
        })
        throw new Error(`DB transaction failed: ${String((err as Error).message || err)}`)
      }
    },
    { connection: connection as any, concurrency: 2 },
  )

  worker.on('error', (err) => {
    log.error({ err }, 'AI worker error')
    if (isConnectionError(err)) {
      const code = (err as NodeJS.ErrnoException).code ?? err.name ?? 'unknown'
      captureThrottled(err, `ai-worker-conn:${code}`, WORKER_CONN_ERROR_SENTRY_WINDOW_MS, {
        tags: { area: 'ai-processor', kind: 'worker-connection-error', code },
      })
    } else {
      Sentry.captureException(err, { tags: { area: 'ai-processor', kind: 'worker-error' } })
    }
  })
  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id ?? 'unknown', err }, 'AI job failed')
  })
  worker.on('ready', () => {
    log.info(`AI worker ready, listening on queue "${AI_QUEUE_NAME}"`)
  })

  return worker
}
