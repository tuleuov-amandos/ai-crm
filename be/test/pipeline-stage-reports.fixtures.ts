/**
 * Shared data for the reports and dashboard specs: the 5 default stages, a
 * tenant with a custom stage and renamed WON/LOST, and a second tenant whose
 * rows must never show up. Deal.stage is filled the way the dual write does
 * (legacyDealStageFor), so a custom-stage deal carries PROSPECT.
 */
import { legacyDealStageFor } from 'src/common/pipeline-stages/default-pipeline-stages'

export const TENANT = 't1'
export const OTHER_TENANT = 't2'
export const ADMIN = { userId: 'admin-1', role: 'ADMIN', tenantId: TENANT, iat: 0, exp: 0 }

type Kind = 'OPEN' | 'WON' | 'LOST'

export const stage = (
  id: string,
  name: string,
  order: number,
  kind: Kind,
  legacyKey: string | null,
  probability: number,
  tenantId = TENANT,
) => ({
  id,
  tenantId,
  name,
  color: 'blue',
  order,
  probability,
  kind,
  legacyKey,
  createdAt: new Date(2026, 0, 1, 0, 0, order),
  updatedAt: new Date(2026, 0, 1),
})

export type StageRow = ReturnType<typeof stage>

export const defaultStages = (tenantId = TENANT, prefix = 's') => [
  stage(`${prefix}-prospect`, 'Лид', 0, 'OPEN', 'PROSPECT', 10, tenantId),
  stage(`${prefix}-qualified`, 'Контакт установлен', 1, 'OPEN', 'QUALIFIED', 30, tenantId),
  stage(`${prefix}-proposal`, 'Предложение', 2, 'OPEN', 'PROPOSAL', 60, tenantId),
  stage(`${prefix}-won`, 'Выиграно', 3, 'WON', 'CLOSED_WON', 100, tenantId),
  stage(`${prefix}-lost`, 'Проиграно', 4, 'LOST', 'CLOSED_LOST', 0, tenantId),
]

// 4 open stages: a custom one (no legacyKey, 45%) right after «Лид», and the
// WON/LOST stages renamed.
export const customStages = () => [
  stage('s-prospect', 'Лид', 0, 'OPEN', 'PROSPECT', 10),
  stage('s-custom', 'Квалификация', 1, 'OPEN', null, 45),
  stage('s-qualified', 'Контакт установлен', 2, 'OPEN', 'QUALIFIED', 30),
  stage('s-proposal', 'Предложение', 3, 'OPEN', 'PROPOSAL', 60),
  stage('s-won', 'Оплачено', 4, 'WON', 'CLOSED_WON', 100),
  stage('s-lost', 'Отказ', 5, 'LOST', 'CLOSED_LOST', 0),
]

export const USERS = [
  { id: 'admin-1', tenantId: TENANT, name: 'Admin', role: 'ADMIN', deletedAt: null },
  { id: 'rep-1', tenantId: TENANT, name: 'Rep', role: 'SALES_REP', deletedAt: null },
]

type DealSpec = {
  id: string
  stageId: string | null
  value: number
  ownerId?: string
  createdAt: Date
  closeDate?: Date | null
  activities?: number
  deletedAt?: Date | null
  tenantId?: string
  // Legacy column override, for a deal written without stageId.
  stage?: string
}

export const dealRow = (spec: DealSpec, stages: StageRow[]) => {
  const pipelineStage = stages.find((s) => s.id === spec.stageId)
  const ownerId = spec.ownerId ?? 'admin-1'
  return {
    id: spec.id,
    tenantId: spec.tenantId ?? TENANT,
    contactId: `contact-${spec.id}`,
    ownerId,
    title: `Deal ${spec.id}`,
    value: spec.value,
    stage: spec.stage ?? legacyDealStageFor(pipelineStage),
    stageId: spec.stageId,
    isPaid: false,
    closeDate: spec.closeDate ?? null,
    note: null,
    createdAt: spec.createdAt,
    updatedAt: spec.createdAt,
    deletedAt: spec.deletedAt ?? null,
    contact: { company: `Company ${spec.id}` },
    owner: { id: ownerId, name: ownerId === 'admin-1' ? 'Admin' : 'Rep' },
    activities: Array.from({ length: spec.activities ?? 0 }, (_, i) => ({ id: `${spec.id}-a${i}` })),
  }
}

const d = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12)

// Mixed periods: "now" in the specs is 2026-06-15. Odd values (3, 7, 333) make
// value × probability land on non-representable doubles.
export const defaultDealSpecs = (prefix = 's'): DealSpec[] => [
  { id: 'p1', stageId: `${prefix}-prospect`, value: 1000, createdAt: d(2026, 2, 10) },
  {
    id: 'p2',
    stageId: `${prefix}-prospect`,
    value: 3,
    ownerId: 'rep-1',
    createdAt: d(2026, 6, 5),
    closeDate: d(2026, 7, 20),
    activities: 1,
  },
  {
    id: 'q1',
    stageId: `${prefix}-qualified`,
    value: 2500,
    ownerId: 'rep-1',
    createdAt: d(2026, 3, 3),
    closeDate: d(2026, 6, 25),
  },
  { id: 'q2', stageId: `${prefix}-qualified`, value: 7, createdAt: d(2026, 6, 10) },
  { id: 'q3', stageId: `${prefix}-qualified`, value: 250, createdAt: d(2026, 5, 20) },
  { id: 'r1', stageId: `${prefix}-proposal`, value: 4000, createdAt: d(2026, 4, 1), closeDate: d(2026, 8, 15) },
  { id: 'r2', stageId: `${prefix}-proposal`, value: 333, ownerId: 'rep-1', createdAt: d(2026, 6, 2) },
  { id: 'r3', stageId: `${prefix}-proposal`, value: 1100, createdAt: d(2025, 12, 20), closeDate: d(2026, 2, 28) },
  { id: 'p3', stageId: `${prefix}-prospect`, value: 90, ownerId: 'rep-1', createdAt: d(2026, 5, 25) },
  {
    id: 'w1',
    stageId: `${prefix}-won`,
    value: 5000,
    createdAt: d(2026, 1, 15),
    closeDate: d(2026, 3, 20),
    activities: 3,
  },
  {
    id: 'w2',
    stageId: `${prefix}-won`,
    value: 1200,
    ownerId: 'rep-1',
    createdAt: d(2026, 2, 1),
    closeDate: d(2026, 5, 5),
    activities: 2,
  },
  {
    id: 'w3',
    stageId: `${prefix}-won`,
    value: 800,
    ownerId: 'rep-1',
    createdAt: d(2026, 6, 3),
    closeDate: d(2026, 6, 12),
  },
  {
    id: 'w4',
    stageId: `${prefix}-won`,
    value: 2000,
    createdAt: d(2025, 9, 10),
    closeDate: d(2025, 11, 15),
    activities: 4,
  },
  {
    id: 'l1',
    stageId: `${prefix}-lost`,
    value: 600,
    createdAt: d(2026, 2, 20),
    closeDate: d(2026, 4, 2),
    activities: 1,
  },
  {
    id: 'l2',
    stageId: `${prefix}-lost`,
    value: 900,
    ownerId: 'rep-1',
    createdAt: d(2026, 3, 11),
    closeDate: d(2026, 5, 20),
    activities: 2,
  },
  {
    id: 'l3',
    stageId: `${prefix}-lost`,
    value: 450,
    createdAt: d(2026, 5, 12),
    closeDate: d(2026, 5, 30),
    activities: 3,
  },
  {
    id: 'l4',
    stageId: `${prefix}-lost`,
    value: 1500,
    createdAt: d(2026, 6, 6),
    closeDate: d(2026, 6, 14),
    activities: 5,
  },
  {
    id: 'l5',
    stageId: `${prefix}-lost`,
    value: 700,
    ownerId: 'rep-1',
    createdAt: d(2025, 10, 1),
    closeDate: d(2025, 12, 1),
  },
  // Soft-deleted: never counted.
  {
    id: 'x1',
    stageId: `${prefix}-won`,
    value: 99999,
    createdAt: d(2026, 6, 1),
    closeDate: d(2026, 6, 2),
    deletedAt: d(2026, 6, 3),
  },
]

export const defaultDeals = () => {
  const stages = defaultStages()
  return defaultDealSpecs().map((spec) => dealRow(spec, stages))
}

// On customStages(): c1/c2 sit in the custom stage and carry Deal.stage
// PROSPECT, like the dual write leaves them.
export const customDeals = () => {
  const stages = customStages()
  const specs: DealSpec[] = [
    { id: 'p1', stageId: 's-prospect', value: 1000, createdAt: d(2026, 2, 10) },
    { id: 'p2', stageId: 's-prospect', value: 50, createdAt: d(2026, 6, 9) },
    { id: 'c1', stageId: 's-custom', value: 400, createdAt: d(2026, 3, 1), closeDate: d(2026, 4, 10) },
    { id: 'c2', stageId: 's-custom', value: 200, createdAt: d(2026, 6, 1) },
    { id: 'q1', stageId: 's-qualified', value: 2500, createdAt: d(2026, 3, 3), closeDate: d(2026, 6, 25) },
    { id: 'r1', stageId: 's-proposal', value: 4000, createdAt: d(2026, 4, 1), closeDate: d(2026, 8, 15) },
    { id: 'w1', stageId: 's-won', value: 5000, createdAt: d(2026, 1, 15), closeDate: d(2026, 3, 20), activities: 3 },
    { id: 'w2', stageId: 's-won', value: 700, createdAt: d(2026, 6, 4), closeDate: d(2026, 6, 10) },
    { id: 'l1', stageId: 's-lost', value: 600, createdAt: d(2026, 2, 20), closeDate: d(2026, 4, 2), activities: 4 },
    { id: 'l2', stageId: 's-lost', value: 900, createdAt: d(2026, 3, 11), closeDate: d(2026, 5, 20), activities: 6 },
  ]
  return specs.map((spec) => dealRow(spec, stages))
}

// Another tenant with its own default stages and large deals in every stage,
// owned by the same user ids, so a missing tenantId filter changes the numbers.
export const otherTenantStages = () => [
  ...defaultStages(OTHER_TENANT, 'o'),
  stage('o-custom', 'Чужая стадия', 1, 'OPEN', null, 90, OTHER_TENANT),
]
export const otherTenantDeals = () => {
  const stages = otherTenantStages()
  return [
    ...defaultDealSpecs('o').map((spec) => ({ ...spec, id: `o-${spec.id}`, value: spec.value * 1000 })),
    { id: 'o-c1', stageId: 'o-custom', value: 777000, createdAt: d(2026, 6, 4), closeDate: d(2026, 6, 30) },
    // Points at a t1 stage id: only the deal query's own tenantId keeps it out.
    {
      id: 'o-x1',
      stageId: 's-won',
      stage: 'CLOSED_WON',
      value: 555000,
      createdAt: d(2026, 6, 4),
      closeDate: d(2026, 6, 5),
      activities: 1,
    },
  ].map((spec) => dealRow({ ...spec, tenantId: OTHER_TENANT }, stages))
}

export const KPI_TARGETS = [
  { tenantId: TENANT, userId: 'admin-1', month: 3, year: 2026, target: 3000 },
  { tenantId: TENANT, userId: 'rep-1', month: 5, year: 2026, target: 2000 },
  { tenantId: TENANT, userId: 'rep-1', month: 6, year: 2026, target: 1500 },
]

export const NOW = d(2026, 6, 15)
