import { Module } from '@nestjs/common'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { TasksRepository } from './tasks.repo'

@Module({
  controllers: [TasksController],
  providers: [TasksService, TasksRepository],
})
export class TasksModule {}
