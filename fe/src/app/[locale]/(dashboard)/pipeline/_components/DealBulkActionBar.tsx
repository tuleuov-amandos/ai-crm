"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAllDeals, useDealPipelineStore } from "@/stores/dealCards-store";
import { useDealSelectionStore } from "@/stores/dealSelection-store";
import { useBulkSetDealsArchived } from "@/hooks/useDeals";
import { countOpenStage, splitSelection, stageKindByDealId } from "@/lib/dealBulk";
import { ArchiveDealDialog } from "./ArchiveDealDialog";

// Bottom bar of the selection mode, shared by the board and the list view
// (both list the deals of the same board query). It is a row of the page
// layout, not an overlay, so it never covers the last cards or rows.
export function DealBulkActionBar() {
  const t = useTranslations("pipeline.archive");
  const columns = useDealPipelineStore((s) => s.columns);
  const selectedIds = useDealSelectionStore((s) => s.selectedIds);
  const exitSelection = useDealSelectionStore((s) => s.exitSelection);
  const bulk = useBulkSetDealsArchived();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Only deals still on the board count (a refetch may have dropped some)
  const { active, archived } = useMemo(
    () => splitSelection(getAllDeals(columns), selectedIds),
    [columns, selectedIds],
  );
  // Stage from the board column, unknown counts as open
  const openCount = useMemo(
    () => countOpenStage(active, stageKindByDealId(columns)),
    [active, columns],
  );

  const total = active.length + archived.length;
  if (total === 0 && !confirmOpen && !bulk.isPending) return null;

  // All batches done: leave the mode. A failed batch keeps the selection so
  // the user can retry (deals already done are skipped by the backend).
  const run = (dealIds: string[], isArchive: boolean) =>
    bulk.mutate(
      { dealIds, archived: isArchive },
      {
        onSuccess: (result) => {
          if (result.ok) exitSelection();
        },
      },
    );

  return (
    <div className="shrink-0 border-t bg-background px-4 py-2.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="mr-auto text-foreground tabular-nums"
          style={{ fontSize: 13, fontWeight: 600 }}
          aria-live="polite"
        >
          {t("bulk.selected", { count: total })}
        </span>
        {active.length > 0 && (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={bulk.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {bulk.isPending && bulk.variables?.archived ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Archive size={13} />
            )}
            {t("bulk.archive", { count: active.length })}
          </Button>
        )}
        {archived.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={bulk.isPending}
            onClick={() => run(archived, false)}
          >
            {bulk.isPending && bulk.variables?.archived === false ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ArchiveRestore size={13} />
            )}
            {t("bulk.unarchive", { count: archived.length })}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          disabled={bulk.isPending}
          onClick={exitSelection}
        >
          {t("cancelSelect")}
        </Button>
      </div>

      <ArchiveDealDialog
        dealCount={active.length}
        openCount={openCount}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => run(active, true)}
      />
    </div>
  );
}
