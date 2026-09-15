import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/services/prisma.service'
import { GetMyTasksQueryType } from './tasks.model'

@Injectable()
export class TasksRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findMineByTenant(tenantId: string, userId: string, query: GetMyTasksQueryType) {
    const where = {
      tenantId,
      assigneeId: userId,
      ...(query.done !== undefined && { done: query.done }),
    }
    const orderBy =
      query.sort === 'dueDate_desc'
        ? [{ dueDate: 'desc' as const }, { id: 'desc' as const }]
        : [{ dueDate: 'asc' as const }, { id: 'desc' as const }]

    const [data, total] = await this.prismaService.$transaction([
      this.prismaService.task.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy,
        include: {
          deal: {
            select: {
              id: true,
              title: true,
              contact: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prismaService.task.count({ where }),
    ])

    return { data, total }
  }
}
