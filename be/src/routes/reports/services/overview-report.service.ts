import { Injectable } from '@nestjs/common'
import { AppException, ReportErrorCode } from 'src/common/errors'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { rootLogger } from 'src/common/logger/root-logger'
import { ReportsRepository } from '../reports.repo'
import { parseDates, stageResolver, weightedValue } from './report-helpers'
import { CaslAbilityFactory } from 'src/common/casl/casl-ability.factory'
import { subject } from '@casl/ability'
import { PipelineStagesRepository } from '../../pipeline-stages/pipeline-stages.repo'

const log = rootLogger.child({ context: 'OverviewReportService' })

@Injectable()
export class OverviewReportService {
  constructor(
    private readonly reportsRepo: ReportsRepository,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly pipelineStagesRepo: PipelineStagesRepository,
  ) {}

  async getOverview(startDateStr: string | undefined, endDateStr: string | undefined, user: AccessTokenPayload) {
    const ability = await this.caslAbilityFactory.createForUser(user)
    if (ability.cannot('read', subject('Report', { view: 'overview' } as any))) {
      throw AppException.forbidden(
        ReportErrorCode.FORBIDDEN_OVERVIEW,
        'You do not have permission to view the overview report',
      )
    }

    const userFilter = {}
    const { start, end } = parseDates(startDateStr, endDateStr)

    // Calculate previous period of same duration
    const duration = end.getTime() - start.getTime()
    const prevStart = new Date(start.getTime() - duration)
    const prevEnd = new Date(start.getTime())

    // ─── Metrics ───
    const [currentDeals, previousDeals, stages] = await Promise.all([
      this.reportsRepo.findDealsInPeriod(user.tenantId, start, end, userFilter),
      this.reportsRepo.findDealsInPeriod(user.tenantId, prevStart, prevEnd, userFilter),
      this.pipelineStagesRepo.findAll(user.tenantId),
    ])
    const stageOf = stageResolver(stages)
    const kindOf = (d: { stageId: string | null }) => stageOf(d)?.kind
    const unstagedCount = currentDeals.filter((d) => !stageOf(d)).length
    if (unstagedCount > 0) {
      log.warn({
        event: 'reports.deal_stage_missing',
        tenantId: user.tenantId,
        report: 'overview',
        count: unstagedCount,
      })
    }

    // Metric 1: Total Revenue (WON stage deals value in period)
    const currentWon = currentDeals.filter((d) => kindOf(d) === 'WON')
    const prevWon = previousDeals.filter((d) => kindOf(d) === 'WON')
    const totalRev = currentWon.reduce((sum, d) => sum + Number(d.value), 0)
    const prevRev = prevWon.reduce((sum, d) => sum + Number(d.value), 0)
    const revDeltaVal = prevRev > 0 ? ((totalRev - prevRev) / prevRev) * 100 : totalRev > 0 ? 100 : 0
    const totalRevenue = {
      value: totalRev,
      delta: `${revDeltaVal >= 0 ? '+' : ''}${Math.round(revDeltaVal)}% YoY`,
      up: revDeltaVal >= 0,
    }

    // Metric 2: Total Closed Deals (won or lost in period)
    const currentClosedCount = currentDeals.filter((d) => kindOf(d) === 'WON' || kindOf(d) === 'LOST').length
    const prevClosedCount = previousDeals.filter((d) => kindOf(d) === 'WON' || kindOf(d) === 'LOST').length
    const closedDeltaVal = currentClosedCount - prevClosedCount
    const closedDeals = {
      value: currentClosedCount,
      delta: `${closedDeltaVal >= 0 ? '+' : ''}${closedDeltaVal}`,
      up: closedDeltaVal >= 0,
    }

    // Metric 3: Avg Win Rate
    const getWinRate = (deals: typeof currentDeals) => {
      const won = deals.filter((d) => kindOf(d) === 'WON').length
      const lost = deals.filter((d) => kindOf(d) === 'LOST').length
      const total = won + lost
      return total > 0 ? (won / total) * 100 : 0
    }
    const currentWinRateVal = getWinRate(currentDeals)
    const prevWinRateVal = getWinRate(previousDeals)
    const wrDeltaVal = currentWinRateVal - prevWinRateVal
    const winRate = {
      value: Number(currentWinRateVal.toFixed(1)),
      delta: `${wrDeltaVal >= 0 ? '+' : ''}${wrDeltaVal.toFixed(1)}%`,
      up: wrDeltaVal >= 0,
    }

    // Metric 4: Avg Deal Size
    const currentAvgSize =
      currentWon.length > 0 ? currentWon.reduce((sum, d) => sum + Number(d.value), 0) / currentWon.length : 0
    const prevAvgSize = prevWon.length > 0 ? prevWon.reduce((sum, d) => sum + Number(d.value), 0) / prevWon.length : 0
    const sizeDeltaVal =
      prevAvgSize > 0 ? ((currentAvgSize - prevAvgSize) / prevAvgSize) * 100 : currentAvgSize > 0 ? 100 : 0
    const avgDealSize = {
      value: Math.round(currentAvgSize),
      delta: `${sizeDeltaVal >= 0 ? '+' : ''}${Math.round(sizeDeltaVal)}%`,
      up: sizeDeltaVal >= 0,
    }

    // Metric 5: Avg Days to Close
    const getAvgDaysToClose = (deals: typeof currentDeals) => {
      const closed = deals.filter((d) => (kindOf(d) === 'WON' || kindOf(d) === 'LOST') && d.closeDate)
      if (closed.length === 0) return 0
      const totalDays = closed.reduce((sum, d) => {
        const days = Math.round((d.closeDate.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        return sum + Math.max(0, days)
      }, 0)
      return totalDays / closed.length
    }
    const currentAvgDays = getAvgDaysToClose(currentDeals)
    const prevAvgDays = getAvgDaysToClose(previousDeals)
    const daysDeltaVal = currentAvgDays - prevAvgDays
    const avgDaysToClose = {
      value: Math.round(currentAvgDays),
      delta: `${daysDeltaVal <= 0 ? '' : '+'}${Math.round(daysDeltaVal)} ngày`,
      up: daysDeltaVal <= 0,
    }

    // ─── Monthly Revenue & Forecast ───
    const monthsList: { label: string; year: number; month: number }[] = []
    const temp = new Date(start)
    while (temp <= end) {
      const label = `T${temp.getMonth() + 1}`
      if (!monthsList.find((m) => m.label === label && m.year === temp.getFullYear())) {
        monthsList.push({ label, year: temp.getFullYear(), month: temp.getMonth() + 1 })
      }
      temp.setMonth(temp.getMonth() + 1)
    }

    const targets = await this.reportsRepo.findKpiTargets(userFilter)

    const monthlyData = monthsList.map((m) => {
      const monthTargets = targets.filter((t) => t.month === m.month && t.year === m.year)
      const targetSum = monthTargets.reduce((sum, t) => sum + Number(t.target), 0)

      const monthWonDeals = currentWon.filter((d) => {
        const dDate = d.closeDate || d.createdAt
        return dDate.getMonth() + 1 === m.month && dDate.getFullYear() === m.year
      })
      const actualSum = monthWonDeals.reduce((sum, d) => sum + Number(d.value), 0)

      return {
        month: m.label,
        actual: actualSum, // raw VND
        target: targetSum, // raw VND
      }
    })

    // Cumulative actual vs forecast
    let cumActual = 0
    let cumForecast = 0
    const forecastCumulativeData = monthsList.map((m) => {
      const monthWon = currentWon.filter((d) => {
        const dDate = d.closeDate || d.createdAt
        return dDate.getFullYear() < m.year || (dDate.getFullYear() === m.year && dDate.getMonth() + 1 <= m.month)
      })
      const wonSum = monthWon.reduce((sum, d) => sum + Number(d.value), 0)

      const openDeals = currentDeals.filter((d) => {
        if (kindOf(d) !== 'OPEN') return false
        const dDate = d.closeDate || d.createdAt
        return dDate.getFullYear() < m.year || (dDate.getFullYear() === m.year && dDate.getMonth() + 1 <= m.month)
      })
      const openWeightedSum = openDeals.reduce((sum, d) => sum + weightedValue(d.value, stageOf(d).probability), 0)

      cumActual = wonSum
      cumForecast = wonSum + openWeightedSum

      return {
        month: m.label,
        cumActual: cumActual, // raw VND
        cumForecast: cumForecast, // raw VND
      }
    })

    // Top deals of the WON stage
    const topDealsRaw = await this.reportsRepo.findTopWonDeals(user.tenantId, start, end, userFilter, 6)

    const topDeals = topDealsRaw.map((d) => {
      return {
        id: d.id,
        name: d.title,
        company: d.contact?.company || 'N/A',
        owner: {
          id: d.owner.id,
          name: d.owner.name,
        },
        value: Number(d.value), // raw number
        closedAt: d.closeDate ? d.closeDate.toISOString() : d.createdAt.toISOString(),
        stage: 'CLOSED_WON',
        stageId: d.pipelineStage.id,
        stageName: d.pipelineStage.name,
      }
    })

    // Win/Loss by stage, a heuristic (the stage a lost deal left is not stored):
    // a won deal passed every stage; a lost deal is taken to have moved one open
    // stage forward per activity after the first and to be lost at the stage it
    // reached (≤ 1 activity: the first stage). Rows are the open stages by order
    // plus a closing row, for lost deals that got past the last open stage.
    // On the default stages these are the old Prospect/Qualified/Proposal/Closed
    // rows with the same thresholds (≤1, 2, 3, ≥4 activities).
    const openStages = stages.filter((s) => s.kind === 'OPEN')
    const closingName = ['WON', 'LOST']
      .map((kind) => stages.find((s) => s.kind === kind)?.name)
      .filter(Boolean)
      .join(' / ')
    const winLossStages = [...openStages.map((s) => s.name), closingName].map((stage) => ({
      stage,
      winCount: 0,
      lossCount: 0,
    }))
    const closingIndex = winLossStages.length - 1

    for (const d of currentDeals) {
      const actCount = d.activities.length
      const kind = kindOf(d)

      if (kind === 'WON') {
        winLossStages.forEach((s) => s.winCount++)
      } else if (kind === 'LOST') {
        const lostAt = Math.min(Math.max(actCount - 1, 0), closingIndex)
        winLossStages.slice(0, lostAt).forEach((s) => s.winCount++)
        winLossStages[lostAt].lossCount++
      }
    }

    const winLossData = winLossStages.map((s) => {
      const total = s.winCount + s.lossCount
      return {
        stage: s.stage,
        win: total > 0 ? Math.round((s.winCount / total) * 100) : 0,
        loss: total > 0 ? Math.round((s.lossCount / total) * 100) : 0,
      }
    })

    return {
      kpis: {
        totalRevenue,
        closedDeals,
        winRate,
        avgDealSize,
        avgDaysToClose,
      },
      revenueByMonth: monthlyData,
      forecastData: forecastCumulativeData,
      winLossData,
      topDeals,
    }
  }
}
