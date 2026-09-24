import { Logger } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { OnEvent } from '@nestjs/event-emitter'
import { Server, Socket } from 'socket.io'
import { ClsService } from 'nestjs-cls'
import { AppException, ValidationErrorCode } from 'src/common/errors'
import { corsOriginValidator } from 'src/common/utils/cors-origin.util'
import { WsAuthenticatedUser, WsJwtGuard } from 'src/common/guards/ws-jwt.guard'
import { ChannelReadEventPayload, ChatService, CHANNEL_READ_EVENT, MESSAGE_CREATED_EVENT } from './chat.service'
import { CreateMessageBodySchema, MessageBaseType } from './chat.model'

function channelRoom(tenantId: string, channelId: string) {
  return `tenant_${tenantId}_channel_${channelId}`
}

// Push-only layer on top of the REST chat API (chat.controller.ts /
// chat.service.ts): every event here either reads through ChatService or
// calls the exact same ChatService methods the REST endpoints call, so
// Postgres (via ChatService) stays the single source of truth. This gateway
// never persists anything on its own.
@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: corsOriginValidator, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name)

  @WebSocketServer()
  server: Server

  constructor(
    private readonly chatService: ChatService,
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly cls: ClsService,
  ) {}

  // Autojoin: right after authenticating, the socket joins the room of every
  // channel this user can see (same list as GET /chat/channels, so private
  // channels only appear if the user is a member). The socket connection is
  // dashboard-wide, so live `newMessage` events (unread badges etc.) must
  // reach it without the user opening a specific channel first.
  // handleJoinChannel stays for explicit joins; re-joining a room the socket
  // is already in is a no-op in Socket.IO.
  //
  // KNOWN LIMITATION (intentionally not handled): rooms are computed once, at
  // connection time. If the user is added to a private channel
  // (POST /chat/channels/:id/members) or a new public channel is created
  // while their socket is already open, that socket is NOT subscribed to the
  // new room until it reconnects (page reload, network drop/restore). It
  // self-heals and is non-critical.
  //
  // SCALING NOTE: this only broadcasts to sockets connected to *this*
  // process, and the autojoin above only joins rooms on the instance the
  // socket connected to. If the backend ever runs on more than one Railway
  // instance, `server.to(room).emit(...)` will miss clients parked on other
  // instances, and autojoin must run on whichever instance a socket
  // (re)connects to (it does, since it runs in handleConnection). At that
  // point, wire up @socket.io/redis-adapter here (in afterInit), backed by
  // the ioredis connection already used for BullMQ, via
  // `server.adapter(createAdapter(pubClient, subClient))`. Not added now —
  // premature at a single instance.
  async handleConnection(client: Socket) {
    let user: WsAuthenticatedUser
    try {
      user = this.wsJwtGuard.authenticate(client)
      client.data.user = user
    } catch (error) {
      this.logger.warn(`WS handshake rejected: ${error instanceof Error ? error.message : 'invalid token'}`)
      client.emit('error', { message: 'Unauthorized' })
      client.disconnect(true)
      return
    }

    try {
      // Like sendMessage: the tenant-isolation Prisma extension reads
      // tenantId from CLS, which doesn't exist outside the HTTP pipeline.
      const channels = await this.cls.run(async () => {
        this.cls.set('tenantId', user.tenantId)
        return (await this.chatService.listChannels(user.tenantId, user.userId)).data
      })
      for (const channel of channels) {
        await client.join(channelRoom(user.tenantId, channel.id))
      }
      // TEMP diagnostics
      this.logger.log(
        `WS autojoin: user ${user.userId} (tenant ${user.tenantId}) joined channels [${channels.map((c) => c.id).join(', ')}]`,
      )
    } catch (error) {
      // Degrade, don't fail: the socket stays connected, just without
      // pre-joined rooms (explicit joinChannel still works).
      this.logger.warn(
        `WS autojoin failed for user ${user.userId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }

  handleDisconnect() {
    // Socket.io removes the socket from all of its rooms automatically.
  }

  @SubscribeMessage('joinChannel')
  async handleJoinChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    const user = this.requireUser(client)
    if (!user || !channelId) return

    try {
      // Without this check any authenticated user of any tenant could join
      // `tenant_<other>_channel_<id>` just by knowing/guessing a channel id.
      // For a private channel this also enforces membership, so a
      // non-member can't join the realtime room either.
      await this.chatService.getChannelForTenant(user.tenantId, channelId, user.userId)
    } catch (error) {
      return this.emitError(client, error)
    }

    await client.join(channelRoom(user.tenantId, channelId))
  }

  @SubscribeMessage('leaveChannel')
  async handleLeaveChannel(@ConnectedSocket() client: Socket, @MessageBody() channelId: string) {
    const user = this.requireUser(client)
    if (!user || !channelId) return
    await client.leave(channelRoom(user.tenantId, channelId))
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId?: string; content?: string },
  ) {
    const user = this.requireUser(client)
    if (!user) return

    if (!payload?.channelId) {
      return client.emit('error', { code: ValidationErrorCode.FAILED, message: 'channelId is required' })
    }

    const parsed = CreateMessageBodySchema.safeParse({ content: payload.content })
    if (!parsed.success) {
      return client.emit('error', {
        code: ValidationErrorCode.FAILED,
        message: parsed.error.issues[0]?.message ?? 'Invalid message',
      })
    }

    try {
      // ChatRepository.createMessage relies on PrismaService's tenant-
      // isolation extension, which reads tenantId off CLS (normally set by
      // TenantInterceptor from the HTTP request). A WebSocket event never
      // passes through Nest's HTTP pipeline, so there is no CLS context here
      // at all unless one is opened explicitly — without this, the insert
      // would be missing a required tenantId and fail outright.
      await this.cls.run(async () => {
        this.cls.set('tenantId', user.tenantId)
        await this.chatService.createMessage(user.tenantId, payload.channelId, user.userId, parsed.data.content)
      })
    } catch (error) {
      this.emitError(client, error)
    }
    // No direct room emit here: ChatService.createMessage fires
    // MESSAGE_CREATED_EVENT after the write commits, and
    // handleMessageCreated below does the actual broadcast — the same path
    // is used whether the message came from this gateway or from the REST
    // endpoint (see chat.service.ts).
  }

  @OnEvent(MESSAGE_CREATED_EVENT)
  async handleMessageCreated(message: MessageBaseType) {
    const roomName = channelRoom(message.tenantId, message.channelId)
    // TEMP diagnostics: log the room size right before emitting.
    const size = (await this.server.in(roomName).allSockets()).size
    this.logger.log(`WS broadcast: room ${roomName} has ${size} socket(s), emitting newMessage id=${message.id}`)
    this.server.to(roomName).emit('newMessage', message)
  }

  // Lets everyone else currently viewing the channel update the read-receipt
  // status under their own messages without reopening the channel.
  @OnEvent(CHANNEL_READ_EVENT)
  handleChannelRead({ tenantId, channelId, userId, lastReadAt }: ChannelReadEventPayload) {
    this.server.to(channelRoom(tenantId, channelId)).emit('channelRead', { channelId, userId, lastReadAt })
  }

  private requireUser(client: Socket): WsAuthenticatedUser | undefined {
    const user = client.data.user as WsAuthenticatedUser | undefined
    if (!user) {
      client.emit('error', { message: 'Unauthorized' })
      client.disconnect(true)
      return undefined
    }
    return user
  }

  private emitError(client: Socket, error: unknown) {
    if (error instanceof AppException) {
      const response = error.getResponse()
      client.emit('error', typeof response === 'string' ? { message: response } : response)
      return
    }
    this.logger.error(error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error))
    client.emit('error', { message: 'Internal error' })
  }
}
