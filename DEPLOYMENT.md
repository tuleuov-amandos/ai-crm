# Deployment checklist

Backend → **Railway**, Frontend → **Vercel**. Часть шагов делается руками в UI;
этот файл фиксирует список переменных и порядок проверки.

## CI/CD (GitHub Actions)

Ручной процесс (SSH на прод → `git pull` → `docker compose build`) заменён на пайплайн.
`docker-compose.yml` остаётся только для локального запуска стека.

| Workflow | Триггер | Что делает |
|---|---|---|
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | PR в `main` | `npm ci` + lint + `tsc --noEmit` + test — отдельно для `be/` и `fe/` |
| [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | push в `main` | собрать образ `be` → push в `ghcr.io/<repo>/backend:sha-<sha>` + `:latest` → **бэкап прод-БД** (`pg_dump` → artifact) → **`prisma migrate deploy`** → `railway up` (API + worker) → health-check гейт |

### Бэкап БД и миграции

- **Бэкап** (`backup` job): `pg_dump --format=custom` прод-Postgres через публичный
  proxy-endpoint Railway, из образа `postgres:18-alpine`
  ([`.github/scripts/backup-db.sh`](.github/scripts/backup-db.sh)) — мажорная версия
  `pg_dump` должна быть ≥ версии сервера Railway (сейчас 18.x). Локальный Postgres в
  `docker-compose.yml` (`16-alpine`) может отставать: это только dev-среда, бэкап
  снимается исключительно с Railway и этим pinned-образом, не из локального клиента.
  Дамп кладётся как
  artifact `db-backup-<sha>` (retention 14 дней). Restore:
  `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" railway-*.dump`.
- **Миграции** (`migrate` job): `npx prisma migrate deploy` — **отдельный шаг пайплайна**,
  строго между бэкапом и `railway up`. Не в build stage Dockerfile и больше не в
  `be/railway.json` `preDeployCommand` — миграции применяются один раз за реальный
  деплой, а не на каждой сборке образа.
- **Нативные snapshot'ы Railway** — независимый второй уровень: Railway → сервис
  Postgres → **Backups** → включить scheduled backups (глубина retention зависит от
  тарифа). CLI/API-хука «сделать бэкап сейчас» у Railway нет, поэтому в пайплайне —
  `pg_dump`.

Health-check: [`.github/scripts/wait-for-health.sh`](.github/scripts/wait-for-health.sh)
поллит `GET {BACKEND_URL}{HEALTHCHECK_PATH}` до 200. Railway с `healthcheckPath`
из [`be/railway.json`](be/railway.json) сам не переключает трафик на неисправный
деплой и держит предыдущий — отдельный откат не нужен, упавший job просто красный.

### Что настроить руками

GitHub → Settings → Secrets and variables → Actions:

- **Secret** `RAILWAY_TOKEN` — project token из Railway (Project → Settings → Tokens).
- **Secret** `DATABASE_URL` (лучше в Environment `production`) — **публичная** строка
  подключения Railway Postgres (`postgresql://…@<host>.proxy.rlwy.net:<port>/railway?sslmode=require`,
  Railway отдаёт её как `DATABASE_PUBLIC_URL`). Нужна job'ам `backup` и `migrate`.
  Внутренний `*.railway.internal` хост из GitHub Actions недоступен.
- **Variables**:
  - `RAILWAY_API_SERVICE` — имя сервиса API в Railway.
  - `RAILWAY_WORKER_SERVICE` — имя сервиса воркера.
  - `BACKEND_URL` — публичный адрес backend, без завершающего слэша.
  - `HEALTHCHECK_PATH` — пока `/`; после мержа ветки с `/health/ready` → `/health/ready`
    (и одновременно `healthcheckPath` в `be/railway.json`).

`GITHUB_TOKEN` для пуша в ghcr — встроенный, добавлять не нужно.

### Railway: сервисы под пайплайн

- **API**: source = этот репо, root `be/`, билд по `be/Dockerfile`. `be/railway.json`
  подхватывается автоматически (healthcheck, restart policy). Миграции Railway больше
  **не** гоняет — их применяет job `migrate` в пайплайне (см. «Бэкап БД и миграции»).
  Ручной прогон миграций из чек-листа ниже не нужен.
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
- [ ] Миграции Prisma применяются пайплайном (job `migrate`) — вручную не гонять.
- [ ] Проверить логи: `✓ Redis connected`, `Server running on port: ...`.
- [ ] `GET /api-docs` открывается.

## Frontend (Vercel)

- [ ] `NEXT_PUBLIC_API_URL` — публичный адрес backend на Railway (без слэша, без `/api`).
      Fallback в коде — `http://localhost:3001` (только dev). Браузер ходит на этот
      адрес напрямую cross-origin (axios `baseURL`, OAuth-редирект, SSE) — rewrite
      `/api/*` из `next.config.ts` **убран** (ломал cookie-флоу: кука привязывалась
      к домену Railway и не долетала обратно). Работает за счёт `sameSite=none;secure`
      кук в проде + `credentials: true` в `app.enableCors` на бэкенде.
- [ ] `NEXT_PUBLIC_APP_URL` — адрес самого Vercel-деплоя (для metadata / OpenGraph).
      Fallback — `http://localhost:3000`.
- [ ] `NEXT_PUBLIC_SITE_LOCALE` — опционально, дефолт `ru_RU` (OpenGraph `locale`).

### Проверка после смены домена
- [ ] Логин через Google проходит, кука `accessToken` ставится на домен backend
      (Railway), последующий `GET /auth/me` авторизован.
- [ ] Запросы с FE идут напрямую на `NEXT_PUBLIC_API_URL` (cross-origin), в DevTools
      видно `Access-Control-Allow-Origin` = домен фронта и `...-Allow-Credentials: true`.
- [ ] В ответах backend нет CORS-ошибок (совпадение `FRONTEND_URL` ↔ реальный origin).

### Preview-деплои Vercel и CORS

`app.enableCors` на бэкенде разрешает **ровно один** origin — `FRONTEND_URL`
(production-домен). Preview-деплои Vercel (`*-git-<branch>-*.vercel.app` и
`*.vercel.app` для отдельных сборок) получат **CORS-ошибку** на любой
auth/api-запрос: их origin не совпадает с `FRONTEND_URL`, куки не отправятся.

Прод это не затрагивает. Если понадобится тестировать auth на preview-ветках —
расширить CORS до списка origin'ов или regex по `*.vercel.app`
(`app.enableCors({ origin: [FRONTEND_URL, /\.vercel\.app$/], credentials: true })`).
Это **отдельная задача** — оценить риск открытия CORS на все preview-поддомены.

- npm warn allow-scripts: msw/sharp/unrs-resolver install-скрипты не одобрены явно.
  Проверить, не влияет ли на рантайм (особенно sharp — обработка изображений).
  Если нужно — `npm approve-scripts <pkg>` или явный allowlist в package.json.
