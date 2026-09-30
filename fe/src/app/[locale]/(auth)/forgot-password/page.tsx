"use client";

import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NstoreLogo } from "@/components/NstoreLogo";
import { Link } from "@/i18n/navigation";

import {
  ForgotPasswordBodySchema,
  ForgotPasswordBodyType,
} from "@/lib/validations/auth.schema";
import { useForgotPassword } from "@/hooks/useAuth";

const ForgotPasswordPage = () => {
  const t = useTranslations("auth.forgotPassword");
  const tc = useTranslations("auth.shared");
  const tv = useTranslations("auth.validation");
  const { mutate: forgotPassword, isPending, isSuccess } = useForgotPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordBodyType>({
    defaultValues: { email: "" },
    resolver: zodResolver(ForgotPasswordBodySchema),
  });

  function onSubmit(values: ForgotPasswordBodyType) {
    forgotPassword(values);
  }

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
          {isSuccess ? (
            // Нейтральный текст: не раскрываем, существует ли аккаунт.
            <div
              className="p-6 flex flex-col items-center text-center space-y-3"
              role="status"
            >
              <MailCheck className="size-8 text-primary" />
              <p className="font-medium text-foreground text-sm">
                {t("sentTitle")}
              </p>
              <p className="text-muted-foreground" style={{ fontSize: 13 }}>
                {t("sentDescription")}
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="p-6 space-y-4"
            >
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-muted-foreground"
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  {tc("emailLabel")}
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={tc("emailPlaceholder")}
                  autoComplete="email"
                  autoFocus
                  className="h-9"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email?.message && (
                  <p className="text-destructive" style={{ fontSize: 12 }}>
                    {tv(errors.email.message)}
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
          )}

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
export default ForgotPasswordPage;
