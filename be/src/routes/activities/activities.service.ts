import { Injectable } from '@nestjs/common'
import { ActivityErrorCode, AppException, ContactErrorCode, DealErrorCode } from 'src/common/errors'
import { PrismaClientKnownRequestError } from '../../../generated/prisma-client/internal/prismaNamespace'
import { ActivitiesRepository } from './activities.repo'
import {
  CreateActivityForContactBodyType,
  CreateActivityForDealBodyType,
  UpdateActivityBodyType,
  GetActivitiesQueryType,
  GetActivitiesPaginatedResType,
} from './activities.model'
import { ActivityWithRelations } from './activities.repo'
import { ContactsRepository } from '../contacts/contacts.repo'
import { DealRepository } from '../deal/deal.repo'
import { RedisService } from 'src/common/services/redis.service'
import { CaslAbilityFactory } from 'src/common/casl/casl-ability.factory'
import { subject } from '@casl/ability'

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly activitiesRepo: ActivitiesRepository,
    private readonly contactsRepo: ContactsRepository,
    private readonly dealRepo: DealRepository,
    private readonly redisService: RedisService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  async createForContact(
    tenantId: string,
    contactId: string,
    userId: string,
    body: CreateActivityForContactBodyType,
    user: { userId: string; role: string; tenantId: string },
  ): Promise<ActivityWithRelations> {
    const contact = await this.contactsRepo.findOne(contactId)
    if (!contact) throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('read', subject('Contact', contact as any))) {
      throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')
    }

    const activity = await this.activitiesRepo.create(userId, body, { contactId })
    await this.redisService.invalidateTenantCache(tenantId)
    return activity
  }

  async createForDeal(
    tenantId: string,
    dealId: string,
    userId: string,
    body: CreateActivityForDealBodyType,
    user: { userId: string; role: string; tenantId: string },
  ): Promise<ActivityWithRelations> {
    const deal = await this.dealRepo.findOne(dealId)
    if (!deal) throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('read', subject('Deal', deal as any))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    if (body.contactId) {
      const contact = await this.contactsRepo.findOne(body.contactId)
      if (!contact || ability.cannot('read', subject('Contact', contact as any))) {
        throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')
      }
    }

    const targetContactId = body.contactId || deal.contactId

    const activity = await this.activitiesRepo.create(userId, body, {
      dealId,
      contactId: targetContactId,
    })
    await this.redisService.invalidateTenantCache(tenantId)
    return activity
  }

  async getByContact(
    tenantId: string,
    contactId: string,
    user: { userId: string; role: string; tenantId: string },
  ): Promise<{ data: ActivityWithRelations[] }> {
    const contact = await this.contactsRepo.findOne(contactId)
    if (!contact) throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('read', subject('Contact', contact as any))) {
      throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')
    }

    const data = await this.activitiesRepo.findAllByContact(contactId)
    return { data }
  }

  async getByDeal(
    tenantId: string,
    dealId: string,
    user: { userId: string; role: string; tenantId: string },
  ): Promise<{ data: ActivityWithRelations[] }> {
    const deal = await this.dealRepo.findOne(dealId)
    if (!deal) throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('read', subject('Deal', deal))) {
      throw AppException.notFound(DealErrorCode.NOT_FOUND, 'Deal not found')
    }

    const data = await this.activitiesRepo.findAllByDeal(dealId)
    return { data }
  }

  async getAll(
    tenantId: string,
    query: GetActivitiesQueryType,
    user: { userId: string; role: string; tenantId: string },
  ): Promise<GetActivitiesPaginatedResType> {
    const ability = await this.caslAbilityFactory.createForUser(user)
    const filters: { userId?: string } = {}

    if (ability.cannot('read', 'Activity')) {
      throw AppException.forbidden(ActivityErrorCode.FORBIDDEN_LIST, 'You do not have permission to view activities')
    }

    if (ability.cannot('read', subject('Activity', { userId: 'other' } as any))) {
      filters.userId = user.userId // hard-locked to own userId, query.userId is ignored
    } else if (query.userId) {
      filters.userId = query.userId // filter by chosen employee, only when the user has the rights
    }

    const { data, total } = await this.activitiesRepo.findAll(query, filters)
    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
    }
  }

  async updateActivity(
    activityId: string,
    tenantId: string,
    body: UpdateActivityBodyType,
    user: { userId: string; role: string; tenantId: string },
  ): Promise<ActivityWithRelations> {
    const existing = await this.activitiesRepo.findOne(activityId)
    if (!existing) throw AppException.notFound(ActivityErrorCode.NOT_FOUND, 'Activity not found')

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', subject('Activity', existing as any))) {
      throw AppException.forbidden(
        ActivityErrorCode.FORBIDDEN_UPDATE,
        'You do not have permission to edit this activity',
      )
    }

    const activity = await this.activitiesRepo.update(activityId, body)
    await this.redisService.invalidateTenantCache(tenantId)
    return activity
  }

  async deleteActivity(
    activityId: string,
    tenantId: string,
    user: { userId: string; role: string; tenantId: string },
  ): Promise<{ message: string }> {
    const existing = await this.activitiesRepo.findOne(activityId)
    if (!existing) throw AppException.notFound(ActivityErrorCode.NOT_FOUND, 'Activity not found')

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('delete', subject('Activity', existing as any))) {
      throw AppException.forbidden(
        ActivityErrorCode.FORBIDDEN_DELETE,
        'You do not have permission to delete this activity',
      )
    }

    try {
      await this.activitiesRepo.hardDelete(activityId)
      await this.redisService.invalidateTenantCache(tenantId)
      return { message: 'Activity deleted successfully' }
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
        throw AppException.notFound(ActivityErrorCode.NOT_FOUND, 'Activity not found')
      }
      throw error
    }
  }
}
