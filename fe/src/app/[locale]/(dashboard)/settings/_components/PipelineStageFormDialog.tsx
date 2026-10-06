"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useApiError } from "@/hooks/useApiError";
import { useCreatePipelineStage, useUpdatePipelineStage } from "@/hooks/usePipelineStages";
import { getStageColors } from "@/lib/pipelineColors";
import { changedStageFields } from "@/lib/pipelineStageSettings";
import {
  OPEN_STAGE_COLORS,
  PIPELINE_STAGE_NAME_MAX,
  PipelineStageFormSchema,
  type PipelineStage,
  type PipelineStageFormValues,
} from "@/lib/validations/pipelineStages.schema";
import type { ApiError } from "@/types/error.type";

type OpenStageColor = PipelineStageFormValues["color"];

const NEW_STAGE: PipelineStageFormValues = { name: "", color: "blue", probability: 20 };

const isOpenStageColor = (color: string): color is OpenStageColor =>
  (OPEN_STAGE_COLORS as readonly string[]).includes(color);

// Form values of an existing stage. A WON/LOST stage edits only its name; its
// color and probability are fixed, so the form holds valid placeholders for
// them that are never shown or sent.
const toFormValues = (stage: PipelineStage | null): PipelineStageFormValues => {
  if (!stage) return NEW_STAGE;
  if (stage.kind !== "OPEN") return { ...NEW_STAGE, name: stage.name };
  return {
    name: stage.name,
    color: isOpenStageColor(stage.color) ? stage.color : NEW_STAGE.color,
    probability: stage.probability,
  };
};

const inputCls =
  "h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null creates a new open stage
  stage: PipelineStage | null;
}

export function PipelineStageFormDialog({ open, onOpenChange, stage }: Props) {
  const t = useTranslations("settings.pipelineStages");
  const tCommon = useTranslations("common");
  const getApiError = useApiError();
  const createStage = useCreatePipelineStage();
  const updateStage = useUpdatePipelineStage();

  const isSystem = !!stage && stage.kind !== "OPEN";
  const initial = useMemo(() => toFormValues(stage), [stage]);
  const isPending = createStage.isPending || updateStage.isPending;

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PipelineStageFormValues>({
    resolver: zodResolver(PipelineStageFormSchema),
    defaultValues: initial,
  });

  useEffect(() => {
    if (open) reset(initial);
  }, [open, initial, reset]);

  const handleError = (error: unknown) => {
    // Case-insensitive name uniqueness is checked by the backend only.
    if ((error as ApiError)?.response?.data?.code === "PIPELINE_STAGE_NAME_TAKEN") {
      setError("name", { type: "server", message: getApiError(error) });
      return;
    }
    toast.error(getApiError(error, t(stage ? "toasts.updateError" : "toasts.createError")));
  };

  const close = () => onOpenChange(false);

  const onSubmit = (values: PipelineStageFormValues) => {
    if (!stage) {
      createStage.mutate(values, { onSuccess: close, onError: handleError });
      return;
    }
    // The PATCH body is strict: only changed fields, only the name for WON/LOST.
    const data = changedStageFields(initial, values, stage.kind);
    if (Object.keys(data).length === 0) {
      close();
      return;
    }
    updateStage.mutate({ id: stage.id, data }, { onSuccess: close, onError: handleError });
  };

  const nameError = errors.name
    ? errors.name.type === "server"
      ? errors.name.message
      : t(`validation.${errors.name.message}`)
    : undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-w-[440px] p-5">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 15, fontWeight: 600 }}>
            {t(stage ? "form.editTitle" : "form.createTitle")}
          </DialogTitle>
          {isSystem && (
            <DialogDescription style={{ fontSize: 12 }}>{t("form.systemNote")}</DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pipeline-stage-name" className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>
              {t("form.nameLabel")}
            </Label>
            <Input
              id="pipeline-stage-name"
              {...register("name")}
              maxLength={PIPELINE_STAGE_NAME_MAX}
              placeholder={t("form.namePlaceholder")}
              aria-invalid={!!nameError}
              autoFocus
              className={inputCls}
              style={{ fontSize: 13 }}
            />
            {nameError && (
              <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>{nameError}</p>
            )}
          </div>

          {!isSystem && (
            <>
              {/* Color */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>
                  {t("form.colorLabel")}
                </Label>
                <Controller
                  control={control}
                  name="color"
                  render={({ field }) => (
                    <div role="radiogroup" aria-label={t("form.colorLabel")} className="flex flex-wrap gap-2">
                      {OPEN_STAGE_COLORS.map((color) => {
                        const selected = field.value === color;
                        return (
                          <button
                            key={color}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={t(`colors.${color}`)}
                            title={t(`colors.${color}`)}
                            onClick={() => field.onChange(color)}
                            className={cn(
                              "size-7 rounded-full flex items-center justify-center transition-shadow cursor-pointer border-0",
                              selected
                                ? "ring-2 ring-offset-2 ring-[#534AB7] dark:ring-primary ring-offset-white dark:ring-offset-card"
                                : "hover:ring-2 hover:ring-offset-2 hover:ring-[#E8E7E2] dark:hover:ring-border ring-offset-white dark:ring-offset-card",
                            )}
                            style={{ backgroundColor: getStageColors(color).dot }}
                          >
                            {selected && <Check size={14} className="text-white" strokeWidth={3} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
                {errors.color?.message && (
                  <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>
                    {t(`validation.${errors.color.message}`)}
                  </p>
                )}
              </div>

              {/* Probability */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pipeline-stage-probability" className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>
                  {t("form.probabilityLabel")}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="pipeline-stage-probability"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    step={1}
                    {...register("probability", { valueAsNumber: true })}
                    aria-invalid={!!errors.probability}
                    className={cn(inputCls, "w-24")}
                    style={{ fontSize: 13 }}
                  />
                  <span className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 13 }}>%</span>
                </div>
                {errors.probability?.message ? (
                  <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>
                    {t(`validation.${errors.probability.message}`)}
                  </p>
                ) : (
                  <p className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 11 }}>
                    {t("form.probabilityHint")}
                  </p>
                )}
              </div>
            </>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={close} disabled={isPending}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="bg-[#534AB7] hover:bg-[#4840A0] text-white"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              {stage ? tCommon("save") : t("form.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
