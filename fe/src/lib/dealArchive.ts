// Manual deal archive (POST /deals/archive, /deals/unarchive). An archived deal
// stays in reports and the forecast, so archiving a deal on an open stage is
// confirmed first.

/** archivedAt is an ISO string or null; mutation responses may omit it. */
export function isDealArchived(deal: { archivedAt?: string | null }): boolean {
  return deal.archivedAt != null;
}

/**
 * Archiving asks for confirmation unless the stage is known to be closed (WON
 * or LOST). An unknown stage (stages still loading) asks too.
 */
export function needsArchiveConfirm(stageKind: string | null | undefined): boolean {
  return stageKind !== "WON" && stageKind !== "LOST";
}
