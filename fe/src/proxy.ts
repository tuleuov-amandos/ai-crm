import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Proxy (ex-middleware) отвечает ТОЛЬКО за locale-routing.
//
// Server-side auth-gating убран намеренно: auth-куки (accessToken/refreshToken)
// ставит Railway-backend на своём домене (cross-origin, SameSite=None), поэтому
// Vercel-edge их не видит — любая проверка request.cookies здесь ложно-отрицательна
// и редиректила бы на /login даже реально залогиненных пользователей.
//
// Защита /dashboard/* теперь целиком клиентская:
//   - axiosInstance (withCredentials) шлёт GET /auth/me на backend;
//   - на 401 после неудачного refresh интерцептор делает
//     window.location.href = "/login" (src/lib/api.ts);
//   - TenantStatusGate в (dashboard)/layout.tsx держит спиннер до ответа
//     и не пускает PENDING/SUSPENDED дальше.
export default createMiddleware(routing);

export const config = {
  // Пропускаем API-проксирование, служебные пути Next/Vercel и файлы с расширением.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
