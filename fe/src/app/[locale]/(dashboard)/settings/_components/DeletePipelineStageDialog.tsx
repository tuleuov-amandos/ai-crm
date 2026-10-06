"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDeletePipelineStage, useStageLabel } from "@/hooks/usePipelineStages";
import { getStageColors } from "@/lib/pipelineColors";
import { defaultDeleteTarget, deleteTargets } from "@/lib/pipelineStageSettings";
import type { PipelineStage } from "@/lib/validations/pipelineStages.schema";

interface Props {
  // The stage to delete; null keeps the dialog closed.
  stage: PipelineStage | null;
  stages: PipelineStage[];
  onClose: () => void;
}

// The backend needs a target whenever the stage still holds deals, archived
// (soft-deleted) ones included, and dealCount counts only active deals, so a
// target is always asked for.
export function DeletePipelineStageDialog({ stage, stages, onClose }: Props) {
  const t = useTranslations("settings.pipelineStages");
  const tCommon = useTranslations("common");
  const stageLabel = useStageLabel();
  const deleteStage = useDeletePipelineStage();

  const targets = useMemo(
    () => (stage ? deleteTargets(stages, stage.id) : []),
    [stages, stage],
  );
  const [targetId, setTargetId] = useState("");

  // Preselect once per opened stage (adjusting state during render), not on
  // every refetch of the list.
  const [preselectedFor, setPreselectedFor] = useState<string | null>(null);
  if (stage && stage.id !== preselectedFor) {
    setPreselectedFor(stage.id);
    setTargetId(defaultDeleteTarget(stages, stage.id));
  }

  const handleOpenChange = (open: boolean) => {
    if (open || deleteStage.isPending) return;
    setPreselectedFor(null);
    onClose();
  };

  const handleDelete = () => {
    if (!stage || !targetId) return;
    deleteStage.mutate({ id: stage.id, targetStageId: targetId }, { onSuccess: onClose });
  };

  const name = stage ? stageLabel(stage) : "";
  const dealCount = stage?.dealCount ?? 0;

  return (
    <AlertDialog open={!!stage} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteDialog.title", { name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {dealCount > 0
              ? t("deleteDialog.bodyWithDeals", { name, count: dealCount })
              : t("deleteDialog.bodyEmpty")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Select value={targetId || undefined} onValueChange={setTargetId} disabled={deleteStage.isPending}>
          <SelectTrigger
            aria-label={t("deleteDialog.targetLabel")}
            className="w-full h-10 rounded-[10px] border-[#E8E7E2] dark:border-border"
            style={{ fontSize: 13 }}
          >
            <SelectValue placeholder={t("deleteDialog.targetPlaceholder")} />
          </SelectTrigger>
          <SelectContent className="rounded-[10px] border-[#E8E7E2] dark:border-border bg-background">
            {targets.map((target) => (
              <SelectItem key={target.id} value={target.id} style={{ fontSize: 13 }}>
                <span className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: getStageColors(target.color).dot }}
                  />
                  {stageLabel(target)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteStage.isPending}>{tCommon("cancel")}</AlertDialogCancel>
          {/* Not AlertDialogAction: it would close the dialog before the request settles. */}
          <Button
            onClick={handleDelete}
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={!targetId || deleteStage.isPending}
          >
            {deleteStage.isPending && <Loader2 size={14} className="animate-spin" />}
            {t("deleteDialog.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
