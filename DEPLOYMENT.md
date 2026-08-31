# Deployment checklist

Backend → **Railway**, Frontend → **Vercel**. Часть шагов делается руками в UI;
этот файл фиксирует список переменных и порядок проверки.

## CI/CD (GitHub Actions)

Ручной процесс (SSH на прод → `git pull` → `docker compose build`) заменён на пайплайн.
`docker-compose.yml` остаётся только для локального запуска стека.

| Workflow | Триггер | Что делает |
|---|---|---|
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | PR в `main` | `npm ci` + lint + `tsc --noEmit` + test — отдельно для `be/` и `fe/` |
| [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | push в `main` | собрать образ `be` → push в `ghcr.io/<repo>/backend:sha-<sha>` + `:latest` → `railway up` (API + worker) → health-check гейт |

Health-check: [`.github/scripts/wait-for-health.sh`](.github/scripts/wait-for-health.sh)
поллит `GET {BACKEND_URL}{HEALTHCHECK_PATH}` до 200. Railway с `healthcheckPath`
из [`be/railway.json`](be/railway.json) сам не переключает трафик на неисправный
деплой и держит предыдущий — отдельный откат не нужен, упавший job просто красный.

### Что настроить руками

GitHub → Settings → Secrets and variables → Actions:

- **Secret** `RAILWAY_TOKEN` — project token из Railway (Project → Settings → Tokens).
- **Variables**:
  - `RAILWAY_API_SERVICE` — имя сервиса API в Railway.
  - `RAILWAY_WORKER_SERVICE` — имя сервиса воркера.
  - `BACKEND_URL` — публичный адрес backend, без завершающего слэша.
  - `HEALTHCHECK_PATH` — пока `/`; после мержа ветки с `/health/ready` → `/health/ready`
    (и одновременно `healthcheckPath` в `be/railway.json`).

`GITHUB_TOKEN` для пуша в ghcr — встроенный, добавлять не нужно.

### Railway: сервисы под пайплайн

- **API**: source = этот репо, root `be/`, билд по `be/Dockerfile`. `be/railway.json`
  подхватывается автоматически (`preDeployCommand` = `npx prisma migrate deploy`,
  healthcheck). Ручной прогон миграций из чек-листа ниже больше не нужен.
- **Worker**: тот же репо/root, **Custom Start Command** `node dist/src/worker.js`,
  те же переменные окружения, без healthcheck.

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
