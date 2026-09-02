"use client";

import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Check, AlertTriangle, Building2, Upload, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button }   from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useAbility } from "@/hooks/useAbility";
import { useWorkspace, useUpdateWorkspace, useUploadLogo, useRemoveLogo } from "@/hooks/useWorkspace";
import type { UpdateWorkspacePayload } from "@/services/tenant.service";
import {
  WorkspaceFormSchema,
  type WorkspaceFormValues,
  INDUSTRY_KEYS,
  COMPANY_SIZE_KEYS,
  WORKSPACE_LOCALE_KEYS,
  TIMEZONE_OPTIONS,
  LOGO_MAX_BYTES,
  LOGO_ALLOWED_MIME,
} from "@/lib/validations/workspace.schema";

// ── Helpers ───────────────────────────────────────────────────────────────────
function tzLabel(tz: string): string {
  try {
    const off = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return off ? `${tz.replace(/_/g, " ")} (${off})` : tz.replace(/_/g, " ");
  } catch {
    return tz;
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const t = useTranslations("settings.workspace");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-[#E8E7E2] dark:border-border last:border-0">
      <span className="text-[#6B6B67] dark:text-muted-foreground shrink-0" style={{ fontSize: 13, width: 120 }}>{label}</span>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <code
          className="flex-1 px-3 py-1.5 rounded-lg truncate bg-[#F8F8F7] dark:bg-muted text-[#1A1A18] dark:text-foreground border border-[#E8E7E2] dark:border-border"
          style={{ fontSize: 12, fontFamily: "monospace" }}
        >
          {value}
        </code>
        <Button
          variant="outline"
          size="icon"
          onClick={handleCopy}
          className="size-8 shrink-0 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#6B6B67] dark:text-muted-foreground hover:bg-[#F1EFE8] dark:hover:bg-muted"
          title={t("copy")}
        >
          {copied ? <Check size={13} className="text-[#1D9E75]" /> : <Copy size={13} />}
        </Button>
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-card rounded-[10px] border border-[#E8E7E2] dark:border-border p-5">
      <h2 className="text-[#1A1A18] dark:text-foreground mb-4" style={{ fontSize: 14, fontWeight: 500 }}>{title}</h2>
      <div className="border-t border-[#E8E7E2] dark:border-border pt-4">{children}</div>
    </div>
  );
}

const inputCls =
  "h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]";
const selectCls =
  "h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus:ring-[#534AB7]/30 focus:border-[#534AB7]";

// ── Component ─────────────────────────────────────────────────────────────────
export function WorkspaceInfo() {
  const t = useTranslations("settings.workspace");
  const tCommon = useTranslations("common");

  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const { data: ws, isLoading } = useWorkspace();
  const { can } = useAbility();
  // Workspace settings are a tenant-wide resource — only a role with
  // `manage:all` (ADMIN) may edit; the backend enforces the same via CASL.
  const canManage = can("manage", "all");

  const updateWorkspace = useUpdateWorkspace();
  const uploadLogo = useUploadLogo();
  const removeLogo = useRemoveLogo();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<WorkspaceFormValues>({
    resolver: zodResolver(WorkspaceFormSchema),
    values: {
      name:          ws?.name ?? "",
      website:       ws?.website ?? "",
      address:       ws?.address ?? "",
      companySize:   ws?.companySize ?? "",
      industry:      ws?.industry ?? "",
      timezone:      ws?.timezone ?? "",
      defaultLocale: (WORKSPACE_LOCALE_KEYS as readonly string[]).includes(ws?.defaultLocale ?? "")
        ? (ws!.defaultLocale as (typeof WORKSPACE_LOCALE_KEYS)[number])
        : ((WORKSPACE_LOCALE_KEYS as readonly string[]).includes(locale)
            ? (locale as (typeof WORKSPACE_LOCALE_KEYS)[number])
            : "ru"),
    },
  });

  const onSubmit = (values: WorkspaceFormValues) => {
    const payload: UpdateWorkspacePayload = {
      name:          values.name.trim(),
      website:       values.website.trim() || null,
      address:       values.address.trim() || null,
      companySize:   values.companySize || null,
      industry:      values.industry || null,
      timezone:      values.timezone || null,
      defaultLocale: values.defaultLocale,
    };
    updateWorkspace.mutate(payload, {
      onSuccess: () => {
        reset(values);
        // "Interface language" is persisted on the workspace *and* applied to
        // the current session right away — same locale switch the sidebar's
        // LanguageSwitcher performs.
        if (values.defaultLocale !== locale) {
          const search = typeof window !== "undefined" ? window.location.search : "";
          router.replace(`${pathname}${search}`, { locale: values.defaultLocale });
        }
      },
    });
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    if (!LOGO_ALLOWED_MIME.includes(file.type)) {
      toast.error(t("validation.logoInvalidType"));
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error(t("validation.logoTooLarge"));
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    const clear = () => {
      setPreview(null);
      URL.revokeObjectURL(url);
    };
    uploadLogo.mutate(file, { onSuccess: clear, onError: clear });
  };

  const logoBusy = uploadLogo.isPending || removeLogo.isPending;
  const shownLogo = preview ?? ws?.logoUrl ?? null;

  const createdAt = ws?.createdAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(ws.createdAt))
    : "—";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 320 }}>
        <Loader2 className="animate-spin text-[#6B6B67] dark:text-muted-foreground" size={22} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Content header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{t("heading")}</h1>
          <p className="text-[#6B6B67] dark:text-muted-foreground mt-1.5" style={{ fontSize: 13 }}>{t("subtitle")}</p>
        </div>
        {canManage && (
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={!isDirty || updateWorkspace.isPending}
            className="h-9 rounded-[10px] bg-[#534AB7] hover:bg-[#4840A0] text-white shrink-0"
            style={{ fontSize: 13 }}
          >
            {updateWorkspace.isPending && <Loader2 size={14} className="animate-spin" />}
            {tCommon("saveChanges")}
          </Button>
        )}
      </div>

      {!canManage && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-[10px] bg-[#F8F8F7] dark:bg-muted border border-[#E8E7E2] dark:border-border">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-[#6B6B67] dark:text-muted-foreground" />
          <p className="text-[#6B6B67] dark:text-muted-foreground" style={{ fontSize: 12 }}>{t("adminOnly")}</p>
        </div>
      )}

      {/* Section 1 */}
      <SectionCard title={t("section1Title")}>
        <div className="flex gap-6">

          {/* Logo upload */}
          <div className="flex flex-col items-center shrink-0 gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canManage || logoBusy}
              className="group relative size-[100px] rounded-[10px] overflow-hidden flex flex-col items-center justify-center border-2 border-dashed border-[#E8E7E2] dark:border-border transition-colors hover:bg-[#F8F8F7] dark:hover:bg-muted disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title={t("uploadLogo")}
            >
              {shownLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownLogo} alt={ws?.name ?? ""} className="size-full object-contain" />
              ) : (
                <>
                  <Building2 size={28} style={{ color: "#D1CFED" }} />
                  <Upload size={12} className="mt-1.5 text-[#6B6B67] dark:text-muted-foreground" />
                </>
              )}
              {canManage && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                  {logoBusy ? (
                    <Loader2 size={18} className="animate-spin text-white" />
                  ) : (
                    shownLogo && <Upload size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={LOGO_ALLOWED_MIME.join(",")}
              className="hidden"
              onChange={handleLogoFile}
            />
            <p className="text-[#6B6B67] dark:text-muted-foreground text-center" style={{ fontSize: 11 }}>{t("uploadLogo")}</p>
            <p className="text-[#6B6B67] dark:text-muted-foreground text-center" style={{ fontSize: 10 }}>{t("uploadLogoHint")}</p>
            {canManage && ws?.logoUrl && (
              <button
                type="button"
                onClick={() => removeLogo.mutate()}
                disabled={logoBusy}
                className="flex items-center gap-1 text-[#B42318] dark:text-red-400 hover:underline disabled:opacity-50 bg-transparent border-0 cursor-pointer"
                style={{ fontSize: 11 }}
              >
                <Trash2 size={11} />
                {t("removeLogo")}
              </button>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 grid grid-cols-2 gap-x-4 gap-y-4">

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("companyName")}</Label>
              <Input {...register("name")} disabled={!canManage} className={inputCls} style={{ fontSize: 13 }} />
              {errors.name?.message && (
                <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>{t(`validation.${errors.name.message}`)}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("website")}</Label>
              <Input {...register("website")} disabled={!canManage} placeholder="https://company.com" className={inputCls} style={{ fontSize: 13 }} />
              {errors.website?.message && (
                <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>{t(`validation.${errors.website.message}`)}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("industry")}</Label>
              <Controller
                control={control}
                name="industry"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!canManage}>
                    <SelectTrigger className={selectCls} style={{ fontSize: 13 }}>
                      <SelectValue placeholder={t("notSet")} />
                    </SelectTrigger>
                    <SelectContent className="rounded-[10px] border-[#E8E7E2] dark:border-border bg-background">
                      {INDUSTRY_KEYS.map((k) => (
                        <SelectItem key={k} value={k} style={{ fontSize: 13 }}>{t(`industryOptions.${k}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("size")}</Label>
              <Controller
                control={control}
                name="companySize"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!canManage}>
                    <SelectTrigger className={selectCls} style={{ fontSize: 13 }}>
                      <SelectValue placeholder={t("notSet")} />
                    </SelectTrigger>
                    <SelectContent className="rounded-[10px] border-[#E8E7E2] dark:border-border bg-background">
                      {COMPANY_SIZE_KEYS.map((k) => (
                        <SelectItem key={k} value={k} style={{ fontSize: 13 }}>{t(`sizeOptions.${k}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("timezone")}</Label>
              <Controller
                control={control}
                name="timezone"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange} disabled={!canManage}>
                    <SelectTrigger className={selectCls} style={{ fontSize: 13 }}>
                      <SelectValue placeholder={t("notSet")} />
                    </SelectTrigger>
                    <SelectContent className="rounded-[10px] border-[#E8E7E2] dark:border-border bg-background max-h-64">
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <SelectItem key={tz} value={tz} style={{ fontSize: 13 }}>{tzLabel(tz)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("language")}</Label>
              <Controller
                control={control}
                name="defaultLocale"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                    <SelectTrigger className={selectCls} style={{ fontSize: 13 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-[10px] border-[#E8E7E2] dark:border-border bg-background">
                      {WORKSPACE_LOCALE_KEYS.map((k) => (
                        <SelectItem key={k} value={k} style={{ fontSize: 13 }}>{t(`languageOptions.${k}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("address")}</Label>
              <Textarea
                {...register("address")}
                disabled={!canManage}
                placeholder={t("addressPlaceholder")}
                rows={2}
                className="rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7] resize-none"
                style={{ fontSize: 13 }}
              />
              {errors.address?.message && (
                <p className="text-[#B42318] dark:text-red-400" style={{ fontSize: 12 }}>{t(`validation.${errors.address.message}`)}</p>
              )}
            </div>

          </form>
        </div>
      </SectionCard>

      {/* Section 2 */}
      <SectionCard title={t("section2Title")}>
        <CopyRow label="Workspace ID" value={ws?.id ?? "—"} />
        <CopyRow label="Subdomain"    value={ws?.slug ? `${ws.slug}.nstore.app` : "—"} />
        <div className="flex items-center justify-between gap-4 py-3 border-b border-[#E8E7E2] dark:border-border">
          <span className="text-[#6B6B67] dark:text-muted-foreground shrink-0" style={{ fontSize: 13, width: 120 }}>{t("createdAtLabel")}</span>
          <span className="flex-1 text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{createdAt}</span>
        </div>
        <div className="flex items-start gap-2.5 mt-4 px-3 py-2.5 rounded-[10px] bg-[#FFFBEB] dark:bg-amber-950/20 border border-[#FDE68A] dark:border-amber-900">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-[#D97706] dark:text-amber-400" />
          <p style={{ fontSize: 12, color: "#92400E" }} className="dark:text-amber-300">
            {t("idWarning")}
          </p>
        </div>
      </SectionCard>

    </div>
  );
}
