"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type MobileDetailTab = "info" | "activity";

const TABS: MobileDetailTab[] = ["info", "activity"];

/**
 * Вкладки «Информация» / «Активность» карточек сделки и контакта на телефоне
 * (< md). Панели переключаются только классами (см. mobileTabPanelClass), на
 * >= md полоса скрыта и обе панели видны рядом.
 */
export function MobileDetailTabs({
  value,
  onChange,
}: {
  value: MobileDetailTab;
  onChange: (tab: MobileDetailTab) => void;
}) {
  const t = useTranslations("common");

  return (
    <div role="tablist" className="md:hidden shrink-0 flex border-b border-border bg-background">
      {TABS.map((tab) => {
        const active = tab === value;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab)}
            className={cn(
              "flex-1 min-h-11 -mb-px border-b-2 text-sm transition-colors cursor-pointer",
              active
                ? "border-b-primary text-primary font-semibold"
                : "border-b-transparent text-muted-foreground",
            )}
          >
            {tab === "info" ? t("tabInfo") : t("tabActivity")}
          </button>
        );
      })}
    </div>
  );
}

/** Скрывает панель другой вкладки только на < md. */
export function mobileTabPanelClass(
  current: MobileDetailTab,
  panel: MobileDetailTab,
): string | undefined {
  return current === panel ? undefined : "max-md:hidden";
}
