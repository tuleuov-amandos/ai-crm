import type { BoardColumn, DealCard } from "@/lib/validations/deals.schema";

// Pure board helpers behind dealCards-store, free of zustand/React so they can
// be unit-tested (dealBoard.test.mjs). A deal's stage is the column it sits in.
// Each function returns the same array when nothing changes, so an unknown
// stage id or deal id is a no-op instead of a crash.

function findColumn(columns: BoardColumn[], stageId: string) {
  return columns.find((column) => column.stage.id === stageId);
}

// All deals of the board as one list, in column order.
export function getAllDeals(columns: BoardColumn[]): DealCard[] {
  return columns.flatMap((column) => column.deals);
}

export function findColumnByDealId(
  columns: BoardColumn[],
  dealId: string,
): BoardColumn | undefined {
  return columns.find((column) =>
    column.deals.some((deal) => deal.id === dealId),
  );
}

// Optimistic move: the deal goes to the top of the target column.
export function moveDealBetweenColumns(
  columns: BoardColumn[],
  dealId: string,
  fromStageId: string,
  toStageId: string,
): BoardColumn[] {
  if (fromStageId === toStageId) return columns;
  const from = findColumn(columns, fromStageId);
  const to = findColumn(columns, toStageId);
  const deal = from?.deals.find((d) => d.id === dealId);
  if (!from || !to || !deal) return columns;

  return columns.map((column) => {
    if (column === from) {
      return { ...column, deals: column.deals.filter((d) => d.id !== dealId) };
    }
    if (column === to) {
      return { ...column, deals: [{ ...deal, stageId: toStageId }, ...column.deals] };
    }
    return column;
  });
}

// Undo moveDealBetweenColumns when the API fails: from/to are the direction of
// the original move, the deal goes back to the end of the origin column.
export function rollbackDealMove(
  columns: BoardColumn[],
  dealId: string,
  fromStageId: string,
  toStageId: string,
): BoardColumn[] {
  if (fromStageId === toStageId) return columns;
  const from = findColumn(columns, fromStageId);
  const to = findColumn(columns, toStageId);
  const deal = to?.deals.find((d) => d.id === dealId);
  if (!from || !to || !deal) return columns;

  return columns.map((column) => {
    if (column === to) {
      return { ...column, deals: column.deals.filter((d) => d.id !== dealId) };
    }
    if (column === from) {
      return { ...column, deals: [...column.deals, { ...deal, stageId: fromStageId }] };
    }
    return column;
  });
}

// Same-column reorder (the backend does not store the order).
export function reorderDealInColumn(
  columns: BoardColumn[],
  stageId: string,
  fromIndex: number,
  toIndex: number,
): BoardColumn[] {
  const target = findColumn(columns, stageId);
  if (!target || fromIndex === toIndex) return columns;
  const size = target.deals.length;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= size || toIndex >= size) {
    return columns;
  }

  const deals = [...target.deals];
  const [moved] = deals.splice(fromIndex, 1);
  deals.splice(toIndex, 0, moved);
  return columns.map((column) => (column === target ? { ...column, deals } : column));
}

// Replace a deal in whatever column holds it.
export function replaceDeal(columns: BoardColumn[], updated: DealCard): BoardColumn[] {
  const target = findColumnByDealId(columns, updated.id);
  if (!target) return columns;
  return columns.map((column) =>
    column === target
      ? { ...column, deals: column.deals.map((d) => (d.id === updated.id ? updated : d)) }
      : column,
  );
}

// stageId narrows the lookup; when it is missing or the deal is not in that
// column, the deal is removed from whatever column holds it.
export function removeDealFromColumns(
  columns: BoardColumn[],
  dealId: string,
  stageId?: string | null,
): BoardColumn[] {
  const hinted = stageId ? findColumn(columns, stageId) : undefined;
  const target = hinted?.deals.some((d) => d.id === dealId)
    ? hinted
    : findColumnByDealId(columns, dealId);
  if (!target) return columns;
  return columns.map((column) =>
    column === target
      ? { ...column, deals: column.deals.filter((d) => d.id !== dealId) }
      : column,
  );
}
