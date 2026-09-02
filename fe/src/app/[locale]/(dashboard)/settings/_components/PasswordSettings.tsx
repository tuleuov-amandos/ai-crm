"use client";

import React, { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Loader2, Lock, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { useMe } from "@/hooks/useAuth";
import { useChangePassword } from "@/hooks/useProfile";
import {
  ChangePasswordFormSchema,
  type ChangePasswordFormValues,
} from "@/lib/validations/profile.schema";
import { getPasswordStrength } from "@/lib/password-strength";

const PasswordInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => {
    const t = useTranslations("settings.account.password");
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={show ? "text" : "password"}
          className={cn(
            "h-10 pr-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]",
            className,
          )}
          style={{ fontSize: 13 }}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B67] dark:text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 cursor-pointer"
          aria-label={show ? t("hide") : t("show")}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

function StrengthMeter({ password }: { password: string }) {
  const t = useTranslations("auth.register.strength");
  if (!password) return null;
  const { level, labelKey, colorClass, bgClass, criteria } = getPasswordStrength(password);
  return (
    <div className="space-y-2 pt-0.5">
      <div className="flex gap-1">
        {([1, 2, 3] as const).map((i) => (
          <div key={i} className={cn("h-1 flex-1 rounded-full transition-all duration-300", i <= level ? bgClass : "bg-muted")} />
        ))}
      </div>
      {labelKey && (
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            {criteria.map((c) => (
              <span
                key={c.key}
                className={cn("flex items-center gap-1 text-[11px]", c.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}
              >
                <Check className={cn("size-3 transition-opacity", c.met ? "opacity-100" : "opacity-30")} strokeWidth={2.5} />
                {t(c.key)}
              </span>
            ))}
          </div>
          <span className={cn("text-[11px] font-medium", colorClass)}>{t(labelKey)}</span>
        </div>
      )}
    </div>
  );
}

export function PasswordSettings() {
  const t = useTranslations("settings.account.password");
  const { data: me } = useMe();
  const changePassword = useChangePassword();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(ChangePasswordFormSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const newPasswordValue = useWatch({ control, name: "newPassword" }) ?? "";

  const onSubmit = (values: ChangePasswordFormValues) => {
    changePassword.mutate(values, {
      onSuccess: () => reset({ currentPassword: "", newPassword: "", confirmPassword: "" }),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{t("heading")}</h1>
        <p className="text-[#6B6B67] dark:text-muted-foreground mt-1.5" style={{ fontSize: 13 }}>{t("subtitle")}</p>
      </div>

      <div className="bg-white dark:bg-card rounded-[10px] border border-[#E8E7E2] dark:border-border p-5 max-w-[480px]">
        <h2 className="text-[#1A1A18] dark:text-foreground mb-4 flex items-center gap-2" style={{ fontSize: 14, fontWeight: 500 }}>
          <Lock size={14} />
          {t("sectionTitle")}
        </h2>
        <div className="border-t border-[#E8E7E2] dark:border-border pt-4">
          {me && !me.hasPassword ? (
            <p className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 13 }}>{t("oauthNotice")}</p>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("current")}</Label>
                <PasswordInput autoComplete="current-password" {...register("currentPassword")} />
                {errors.currentPassword?.message && (
                  <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>{t(`validation.${errors.currentPassword.message}`)}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("new")}</Label>
                <PasswordInput autoComplete="new-password" {...register("newPassword")} />
                <StrengthMeter password={newPasswordValue} />
                {errors.newPassword?.message && (
                  <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>{t(`validation.${errors.newPassword.message}`)}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("confirm")}</Label>
                <PasswordInput autoComplete="new-password" {...register("confirmPassword")} />
                {errors.confirmPassword?.message && (
                  <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>{t(`validation.${errors.confirmPassword.message}`)}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={changePassword.isPending}
                className="h-9 mt-1 rounded-[10px] bg-[#534AB7] hover:bg-[#4840A0] text-white self-start"
                style={{ fontSize: 13 }}
              >
                {changePassword.isPending && <Loader2 size={14} className="animate-spin" />}
                {t("submit")}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
