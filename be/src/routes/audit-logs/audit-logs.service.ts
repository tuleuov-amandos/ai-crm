import { Injectable } from '@nestjs/common'
import { Prisma } from '../../../generated/prisma-client/client'
import { AuditLogsRepository } from './audit-logs.repo'
import { AuditLogChanges, GetAuditLogsQueryType } from './audit-logs.model'

@Injectable()
export class AuditLogsService {
  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

  // Pass `tx` to write the entry inside the caller's transaction.
  async logAction(
    params: {
      tenantId: string
      userId: string
      action: string
      targetType: string
      targetId: string
      targetName?: string | null
      changes: AuditLogChanges
    },
    tx?: Pick<Prisma.TransactionClient, 'auditLog'>,
  ) {
    return this.auditLogsRepository.create(params, tx)
  }

  async getLogs(tenantId: string, query: GetAuditLogsQueryType) {
    const limit = query.limit || 20
    const { cursor, action, targetType, userId, search } = query

    const logs = await this.auditLogsRepository.getLogsByTenant({
      tenantId,
      query: {
        limit,
        cursor,
        action,
        targetType,
        userId,
        search,
      },
    })

    const hasNextPage = logs.length > limit
    const data = hasNextPage ? logs.slice(0, -1) : logs
    const nextCursor = hasNextPage ? logs[logs.length - 1].id : null

    return {
      data,
      pagination: {
        nextCursor,
        hasNextPage,
      },
    }
  }
}
