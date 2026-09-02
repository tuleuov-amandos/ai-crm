import { Injectable } from '@nestjs/common'
import { AppException, ReportErrorCode } from 'src/common/errors'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { DealStage } from '../../../../generated/prisma-client/enums'
import { ReportsRepository } from '../reports.repo'
import { STAGE_PROBABILITIES } from './report-helpers'
import { CaslAbilityFactory } from 'src/common/casl/casl-ability.factory'
import { subject } from '@casl/ability'

@Injectable()
export class PipelineReportService {
  constructor(
    private readonly reportsRepo: ReportsRepository,
    private readonly caslAbilityFactory: CaslAbilityFactory,
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

    const deals = await this.reportsRepo.findAllDeals(userFilter)

    const funnelStages = [
      { name: '1. Lead (Prospect)', key: DealStage.PROSPECT },
      { name: '2. Contacted (Qualified)', key: DealStage.QUALIFIED },
      { name: '3. Proposal', key: DealStage.PROPOSAL },
      { name: '4. Won', key: DealStage.CLOSED_WON },
    ]

    const leadCount = deals.filter((d) => d.stage === DealStage.PROSPECT).length
    const contactedCount = deals.filter((d) => d.stage === DealStage.QUALIFIED).length
    const proposalCount = deals.filter((d) => d.stage === DealStage.PROPOSAL).length
    const wonCount = deals.filter((d) => d.stage === DealStage.CLOSED_WON).length
    const lostCount = deals.filter((d) => d.stage === DealStage.CLOSED_LOST).length

    const getStageSum = (stage: DealStage) =>
      deals.filter((d) => d.stage === stage).reduce((sum, d) => sum + Number(d.value), 0)

    const conversionFunnel = funnelStages.map((stage) => {
      let count = 0
      let value = 0

      if (stage.key === DealStage.PROSPECT) {
        count = leadCount + contactedCount + proposalCount + wonCount
        value =
          getStageSum(DealStage.PROSPECT) +
          getStageSum(DealStage.QUALIFIED) +
          getStageSum(DealStage.PROPOSAL) +
          getStageSum(DealStage.CLOSED_WON)
      } else if (stage.key === DealStage.QUALIFIED) {
        count = contactedCount + proposalCount + wonCount
        value = getStageSum(DealStage.QUALIFIED) + getStageSum(DealStage.PROPOSAL) + getStageSum(DealStage.CLOSED_WON)
      } else if (stage.key === DealStage.PROPOSAL) {
        count = proposalCount + wonCount
        value = getStageSum(DealStage.PROPOSAL) + getStageSum(DealStage.CLOSED_WON)
      } else {
        count = wonCount
        value = getStageSum(DealStage.CLOSED_WON)
      }

      const baseCount = leadCount + contactedCount + proposalCount + wonCount
      const percentage = baseCount > 0 ? Math.round((count / baseCount) * 100) : 0

      return {
        stage: stage.name,
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

    const totalProspects = leadCount + contactedCount + proposalCount + wonCount
    const totalQualified = contactedCount + proposalCount + wonCount
    const qualRate = totalProspects > 0 ? (totalQualified / totalProspects) * 100 : 0
    if (qualRate < 50 && totalProspects > 0) {
      bottlenecks.push({ type: 'warning', code: 'leadContactedLow', rate: Math.round(qualRate) })
    } else if (qualRate >= 50 && totalProspects > 0) {
      bottlenecks.push({ type: 'success', code: 'leadContactedGood', rate: Math.round(qualRate) })
    }

    const propRate = totalQualified > 0 ? ((proposalCount + wonCount) / totalQualified) * 100 : 0
    if (propRate < 40 && totalQualified > 0) {
      bottlenecks.push({ type: 'warning', code: 'contactedProposalLow', rate: Math.round(propRate) })
    }

    const winRateVal = proposalCount + wonCount > 0 ? (wonCount / (proposalCount + wonCount)) * 100 : 0
    if (winRateVal >= 50 && wonCount > 0) {
      bottlenecks.push({ type: 'success', code: 'proposalWonHigh', rate: Math.round(winRateVal) })
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
        if (d.stage !== DealStage.CLOSED_WON) return false
        const dDate = d.closeDate || d.createdAt
        return dDate.getFullYear() === currentYear && dDate.getMonth() + 1 === m
      })
      const monthActualVal = monthWon.reduce((sum, d) => sum + Number(d.value), 0)

      const monthOpen = deals.filter((d) => {
        if (d.stage === DealStage.CLOSED_WON || d.stage === DealStage.CLOSED_LOST) return false
        const dDate = d.closeDate || d.createdAt
        return dDate.getFullYear() === currentYear && dDate.getMonth() + 1 === m
      })
      const monthOpenWeightedVal = monthOpen.reduce(
        (sum, d) => sum + Number(d.value) * (STAGE_PROBABILITIES[d.stage] || 0),
        0,
      )

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
