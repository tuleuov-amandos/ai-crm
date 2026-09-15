import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOkResponse } from '@nestjs/swagger'
import { ZodSerializerDto } from 'nestjs-zod'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { TenantStatusGuard } from 'src/common/guards/tenant-status.guard'
import { CurrentUser } from 'src/common/decorators/current-user.decorator'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { TasksService } from './tasks.service'
import { GetMyTasksQueryDto, GetMyTasksResDto } from './tasks.dto'

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, TenantStatusGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // GET /tasks/mine?page=1&limit=20&sort=dueDate_asc&done=false
  @Get('mine')
  @ApiOkResponse({ type: GetMyTasksResDto })
  @ZodSerializerDto(GetMyTasksResDto)
  getMine(@CurrentUser() user: AccessTokenPayload, @Query() query: GetMyTasksQueryDto) {
    return this.tasksService.getMine(user.tenantId, user.userId, query)
  }
}
