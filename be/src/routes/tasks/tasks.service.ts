import { Injectable } from '@nestjs/common'
import { TasksRepository } from './tasks.repo'
import { GetMyTasksQueryType, GetMyTasksResType } from './tasks.model'

@Injectable()
export class TasksService {
  constructor(private readonly tasksRepo: TasksRepository) {}

  async getMine(tenantId: string, userId: string, query: GetMyTasksQueryType): Promise<GetMyTasksResType> {
    const { data, total } = await this.tasksRepo.findMineByTenant(tenantId, userId, query)
    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
    }
  }
}
