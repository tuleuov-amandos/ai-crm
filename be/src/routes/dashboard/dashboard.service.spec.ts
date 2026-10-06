import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { buildReportsDb, ReportsDbTables } from '../../../test/in-memory-reports-db'
import {
  ADMIN,
  NOW,
  TENANT,
  USERS,
  customDeals,
  customStages,
  dealRow,
  defaultDeals,
  defaultStages,
  otherTenantDeals,
  otherTenantStages,
} from '../../../test/pipeline-stage-reports.fixtures'
import { PipelineStagesRepository } from '../pipeline-stages/pipeline-stages.repo'
import { DashboardRepository } from './dashboard.repo'
import { DashboardResSchema } from './dashboard.model'
import { DashboardService } from './dashboard.service'

// GET /dashboard: open/won/lost by the PipelineStage kind of Deal.stageId, the
// funnel columns are the tenant's stages.

const adminAbility = () => {
  const { can, build } = new AbilityBuilder(createMongoAbility)
  can('manage', 'all')
  return build()
}

const dashboard = async (tables: Pick<ReportsDbTables, 'pipelineStages' | 'deals'>) => {
  const db = buildReportsDb({ users: USERS, ...tables }) as never
  const service = new DashboardService(
    new DashboardRepository(db),
    { getTenantCacheVersion: () => Promise.resolve('1'), get: () => Promise.resolve(null), set: jest.fn() } as never,
    { createForUser: () => Promise.resolve(adminAbility()) } as never,
    new PipelineStagesRepository(db),
  )
  // The global ZodSerializerInterceptor parses the response with this schema.
  return DashboardResSchema.parse(await service.getDashboardData(TENANT, 'month', ADMIN))
}

// Reference numbers produced by the enum-based dashboard (before this change)
// on defaultDeals(), for June 1–15 against May.
const DEFAULT_METRICS = {
  totalDealValue: {
    label: 'Total deal value',
    value: 2643,
    trend: { value: 235, positive: true },
    subtext: 'vs. previous period',
  },
  openDeals: { label: 'Open deals', value: 3, trend: { value: 1, positive: true }, subtext: 'In pipeline' },
  winRate: { label: 'Win rate', value: 50, trend: { value: 50, positive: true }, subtext: 'vs. previous period' },
  monthlyRevenue: { label: 'Monthly revenue', value: 800, progress: { current: 800, target: 500000000 } },
}
const DEFAULT_STAGES = [
  { name: 'Лид', key: 'PROSPECT', stageId: 's-prospect', legacyKey: 'PROSPECT', count: 1, value: 3 },
  {
    name: 'Контакт установлен',
    key: 'QUALIFIED',
    stageId: 's-qualified',
    legacyKey: 'QUALIFIED',
    count: 1,
    value: 7,
  },
  { name: 'Предложение', key: 'PROPOSAL', stageId: 's-proposal', legacyKey: 'PROPOSAL', count: 1, value: 333 },
  { name: 'Выиграно', key: 'CLOSED_WON', stageId: 's-won', legacyKey: 'CLOSED_WON', count: 1, value: 800 },
]
const DEFAULT_LEADERBOARD = [{ rank: 1, userId: 'rep-1', name: 'Rep', deals: 1, revenue: 800 }]

const recentDeal = (
  id: string,
  stage: string,
  stageId: string | null,
  stageName: string | null,
  value: number,
  ownerId: string,
  daysAgo: number,
) => ({
  id,
  title: `Deal ${id}`,
  company: `Company ${id}`,
  stage,
  stageId,
  stageName,
  value,
  owner: { id: ownerId, name: ownerId === 'admin-1' ? 'Admin' : 'Rep' },
  daysAgo,
})

describe('DashboardService on the tenant pipeline stages', () => {
  beforeAll(() => jest.useFakeTimers({ now: NOW }))
  afterAll(() => jest.useRealTimers())

  it('on the 5 default stages gives the same numbers as the enum-based dashboard', async () => {
    const result = await dashboard({ pipelineStages: defaultStages(), deals: defaultDeals() })

    expect(result.metrics).toEqual(DEFAULT_METRICS)
    expect(result.pipelineFunnel).toEqual({ stages: DEFAULT_STAGES, totalCount: 5, totalValue: 2643 })
    expect(result.leaderboard).toEqual(DEFAULT_LEADERBOARD)
    expect(result.recentDeals).toEqual([
      recentDeal('q2', 'QUALIFIED', 's-qualified', 'Контакт установлен', 7, 'admin-1', 5),
      recentDeal('l4', 'CLOSED_LOST', 's-lost', 'Проиграно', 1500, 'admin-1', 9),
      recentDeal('p2', 'PROSPECT', 's-prospect', 'Лид', 3, 'rep-1', 10),
      recentDeal('w3', 'CLOSED_WON', 's-won', 'Выиграно', 800, 'rep-1', 12),
      recentDeal('r2', 'PROPOSAL', 's-proposal', 'Предложение', 333, 'rep-1', 13),
    ])
  })

  it('gives each tenant stage but LOST its own column; a custom-stage deal is not in «Лид»', async () => {
    const result = await dashboard({ pipelineStages: customStages(), deals: customDeals() })

    // June 1–15: p2 (Лид, 50), c2 (custom, 200), w2 (won, 700).
    expect(result.pipelineFunnel).toEqual({
      stages: [
        { name: 'Лид', key: 'PROSPECT', stageId: 's-prospect', legacyKey: 'PROSPECT', count: 1, value: 50 },
        { name: 'Квалификация', key: null, stageId: 's-custom', legacyKey: null, count: 1, value: 200 },
        {
          name: 'Контакт установлен',
          key: 'QUALIFIED',
          stageId: 's-qualified',
          legacyKey: 'QUALIFIED',
          count: 0,
          value: 0,
        },
        { name: 'Предложение', key: 'PROPOSAL', stageId: 's-proposal', legacyKey: 'PROPOSAL', count: 0, value: 0 },
        { name: 'Оплачено', key: 'CLOSED_WON', stageId: 's-won', legacyKey: 'CLOSED_WON', count: 1, value: 700 },
      ],
      totalCount: 3,
      totalValue: 950,
    })
    expect(result.metrics.openDeals.value).toBe(2)
    expect(result.metrics.winRate.value).toBe(100)
    expect(result.metrics.monthlyRevenue.value).toBe(700)
    expect(result.leaderboard).toEqual([{ rank: 1, userId: 'admin-1', name: 'Admin', deals: 1, revenue: 700 }])
    expect(result.recentDeals.find((deal) => deal.id === 'c2')).toEqual(
      recentDeal('c2', 'PROSPECT', 's-custom', 'Квалификация', 200, 'admin-1', 14),
    )
  })

  it('leaves a deal without stageId out of the columns, open deals, win rate, revenue and leaderboard', async () => {
    const stages = defaultStages()
    const unstaged = dealRow(
      {
        id: 'n1',
        stageId: null,
        stage: 'CLOSED_WON',
        value: 12345,
        createdAt: new Date(2026, 5, 11, 12),
        closeDate: new Date(2026, 5, 11, 12),
      },
      stages,
    )

    const result = await dashboard({ pipelineStages: stages, deals: [...defaultDeals(), unstaged] })

    expect(result.pipelineFunnel.stages).toEqual(DEFAULT_STAGES)
    expect(result.metrics.openDeals).toEqual(DEFAULT_METRICS.openDeals)
    expect(result.metrics.winRate).toEqual(DEFAULT_METRICS.winRate)
    expect(result.metrics.monthlyRevenue).toEqual(DEFAULT_METRICS.monthlyRevenue)
    expect(result.leaderboard).toEqual(DEFAULT_LEADERBOARD)
    // Totals do not depend on stages and still include it.
    expect(result.pipelineFunnel.totalCount).toBe(6)
    expect(result.metrics.totalDealValue.value).toBe(14988)
    expect(result.recentDeals[0]).toEqual(recentDeal('n1', 'CLOSED_WON', null, null, 12345, 'admin-1', 4))
  })

  it('ignores the stages and deals of another tenant', async () => {
    const alone = await dashboard({ pipelineStages: defaultStages(), deals: defaultDeals() })
    const mixed = await dashboard({
      pipelineStages: [...defaultStages(), ...otherTenantStages()],
      deals: [...defaultDeals(), ...otherTenantDeals()],
    })

    expect(mixed).toEqual(alone)
    expect(mixed.pipelineFunnel.stages).toEqual(DEFAULT_STAGES)
  })

  it('still serializes a response cached in Redis before this change (no stageId, enum keys)', () => {
    const cachedBeforeChange = {
      metrics: DEFAULT_METRICS,
      pipelineFunnel: {
        stages: [
          { name: 'Prospect', key: 'PROSPECT', count: 1, value: 3 },
          { name: 'Qualified', key: 'QUALIFIED', count: 1, value: 7 },
          { name: 'Proposal', key: 'PROPOSAL', count: 1, value: 333 },
          { name: 'Closed Won', key: 'CLOSED_WON', count: 1, value: 800 },
        ],
        totalCount: 5,
        totalValue: 2643,
      },
      leaderboard: DEFAULT_LEADERBOARD,
      recentDeals: [
        {
          id: 'q2',
          title: 'Deal q2',
          company: 'Company q2',
          stage: 'QUALIFIED',
          value: 7,
          owner: { id: 'admin-1', name: 'Admin' },
          daysAgo: 5,
        },
      ],
      upcomingActivities: [],
    }

    expect(DashboardResSchema.parse(cachedBeforeChange)).toEqual(cachedBeforeChange)
  })
})
