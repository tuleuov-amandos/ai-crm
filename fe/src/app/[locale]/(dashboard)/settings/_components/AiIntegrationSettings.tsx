"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAiSettings, useUpdateAiSettings } from "@/hooks/useAiSettings";
import {
  AI_KEY_MAX_LENGTH,
  AI_KEY_MIN_LENGTH,
  AI_PROVIDER_OPTIONS,
  maskKeyLast4,
  providerLabel,
  providerPlaceholder,
} from "@/lib/aiSettings";
import {
  AiSettingsFormSchema,
  type AiSettingsFormValues,
} from "@/lib/validations/aiSettings.schema";
import { DeleteAiKeyDialog } from "./DeleteAiKeyDialog";

const DEFAULT_PROVIDER: AiSettingsFormValues["provider"] = "openai";

const inputCls =
  "h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]";

const outlineBtnCls = "h-9 rounded-[10px] border-[#E8E7E2] dark:border-border";

// The key lives only in the form field: it is cleared, and the mutation (which
// keeps its variables) is reset, once the key is saved, on cancel and on unmount.
function AiKeyForm({
  initialProvider,
  canCancel,
  onDone,
}: {
  initialProvider: AiSettingsFormValues["provider"];
  // Replacing an existing key can be cancelled; the first key cannot.
  canCancel: boolean;
  // Called after a successful save or on cancel.
  onDone: () => void;
}) {
  const t = useTranslations("settings.integrations");
  const tCommon = useTranslations("common");
  const updateKey = useUpdateAiSettings();
  const { reset: resetMutation, isPending } = updateKey;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AiSettingsFormValues>({
    resolver: zodResolver(AiSettingsFormSchema),
    defaultValues: { provider: initialProvider, apiKey: "" },
  });

  const selectedProvider = useWatch({ control, name: "provider" });

  useEffect(() => () => resetMutation(), [resetMutation]);

  const clear = () => {
    reset({ provider: initialProvider, apiKey: "" });
    resetMutation();
  };

  const onSubmit = (values: AiSettingsFormValues) => {
    if (isPending) return;
    updateKey.mutate(values, {
      onSuccess: () => {
        clear();
        onDone();
      },
    });
  };

  const handleCancel = () => {
    clear();
    onDone();
  };

  const validation = (message?: string) =>
    message
      ? t(`validation.${message}`, { min: AI_KEY_MIN_LENGTH, max: AI_KEY_MAX_LENGTH })
      : undefined;
  const providerError = validation(errors.provider?.message);
  const keyError = validation(errors.apiKey?.message);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {/* Provider */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ai-provider" className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>
          {t("form.providerLabel")}
        </Label>
        <Controller
          control={control}
          name="provider"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
              <SelectTrigger
                id="ai-provider"
                aria-invalid={!!providerError}
                className="w-full h-10 rounded-[10px] border-[#E8E7E2] dark:border-border"
                style={{ fontSize: 13 }}
              >
                <SelectValue placeholder={t("form.providerPlaceholder")} />
              </SelectTrigger>
              <SelectContent className="rounded-[10px] border-[#E8E7E2] dark:border-border bg-background">
                {AI_PROVIDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} style={{ fontSize: 13 }}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {providerError && (
          <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>{providerError}</p>
        )}
      </div>

      {/* Key */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ai-api-key" className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>
          {t("form.keyLabel")}
        </Label>
        <Input
          id="ai-api-key"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          {...register("apiKey")}
          placeholder={providerPlaceholder(selectedProvider)}
          readOnly={isPending}
          aria-invalid={!!keyError}
          className={inputCls}
          style={{ fontSize: 13 }}
        />
        {keyError ? (
          <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>{keyError}</p>
        ) : (
          <p className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 12 }}>{t("form.keyHint")}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={isPending}
          className="h-9 rounded-[10px] bg-[#534AB7] hover:bg-[#4840A0] text-white"
          style={{ fontSize: 13 }}
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          {t(isPending ? "form.submitting" : "form.submit")}
        </Button>
        {canCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isPending}
            className={outlineBtnCls}
            style={{ fontSize: 13 }}
          >
            {tCommon("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}

export function AiIntegrationSettings() {
  const t = useTranslations("settings.integrations");
  const { data, isLoading, isError, refetch, isFetching } = useAiSettings();
  const [replacing, setReplacing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const configured = !!data?.configured;
  const provider = data?.provider ?? null;

  return (
    <div className="flex flex-col gap-5 max-w-[640px]">

      {/* Content header */}
      <div>
        <h1 className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{t("heading")}</h1>
        <p className="text-[#6B6B67] dark:text-muted-foreground mt-1.5" style={{ fontSize: 13 }}>{t("subtitle")}</p>
      </div>

      <div className="rounded-[10px] border border-[#E8E7E2] dark:border-border bg-white dark:bg-card p-4">
        {isLoading ? (
          <div className="flex flex-col gap-3" aria-hidden>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-9 w-32" />
          </div>
        ) : isError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 13 }}>{t("loadError")}</p>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className={outlineBtnCls}
              style={{ fontSize: 13 }}
            >
              {isFetching && <Loader2 size={14} className="animate-spin" />}
              {t("retry")}
            </Button>
          </div>
        ) : configured && !replacing ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="size-8 shrink-0 rounded-full flex items-center justify-center bg-[#EEEDFE] dark:bg-secondary">
                <KeyRound size={15} className="text-[#534AB7] dark:text-primary" />
              </span>
              <p className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>
                {t("connected", {
                  provider: providerLabel(provider),
                  mask: maskKeyLast4(data?.keyLast4),
                })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setReplacing(true)}
                className={outlineBtnCls}
                style={{ fontSize: 13 }}
              >
                {t("replaceKey")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className={`${outlineBtnCls} text-[#B42318] dark:text-red-400 hover:text-[#B42318] dark:hover:text-red-400`}
                style={{ fontSize: 13 }}
              >
                {t("removeKey")}
              </Button>
            </div>
          </div>
        ) : (
          <AiKeyForm
            initialProvider={provider ?? DEFAULT_PROVIDER}
            canCancel={configured}
            onDone={() => setReplacing(false)}
          />
        )}
      </div>

      <DeleteAiKeyDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
