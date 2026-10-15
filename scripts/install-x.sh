#!/usr/bin/env bash
# Ставит собранный Paseo X на телефон — и только если сборка действительно свежая.
#
# Отдельным скриптом, потому что однажды установка прошла после несостоявшейся сборки
# (та остановилась на нехватке диска), и на телефон уехала предыдущая версия, а отчёт
# был бодрый. Теперь признак свежести проверяется явно.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$HERE/.derived/Build/Products/Release-iphoneos/PaseoX.app"
DEVICE="${1:?укажи идентификатор устройства: ./scripts/install-x.sh <device-id>}"
MAX_AGE_MIN="${MAX_AGE_MIN:-30}"

[ -d "$APP" ] || { echo "сборки нет: $APP"; exit 1; }

# Старше получаса — почти наверняка не та, что собиралась только что.
age=$(( ($(date +%s) - $(stat -f %m "$APP")) / 60 ))
[ "$age" -le "$MAX_AGE_MIN" ] || {
  echo "сборке $age мин — это не свежая сборка; пересобери или подними MAX_AGE_MIN"; exit 1; }

codesign -d --entitlements - "$APP" 2>/dev/null | grep -q carplay || {
  echo "в сборке нет ключа CarPlay — ставить нечего"; exit 1; }

echo "ставлю сборку возрастом $age мин"
n=0
until xcrun devicectl device install app --device "$DEVICE" "$APP" >/tmp/paseox-install.log 2>&1; do
  n=$((n + 1))
  [ "$n" -gt 60 ] && { echo "телефон так и не разблокирован"; tail -3 /tmp/paseox-install.log; exit 1; }
  sleep 10
done
echo "установлено"
grep -aE "bundleID|installationURL" /tmp/paseox-install.log | head -2
