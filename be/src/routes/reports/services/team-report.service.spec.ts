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
import { TeamPerformanceResDto } from '../reports.dto'
import { ReportsRepository } from '../reports.repo'
import { TeamReportService } from './team-report.service'

// GET /reports/team-performance: a rep's won and lost deals are picked by the
// PipelineStage kind of Deal.stageId.

const adminAbility = () => {
  const { can, build } = new AbilityBuilder(createMongoAbility)
  can('manage', 'all')
  return build()
}

const teamPerformance = async (tables: Pick<ReportsDbTables, 'pipelineStages' | 'deals'>) => {
  const db = buildReportsDb({ users: USERS, kpiTargets: KPI_TARGETS, ...tables }) as never
  const service = new TeamReportService(new ReportsRepository(db), {
    createForUser: () => Promise.resolve(adminAbility()),
  } as never)
  return TeamPerformanceResDto.schema.parse(await service.getTeamPerformance('2026-01-01', '2026-06-30', ADMIN))
}

// Reference numbers produced by the enum-based report (before this change) on
// defaultDeals().
const DEFAULT_REPS = [
  { userId: 'admin-1', name: 'Admin', actual: 5000, target: 3000, winRate: 25, activities: 0, avgDaysToClose: 33 },
  { userId: 'rep-1', name: 'Rep', actual: 2000, target: 3500, winRate: 67, activities: 0, avgDaysToClose: 57 },
]

describe('TeamReportService on the tenant pipeline stages', () => {
  beforeAll(() => jest.useFakeTimers({ now: NOW }))
  afterAll(() => jest.useRealTimers())

  it('on the 5 default stages gives the same numbers as the enum-based report', async () => {
    const result = await teamPerformance({ pipelineStages: defaultStages(), deals: defaultDeals() })

    expect(result.reps).toEqual(DEFAULT_REPS)
  })

  it('counts deals of renamed WON/LOST stages, not deals of a custom open stage', async () => {
    const result = await teamPerformance({ pipelineStages: customStages(), deals: customDeals() })

    // admin-1 owns every custom deal: won w1 + w2, lost l1 + l2; c1 has a
    // closeDate in the period but is open.
    expect(result.reps[0]).toMatchObject({ userId: 'admin-1', actual: 5700, winRate: 50 })
  })

  it('leaves a deal without stageId out of actual and win rate', async () => {
    const stages = defaultStages()
    const unstaged = dealRow(
      {
        id: 'n1',
        stageId: null,
        stage: 'CLOSED_WON',
        value: 12345,
        createdAt: new Date(2026, 3, 1, 12),
        closeDate: new Date(2026, 3, 5, 12),
      },
      stages,
    )

    const result = await teamPerformance({ pipelineStages: stages, deals: [...defaultDeals(), unstaged] })

    expect(result.reps).toEqual(DEFAULT_REPS)
  })

  it('ignores the deals of another tenant even for the same owner ids', async () => {
    const result = await teamPerformance({
      pipelineStages: [...defaultStages(), ...otherTenantStages()],
      deals: [...defaultDeals(), ...otherTenantDeals()],
    })

    expect(result.reps).toEqual(DEFAULT_REPS)
  })
})
