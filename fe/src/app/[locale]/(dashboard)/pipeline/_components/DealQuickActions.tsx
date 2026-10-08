import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { dealKeys, useUpdateDealStage } from "@/hooks/useDeals";
import { usePipelineStages, useStageLabel } from "@/hooks/usePipelineStages";
import { buildTelHref, buildWhatsAppHref, isClosingStage } from "@/lib/dealQuickActions";
import type { PipelineStage } from "@/lib/validations/pipelineStages.schema";
import { DealDetail } from "./types";

type DealQuickActionsProps = {
  deal: DealDetail;
  /** Same toggle as the payment badge: set only for ADMIN and MANAGER. */
  onTogglePaid?: () => void;
  paidPending: boolean;
};

// Phone-only block (< md) at the top of the deal's info tab: call, WhatsApp,
// stage and payment status in reach of a thumb.
export function DealQuickActions({ deal, onTogglePaid, paidPending }: DealQuickActionsProps) {
  const t = useTranslations("pipeline");
  const tToasts = useTranslations("pipeline.toasts");
  const tCommon = useTranslations("common");
  const stageLabel = useStageLabel();
  const { stages, getDealStage, isLoading: stagesLoading } = usePipelineStages();
  // Same stage move as EditDealSheet: PATCH /deals/:id/stage with { stageId }
  const updateDealStage = useUpdateDealStage();
  const queryClient = useQueryClient();
  // A WON/LOST stage waiting for confirmation; kept while the dialog closes
  const [closingStage, setClosingStage] = useState<PipelineStage | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dealStageId = getDealStage(deal)?.id ?? "";
  // While the move is saved the select shows the target stage
  const shownStageId = updateDealStage.isPending
    ? updateDealStage.variables.to
    : dealStageId;
  const telHref = buildTelHref(deal.contact.phone);
  const whatsAppHref = buildWhatsAppHref(deal.contact.phone);

  // Errors toast in useUpdateDealStage. Its rollback is a no-op here: the
  // deal was not moved on the board optimistically.
  const moveToStage = (stageId: string) =>
    updateDealStage.mutate(
      { id: deal.id, from: dealStageId, to: stageId, data: { stageId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: dealKeys.detail(deal.id) });
          toast.success(tToasts("updateSuccess"));
        },
      },
    );

  const handleStageChange = (stageId: string) => {
    if (stageId === dealStageId) return;
    const target = stages.find((s) => s.id === stageId);
    if (!target) return;
    if (isClosingStage(target.kind)) {
      setClosingStage(target);
      setConfirmOpen(true);
    } else {
      moveToStage(stageId);
    }
  };

  return (
    <div className="md:hidden px-5 py-4 border-b border-border space-y-3">
      <p
        className="text-muted-foreground uppercase"
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}
      >
        {t("detail.quickActions")}
      </p>

      {/* Call + WhatsApp: only when the contact has a phone */}
      {telHref && (
        <div className="grid grid-cols-2 gap-2">
          <Button asChild className="h-11 gap-2 text-sm">
            <a href={telHref}>
              <Phone size={16} />
              {t("detail.call")}
            </a>
          </Button>
          {whatsAppHref && (
            <Button asChild variant="outline" className="h-11 gap-2 text-sm">
              <a href={whatsAppHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} style={{ color: "#25D366" }} />
                {t("detail.whatsapp")}
              </a>
            </Button>
          )}
        </div>
      )}

      {/* Stage */}
      <div className="space-y-1">
        <p className="text-muted-foreground" style={{ fontSize: 12 }}>
          {t("form.stageLabel")}
        </p>
        <Select
          value={shownStageId}
          onValueChange={handleStageChange}
          disabled={stagesLoading || updateDealStage.isPending}
        >
          <SelectTrigger className="w-full data-[size=default]:h-11 text-base">
            <SelectValue placeholder={stagesLoading ? tCommon("loading") : undefined} />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id} className="min-h-10 text-base">
                {stageLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Payment status */}
      <Button
        type="button"
        variant="outline"
        aria-pressed={deal.isPaid}
        disabled={!onTogglePaid || paidPending}
        onClick={onTogglePaid}
        className={cn(
          "h-11 w-full justify-start gap-2 text-sm",
          deal.isPaid && "border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300",
        )}
      >
        {deal.isPaid ? <CheckCircle2 size={16} /> : <Circle size={16} />}
        {deal.isPaid ? t("paymentStatus.paid") : t("paymentStatus.unpaid")}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontSize: 15 }}>
              {t("detail.closeConfirmTitle", { stage: closingStage ? stageLabel(closingStage) : "" })}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: 13 }}>
              {t("detail.closeConfirmDescription", { stage: closingStage ? stageLabel(closingStage) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ fontSize: 13 }}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              style={{ fontSize: 13 }}
              onClick={() => {
                if (closingStage) moveToStage(closingStage.id);
                setConfirmOpen(false);
              }}
            >
              {t("detail.closeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
