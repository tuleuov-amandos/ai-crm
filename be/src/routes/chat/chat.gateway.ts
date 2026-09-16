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
import { ChatService, MESSAGE_CREATED_EVENT } from './chat.service'
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

  // SCALING NOTE: this only broadcasts to sockets connected to *this*
  // process. If the backend ever runs on more than one Railway instance,
  // `server.to(room).emit(...)` will miss clients parked on other instances.
  // At that point, wire up @socket.io/redis-adapter here (in afterInit),
  // backed by the ioredis connection already used for BullMQ, via
  // `server.adapter(createAdapter(pubClient, subClient))`. Not added now —
  // premature at a single instance.
  handleConnection(client: Socket) {
    try {
      client.data.user = this.wsJwtGuard.authenticate(client)
    } catch (error) {
      this.logger.warn(`WS handshake rejected: ${error instanceof Error ? error.message : 'invalid token'}`)
      client.emit('error', { message: 'Unauthorized' })
      client.disconnect(true)
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
      await this.chatService.getChannelForTenant(user.tenantId, channelId)
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
  handleMessageCreated(message: MessageBaseType) {
    this.server.to(channelRoom(message.tenantId, message.channelId)).emit('newMessage', message)
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
