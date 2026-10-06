import type { PipelineStage } from '../../../../generated/prisma-client/client'

// The stage a deal is in, read from Deal.stageId only. Deal.stage is no
// fallback: the dual write stores PROSPECT for every custom stage, so those
// deals would silently land in the first stage. A deal without stageId (or with
// a stage the tenant does not have) gets no stage and is left out of every
// stage-based figure.
export function stageResolver<S extends Pick<PipelineStage, 'id'>>(stages: S[]) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]))
  return (deal: { stageId: string | null }) => (deal.stageId ? byId.get(deal.stageId) : undefined)
}

// value × probability%. Written as value × (probability / 100), not
// value × probability / 100: 10/100, 30/100, 60/100 are the same doubles as
// the 0.1/0.3/0.6 factors used before, so the default stages forecast the
// exact same numbers.
export function weightedValue(value: unknown, probability: number) {
  return Number(value) * (probability / 100)
}

export function parseDates(startDateStr?: string, endDateStr?: string) {
  const now = new Date()
  let start = new Date(now.getFullYear(), 0, 1) // default Jan 1st of current year
  let end = new Date(now)

  if (startDateStr) {
    const parsed = new Date(startDateStr)
    if (!isNaN(parsed.getTime())) start = parsed
  }
  if (endDateStr) {
    const parsed = new Date(endDateStr)
    if (!isNaN(parsed.getTime())) end = parsed
  }
  return { start, end }
}
