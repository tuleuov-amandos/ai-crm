import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { aiQueue } from './ai.queue'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../common/services/prisma.service'
import { AiErrorCode, AppException } from '../../common/errors'
import { AiSettingsService } from '../ai-settings/ai-settings.service'
import { createTenantAiClient } from './tenant-ai-client'

export interface EnqueueOpts {
  dealId: string
  tenantId: string
  userId: string
  meetingNote: string
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiSettings: AiSettingsService,
  ) {}

  // One call on the company's own key: 400 AI_KEY_NOT_CONFIGURED without one,
  // AI_KEY_INVALID / AI_PROVIDER_UNREACHABLE when the provider refuses it.
  async callModel(tenantId: string, prompt: string, options?: { temperature?: number }) {
    const client = await createTenantAiClient(this.aiSettings, tenantId)
    return client.complete(prompt, { temperature: options?.temperature ?? 0.1 })
  }

  async enqueueAnalysis(opts: EnqueueOpts) {
    // Fail fast instead of queueing a job that cannot run. Only whether a key
    // exists is checked here: the key itself is decrypted by the worker at the
    // moment of the call and never goes into the job data.
    if (!(await this.aiSettings.isConfigured(opts.tenantId))) {
      throw AppException.badRequest(AiErrorCode.KEY_NOT_CONFIGURED, 'AI is not configured: the company has no API key')
    }

    const jobId = randomUUID()

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: opts.tenantId },
      select: { defaultLocale: true },
    })
    const locale = tenant?.defaultLocale ?? 'ru'

    const payload = { jobId, ...opts, locale }

    try {
      await aiQueue.add('analyze', payload, {
        attempts: 3,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      })

      return jobId
    } catch {
      // bubble up as 503 so controller can return SERVICE_UNAVAILABLE
      throw new HttpException('AI queue unavailable. Please try later.', HttpStatus.SERVICE_UNAVAILABLE)
    }
  }

  // Instance wrapper for convenience when used inside Nest context
  async saveAiResultAtomic(
    parsed: { tasks?: Array<{ title: string; dueDate?: string }>; emailDraft?: string | null; summary?: string | null },
    jobId: string,
    tenantId: string,
    dealId: string,
    sourceNote?: string,
  ) {
    return saveAiResultAtomic(this.prisma, parsed, jobId, tenantId, dealId, sourceNote)
  }
}

// Exported helper so non-Nest workers (e.g. standalone Bull worker) can reuse the same logic
export async function saveAiResultAtomic(
  prisma: PrismaService,
  parsed: { tasks?: Array<{ title: string; dueDate?: string }>; emailDraft?: string | null; summary?: string | null },
  jobId: string,
  tenantId: string,
  dealId: string,
  sourceNote?: string,
) {
  return prisma.$transaction(async (tx) => {
    // create SUMMARY
    await tx.aiSuggestion.create({
      data: {
        tenantId,
        jobId,
        dealId,
        type: 'SUMMARY',
        content: JSON.stringify({ summary: parsed.summary ?? null }),
        sourceNote: sourceNote ?? null,
      },
    })

    // create EMAIL_DRAFT
    await tx.aiSuggestion.create({
      data: {
        tenantId,
        jobId,
        dealId,
        type: 'EMAIL_DRAFT',
        content: JSON.stringify({ emailDraft: parsed.emailDraft ?? null }),
        sourceNote: sourceNote ?? null,
      },
    })

    // create TASK_LIST
    await tx.aiSuggestion.create({
      data: {
        tenantId,
        jobId,
        dealId,
        type: 'TASK_LIST',
        content: JSON.stringify({ tasks: parsed.tasks ?? [] }),
        sourceNote: sourceNote ?? null,
      },
    })

    return { suggestionsCreated: 3, tasksCreated: 0 }
  })
}
