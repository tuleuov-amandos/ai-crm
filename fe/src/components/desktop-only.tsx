"use client";

import { Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  isDesktopOnlyFeature,
  isDesktopOnlyRoute,
  type DesktopOnlyFeature,
} from "@/lib/mobileAccess";

/**
 * Скрывает children на телефоне (< md) только CSS: ни JS, ни мигания.
 * `contents` убирает обёртку из раскладки, поэтому в flex-шапках на >= md
 * дети остаются прямыми flex-элементами (gap и порядок прежние).
 * Функция вне DESKTOP_ONLY_FEATURES рендерится как есть.
 */
export function DesktopOnly({
  feature,
  children,
}: {
  feature: DesktopOnlyFeature;
  children: React.ReactNode;
}) {
  if (!isDesktopOnlyFeature(feature)) return <>{children}</>;
  return <div className="contents max-md:hidden">{children}</div>;
}

export function DesktopOnlyStub() {
  const t = useTranslations("desktopOnly");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
        <Monitor size={24} />
      </div>
      <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
      <p className="max-w-xs text-sm text-muted-foreground">{t("description")}</p>
      <Button asChild size="sm">
        <Link href="/dashboard">{t("button")}</Link>
      </Button>
    </div>
  );
}

/**
 * Для экранов из DESKTOP_ONLY_ROUTES рендерит оба варианта: заглушку (md:hidden)
 * и страницу (max-md:hidden), чтобы не мигать до первого замера ширины.
 * Страница на телефоне всё равно монтируется и грузит свои данные.
 */
export function DesktopOnlyRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!isDesktopOnlyRoute(pathname)) return <>{children}</>;
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <DesktopOnlyStub />
      </div>
      <div className="contents max-md:hidden">{children}</div>
    </>
  );
}
