import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/common/services/prisma.service'
import { Prisma } from '../../../generated/prisma-client/client'
import type { DealStage } from '../../../generated/prisma-client/enums'
import { CreateDealBodyType, DealStageType, UpdateDealBodyType } from './deal.model'
import { findFirstOpenStage } from 'src/common/pipeline-stages/default-pipeline-stages'

// Dual write (R1): the PipelineStage a deal goes into and the legacy
// Deal.stage value written next to it (legacyDealStageFor).
export type DealStageTarget = { stageId: string; stage: DealStage }

@Injectable()
export class DealRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findAllByTenant(filters?: {
    ownerId?: string
    dateFrom?: string
    dateTo?: string
    search?: string
    isPaid?: boolean
    // Opt-in: only the board hides archived deals.
    excludeArchived?: boolean
  }) {
    return this.prismaService.deal.findMany({
      where: {
        deletedAt: null,
        ...(filters?.excludeArchived && { archivedAt: null }),
        ...(filters?.ownerId && { ownerId: filters.ownerId }),
        ...(filters?.isPaid !== undefined && { isPaid: filters.isPaid }),
        ...((filters?.dateFrom || filters?.dateTo) && {
          closeDate: {
            ...(filters?.dateFrom && { gte: new Date(filters.dateFrom) }),
            ...(filters?.dateTo && { lte: new Date(filters.dateTo) }),
          },
        }),
        ...(filters?.search && {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { contact: { name: { contains: filters.search, mode: 'insensitive' } } },
            { contact: { company: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }),
      },
      include: {
        contact: { select: { id: true, name: true, company: true, phone: true, address: true, city: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  findDealsByStage(stage: DealStageType, filters?: { ownerId?: string }) {
    return this.prismaService.deal.findMany({
      where: {
        stage: stage,
        deletedAt: null,
        ...(filters?.ownerId && { ownerId: filters.ownerId }),
      },
      include: {
        contact: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    })
  }

  findOne(dealId: string, filters?: { ownerId?: string }) {
    return this.prismaService.deal.findFirst({
      where: {
        id: dealId,
        deletedAt: null,
        ...(filters?.ownerId && { ownerId: filters.ownerId }),
      },
      include: {
        contact: true,
        owner: { select: { id: true, name: true, email: true } },
        tasks: {
          orderBy: { createdAt: 'asc' },
          include: { assignee: { select: { id: true, name: true, email: true } } },
        },
        activities: { orderBy: { date: 'desc' }, take: 20 },
        aiSuggestions: { orderBy: { createdAt: 'desc' } },
      },
    })
  }

  // Stage lookups for deal writes; tenantId is always explicit, so a stageId of
  // another tenant is never found.
  findStageById(tenantId: string, stageId: string) {
    return this.prismaService.pipelineStage.findFirst({
      where: { id: stageId, tenantId },
      select: { id: true, kind: true, legacyKey: true },
    })
  }

  findFirstOpenStage(tenantId: string) {
    return findFirstOpenStage(this.prismaService, tenantId)
  }

  // Non-throwing: a tenant may have deleted the default stage with this key.
  findStageByLegacyKey(tenantId: string, legacyKey: DealStageType) {
    return this.prismaService.pipelineStage.findFirst({
      where: { tenantId, legacyKey },
      select: { id: true },
    })
  }

  create(data: CreateDealBodyType, target: DealStageTarget) {
    return this.prismaService.deal.create({
      data: {
        ownerId: data.ownerId,
        title: data.title,
        value: data.value ?? 0,
        stage: target.stage,
        stageId: target.stageId,
        contactId: data.contactId,
        closeDate: data.closeDate ?? null,
        note: data.note ?? null,
      } as Prisma.DealUncheckedCreateInput,
    })
  }

  update(dealId: string, data: UpdateDealBodyType) {
    return this.prismaService.deal.update({
      where: { id: dealId, deletedAt: null },
      data,
    })
  }

  updateStage(dealId: string, target: DealStageTarget) {
    return this.prismaService.deal.update({
      where: { id: dealId, deletedAt: null },
      data: { stage: target.stage, stageId: target.stageId },
    })
  }

  updatePaymentStatus(dealId: string, isPaid: boolean) {
    return this.prismaService.deal.update({
      where: { id: dealId, deletedAt: null },
      data: { isPaid },
    })
  }

  softDelete(dealId: string) {
    return this.prismaService.deal.update({
      where: { id: dealId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  }

  // Bulk archive / unarchive. tenantId and deletedAt are explicit, not left to
  // the tenant extension; ids that do not match are skipped. Returns { count }.
  archiveMany(tenantId: string, dealIds: string[], filters?: { ownerId?: string }) {
    return this.prismaService.deal.updateMany({
      where: {
        id: { in: dealIds },
        tenantId,
        deletedAt: null,
        archivedAt: null,
        ...(filters?.ownerId && { ownerId: filters.ownerId }),
      },
      data: { archivedAt: new Date() },
    })
  }

  unarchiveMany(tenantId: string, dealIds: string[], filters?: { ownerId?: string }) {
    return this.prismaService.deal.updateMany({
      where: {
        id: { in: dealIds },
        tenantId,
        deletedAt: null,
        archivedAt: { not: null },
        ...(filters?.ownerId && { ownerId: filters.ownerId }),
      },
      data: { archivedAt: null },
    })
  }

  // Create new Deal in an already resolved stage (for Excel Import)
  createWithStage(
    data: {
      ownerId: string
      title: string
      value: number
      contactId: string
      closeDate?: Date | null
      note?: string | null
    } & DealStageTarget,
  ) {
    return this.prismaService.deal.create({
      data: {
        ownerId: data.ownerId,
        title: data.title,
        value: data.value,
        stage: data.stage,
        stageId: data.stageId,
        contactId: data.contactId,
        closeDate: data.closeDate ?? null,
        note: data.note ?? null,
      } as Prisma.DealUncheckedCreateInput,
    })
  }
}
