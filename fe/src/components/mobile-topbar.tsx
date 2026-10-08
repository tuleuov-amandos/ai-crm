"use client";
import { useTranslations } from "next-intl";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useWorkspace } from "@/hooks/useWorkspace";

// Верхняя полоса только для телефонов (< md): на десктопе меню всегда в сайдбаре.
// Высота (h-12) должна совпадать с calc-ами в layout, если они появятся.
export function MobileTopbar() {
  const t = useTranslations("sidebar");
  const { data: workspace } = useWorkspace();
  const brandName = workspace?.name?.trim() || "NSTORE";

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:hidden print:hidden">
      <SidebarTrigger aria-label={t("openMenu")} />
      <span className="min-w-0 truncate text-sm font-semibold text-foreground">
        {brandName}
      </span>
    </div>
  );
}
