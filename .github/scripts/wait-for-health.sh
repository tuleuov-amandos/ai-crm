#!/usr/bin/env bash
#
# Health-check gate: поллит URL до первого HTTP 200.
#
#   wait-for-health.sh <url> [attempts] [sleep_seconds]
#
# Дефолт: 30 попыток × 10s = ждём до 5 минут.
# Exit 0 — получили 200; exit 1 — не дождались (job становится красным,
# трафик на Railway при этом уже НЕ переключён на неисправный деплой).

set -euo pipefail

URL="${1:?usage: wait-for-health.sh <url> [attempts] [sleep_seconds]}"
ATTEMPTS="${2:-30}"
SLEEP="${3:-10}"

echo "Health-check: $URL (${ATTEMPTS} попыток, интервал ${SLEEP}s)"

for i in $(seq 1 "$ATTEMPTS"); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" || echo 000)"
  echo "  [$i/$ATTEMPTS] -> $code"
  if [ "$code" = "200" ]; then
    echo "healthy ✅"
    exit 0
  fi
  sleep "$SLEEP"
done

echo "::error::health-check не прошёл за $((ATTEMPTS * SLEEP))s — деплой не считается успешным"
exit 1
