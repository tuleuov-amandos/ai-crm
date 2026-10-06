"use client";

import { useTranslations } from "next-intl";
import { Archive } from "lucide-react";
import { cn } from "@/lib/utils";

// Small neutral mark for a manually archived deal (archivedAt != null).
export function ArchivedBadge({ className }: { className?: string }) {
  const t = useTranslations("pipeline.archive");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-px whitespace-nowrap font-medium text-muted-foreground align-middle",
        className,
      )}
      style={{ fontSize: 10, lineHeight: 1.4 }}
    >
      <Archive size={9} className="shrink-0" />
      {t("badge")}
    </span>
  );
}
