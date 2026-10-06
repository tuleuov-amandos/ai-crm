/**
 * In-memory stand-in for the Prisma queries the reports and dashboard
 * repositories run, so specs exercise the real repositories. There is no
 * tenant extension here: only a tenantId the repository puts into `where`
 * isolates tenants, so a forgotten filter shows up in a spec. A filter the
 * fake does not know throws instead of matching silently.
 */

type Row = Record<string, any>

export type ReportsDbTables = {
  pipelineStages: Row[]
  // Deal scalars plus the `contact`, `owner` and `activities` relations; they
  // are returned only when the query includes them.
  deals: Row[]
  users?: Row[]
  kpiTargets?: Row[]
  activities?: Row[]
}

type Query = {
  where?: Row
  include?: Row
  select?: Row
  orderBy?: Row | Row[]
  take?: number
}

const DEAL_RELATIONS = ['contact', 'owner', 'activities', 'pipelineStage']

const sameValue = (actual: unknown, expected: unknown) =>
  actual instanceof Date && expected instanceof Date ? actual.getTime() === expected.getTime() : actual === expected

const matchCondition = (actual: any, condition: any) => {
  if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
    return sameValue(actual, condition)
  }
  return Object.entries(condition as Row).every(([op, value]) => {
    if (op === 'gte') return actual != null && actual >= value
    if (op === 'lte') return actual != null && actual <= value
    if (op === 'in') return (value as unknown[]).some((v) => sameValue(actual, v))
    throw new Error(`in-memory db: unsupported filter operator "${op}"`)
  })
}

const pick = (row: Row, select: Row) =>
  Object.fromEntries(
    Object.keys(select)
      .filter((key) => select[key])
      .map((key) => [key, row[key]]),
  )

const sortRows = (rows: Row[], orderBy?: Row | Row[]) => {
  const orders: Row[] = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : []
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [key, dir] = Object.entries(order)[0]
      const left = Number(a[key] instanceof Date ? a[key].getTime() : a[key])
      const right = Number(b[key] instanceof Date ? b[key].getTime() : b[key])
      if (left !== right) return (left < right ? -1 : 1) * (dir === 'desc' ? -1 : 1)
    }
    return 0
  })
}

export function buildReportsDb(tables: ReportsDbTables) {
  const stageOf = (deal: Row) => tables.pipelineStages.find((stage) => stage.id === deal.stageId) ?? null

  const matches = (row: Row, where: Row = {}, relation?: (row: Row, key: string) => Row | null) =>
    Object.entries(where).every(([key, condition]) => {
      if (relation && DEAL_RELATIONS.includes(key)) {
        const related = relation(row, key)
        return related !== null && matches(related, condition as Row)
      }
      return matchCondition(row[key], condition)
    })

  const dealRelation = (deal: Row, key: string) => (key === 'pipelineStage' ? stageOf(deal) : deal[key])

  const shapeDeal = (deal: Row, query: Query) => {
    if (query.select) return pick(deal, query.select)
    const scalars = Object.fromEntries(Object.entries(deal).filter(([key]) => !DEAL_RELATIONS.includes(key)))
    for (const [key, spec] of Object.entries(query.include ?? {})) {
      const related = dealRelation(deal, key)
      const select = spec === true ? null : ((spec as Row).select as Row)
      scalars[key] =
        related === null || select === null
          ? related
          : Array.isArray(related)
            ? related.map((item: Row) => pick(item, select))
            : pick(related as Row, select)
    }
    return scalars
  }

  const plainModel = (rows: Row[] = []) => ({
    findMany: (query: Query = {}) => {
      const found = sortRows(
        rows.filter((row) => matches(row, query.where)),
        query.orderBy,
      ).slice(0, query.take)
      return Promise.resolve(found.map((row) => (query.select ? pick(row, query.select) : { ...row })))
    },
    count: (query: Query = {}) => Promise.resolve(rows.filter((row) => matches(row, query.where)).length),
  })

  return {
    pipelineStage: plainModel(tables.pipelineStages),
    deal: {
      findMany: (query: Query = {}) => {
        const found = sortRows(
          tables.deals.filter((deal) => matches(deal, query.where, dealRelation)),
          query.orderBy,
        ).slice(0, query.take)
        return Promise.resolve(found.map((deal) => shapeDeal(deal, query)))
      },
    },
    user: plainModel(tables.users),
    kpiTarget: plainModel(tables.kpiTargets),
    activity: plainModel(tables.activities),
  }
}
