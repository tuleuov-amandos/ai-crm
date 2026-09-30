"use client";

// Referrer-Policy: no-referrer для этой страницы задаётся HTTP-заголовком
// в next.config.ts: токен лежит в URL и не должен утечь через Referer.

import React, { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NstoreLogo } from "@/components/NstoreLogo";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import {
  ResetPasswordFormSchema,
  ResetPasswordFormType,
} from "@/lib/validations/auth.schema";
import { useResetPassword } from "@/hooks/useAuth";
import { useApiError } from "@/hooks/useApiError";
import { ApiError } from "@/types/error.type";
import { toast } from "sonner";

const PASSWORD_RESET_TOKEN_INVALID = "AUTH_PASSWORD_RESET_TOKEN_INVALID";

// ─── Password Input ───────────────────────────────────────────────────────────

const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, ...props }, ref) => {
  const t = useTranslations("auth.resetPassword");
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        className={cn("h-9 pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 cursor-pointer"
        aria-label={show ? t("passwordHide") : t("passwordShow")}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

// ─── Content ──────────────────────────────────────────────────────────────────

function ResetPasswordContent() {
  const t = useTranslations("auth.resetPassword");
  const tv = useTranslations("auth.validation");
  const tt = useTranslations("auth.toasts");
  const getApiError = useApiError();
  const token = useSearchParams().get("token");
  const [tokenInvalid, setTokenInvalid] = useState(!token);
  const { mutate: resetPassword, isPending } = useResetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormType>({
    defaultValues: { newPassword: "", confirmPassword: "" },
    resolver: zodResolver(ResetPasswordFormSchema),
  });

  function onSubmit(values: ResetPasswordFormType) {
    if (!token) return;
    resetPassword(
      { ...values, token },
      {
        onError: (error: ApiError) => {
          if (error.response?.data?.code === PASSWORD_RESET_TOKEN_INVALID) {
            setTokenInvalid(true);
            return;
          }
          toast.error(getApiError(error, tt("resetPasswordError")));
        },
      },
    );
  }

  if (tokenInvalid) {
    return (
      <div
        className="p-6 flex flex-col items-center text-center space-y-3"
        role="alert"
      >
        <AlertCircle className="size-8 text-destructive" />
        <p className="font-medium text-foreground text-sm">
          {t("invalidTitle")}
        </p>
        <p className="text-muted-foreground" style={{ fontSize: 13 }}>
          {t("invalidDescription")}
        </p>
        <Button asChild className="w-full h-9 mt-2">
          <Link href="/forgot-password">{t("requestNewLink")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="p-6 space-y-4"
    >
      {/* New password */}
      <div className="space-y-1.5">
        <Label
          htmlFor="newPassword"
          className="text-muted-foreground"
          style={{ fontSize: 12, fontWeight: 500 }}
        >
          {t("newPasswordLabel")}
        </Label>
        <PasswordInput
          id="newPassword"
          placeholder="••••••••"
          autoComplete="new-password"
          autoFocus
          aria-invalid={!!errors.newPassword}
          aria-describedby="newPassword-hint"
          {...register("newPassword")}
        />
        {errors.newPassword?.message ? (
          <p className="text-destructive" style={{ fontSize: 12 }}>
            {tv(errors.newPassword.message)}
          </p>
        ) : (
          <p
            id="newPassword-hint"
            className="text-muted-foreground"
            style={{ fontSize: 12 }}
          >
            {t("passwordHint")}
          </p>
        )}
      </div>

      {/* Confirm password */}
      <div className="space-y-1.5">
        <Label
          htmlFor="confirmPassword"
          className="text-muted-foreground"
          style={{ fontSize: 12, fontWeight: 500 }}
        >
          {t("confirmPasswordLabel")}
        </Label>
        <PasswordInput
          id="confirmPassword"
          placeholder="••••••••"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword?.message && (
          <p className="text-destructive" style={{ fontSize: 12 }}>
            {tv(errors.confirmPassword.message)}
          </p>
        )}
      </div>

      <Button
        className="w-full h-9 hover:bg-primary/90 transition-colors cursor-pointer"
        disabled={isPending}
      >
        {isPending && <Loader2 className="size-4 animate-spin" />}
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ResetPasswordPage = () => {
  const t = useTranslations("auth.resetPassword");
  const tc = useTranslations("auth.shared");

  return (
    <div
      className="min-h-svh flex flex-col items-center justify-center px-4 py-16 bg-[#F8F8F7] dark:bg-background"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div className="w-full" style={{ maxWidth: 400 }}>
        {/* Brand header */}
        <div className="flex flex-col items-center gap-5 mb-8 text-center">
          <NstoreLogo />
          <div className="space-y-1">
            <h1
              className="tracking-[-0.03em] text-foreground"
              style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3 }}
            >
              {t("title")}
            </h1>
            <p className="text-muted-foreground" style={{ fontSize: 14 }}>
              {t("subtitle")}
            </p>
          </div>
        </div>

        {/* Form card */}
        <div
          className="bg-card border border-border rounded-xl overflow-hidden"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          {/* useSearchParams требует Suspense-границы при пререндере */}
          <Suspense
            fallback={
              <div className="p-12 flex justify-center">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            }
          >
            <ResetPasswordContent />
          </Suspense>

          <div className="px-6 pb-5 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-primary hover:underline underline-offset-2 transition-colors"
              style={{ fontSize: 13, fontWeight: 500 }}
            >
              <ArrowLeft className="size-3.5" />
              {t("backToLogin")}
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-12 text-muted-foreground" style={{ fontSize: 12 }}>
        {tc("copyright", { year: "2026" })}
      </p>
    </div>
  );
};
export default ResetPasswordPage;
