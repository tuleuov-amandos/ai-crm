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
import { PipelineAnalysisResSchema } from '../reports.dto'
import { ReportsRepository } from '../reports.repo'
import { PipelineReportService } from './pipeline-report.service'

// GET /reports/pipeline-analysis reads a deal's stage from Deal.stageId and the
// tenant's PipelineStage (kind/order/probability/name), never from Deal.stage:
// a custom stage writes PROSPECT there.

const adminAbility = () => {
  const { can, build } = new AbilityBuilder(createMongoAbility)
  can('manage', 'all')
  return build()
}

const analyse = async (tables: Pick<ReportsDbTables, 'pipelineStages' | 'deals'>) => {
  const db = buildReportsDb({ users: USERS, kpiTargets: KPI_TARGETS, ...tables }) as never
  const service = new PipelineReportService(
    new ReportsRepository(db),
    { createForUser: () => Promise.resolve(adminAbility()) } as never,
    new PipelineStagesRepository(db),
  )
  // The global ZodSerializerInterceptor parses the response with this schema.
  return PipelineAnalysisResSchema.parse(await service.getPipelineAnalysis(ADMIN))
}

// Reference numbers produced by the enum-based report (before this change) on
// defaultDeals(): only the step names and the new stageId/legacyKey differ.
const DEFAULT_FUNNEL = [
  {
    stage: 'Лид',
    stageId: 's-prospect',
    stageKey: 'PROSPECT',
    legacyKey: 'PROSPECT',
    count: 13,
    value: 18283,
    percentage: 100,
  },
  {
    stage: 'Контакт установлен',
    stageId: 's-qualified',
    stageKey: 'QUALIFIED',
    legacyKey: 'QUALIFIED',
    count: 10,
    value: 17190,
    percentage: 77,
  },
  {
    stage: 'Предложение',
    stageId: 's-proposal',
    stageKey: 'PROPOSAL',
    legacyKey: 'PROPOSAL',
    count: 7,
    value: 14433,
    percentage: 54,
  },
  {
    stage: 'Выиграно',
    stageId: 's-won',
    stageKey: 'CLOSED_WON',
    legacyKey: 'CLOSED_WON',
    count: 4,
    value: 9000,
    percentage: 31,
  },
]

// Exact doubles of the old value × 0.1/0.3/0.6 sums (8795.9, 8796.199999999999).
const DEFAULT_FORECAST = [
  { month: 'T1', actual: 0, forecast: 0, target: undefined },
  { month: 'T2', actual: 0, forecast: 760, target: undefined },
  { month: 'T3', actual: 5000, forecast: 5760, target: 3000 },
  { month: 'T4', actual: 5000, forecast: 5760, target: 3000 },
  { month: 'T5', actual: 6200, forecast: 7044, target: 5000 },
  { month: 'T6', actual: 7000, forecast: 8795.9, target: 6500 },
  { month: 'T7', actual: undefined, forecast: 8796.199999999999, target: 6500 },
  { month: 'T8', actual: undefined, forecast: 11196.199999999999, target: 6500 },
  { month: 'T9', actual: undefined, forecast: 11196.199999999999, target: 6500 },
  { month: 'T10', actual: undefined, forecast: 11196.199999999999, target: 6500 },
  { month: 'T11', actual: undefined, forecast: 11196.199999999999, target: 6500 },
  { month: 'T12', actual: undefined, forecast: 11196.199999999999, target: 6500 },
]

const d = (month: number, day: number) => new Date(2026, month - 1, day, 12)

describe('PipelineReportService on the tenant pipeline stages', () => {
  beforeAll(() => jest.useFakeTimers({ now: NOW }))
  afterAll(() => jest.useRealTimers())

  it('on the 5 default stages gives the same numbers as the enum-based report', async () => {
    const result = await analyse({ pipelineStages: defaultStages(), deals: defaultDeals() })

    expect(result.conversionFunnel).toEqual(DEFAULT_FUNNEL)
    expect(result.bottlenecks).toEqual([
      { type: 'success', code: 'leadContactedGood', rate: 77 },
      { type: 'success', code: 'proposalWonHigh', rate: 57 },
    ])
    expect(result.averageWinVelocity).toBe('44.4%')
    expect(result.weightedForecast).toEqual(DEFAULT_FORECAST)
  })

  it('weights an open deal by its stage probability bit-for-bit like the old 0.1/0.3/0.6 factors', async () => {
    const stages = defaultStages()
    const deals = [
      { id: 'a', stageId: 's-prospect', value: 3 },
      { id: 'b', stageId: 's-qualified', value: 7 },
      { id: 'c', stageId: 's-proposal', value: 333 },
    ].map((spec) => dealRow({ ...spec, createdAt: d(7, 1) }, stages))

    const result = await analyse({ pipelineStages: stages, deals })

    // value × 10 / 100 would give 0.3 + 2.1 + 199.8; the old factors give these.
    expect(result.weightedForecast[6].forecast).toBe(3 * 0.1 + 7 * 0.3 + 333 * 0.6)
  })

  it('builds the funnel from the tenant stages: a custom stage is its own step, not part of «Лид» alone', async () => {
    const result = await analyse({ pipelineStages: customStages(), deals: customDeals() })

    expect(result.conversionFunnel).toEqual([
      {
        stage: 'Лид',
        stageId: 's-prospect',
        stageKey: 'PROSPECT',
        legacyKey: 'PROSPECT',
        count: 8,
        value: 13850,
        percentage: 100,
      },
      {
        stage: 'Квалификация',
        stageId: 's-custom',
        stageKey: null,
        legacyKey: null,
        count: 6,
        value: 12800,
        percentage: 75,
      },
      {
        stage: 'Контакт установлен',
        stageId: 's-qualified',
        stageKey: 'QUALIFIED',
        legacyKey: 'QUALIFIED',
        count: 4,
        value: 12200,
        percentage: 50,
      },
      {
        stage: 'Предложение',
        stageId: 's-proposal',
        stageKey: 'PROPOSAL',
        legacyKey: 'PROPOSAL',
        count: 3,
        value: 9700,
        percentage: 38,
      },
      {
        stage: 'Оплачено',
        stageId: 's-won',
        stageKey: 'CLOSED_WON',
        legacyKey: 'CLOSED_WON',
        count: 2,
        value: 5700,
        percentage: 25,
      },
    ])
    expect(result.averageWinVelocity).toBe('50.0%')
    // first → second open step 6/8, last open step → WON 2/3.
    expect(result.bottlenecks).toEqual([
      { type: 'success', code: 'leadContactedGood', rate: 75 },
      { type: 'success', code: 'proposalWonHigh', rate: 67 },
    ])
  })

  it('forecasts a custom-stage deal with that stage probability (45%), not the «Лид» 10%', async () => {
    const result = await analyse({ pipelineStages: customStages(), deals: customDeals() })

    // c1 400 × 45% in April; June adds w2 700 won + c2 200 × 45% + q1 2500 × 30% + p2 50 × 10%.
    const expected = [0, 100, 5100, 5280, 5280, 6825, 6825, 9225, 9225, 9225, 9225, 9225]
    result.weightedForecast.forEach((month, i) => expect(month.forecast).toBeCloseTo(expected[i], 6))
    expect(result.weightedForecast.map((m) => m.actual)).toEqual([
      0,
      0,
      5000,
      5000,
      5000,
      5700,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('leaves a deal without stageId out of every step and the forecast', async () => {
    const stages = defaultStages()
    const unstaged = dealRow({ id: 'n1', stageId: null, stage: 'QUALIFIED', value: 12345, createdAt: d(6, 1) }, stages)

    const result = await analyse({ pipelineStages: stages, deals: [...defaultDeals(), unstaged] })

    expect(result.conversionFunnel).toEqual(DEFAULT_FUNNEL)
    expect(result.weightedForecast).toEqual(DEFAULT_FORECAST)
  })

  it('ignores the stages and deals of another tenant', async () => {
    const result = await analyse({
      pipelineStages: [...defaultStages(), ...otherTenantStages()],
      deals: [...defaultDeals(), ...otherTenantDeals()],
    })

    expect(result.conversionFunnel).toEqual(DEFAULT_FUNNEL)
    expect(result.averageWinVelocity).toBe('44.4%')
    expect(result.weightedForecast).toEqual(DEFAULT_FORECAST)
  })
})
