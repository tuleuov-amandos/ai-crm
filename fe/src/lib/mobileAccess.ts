// Что скрыто на телефоне (< md, 768 px). Единственное место, где это меняется:
//  - скрыть экран: добавь путь без локали в DESKTOP_ONLY_ROUTES (убрать: удали строку);
//  - скрыть вкладку Settings: добавь её id в DESKTOP_ONLY_SETTINGS_TABS;
//  - скрыть кнопку или функцию: добавь ключ в DESKTOP_ONLY_FEATURES и оберни
//    её в <DesktopOnly feature="...">. Новый ключ сначала добавь в тип DesktopOnlyFeature.
// Скрытие работает только на < md и защитой не является: прямой запрос к API
// по-прежнему идёт, права проверяет бэкенд.
import type { SettingsTab } from "@/app/[locale]/(dashboard)/settings/page";

export type DesktopOnlyFeature = "contacts-import" | "deal-selection";

export const DESKTOP_ONLY_ROUTES: readonly string[] = [
  "/roles",
  "/audit-logs",
  "/reports",
];

export const DESKTOP_ONLY_SETTINGS_TABS: readonly SettingsTab[] = [
  "workspace-info",
  "members",
  "invitations",
  "pipeline-stages",
  "billing",
  "invoices",
  "notifications",
  "integrations",
];

export const DESKTOP_ONLY_FEATURES: readonly DesktopOnlyFeature[] = [
  "contacts-import",
  "deal-selection",
];

/** pathname без локали (usePathname из @/i18n/navigation); совпадение по границе сегмента. */
export function isDesktopOnlyRoute(pathname: string): boolean {
  if (!pathname || pathname === "/") return false;
  return DESKTOP_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isDesktopOnlySettingsTab(tab: string): boolean {
  return (DESKTOP_ONLY_SETTINGS_TABS as readonly string[]).includes(tab);
}

export function isDesktopOnlyFeature(feature: string): boolean {
  return (DESKTOP_ONLY_FEATURES as readonly string[]).includes(feature);
}
