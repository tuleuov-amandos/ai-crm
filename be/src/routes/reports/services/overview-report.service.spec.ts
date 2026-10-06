import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { buildReportsDb, ReportsDbTables } from '../../../../test/in-memory-reports-db'
import {
  ADMIN,
  KPI_TARGETS,
  NOW,
  USERS,
  customDeals,
  customStages,
  dealRow,
  defaultDeals,
  defaultStages,
  otherTenantDeals,
  otherTenantStages,
} from '../../../../test/pipeline-stage-reports.fixtures'
import { PipelineStagesRepository } from '../../pipeline-stages/pipeline-stages.repo'
import { OverviewResSchema } from '../reports.dto'
import { ReportsRepository } from '../reports.repo'
import { OverviewReportService } from './overview-report.service'

// GET /reports/overview: won/lost/closed/open come from the PipelineStage kind
// of Deal.stageId, the forecast from the stage probability.

const adminAbility = () => {
  const { can, build } = new AbilityBuilder(createMongoAbility)
  can('manage', 'all')
  return build()
}

const overview = async (tables: Pick<ReportsDbTables, 'pipelineStages' | 'deals'>) => {
  const db = buildReportsDb({ users: USERS, kpiTargets: KPI_TARGETS, ...tables }) as never
  const service = new OverviewReportService(
    new ReportsRepository(db),
    { createForUser: () => Promise.resolve(adminAbility()) } as never,
    new PipelineStagesRepository(db),
  )
  return OverviewResSchema.parse(await service.getOverview('2026-01-01', '2026-06-30', ADMIN))
}

const at = (month: number, day: number) => new Date(2026, month - 1, day, 12)

// Reference numbers produced by the enum-based report (before this change) on
// defaultDeals().
const DEFAULT_KPIS = {
  totalRevenue: { value: 7000, delta: '+250% YoY', up: true },
  closedDeals: { value: 7, delta: '+5', up: true },
  winRate: { value: 42.9, delta: '-7.1%', up: false },
  avgDealSize: { value: 2333, delta: '+17%', up: true },
  avgDaysToClose: { value: 43, delta: '-20 ngày', up: true },
}
const DEFAULT_FORECAST = [
  { month: 'T1', cumActual: 0, cumForecast: 0 },
  { month: 'T2', cumActual: 0, cumForecast: 100 },
  { month: 'T3', cumActual: 5000, cumForecast: 5100 },
  { month: 'T4', cumActual: 5000, cumForecast: 5100 },
  { month: 'T5', cumActual: 6200, cumForecast: 6384 },
  { month: 'T6', cumActual: 7000, cumForecast: 8135.9 },
]
const wonDeal = (id: string, ownerId: string, value: number, closedAt: Date, stageName = 'Выиграно') => ({
  id,
  name: `Deal ${id}`,
  company: `Company ${id}`,
  owner: { id: ownerId, name: ownerId === 'admin-1' ? 'Admin' : 'Rep' },
  value,
  closedAt: closedAt.toISOString(),
  stage: 'CLOSED_WON',
  stageId: 's-won',
  stageName,
})
const DEFAULT_TOP_DEALS = [
  wonDeal('w1', 'admin-1', 5000, at(3, 20)),
  wonDeal('w2', 'rep-1', 1200, at(5, 5)),
  wonDeal('w3', 'rep-1', 800, at(6, 12)),
]

describe('OverviewReportService on the tenant pipeline stages', () => {
  beforeAll(() => jest.useFakeTimers({ now: NOW }))
  afterAll(() => jest.useRealTimers())

  it('on the 5 default stages gives the same numbers as the enum-based report', async () => {
    const result = await overview({ pipelineStages: defaultStages(), deals: defaultDeals() })

    expect(result.kpis).toEqual(DEFAULT_KPIS)
    expect(result.revenueByMonth).toEqual([
      { month: 'T1', actual: 0, target: 0 },
      { month: 'T2', actual: 0, target: 0 },
      { month: 'T3', actual: 5000, target: 3000 },
      { month: 'T4', actual: 0, target: 0 },
      { month: 'T5', actual: 1200, target: 2000 },
      { month: 'T6', actual: 800, target: 1500 },
    ])
    expect(result.forecastData).toEqual(DEFAULT_FORECAST)
    expect(result.topDeals).toEqual(DEFAULT_TOP_DEALS)
  })

  it('keeps the Win/Loss percentages of the default stages and names the rows after them', async () => {
    const result = await overview({ pipelineStages: defaultStages(), deals: defaultDeals() })

    // Was Prospect 86/14, Qualified 83/17, Proposal 80/20, Closed 75/25.
    expect(result.winLossData).toEqual([
      { stage: 'Лид', win: 86, loss: 14 },
      { stage: 'Контакт установлен', win: 83, loss: 17 },
      { stage: 'Предложение', win: 80, loss: 20 },
      { stage: 'Выиграно / Проиграно', win: 75, loss: 25 },
    ])
  })

  it('spreads Win/Loss over every open stage of a custom pipeline, one stage per activity', async () => {
    const result = await overview({ pipelineStages: customStages(), deals: customDeals() })

    // w1, w2 win everywhere; l1 (4 activities) is lost at the 4th open stage,
    // l2 (6 activities) went past the last open stage and is lost at closing.
    expect(result.winLossData).toEqual([
      { stage: 'Лид', win: 100, loss: 0 },
      { stage: 'Квалификация', win: 100, loss: 0 },
      { stage: 'Контакт установлен', win: 100, loss: 0 },
      { stage: 'Предложение', win: 75, loss: 25 },
      { stage: 'Оплачено / Отказ', win: 67, loss: 33 },
    ])
  })

  it('counts won and lost deals by stage kind under renamed WON/LOST stages', async () => {
    const result = await overview({ pipelineStages: customStages(), deals: customDeals() })

    expect(result.kpis.totalRevenue).toEqual({ value: 5700, delta: '+100% YoY', up: true })
    expect(result.kpis.closedDeals).toEqual({ value: 4, delta: '+4', up: true })
    expect(result.kpis.winRate).toEqual({ value: 50, delta: '+50.0%', up: true })
    expect(result.topDeals).toEqual([
      wonDeal('w1', 'admin-1', 5000, at(3, 20), 'Оплачено'),
      wonDeal('w2', 'admin-1', 700, at(6, 10), 'Оплачено'),
    ])
  })

  it('forecasts a custom-stage deal with that stage probability (45%), not the «Лид» 10%', async () => {
    const result = await overview({ pipelineStages: customStages(), deals: customDeals() })

    // c1 400 × 45% from April; June adds w2 700 + c2 200 × 45% + q1 2500 × 30% + p2 50 × 10%.
    const expected = [0, 100, 5100, 5280, 5280, 6825]
    expect(result.forecastData.map((m) => m.cumActual)).toEqual([0, 0, 5000, 5000, 5000, 5700])
    result.forecastData.forEach((month, i) => expect(month.cumForecast).toBeCloseTo(expected[i], 6))
  })

  it('leaves a deal without stageId out of revenue, closed deals, win rate, Win/Loss and top deals', async () => {
    const stages = defaultStages()
    const unstaged = dealRow(
      { id: 'n1', stageId: null, stage: 'CLOSED_WON', value: 12345, createdAt: at(4, 1), closeDate: at(4, 5) },
      stages,
    )

    const result = await overview({ pipelineStages: stages, deals: [...defaultDeals(), unstaged] })

    expect(result.kpis).toEqual(DEFAULT_KPIS)
    expect(result.forecastData).toEqual(DEFAULT_FORECAST)
    expect(result.winLossData.map((row) => [row.win, row.loss])).toEqual([
      [86, 14],
      [83, 17],
      [80, 20],
      [75, 25],
    ])
    expect(result.topDeals).toEqual(DEFAULT_TOP_DEALS)
  })

  it('ignores the stages and deals of another tenant', async () => {
    const alone = await overview({ pipelineStages: defaultStages(), deals: defaultDeals() })
    const mixed = await overview({
      pipelineStages: [...defaultStages(), ...otherTenantStages()],
      deals: [...defaultDeals(), ...otherTenantDeals()],
    })

    expect(mixed).toEqual(alone)
    expect(mixed.kpis).toEqual(DEFAULT_KPIS)
  })
})
