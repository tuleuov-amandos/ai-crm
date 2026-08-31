# Deployment checklist

Backend → **Railway**, Frontend → **Vercel**. Часть шагов делается руками в UI;
этот файл фиксирует список переменных и порядок проверки.

## Backend (Railway)

Полный список переменных — в [`be/.env.example`](be/.env.example).

### Сервисы
- [ ] Добавить плагин **Postgres**.
- [ ] Добавить плагин **Redis**.
- [ ] Основной сервис из репо (`be/`), Dockerfile.
- [ ] Отдельный сервис для BullMQ-воркера: та же кодовая база, команда
      `npm run start:worker` (см. `be/package.json`), те же переменные окружения.

### Переменные
- [ ] `DATABASE_URL` — из плагина Postgres, добавить `?sslmode=require` в конец.
- [ ] Redis: Railway отдаёт `REDIS_URL` вида `redis://default:<pass>@<host>:<port>`.
      Приложение читает раздельные переменные — разобрать URL:
      `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (после `default:`),
      `REDIS_TLS=true` только если схема `rediss://`.
- [ ] `FRONTEND_URL` — точный адрес Vercel-деплоя, **без завершающего слэша**
      (используется в `app.enableCors`, схема+хост должны совпадать 1:1).
- [ ] `COOKIE_DOMAIN` — общий родительский домен для FE и BE, напр. `.example.com`.
      Оставить пустым, если FE и BE на разных доменах (кука будет host-only) или для локали.
- [ ] `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` — `openssl rand -hex 64`, разные значения.
- [ ] `ACCESS_TOKEN_EXPIRES_IN` / `REFRESH_TOKEN_EXPIRES_IN` (напр. `15m` / `7d`).
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- [ ] `GOOGLE_CALLBACK_URL` — `https://<backend>/auth/google/callback`,
      и этот же URL добавить в Authorized redirect URIs в Google Cloud Console.
- [ ] `AI_PROVIDER` (`openai` | `groq`) + соответствующий ключ (`OPENAI_API_KEY` / `GROQ_API_KEY`).
- [ ] `NODE_ENV=production`. `PORT` Railway прокидывает сам.

### После деплоя
- [ ] Прогнать миграции Prisma (`npx prisma migrate deploy`).
- [ ] Проверить логи: `✓ Redis connected`, `Server running on port: ...`.
- [ ] `GET /api-docs` открывается.

## Frontend (Vercel)

- [ ] `NEXT_PUBLIC_API_URL` — публичный адрес backend на Railway (без слэша).
      Fallback в коде — `http://localhost:3001` (только dev).
- [ ] `NEXT_PUBLIC_APP_URL` — адрес самого Vercel-деплоя (для metadata / OpenGraph).
      Fallback — `http://localhost:3000`.
- [ ] `NEXT_PUBLIC_SITE_LOCALE` — опционально, дефолт `ru_RU` (OpenGraph `locale`).

### Проверка после смены домена
- [ ] Логин через Google проходит, кука `accessToken` ставится на нужный домен.
- [ ] Запросы с FE к `/api/*` доходят до backend (rewrite в `fe/next.config.ts`).
- [ ] В ответах backend нет CORS-ошибок (совпадение `FRONTEND_URL` ↔ реальный origin).
