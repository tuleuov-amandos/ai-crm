// Pure helpers behind Settings → Sales pipeline, free of React and path aliases
// so they can be unit-tested (pipelineStageSettings.test.mjs). Limits mirror
// be/src/routes/pipeline-stages/pipeline-stages.model.ts.

export const MAX_OPEN_STAGES = 12;
export const MIN_OPEN_STAGES = 1;

type StageKind = "OPEN" | "WON" | "LOST";

type StageLike = { id: string; order: number; kind: StageKind };

export type StageFormFields = { name: string; color: string; probability: number };

const byOrder = <T extends StageLike>(stages: readonly T[]) =>
  [...stages].sort((a, b) => a.order - b.order);

// Open stages (sortable) and the WON/LOST stages that always stay last.
export function splitStages<T extends StageLike>(stages: readonly T[]) {
  const sorted = byOrder(stages);
  return {
    open: sorted.filter((s) => s.kind === "OPEN"),
    closed: [
      ...sorted.filter((s) => s.kind === "WON"),
      ...sorted.filter((s) => s.kind === "LOST"),
    ],
  };
}

// Moves activeId to the position of overId. Returns the same array when the
// drop is a no-op or either id is not in the list (WON/LOST are not).
export function moveStageId(
  ids: readonly string[],
  activeId: string,
  overId: string | null | undefined,
): readonly string[] {
  if (!overId || activeId === overId) return ids;
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return ids;

  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}

export function isOrderChanged(before: readonly string[], after: readonly string[]): boolean {
  return before.length !== after.length || before.some((id, i) => id !== after[i]);
}

// The pipeline after a reorder, as the backend stores it: open stages 0..n-1 in
// the given sequence, then WON, then LOST. Used for the optimistic cache update.
export function applyOpenStageOrder<T extends StageLike>(
  stages: readonly T[],
  openIds: readonly string[],
): T[] {
  const { open, closed } = splitStages(stages);
  const openById = new Map(open.map((s) => [s.id, s]));
  const ordered = openIds.flatMap((id) => openById.get(id) ?? []);
  return [...ordered, ...closed].map((s, order) => ({ ...s, order }));
}

export function canAddStage(openCount: number): boolean {
  return openCount < MAX_OPEN_STAGES;
}

// WON/LOST can never be deleted; the pipeline keeps at least one open stage.
export function canDeleteStage(stage: { kind: StageKind }, openCount: number): boolean {
  return stage.kind === "OPEN" && openCount > MIN_OPEN_STAGES;
}

// Stages the deals of a deleted stage can move to: every other stage, by order.
export function deleteTargets<T extends StageLike>(stages: readonly T[], stageId: string): T[] {
  return byOrder(stages).filter((s) => s.id !== stageId);
}

// Preselected target: the first other open stage, else the first other stage.
export function defaultDeleteTarget(stages: readonly StageLike[], stageId: string): string {
  const targets = deleteTargets(stages, stageId);
  return (targets.find((s) => s.kind === "OPEN") ?? targets[0])?.id ?? "";
}

// PATCH /pipeline-stages/:id body: only the changed fields (the body is strict
// and rejects color/probability of WON/LOST stages).
export function changedStageFields<F extends StageFormFields>(
  initial: F,
  values: F,
  kind: StageKind,
): Partial<F> {
  const changes: Partial<F> = {};
  const name = values.name.trim();
  if (name !== initial.name) changes.name = name;
  if (kind !== "OPEN") return changes;
  if (values.color !== initial.color) changes.color = values.color;
  if (values.probability !== initial.probability) changes.probability = values.probability;
  return changes;
}
