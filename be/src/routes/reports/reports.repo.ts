import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/services/prisma.service'
import type { PipelineStageKind } from '../../../generated/prisma-client/enums'

// Deal queries pass tenantId explicitly on top of the Prisma tenant extension,
// like the pipeline stage and deal repositories. Won/lost deals are picked by
// the kind of their PipelineStage, never by the legacy Deal.stage column.
@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findDealsInPeriod(tenantId: string, start: Date, end: Date, userFilter: Record<string, any>) {
    return this.prisma.deal.findMany({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: { gte: start, lte: end },
        ...userFilter,
      },
      include: {
        activities: {
          select: {
            id: true,
          },
        },
      },
    })
  }

  findKpiTargets(userFilter: Record<string, any>) {
    return this.prisma.kpiTarget.findMany({
      where: {
        ...userFilter,
      },
    })
  }

  findTopWonDeals(tenantId: string, start: Date, end: Date, userFilter: Record<string, any>, take: number) {
    return this.prisma.deal.findMany({
      where: {
        tenantId,
        pipelineStage: { tenantId, kind: 'WON' },
        closeDate: { gte: start, lte: end },
        deletedAt: null,
        ...userFilter,
      },
      include: {
        contact: { select: { company: true } },
        owner: { select: { id: true, name: true } },
        pipelineStage: { select: { id: true, name: true } },
      },
      orderBy: { value: 'desc' },
      take,
    })
  }

  findUsers(userFilter: Record<string, any>) {
    return this.prisma.user.findMany({
      where: {
        ...userFilter,
        deletedAt: null,
      },
      select: { id: true, name: true, role: true },
    })
  }

  findUserClosedDeals(tenantId: string, userId: string, kind: PipelineStageKind, start: Date, end: Date) {
    return this.prisma.deal.findMany({
      where: {
        tenantId,
        ownerId: userId,
        pipelineStage: { tenantId, kind },
        closeDate: { gte: start, lte: end },
        deletedAt: null,
      },
    })
  }

  countUserActivities(userId: string, start: Date, end: Date) {
    return this.prisma.activity.count({
      where: {
        userId,
        date: { gte: start, lte: end },
      },
    })
  }

  upsertKpiTarget(tenantId: string, userId: string, month: number, year: number, target: number) {
    return this.prisma.kpiTarget.upsert({
      where: {
        tenantId_userId_month_year: {
          tenantId,
          userId,
          month,
          year,
        },
      },
      update: { target },
      create: { tenantId, userId, month, year, target },
    })
  }

  findAllDeals(tenantId: string, userFilter: Record<string, any>) {
    return this.prisma.deal.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...userFilter,
      },
    })
  }

  findKpiTargetsForYear(year: number, userFilter: Record<string, any>) {
    return this.prisma.kpiTarget.findMany({
      where: {
        year,
        ...userFilter,
      },
    })
  }

  findActivities(start: Date, end: Date, userFilter: Record<string, any>) {
    return this.prisma.activity.findMany({
      where: {
        date: { gte: start, lte: end },
        ...userFilter,
      },
    })
  }

  findTasks(start: Date, end: Date, isSalesRep: boolean, userId: string) {
    return this.prisma.task.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ...(isSalesRep
          ? {
              deal: {
                ownerId: userId,
              },
            }
          : {}),
      },
    })
  }
}
