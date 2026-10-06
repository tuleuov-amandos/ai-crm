"use client";
import { useTranslations } from "next-intl";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { BoardColumnStage, Deal } from "./types";
import { DealCard } from "./DealCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getStageColors } from "@/lib/pipelineColors";
import { useStageLabel } from "@/hooks/usePipelineStages";

interface Props {
  stage: BoardColumnStage;
  deals: Deal[];
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
  onAddDeal: (stageId: string) => void;
}

function formatTotal(total: number, units: { billion: string; million: string }): string {
  if (total === 0) return "—";
  const millions = total / 1_000_000;
  if (millions >= 1000) return `${(millions / 1000).toFixed(1).replace(".0", "")} ${units.billion}`;
  return `${millions % 1 === 0 ? millions : millions.toFixed(1)}${units.million}`;
}

export function KanbanColumn({
  stage,
  deals,
  onEdit,
  onDelete,
  onAddDeal,
}: Props) {
  const t = useTranslations("pipeline");
  const stageLabel = useStageLabel();
  const units = { billion: t("units.billion"), million: t("units.million") };
  const colors = getStageColors(stage.color);
  const isWon = stage.kind === "WON";

  // Column is droppable target — id = PipelineStage id
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const totalValue = deals.reduce((sum, d) => sum + Number(d.value), 0);
  const isEmpty = deals.length === 0;

  // SortableContext needs id list in current order
  const dealIds = deals.map((d) => d.id);

  // Columns share the width down to 220px; past that the board scrolls sideways.
  return (
    <div className="flex flex-col flex-1 min-w-[220px] group/col h-full overflow-hidden">
      {/* ── Column header ─────────────────────────────────────────────── */}
      <div className="pb-3 pl-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="size-2 rounded-full shrink-0"
              style={{ background: colors.dot }}
            />
            <span
              className="text-foreground truncate"
              style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}
            >
              {stageLabel(stage)}
            </span>
            <span
              className="rounded-full px-1.5 tabular-nums shrink-0"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.text,
                background: colors.bg,
              }}
            >
              {deals.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/8"
            title={t("column.addDeal")}
            aria-label={t("column.addDeal")}
            onClick={() => onAddDeal(stage.id)}
          >
            <Plus size={14} />
          </Button>
        </div>
        <p
          className="pl-4 mt-0.5 text-muted-foreground tabular-nums"
          style={{ fontSize: 12 }}
        >
          {isEmpty
            ? t("column.noDeals")
            : t("column.summary", { count: deals.length, total: formatTotal(totalValue, units) })}
        </p>
      </div>

      {/* ── Droppable + Sortable zone ──────────────────────────────────── */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-[300px] rounded-[10px] p-2 flex flex-col gap-1.5 overflow-y-auto transition-all duration-150",
          isOver
            ? "bg-primary/5 border-[1.5px] border-dashed border-primary"
            : "bg-[#F8F8F7] dark:bg-muted/30 border-[1.5px] border-border/70",
        )}
      >
        <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
          {isEmpty ? (
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-2.5 flex-grow",
                "min-h-[80px] rounded-lg border-[1.5px] border-dashed transition-all duration-150",
                isOver
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/50 bg-transparent",
              )}
            >
              <p
                className="text-muted-foreground/60 select-none"
                style={{ fontSize: 12 }}
              >
                {t("column.dropHint")}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-muted-foreground hover:text-primary hover:bg-primary/8 px-3"
                style={{ fontSize: 12 }}
                onClick={() => onAddDeal(stage.id)}
              >
                <Plus size={12} />
                {t("column.addDeal")}
              </Button>
            </div>
          ) : (
            deals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                isWon={isWon}
                onEdit={() => onEdit(deal)}
                onDelete={() => onDelete(deal)}
              />
            ))
          )}
        </SortableContext>
        {!isEmpty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-muted-foreground hover:text-primary hover:bg-primary/8 px-3 mt-1 shrink-0"
            style={{ fontSize: 12 }}
            onClick={() => onAddDeal(stage.id)}
          >
            <Plus size={12} />
            {t("column.addDeal")}
          </Button>
        )}
      </div>
    </div>
  );
}
