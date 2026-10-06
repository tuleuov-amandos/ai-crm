"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Lock, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  usePipelineStages,
  useReorderPipelineStages,
  useStageLabel,
} from "@/hooks/usePipelineStages";
import { getStageColors } from "@/lib/pipelineColors";
import {
  MAX_OPEN_STAGES,
  canAddStage,
  canDeleteStage,
  isOrderChanged,
  moveStageId,
  splitStages,
} from "@/lib/pipelineStageSettings";
import type { PipelineStage } from "@/lib/validations/pipelineStages.schema";
import { PipelineStageFormDialog } from "./PipelineStageFormDialog";
import { DeletePipelineStageDialog } from "./DeletePipelineStageDialog";

const rowCls =
  "flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-card border-b border-[#E8E7E2] dark:border-border last:border-b-0 first:rounded-t-[10px] last:rounded-b-[10px]";

const iconBtnCls =
  "size-8 rounded-lg text-[#6B6B67] dark:text-muted-foreground hover:bg-[#F1EFE8] dark:hover:bg-muted hover:text-[#1A1A18] dark:hover:text-foreground";

// ── Row parts ─────────────────────────────────────────────────────────────────
function StageSummary({ stage, label, caption }: { stage: PipelineStage; label: string; caption?: string }) {
  const t = useTranslations("settings.pipelineStages");
  return (
    <>
      <span
        className="size-2.5 rounded-full shrink-0"
        style={{ backgroundColor: getStageColors(stage.color).dot }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[#1A1A18] dark:text-foreground truncate" style={{ fontSize: 13, fontWeight: 500 }}>
          {label}
        </p>
        {caption && (
          <p className="text-[#6B6B67] dark:text-muted-foreground truncate" style={{ fontSize: 11 }}>{caption}</p>
        )}
      </div>
      <span className="text-[#1A1A18] dark:text-foreground tabular-nums shrink-0 text-right" style={{ fontSize: 13, width: 44 }}>
        {stage.probability}%
      </span>
      <span className="text-[#6B6B67] dark:text-muted-foreground tabular-nums shrink-0 text-right" style={{ fontSize: 12, width: 80 }}>
        {t("dealCount", { count: stage.dealCount ?? 0 })}
      </span>
    </>
  );
}

function SortableStageRow({
  stage,
  label,
  deleteDisabled,
  onEdit,
  onDelete,
}: {
  stage: PipelineStage;
  label: string;
  deleteDisabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("settings.pipelineStages");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(rowCls, isDragging && "relative z-10 shadow-md rounded-lg")}
    >
      {/* Only the handle starts a drag, so the row buttons stay clickable. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t("dragHandle", { name: label })}
        className="shrink-0 -ml-1 p-1 rounded-md text-[#A3A29D] dark:text-muted-foreground hover:text-[#1A1A18] dark:hover:text-foreground hover:bg-[#F1EFE8] dark:hover:bg-muted cursor-grab active:cursor-grabbing touch-none bg-transparent border-0"
      >
        <GripVertical size={15} />
      </button>
      <StageSummary stage={stage} label={label} />
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" onClick={onEdit} className={iconBtnCls} aria-label={t("edit")} title={t("edit")}>
          <Pencil size={14} />
        </Button>
        {/* A disabled button gets no hover events, the wrapper carries the hint. */}
        <span title={deleteDisabled ? t("lastStageHint") : t("delete")}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={deleteDisabled}
            className={cn(iconBtnCls, "hover:text-[#B42318] dark:hover:text-red-400")}
            aria-label={t("delete")}
          >
            <Trash2 size={14} />
          </Button>
        </span>
      </div>
    </li>
  );
}

function ClosedStageRow({ stage, label, onEdit }: { stage: PipelineStage; label: string; onEdit: () => void }) {
  const t = useTranslations("settings.pipelineStages");
  const caption = stage.kind === "WON" ? t("wonCaption") : t("lostCaption");
  return (
    <li className={rowCls}>
      <span className="shrink-0 -ml-1 p-1 text-[#A3A29D] dark:text-muted-foreground" title={t("systemFixed")}>
        <Lock size={15} />
      </span>
      <StageSummary stage={stage} label={label} caption={caption} />
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" onClick={onEdit} className={iconBtnCls} aria-label={t("edit")} title={t("edit")}>
          <Pencil size={14} />
        </Button>
        {/* Keeps the action column aligned with the open stage rows. */}
        <span className="size-8" aria-hidden />
      </div>
    </li>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PipelineStagesSettings() {
  const t = useTranslations("settings.pipelineStages");
  const { stages, isLoading, isError } = usePipelineStages();
  const stageLabel = useStageLabel();
  const reorder = useReorderPipelineStages();

  const { open, closed } = useMemo(() => splitStages(stages), [stages]);

  // Order of the last drop until the reorder settles. The stages cache is
  // updated optimistically too, but asynchronously; this keeps the dropped row
  // from flashing back to its old place in between.
  const [pendingOrder, setPendingOrder] = useState<readonly string[] | null>(null);
  const openStages = useMemo(() => {
    if (!pendingOrder) return open;
    const byId = new Map(open.map((s) => [s.id, s]));
    return pendingOrder.flatMap((id) => byId.get(id) ?? []);
  }, [open, pendingOrder]);
  const openIds = useMemo(() => openStages.map((s) => s.id), [openStages]);

  const [formOpen, setFormOpen] = useState(false);
  const [formStage, setFormStage] = useState<PipelineStage | null>(null);
  const [deletingStage, setDeletingStage] = useState<PipelineStage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const next = moveStageId(openIds, String(active.id), over ? String(over.id) : null);
    // The backend writes an audit entry even for an unchanged order.
    if (!isOrderChanged(openIds, next)) return;
    setPendingOrder(next);
    reorder.mutate([...next], { onSettled: () => setPendingOrder(null) });
  };

  const openForm = (stage: PipelineStage | null) => {
    setFormStage(stage);
    setFormOpen(true);
  };

  const canAdd = canAddStage(open.length);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2" style={{ minHeight: 320 }}>
        <Loader2 className="animate-spin text-[#6B6B67] dark:text-muted-foreground" size={22} />
        <p className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 13 }}>{t("loading")}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 320 }}>
        <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 13 }}>{t("loadError")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Content header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{t("heading")}</h1>
          <p className="text-[#6B6B67] dark:text-muted-foreground mt-1.5" style={{ fontSize: 13 }}>{t("subtitle")}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Button
            onClick={() => openForm(null)}
            disabled={!canAdd}
            className="h-9 rounded-[10px] bg-[#534AB7] hover:bg-[#4840A0] text-white"
            style={{ fontSize: 13 }}
          >
            <Plus size={14} />
            {t("addStage")}
          </Button>
          {!canAdd && (
            <p className="text-[#6B6B67] dark:text-muted-foreground text-right" style={{ fontSize: 11 }}>
              {t("limitHint", { max: MAX_OPEN_STAGES })}
            </p>
          )}
        </div>
      </div>

      {/* Open stages — sortable */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[#6B6B67] dark:text-muted-foreground tracking-wider" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>
          {t("openStages")}
        </h2>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={openIds} strategy={verticalListSortingStrategy}>
            <ul className="rounded-[10px] border border-[#E8E7E2] dark:border-border">
              {openStages.map((stage) => (
                <SortableStageRow
                  key={stage.id}
                  stage={stage}
                  label={stageLabel(stage)}
                  deleteDisabled={!canDeleteStage(stage, open.length)}
                  onEdit={() => openForm(stage)}
                  onDelete={() => setDeletingStage(stage)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </section>

      {/* WON / LOST — fixed at the end, outside the sortable list */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[#6B6B67] dark:text-muted-foreground tracking-wider" style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>
          {t("closedStages")}
        </h2>
        <ul className="rounded-[10px] border border-[#E8E7E2] dark:border-border">
          {closed.map((stage) => (
            <ClosedStageRow
              key={stage.id}
              stage={stage}
              label={stageLabel(stage)}
              onEdit={() => openForm(stage)}
            />
          ))}
        </ul>
      </section>

      <PipelineStageFormDialog open={formOpen} onOpenChange={setFormOpen} stage={formStage} />
      <DeletePipelineStageDialog
        stage={deletingStage}
        stages={stages}
        onClose={() => setDeletingStage(null)}
      />
    </div>
  );
}
