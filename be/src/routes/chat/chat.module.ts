import { Module } from '@nestjs/common'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { ChatRepository } from './chat.repo'
import { ChatGateway } from './chat.gateway'
import { WsJwtGuard } from 'src/common/guards/ws-jwt.guard'

@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, ChatGateway, WsJwtGuard],
})
export class ChatModule {}
