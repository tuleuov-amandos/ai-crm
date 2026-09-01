#!/usr/bin/env bash
#
# Логический бэкап Railway Postgres — гоняется в пайплайне ПЕРЕД
# `prisma migrate deploy`, до переключения трафика на новый деплой.
#
#   backup-db.sh <out-file>
#
# Строку подключения берём из env DATABASE_URL (не из аргумента — чтобы не
# светить её в списке процессов хоста). Дамп в custom-формате (-Fc): сжатый,
# годится для `pg_restore --clean --if-exists`.
#
# pg_dump запускаем из official-образа Postgres, а не из клиента раннера —
# так версия pg_dump гарантированно не старше версии сервера Railway.
# Переопределить образ: PG_IMAGE=postgres:16-alpine backup-db.sh ...
#
# Exit 0 — валидный дамп записан; exit 1 — ошибка подключения/дампа или
# битый файл (нет заголовка PGDMP).

set -euo pipefail

OUT_FILE="${1:?usage: backup-db.sh <out-file>}"
: "${DATABASE_URL:?DATABASE_URL is required}"
PG_IMAGE="${PG_IMAGE:-postgres:18-alpine}"

mkdir -p "$(dirname "$OUT_FILE")"

echo "pg_dump ($PG_IMAGE) -> $OUT_FILE"

# DBURL пробрасываем в контейнер по имени (без значения в argv docker run).
export DBURL="$DATABASE_URL"
docker run --rm --env DBURL --env PGCONNECT_TIMEOUT=15 "$PG_IMAGE" \
  sh -c 'exec pg_dump --format=custom --no-owner --no-privileges --dbname="$DBURL"' \
  > "$OUT_FILE"

# Sanity-check: custom-format дампы начинаются с магии "PGDMP".
if [ "$(head -c 5 "$OUT_FILE")" != "PGDMP" ]; then
  echo "::error::дамп повреждён — отсутствует заголовок PGDMP"
  exit 1
fi

bytes="$(wc -c < "$OUT_FILE" | tr -d ' ')"
echo "backup ok: $OUT_FILE (${bytes} bytes)"
