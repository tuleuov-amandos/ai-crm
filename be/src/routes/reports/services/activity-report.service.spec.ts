import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { ActivitiesReportResDto } from '../reports.dto'
import { ActivityReportService } from './activity-report.service'

// GET /reports/activities: task status distribution is returned under stable
// keys (done / overdue / pending); the labels come from fe translations.

const adminAbility = () => {
  const { can, build } = new AbilityBuilder(createMongoAbility)
  can('manage', 'all')
  return build()
}

const NOW = new Date(2026, 5, 15, 12)
const ADMIN = { userId: 'admin-1', tenantId: 'tenant-1' } as never

const task = (done: boolean, dueDate: Date | null) => ({ done, dueDate, createdAt: new Date(2026, 5, 1) })

const report = async (tasks: ReturnType<typeof task>[]) => {
  const repo = {
    findActivities: () => Promise.resolve([]),
    findTasks: () => Promise.resolve(tasks),
  }
  const service = new ActivityReportService(
    repo as never,
    { createForUser: () => Promise.resolve(adminAbility()) } as never,
  )
  return ActivitiesReportResDto.schema.parse(await service.getActivitiesReport('2026-06-01', '2026-06-30', ADMIN))
}

describe('ActivityReportService task status distribution', () => {
  beforeAll(() => jest.useFakeTimers({ now: NOW }))
  afterAll(() => jest.useRealTimers())

  it('uses stable keys instead of display names', async () => {
    const result = await report([
      task(true, new Date(2026, 5, 10)),
      task(false, new Date(2026, 5, 1)),
      task(false, new Date(2026, 5, 25)),
      task(false, null),
    ])

    expect(result.statusDistribution).toEqual([
      { name: 'done', value: 25 },
      { name: 'overdue', value: 25 },
      { name: 'pending', value: 50 },
    ])
  })

  it('returns zeros for every key when there are no tasks', async () => {
    const result = await report([])

    expect(result.statusDistribution).toEqual([
      { name: 'done', value: 0 },
      { name: 'overdue', value: 0 },
      { name: 'pending', value: 0 },
    ])
  })
})
