"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle, Building2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button }   from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Copy row ──────────────────────────────────────────────────────────────────
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

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-card rounded-[10px] border border-[#E8E7E2] dark:border-border p-5">
      <h2 className="text-[#1A1A18] dark:text-foreground mb-4" style={{ fontSize: 14, fontWeight: 500 }}>{title}</h2>
      <div className="border-t border-[#E8E7E2] dark:border-border pt-4">{children}</div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function WorkspaceInfo() {
  const t = useTranslations("settings.workspace");
  const tCommon = useTranslations("common");

  const industryKeys = ["it", "finance", "retail", "healthcare", "manufacturing", "other"] as const;
  const sizeKeys = ["xs", "sm", "md", "lg", "xl"] as const;
  const industryOptions = industryKeys.map((k) => t(`industryOptions.${k}`));
  const sizeOptions = sizeKeys.map((k) => t(`sizeOptions.${k}`));
  const languageOptions = [t("languageOptions.ru"), t("languageOptions.en")];

  const [form, setForm] = useState({
    name:     t("defaultCompanyName"),
    website:  "",
    industry: industryOptions[0],
    size:     sizeOptions[1],
    timezone: "Asia/Ho_Chi_Minh (GMT+7)",
    language: languageOptions[0],
    address:  "",
  });

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  return (
    <div className="flex flex-col gap-5">

      {/* Content header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{t("heading")}</h1>
          <p className="text-[#6B6B67] dark:text-muted-foreground mt-1.5" style={{ fontSize: 13 }}>{t("subtitle")}</p>
        </div>
        <Button
          onClick={() => toast.success(t("savedToast"))}
          className="h-9 rounded-[10px] bg-[#534AB7] hover:bg-[#4840A0] text-white shrink-0"
          style={{ fontSize: 13 }}
        >
          {tCommon("saveChanges")}
        </Button>
      </div>

      {/* Section 1 */}
      <SectionCard title={t("section1Title")}>
        <div className="flex gap-6">

          {/* Logo upload */}
          <div className="flex flex-col items-center shrink-0 gap-2">
            <div
              className="size-[100px] rounded-[10px] flex flex-col items-center justify-center cursor-pointer hover:bg-[#F8F8F7] dark:hover:bg-muted transition-colors border-2 border-dashed border-[#E8E7E2] dark:border-border"
            >
              <Building2 size={28} style={{ color: "#D1CFED" }} />
              <Upload size={12} className="mt-1.5 text-[#6B6B67] dark:text-muted-foreground" />
            </div>
            <p className="text-[#6B6B67] dark:text-muted-foreground text-center" style={{ fontSize: 11 }}>{t("uploadLogo")}</p>
            <p className="text-[#6B6B67] dark:text-muted-foreground text-center" style={{ fontSize: 10 }}>{t("uploadLogoHint")}</p>
          </div>

          {/* Form */}
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-4">

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("companyName")}</Label>
              <Input value={form.name} onChange={(e) => set("name")(e.target.value)} className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]" style={{ fontSize: 13 }} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("website")}</Label>
              <Input value={form.website} onChange={(e) => set("website")(e.target.value)} placeholder="https://company.com" className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7]" style={{ fontSize: 13 }} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("industry")}</Label>
              <Select value={form.industry} onValueChange={set("industry")}>
                <SelectTrigger className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus:ring-[#534AB7]/30 focus:border-[#534AB7]" style={{ fontSize: 13 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-[10px] border-[#E8E7E2] dark:border-border bg-background">
                  {industryOptions.map((o) => (
                    <SelectItem key={o} value={o} style={{ fontSize: 13 }}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("size")}</Label>
              <Select value={form.size} onValueChange={set("size")}>
                <SelectTrigger className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus:ring-[#534AB7]/30 focus:border-[#534AB7]" style={{ fontSize: 13 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-[10px] border-[#E8E7E2] dark:border-border bg-background">
                  {sizeOptions.map((o) => (
                    <SelectItem key={o} value={o} style={{ fontSize: 13 }}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("timezone")}</Label>
              <Select value={form.timezone} onValueChange={set("timezone")}>
                <SelectTrigger className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus:ring-[#534AB7]/30 focus:border-[#534AB7]" style={{ fontSize: 13 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-[10px] border-[#E8E7E2] dark:border-border bg-background">
                  {["Asia/Ho_Chi_Minh (GMT+7)", "Asia/Singapore (GMT+8)", "UTC (GMT+0)"].map((o) => (
                    <SelectItem key={o} value={o} style={{ fontSize: 13 }}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("language")}</Label>
              <Select value={form.language} onValueChange={set("language")}>
                <SelectTrigger className="h-10 rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus:ring-[#534AB7]/30 focus:border-[#534AB7]" style={{ fontSize: 13 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-[10px] border-[#E8E7E2] dark:border-border bg-background">
                  {languageOptions.map((o) => (
                    <SelectItem key={o} value={o} style={{ fontSize: 13 }}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label className="text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("address")}</Label>
              <Textarea
                value={form.address}
                onChange={(e) => set("address")(e.target.value)}
                placeholder={t("addressPlaceholder")}
                rows={2}
                className="rounded-[10px] border-[#E8E7E2] dark:border-border text-[#1A1A18] dark:text-foreground focus-visible:ring-[#534AB7]/30 focus-visible:border-[#534AB7] resize-none"
                style={{ fontSize: 13 }}
              />
            </div>

          </div>
        </div>
      </SectionCard>

      {/* Section 2 */}
      <SectionCard title={t("section2Title")}>
        <CopyRow label="Workspace ID" value="ws_abc123xyz789" />
        <CopyRow label="Subdomain"    value="company.salesflow.app" />
        <div className="flex items-center justify-between gap-4 py-3 border-b border-[#E8E7E2] dark:border-border">
          <span className="text-[#6B6B67] dark:text-muted-foreground shrink-0" style={{ fontSize: 13, width: 120 }}>{t("createdAtLabel")}</span>
          <span className="flex-1 text-[#1A1A18] dark:text-foreground" style={{ fontSize: 13 }}>{t("createdAtValue")}</span>
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
