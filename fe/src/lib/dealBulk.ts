// Bulk archive / unarchive of selected deals (POST /deals/archive,
// /deals/unarchive take 1-200 ids). Pure helpers, free of React and imports,
// so they can be unit-tested (dealBulk.test.mjs). The archived and open-stage
// rules are the same as isDealArchived and needsArchiveConfirm in dealArchive.ts.

export const BULK_BATCH_SIZE = 200;

export type SelectAllState = "all" | "some" | "none";

export type BatchResult =
  | { ok: true; updated: number }
  // updated counts the batches sent before the failed one
  | { ok: false; updated: number; error: unknown };

export function chunkIds(ids: string[], size = BULK_BATCH_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/**
 * Selected deals that are still on the board, split by archive state, in board
 * order. Ids of deals no longer listed (refetch, filters) are dropped.
 */
export function splitSelection(
  deals: { id: string; archivedAt?: string | null }[],
  selected: ReadonlySet<string>,
): { active: string[]; archived: string[] } {
  const active: string[] = [];
  const archived: string[] = [];
  for (const deal of deals) {
    if (!selected.has(deal.id)) continue;
    if (deal.archivedAt != null) archived.push(deal.id);
    else active.push(deal.id);
  }
  return { active, archived };
}

/** A deal's stage is the board column it sits in. */
export function stageKindByDealId(
  columns: { stage: { kind: string }; deals: { id: string }[] }[],
): Map<string, string> {
  const kinds = new Map<string, string>();
  for (const column of columns) {
    for (const deal of column.deals) kinds.set(deal.id, column.stage.kind);
  }
  return kinds;
}

/** Deals not on a closed (WON / LOST) stage; an unknown stage counts as open. */
export function countOpenStage(
  dealIds: string[],
  kinds: ReadonlyMap<string, string | null | undefined>,
): number {
  return dealIds.filter((id) => {
    const kind = kinds.get(id);
    return kind !== "WON" && kind !== "LOST";
  }).length;
}

export function selectAllState(
  selected: ReadonlySet<string>,
  visibleIds: string[],
): SelectAllState {
  const count = visibleIds.filter((id) => selected.has(id)).length;
  if (count === 0) return "none";
  return count === visibleIds.length ? "all" : "some";
}

/** All visible selected → deselect them; otherwise select them all. */
export function toggleAll(
  selected: ReadonlySet<string>,
  visibleIds: string[],
): Set<string> {
  const next = new Set(selected);
  if (selectAllState(selected, visibleIds) === "all") {
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }
  return next;
}

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function sumUpdated(results: { updated: number }[]): number {
  return results.reduce((sum, result) => sum + result.updated, 0);
}

/**
 * Sends the ids in batches one after another and stops at the first failed
 * batch. Retrying is safe: the backend skips deals already in that state.
 */
export async function runInBatches(
  ids: string[],
  send: (batch: string[]) => Promise<{ updated: number }>,
  size = BULK_BATCH_SIZE,
): Promise<BatchResult> {
  const results: { updated: number }[] = [];
  for (const batch of chunkIds(ids, size)) {
    try {
      results.push(await send(batch));
    } catch (error) {
      return { ok: false, updated: sumUpdated(results), error };
    }
  }
  return { ok: true, updated: sumUpdated(results) };
}
