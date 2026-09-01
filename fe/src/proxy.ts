import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { stripLocale } from "./i18n/pathname";

const intlMiddleware = createMiddleware(routing);

const protectedRoutes = ['/dashboard', '/pipeline', '/contacts', '/deals', '/activities', '/users', '/roles', '/audit-logs', '/settings'];
const authRoutes = ['/login', '/register'];

export function proxy(request: NextRequest) {
  // 1. next-intl: определение локали (cookie -> Accept-Language -> defaultLocale),
  //    редирект / -> /ru, простановка NEXT_LOCALE cookie.
  const response = intlMiddleware(request);

  // 2. Auth-gating поверх уже локализованного пути.
  const { locale, pathname } = stripLocale(request.nextUrl.pathname);
  const accessToken = request.cookies.get('accessToken')?.value;
  const refreshToken = request.cookies.get('refreshToken')?.value;

  if (authRoutes.includes(pathname) && accessToken) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  const isProtectedRoute = protectedRoutes.some((route) => {
    return pathname === route || pathname.startsWith(route + '/');
  });

  if (isProtectedRoute && !accessToken && !refreshToken) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  return response;
}

export const config = {
  // Пропускаем API-проксирование, служебные пути Next/Vercel и файлы с расширением.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
