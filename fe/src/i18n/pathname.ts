import { routing } from "./routing";

const localeSet = new Set<string>(routing.locales);

/**
 * Отрезает префикс локали от пути.
 *   /ru/dashboard -> { locale: 'ru', pathname: '/dashboard' }
 *   /en           -> { locale: 'en', pathname: '/' }
 *   /dashboard    -> { locale: <defaultLocale>, pathname: '/dashboard' }
 */
export function stripLocale(pathname: string): {
  locale: string;
  pathname: string;
} {
  const segments = pathname.split("/");
  const maybeLocale = segments[1];
  if (localeSet.has(maybeLocale)) {
    const rest = "/" + segments.slice(2).join("/");
    return {
      locale: maybeLocale,
      pathname: rest === "/" ? "/" : rest.replace(/\/$/, ""),
    };
  }
  return { locale: routing.defaultLocale, pathname };
}

/**
 * true для корня сайта с учётом локали: `/`, `/ru`, `/en`, `/ru/`.
 * Используется, чтобы не редиректить на /login, когда пользователь
 * уже на публичном лендинге.
 */
export function isLocaleRoot(pathname: string): boolean {
  return stripLocale(pathname).pathname === "/";
}
