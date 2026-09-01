"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Loader2, Building2, Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { RegisterBodyType } from "@/lib/validations/auth.schema";
import { RegisterBodySchema } from '@/lib/validations/auth.schema';
import { zodResolver } from "@hookform/resolvers/zod";
import { SalesFlowLogo } from "@/components/SalesFlowLogo";
import { useRegister } from "@/hooks/useAuth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type StrengthLevel = 0 | 1 | 2 | 3;

interface StrengthResult {
  level: StrengthLevel;
  labelKey: string;
  colorClass: string;
  bgClass: string;
  criteria: { key: string; met: boolean }[];
}

function getPasswordStrength(pw: string): StrengthResult {
  const criteria = [
    { key: "min8",      met: pw.length >= 8 },
    { key: "digit",     met: /\d/.test(pw) },
    { key: "uppercase", met: /[A-Z]/.test(pw) },
  ];
  const metCount = criteria.filter((c) => c.met).length as 0 | 1 | 2 | 3;
  const levels: { labelKey: string; colorClass: string; bgClass: string }[] = [
    { labelKey: "",       colorClass: "text-muted-foreground", bgClass: "bg-muted" },
    { labelKey: "weak",   colorClass: "text-red-500 dark:text-red-400", bgClass: "bg-red-500 dark:bg-red-400" },
    { labelKey: "medium", colorClass: "text-amber-500 dark:text-amber-400", bgClass: "bg-amber-500 dark:bg-amber-400" },
    { labelKey: "strong", colorClass: "text-green-600 dark:text-green-400", bgClass: "bg-green-600 dark:bg-green-400" },
  ];
  return { level: metCount, ...levels[metCount], criteria };
}



// ─── Password Input ───────────────────────────────────────────────────────────

const PasswordInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => {
    const t = useTranslations("auth.register");
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={show ? "text" : "password"}
          className={cn("pr-10", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 cursor-pointer"
          aria-label={show ? t("passwordHide") : t("passwordShow")}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

// ─── Strength Meter ───────────────────────────────────────────────────────────

function PasswordStrengthMeter({ password }: { password: string }) {
  const t = useTranslations("auth.register.strength");
  if (!password) return null;
  const { level, labelKey, colorClass, bgClass, criteria } = getPasswordStrength(password);
  const label = labelKey ? t(labelKey) : "";
  return (
    <div className="space-y-2 pt-0.5">
      {/* Bar */}
      <div className="flex gap-1">
        {([1, 2, 3] as const).map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-all duration-300",
              i <= level ? bgClass : "bg-muted"
            )}
          />
        ))}
      </div>
      {/* Criteria + label */}
      {label && (
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            {criteria.map((c) => (
              <span
                key={c.key}
                className={cn(
                  "flex items-center gap-1 text-[11px]",
                  c.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                )}
              >
                <Check
                  className={cn("size-3 transition-opacity", c.met ? "opacity-100" : "opacity-30")}
                  strokeWidth={2.5}
                />
                {t(c.key)}
              </span>
            ))}
          </div>
          <span className={cn("text-[11px] font-medium", colorClass)}>{label}</span>
        </div>
      )}
    </div>
  );
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const t = useTranslations("auth.register");
  const tc = useTranslations("auth.shared");
  const tv = useTranslations("auth.validation");
  const { mutate: authRegister, isPending, } = useRegister();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterBodyType>({
    defaultValues: { companyName: "", name: "", email: "", password: "", confirmPassword: "" },
    resolver: zodResolver(RegisterBodySchema)
  });

  const passwordValue = watch("password");

  async function onSubmit(values: RegisterBodyType) {
    authRegister(values);
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center px-4 py-16 bg-[#F8F8F7] dark:bg-background">
      <div className="w-full max-w-[420px]">
        {/* Brand header */}
        <div className="flex flex-col items-center gap-5 mb-8 text-center">
          <SalesFlowLogo />
          <div className="space-y-1">
            <h1
              className="text-foreground tracking-tight"
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
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
            {/* Company name */}
            <div className="space-y-1.5">
              <Label htmlFor="companyName" className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                {t("companyNameLabel")}
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none size-3.5" />
                <Input
                  id="companyName"
                  type="text"
                  placeholder={t("companyNamePlaceholder")}
                  autoComplete="organization"
                  autoFocus
                  className={cn("h-9 pl-9", errors.companyName && "border-destructive focus-visible:ring-destructive/20")}
                  aria-invalid={!!errors.companyName}
                  {...register("companyName")}
                />
              </div>
              {errors.companyName?.message && (
                <p className="text-destructive" style={{ fontSize: 12 }}>{tv(errors.companyName.message)}</p>
              )}
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                {t("fullNameLabel")}
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none size-3.5" />
                <Input
                  id="name"
                  type="text"
                  placeholder={t("fullNamePlaceholder")}
                  autoComplete="name"
                  autoFocus
                  className={cn("h-9 pl-9", errors.name && "border-destructive focus-visible:ring-destructive/20")}
                  aria-invalid={!!errors.name}
                  {...register("name")}
                />
              </div>
              {errors.name?.message && (
                <p className="text-destructive" style={{ fontSize: 12 }}>{tv(errors.name.message)}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                {t("emailLabel")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={tc("emailPlaceholder")}
                autoComplete="email"
                className={cn("h-9", errors.email && "border-destructive focus-visible:ring-destructive/20")}
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email?.message && (
                <p className="text-destructive" style={{ fontSize: 12 }}>{tv(errors.email.message)}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                {tc("passwordLabel")}
              </Label>
              <PasswordInput
                id="password"
                {...register("password")}
                placeholder={t("passwordPlaceholder")}
                autoComplete="new-password"
                className={cn("h-9", errors.password && "border-destructive focus-visible:ring-destructive/20")}
                aria-invalid={!!errors.password}
              />
              <PasswordStrengthMeter password={passwordValue} />
              {errors.password?.message && (
                <p className="text-destructive" style={{ fontSize: 12 }}>{tv(errors.password.message)}</p>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                {t("confirmPasswordLabel")}
              </Label>
              <PasswordInput
                id="confirmPassword"
                {...register("confirmPassword")}
                placeholder={t("confirmPasswordPlaceholder")}
                autoComplete="new-password"
                className={cn("h-9", errors.confirmPassword && "border-destructive focus-visible:ring-destructive/20")}
                aria-invalid={!!errors.confirmPassword}
              />
              {errors.confirmPassword?.message && (
                <p className="text-destructive" style={{ fontSize: 12 }}>{tv(errors.confirmPassword.message)}</p>
              )}
            </div>

            {/* Terms hint */}
            <p className="text-muted-foreground pt-0.5" style={{ fontSize: 12 }}>
              {t.rich("termsAgreement", {
                terms: (chunks) => (
                  <button type="button" className="text-primary hover:underline underline-offset-2 bg-transparent border-0 cursor-pointer" style={{ fontWeight: 500 }}>
                    {chunks}
                  </button>
                ),
                privacy: (chunks) => (
                  <button type="button" className="text-primary hover:underline underline-offset-2 bg-transparent border-0 cursor-pointer" style={{ fontWeight: 500 }}>
                    {chunks}
                  </button>
                ),
              })}
            </p>

            <Button type="submit" className="w-full h-9 mt-1" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {isPending ? t("submitting") : t("submit")}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative px-6 pb-1">
            <Separator />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-card px-3 text-muted-foreground" style={{ fontSize: 12 }}>
                {tc("or")}
              </span>
            </div>
          </div>

          {/* Sign-in link */}
          <div className="px-6 py-5 text-center">
            <p className="text-muted-foreground" style={{ fontSize: 13 }}>
              {t("haveAccountQuestion")}{" "}
              <Link
                href="/login"
                className="text-primary hover:underline underline-offset-2 transition-colors"
                style={{ fontWeight: 500, textDecoration: "none" }}
              >
                {tc("signIn")}
              </Link>
            </p>
          </div>
        </div>

        {/* SSO hint */}
        <p className="mt-4 text-center text-muted-foreground" style={{ fontSize: 12 }}>
          {tc("ssoOrgQuestion")}{" "}
          <button
            type="button"
            className="text-primary hover:underline underline-offset-2 transition-colors bg-transparent border-0 cursor-pointer"
          >
            {t("signUpWithSso")}
          </button>
        </p>
      </div>

      <p className="mt-12 text-muted-foreground" style={{ fontSize: 12 }}>
        {tc("copyright", { year: "2026" })}
      </p>
    </div>
  );
}
