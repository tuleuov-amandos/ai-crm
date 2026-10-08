import { Injectable } from '@nestjs/common'
import { AppException, ContactErrorCode } from 'src/common/errors'
import { ContactsRepository } from './contacts.repo'
import {
  CreateContactBodyType,
  ContactTagType,
  ContactChannelConst,
  ContactChannelType,
  GetContactsQueryType,
  UpdateContactBodyType,
} from './contacts.model'
import { RedisService } from 'src/common/services/redis.service'
import { AuditLogsService } from '../audit-logs/audit-logs.service'
import { AuditLogChanges } from '../audit-logs/audit-logs.model'
import { getChangesDiff } from '../deal/deal.service'
import { CaslAbilityFactory } from 'src/common/casl/casl-ability.factory'
import { subject } from '@casl/ability'
import { DealRepository } from '../deal/deal.repo'
import { AiService } from '../ai/ai.service'
import { PrismaService } from 'src/common/services/prisma.service'
import { DealStageType } from '../deal/deal.model'
import { BulkImportContactsBodyDto } from './contacts.dto'
import { PipelineStagesRepository } from '../pipeline-stages/pipeline-stages.repo'
import { legacyDealStageFor } from 'src/common/pipeline-stages/default-pipeline-stages'

type ImportStage = { id: string; name: string; kind: string; legacyKey: string | null }

// Old English import words, kept so earlier client files still land in the same
// stages.
function legacyStageFromImportWords(rawStage: string): DealStageType | null {
  if (rawStage.includes('prospect')) return 'PROSPECT'
  if (rawStage.includes('qualified')) return 'QUALIFIED'
  if (rawStage.includes('proposal')) return 'PROPOSAL'
  if (rawStage.includes('won')) return 'CLOSED_WON'
  if (rawStage.includes('lost')) return 'CLOSED_LOST'
  return null
}

// Deal stage text from an import row -> one of the tenant's stages (ordered as
// in the pipeline): stage name, then legacyKey (both ignoring case), then the
// old words, otherwise the first open stage.
function matchImportStage(raw: string | null | undefined, stages: ImportStage[]): ImportStage {
  const text = (raw || '').trim().toLowerCase()
  const byName = text && stages.find((s) => s.name.trim().toLowerCase() === text)
  if (byName) return byName
  const byLegacyKey = text && stages.find((s) => s.legacyKey?.toLowerCase() === text)
  if (byLegacyKey) return byLegacyKey
  const legacyKey = legacyStageFromImportWords(text)
  const byOldWords = legacyKey && stages.find((s) => s.legacyKey === legacyKey)
  if (byOldWords) return byOldWords
  const firstOpen = stages.find((s) => s.kind === 'OPEN')
  if (!firstOpen) throw new Error('No open PipelineStage found for the import')
  return firstOpen
}

function normalizeChannel(raw: string | null | undefined): ContactChannelType | null {
  if (!raw) return null
  const validValues = Object.values(ContactChannelConst) as string[]
  const trimmed = raw.trim()
  const normalized = trimmed.toUpperCase()
  if (normalized === 'A' || normalized === 'А' || normalized === 'CATEGORY_A' || normalized === 'КАТЕГОРИЯ А')
    return ContactChannelConst.CategoryA
  if (normalized === 'B' || normalized === 'Б' || normalized === 'CATEGORY_B' || normalized === 'КАТЕГОРИЯ Б')
    return ContactChannelConst.CategoryB
  if (
    normalized === 'C' ||
    normalized === 'С' ||
    normalized === 'CATEGORY_C' ||
    normalized === 'КАТЕГОРИЯ С' ||
    normalized === 'КАТЕГОРИЯ C'
  )
    return ContactChannelConst.CategoryC
  if (validValues.includes(normalized)) return normalized as ContactChannelType
  return null
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly contactRepository: ContactsRepository,
    private readonly redisService: RedisService,
    private readonly auditLogsService: AuditLogsService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly dealRepository: DealRepository, // Inject DealRepository
    private readonly aiService: AiService,
    private readonly pipelineStagesRepo: PipelineStagesRepository,
  ) {}

  async getAllContacts(
    tenantId: string,
    query: GetContactsQueryType,
    user: { userId: string; role: string; tenantId: string },
  ) {
    const { limit } = query
    const ability = await this.caslAbilityFactory.createForUser(user)

    if (ability.cannot('read', 'Contact')) {
      throw AppException.forbidden(
        ContactErrorCode.FORBIDDEN_LIST,
        'You do not have permission to view the contacts list',
      )
    }

    const filters: { ownerId?: string } = {}
    if (ability.cannot('read', subject('Contact', { ownerId: 'other' } as any))) {
      filters.ownerId = user.userId
    }

    const contacts = await this.contactRepository.findAll(query, filters)

    const hasNextPage = contacts.length > limit
    const data = hasNextPage ? contacts.slice(0, -1) : contacts
    const nextCursor = hasNextPage ? data[data.length - 1].id : null

    const pagination = { nextCursor, hasNextPage }
    return { data, pagination }
  }

  async getContactById(contactId: string, tenantId: string, user: { userId: string; role: string; tenantId: string }) {
    const contact = await this.contactRepository.findOne(contactId)
    if (!contact) {
      throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)
    // Use subject() helper to map database model type
    if (ability.cannot('read', subject('Contact', contact))) {
      throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found') // Return 404 to prevent ID scanning
    }

    return contact
  }

  async createContact(tenantId: string, ownerId: string, body: CreateContactBodyType) {
    const result = await this.contactRepository.create(ownerId, body)
    await this.redisService.invalidateTenantCache(tenantId)

    const changes: AuditLogChanges = {}
    for (const [key, val] of Object.entries(result)) {
      if (['createdAt', 'updatedAt', 'deletedAt', 'id', 'tenantId'].includes(key)) continue
      changes[key] = { old: null, new: val }
    }
    await this.auditLogsService.logAction({
      tenantId,
      userId: ownerId,
      action: 'CREATE',
      targetType: 'CONTACT',
      targetId: result.id,
      targetName: result.name,
      changes,
    })

    return result
  }

  async update(
    contactId: string,
    tenantId: string,
    body: UpdateContactBodyType,
    user: { userId: string; role: string; tenantId: string },
  ) {
    const oldContact = await this.contactRepository.findOne(contactId)
    if (!oldContact) {
      throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', subject('Contact', oldContact))) {
      throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found') // Security 404
    }

    const result = await this.contactRepository.update(contactId, body)
    await this.redisService.invalidateTenantCache(tenantId)

    const changes = getChangesDiff(oldContact, body)
    if (Object.keys(changes).length > 0) {
      await this.auditLogsService.logAction({
        tenantId,
        userId: user.userId,
        action: 'UPDATE',
        targetType: 'CONTACT',
        targetId: contactId,
        targetName: result.name,
        changes,
      })
    }
    return result
  }

  async delete(contactId: string, tenantId: string, user: { userId: string; role: string; tenantId: string }) {
    const oldContact = await this.contactRepository.findOne(contactId)
    if (!oldContact) {
      throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('delete', subject('Contact', oldContact))) {
      throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')
    }

    const result = await this.contactRepository.delete(contactId)
    await this.redisService.invalidateTenantCache(tenantId)

    const changes: AuditLogChanges = {}
    for (const [key, val] of Object.entries(oldContact)) {
      if (['createdAt', 'updatedAt', 'deletedAt', 'id', 'tenantId'].includes(key)) continue
      changes[key] = { old: val, new: null }
    }
    await this.auditLogsService.logAction({
      tenantId,
      userId: user.userId,
      action: 'DELETE',
      targetType: 'CONTACT',
      targetId: contactId,
      targetName: oldContact.name,
      changes,
    })
    return result
  }

  async restore(contactId: string, tenantId: string, user: { userId: string; role: string; tenantId: string }) {
    const exits = await this.contactRepository.findDeleted(contactId)
    if (!exits) {
      throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')
    }

    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('update', subject('Contact', exits))) {
      throw AppException.notFound(ContactErrorCode.NOT_FOUND, 'Contact not found')
    }

    const result = await this.contactRepository.restore(contactId)
    await this.redisService.invalidateTenantCache(tenantId)
    return result
  }

  // Logic bulk import Contacts & Deals
  async bulkImport(tenantId: string, currentUserId: string, body: BulkImportContactsBodyDto) {
    const results = []

    // Pre-read all Tenant users to find Owner by email as fast as possible
    const allTenantUsers = await (
      this.contactRepository as unknown as { prismaService: PrismaService }
    ).prismaService.user.findMany({
      where: { tenantId, deletedAt: null },
    })
    const userMap = new Map<string, string>(allTenantUsers.map((u) => [u.email.toLowerCase(), u.id]))

    // Pipeline stages are read once for the whole import, not per row.
    const stages = await this.pipelineStagesRepo.findAll(tenantId)

    for (const item of body.contacts) {
      // 1. Owner authorization
      let ownerId = currentUserId
      if (item.ownerEmail) {
        const matchedUserId = userMap.get(item.ownerEmail.toLowerCase())
        if (matchedUserId) {
          ownerId = matchedUserId
        }
      }

      // 2. Search for duplicate Contacts (Merge/Overwrite)
      let contact = await this.contactRepository.findByEmailOrPhone(item.email, item.phone)

      if (contact) {
        // Update with new information
        const updateData: Partial<CreateContactBodyType> & { tags?: ContactTagType[]; channel?: ContactChannelType } =
          {}
        if (item.name) updateData.name = item.name
        if (item.company) updateData.company = item.company
        if (item.position) updateData.position = item.position

        // Merge old tags and new tags from Excel
        if (item.tags && item.tags.length > 0) {
          const existingTags = contact.tags || []
          // Tags from BulkImportContactItemSchema are plain strings; cast to ContactTagType[] after Zod validation
          const validNewTags = item.tags as ContactTagType[]
          updateData.tags = Array.from(new Set([...existingTags, ...validNewTags])) as ContactTagType[]
        }

        if (item.channel) {
          const normalizedChannel = normalizeChannel(item.channel)
          if (normalizedChannel) updateData.channel = normalizedChannel
        }

        const oldContact = { ...contact }
        contact = await this.contactRepository.update(contact.id, updateData)

        // Write Audit Log for UPDATE action
        const changes = getChangesDiff(oldContact, updateData)
        if (Object.keys(changes).length > 0) {
          await this.auditLogsService.logAction({
            tenantId,
            userId: currentUserId,
            action: 'UPDATE',
            targetType: 'CONTACT',
            targetId: contact.id,
            targetName: contact.name,
            changes,
          })
        }
      } else {
        // Create new Contact
        contact = await this.contactRepository.create(ownerId, {
          name: item.name,
          email: item.email || null,
          phone: item.phone || null,
          company: item.company || null,
          position: item.position || null,
          // Tags from BulkImportContactItemSchema are plain strings; cast to ContactTagType[] after validation
          tags: (item.tags || []) as ContactTagType[],
          channel: normalizeChannel(item.channel),
        })

        // Write Audit Log for CREATE Contact action
        const changes: AuditLogChanges = {}
        for (const [key, val] of Object.entries(contact)) {
          if (['createdAt', 'updatedAt', 'deletedAt', 'id', 'tenantId'].includes(key)) continue
          changes[key] = { old: null, new: val }
        }
        await this.auditLogsService.logAction({
          tenantId,
          userId: currentUserId,
          action: 'CREATE',
          targetType: 'CONTACT',
          targetId: contact.id,
          targetName: contact.name,
          changes,
        })
      }

      // 3. Create accompanying Deal if Deal Title is declared
      if (item.dealTitle) {
        const stage = matchImportStage(item.dealStage, stages)

        const deal = await this.dealRepository.createWithStage({
          ownerId,
          title: item.dealTitle,
          value: item.dealValue || 0,
          stageId: stage.id,
          stage: legacyDealStageFor(stage),
          contactId: contact.id,
          note: item.dealNote || null,
        })

        // Write Audit Log for CREATE Deal action
        const dealChanges: AuditLogChanges = {}
        for (const [key, val] of Object.entries(deal)) {
          if (['createdAt', 'updatedAt', 'deletedAt', 'id', 'tenantId', 'stageId'].includes(key)) continue
          dealChanges[key] = { old: null, new: val }
        }
        await this.auditLogsService.logAction({
          tenantId,
          userId: currentUserId,
          action: 'CREATE',
          targetType: 'DEAL',
          targetId: deal.id,
          targetName: deal.title,
          changes: dealChanges,
        })
      }

      results.push(contact)
    }

    // Invalidate tenant Redis cache to update UI immediately
    await this.redisService.invalidateTenantCache(tenantId)
    return { success: true, count: results.length }
  }

  async aiMapColumns(headers: string[]) {
    const prompt = `You are an expert data mapping assistant for a CRM system.
    We have 12 system fields:
    - name (Full name - Required)
    - email (Email)
    - phone (Phone number)
    - company (Company)
    - position (Job title)
    - tags (Tags)
    - ownerEmail (Owner email)
    - dealTitle (Deal title)
    - dealValue (Deal value)
    - dealStage (Deal stage)
    - dealNote (Deal note)
    - channel (Channel / customer category)

    Given this list of headers from an uploaded spreadsheet:
    ${JSON.stringify(headers)}

    Map these user headers to our 11 system fields.
    Return ONLY a single valid JSON object (no explanations, no markdown formatting blocks, no triple backticks, no markdown json block) where keys are system fields, and values are the exact matching header from the spreadsheet list, or null if no matching header is found.
    Example Output Format:
    {
      "name": "Full name",
      "email": "Contact email",
      "phone": "Phone",
      "company": null,
      ...
    }`

    try {
      const content = await this.aiService.callModel(prompt, { temperature: 0.1 })
      // Clean markdown format if generated by mistake
      const cleanJson = content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim()
      const mappings = JSON.parse(cleanJson)
      return { mappings }
    } catch {
      // Fallback mapping in case of AI API error
      const mappings: Record<string, string | null> = {}
      const fields = [
        'name',
        'email',
        'phone',
        'company',
        'position',
        'tags',
        'ownerEmail',
        'dealTitle',
        'dealValue',
        'dealStage',
        'dealNote',
        'channel',
      ]
      fields.forEach((f) => {
        mappings[f] = null
      })
      return { mappings }
    }
  }
}
