import { Injectable } from '@nestjs/common'
import { AppException, ReportErrorCode } from 'src/common/errors'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { rootLogger } from 'src/common/logger/root-logger'
import { ReportsRepository } from '../reports.repo'
import { stageResolver, weightedValue } from './report-helpers'
import { CaslAbilityFactory } from 'src/common/casl/casl-ability.factory'
import { subject } from '@casl/ability'
import { PipelineStagesRepository } from '../../pipeline-stages/pipeline-stages.repo'

const log = rootLogger.child({ context: 'PipelineReportService' })

@Injectable()
export class PipelineReportService {
  constructor(
    private readonly reportsRepo: ReportsRepository,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly pipelineStagesRepo: PipelineStagesRepository,
  ) {}

  async getPipelineAnalysis(user: AccessTokenPayload) {
    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('read', subject('Report', { view: 'pipeline' } as any))) {
      throw AppException.forbidden(
        ReportErrorCode.FORBIDDEN_PIPELINE,
        'You do not have permission to view the sales pipeline report',
      )
    }

    const userFilter = ability.cannot('read', subject('Deal', { ownerId: 'other' } as any))
      ? { ownerId: user.userId }
      : {}

    const [deals, stages] = await Promise.all([
      this.reportsRepo.findAllDeals(user.tenantId, userFilter),
      this.pipelineStagesRepo.findAll(user.tenantId),
    ])
    const stageOf = stageResolver(stages)
    const unstagedCount = deals.filter((d) => !stageOf(d)).length
    if (unstagedCount > 0) {
      log.warn({
        event: 'reports.deal_stage_missing',
        tenantId: user.tenantId,
        report: 'pipeline',
        count: unstagedCount,
      })
    }

    // Steps: the open stages by order, then the WON stage. LOST is not a step.
    const openStages = stages.filter((s) => s.kind === 'OPEN')
    const wonStage = stages.find((s) => s.kind === 'WON')
    const funnelStages = wonStage ? [...openStages, wonStage] : openStages

    // Per stage, summed in deal order like the old per-enum sums.
    const stageTotals = new Map(funnelStages.map((stage) => [stage.id, { count: 0, value: 0 }]))
    for (const deal of deals) {
      const totals = stageTotals.get(stageOf(deal)?.id)
      if (totals) {
        totals.count += 1
        totals.value += Number(deal.value)
      }
    }

    // A step holds the deals of its stage, of every later open stage and the
    // won ones; values are added stage by stage in pipeline order, as before.
    const steps = funnelStages.map((stage, i) => {
      const fromHere = funnelStages.slice(i).map((s) => stageTotals.get(s.id))
      return {
        stage,
        count: fromHere.reduce((sum, t) => sum + t.count, 0),
        value: fromHere.reduce((sum, t) => sum + t.value, 0),
      }
    })
    const baseCount = steps[0]?.count ?? 0

    const conversionFunnel = steps.map(({ stage, count, value }) => {
      const percentage = baseCount > 0 ? Math.round((count / baseCount) * 100) : 0

      return {
        stage: stage.name,
        stageId: stage.id,
        // The current frontend keys on the old enum value; null for a custom stage.
        stageKey: stage.legacyKey,
        legacyKey: stage.legacyKey,
        count,
        value: value, // raw VND
        percentage,
      }
    })

    const bottlenecks: {
      type: 'warning' | 'success'
      code: 'leadContactedLow' | 'leadContactedGood' | 'contactedProposalLow' | 'proposalWonHigh'
      rate: number
    }[] = []

    // Between neighbouring steps: 1st → 2nd open step, 2nd → 3rd open step,
    // last open step → WON (Lead → Contacted → Proposal → Won on the default
    // stages). A check is skipped when the pipeline has too few open stages.
    const openSteps = steps.slice(0, openStages.length)
    const wonCount = deals.filter((d) => stageOf(d)?.kind === 'WON').length
    const lostCount = deals.filter((d) => stageOf(d)?.kind === 'LOST').length

    if (openSteps.length >= 2) {
      const totalProspects = openSteps[0].count
      const totalQualified = openSteps[1].count
      const qualRate = totalProspects > 0 ? (totalQualified / totalProspects) * 100 : 0
      if (qualRate < 50 && totalProspects > 0) {
        bottlenecks.push({ type: 'warning', code: 'leadContactedLow', rate: Math.round(qualRate) })
      } else if (qualRate >= 50 && totalProspects > 0) {
        bottlenecks.push({ type: 'success', code: 'leadContactedGood', rate: Math.round(qualRate) })
      }
    }

    if (openSteps.length >= 3) {
      const totalQualified = openSteps[1].count
      const propRate = totalQualified > 0 ? (openSteps[2].count / totalQualified) * 100 : 0
      if (propRate < 40 && totalQualified > 0) {
        bottlenecks.push({ type: 'warning', code: 'contactedProposalLow', rate: Math.round(propRate) })
      }
    }

    if (openSteps.length >= 1) {
      const lastOpenCount = openSteps[openSteps.length - 1].count
      const winRateVal = lastOpenCount > 0 ? (wonCount / lastOpenCount) * 100 : 0
      if (winRateVal >= 50 && wonCount > 0) {
        bottlenecks.push({ type: 'success', code: 'proposalWonHigh', rate: Math.round(winRateVal) })
      }
    }

    const totalClosed = wonCount + lostCount
    const avgWinVelocity = totalClosed > 0 ? `${((wonCount / totalClosed) * 100).toFixed(1)}%` : '0.0%'

    const now = new Date()
    const currentYear = now.getFullYear()
    const months = Array.from({ length: 12 }, (_, i) => i + 1)

    const kpiTargets = await this.reportsRepo.findKpiTargetsForYear(currentYear, userFilter)

    let cumActual = 0
    let cumForecast = 0
    let cumTarget = 0

    const weightedForecast = months.map((m) => {
      const monthWon = deals.filter((d) => {
        if (stageOf(d)?.kind !== 'WON') return false
        const dDate = d.closeDate || d.createdAt
        return dDate.getFullYear() === currentYear && dDate.getMonth() + 1 === m
      })
      const monthActualVal = monthWon.reduce((sum, d) => sum + Number(d.value), 0)

      const monthOpen = deals.filter((d) => {
        if (stageOf(d)?.kind !== 'OPEN') return false
        const dDate = d.closeDate || d.createdAt
        return dDate.getFullYear() === currentYear && dDate.getMonth() + 1 === m
      })
      const monthOpenWeightedVal = monthOpen.reduce((sum, d) => sum + weightedValue(d.value, stageOf(d).probability), 0)

      const monthTargets = kpiTargets.filter((t) => t.month === m)
      const monthTargetVal = monthTargets.reduce((sum, t) => sum + Number(t.target), 0)

      cumActual += monthActualVal
      cumTarget += monthTargetVal

      cumForecast += monthActualVal + monthOpenWeightedVal

      const isFutureMonth =
        currentYear > now.getFullYear() || (currentYear === now.getFullYear() && m > now.getMonth() + 1)

      return {
        month: `T${m}`,
        actual: isFutureMonth ? undefined : cumActual,
        forecast: cumForecast,
        target: cumTarget > 0 ? cumTarget : undefined,
      }
    })

    return {
      conversionFunnel,
      bottlenecks,
      averageWinVelocity: avgWinVelocity,
      weightedForecast,
    }
  }
}
