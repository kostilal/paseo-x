#!/usr/bin/env bash
# Собирает Paseo X. Клонирует не апстрим, а этот форк, затем накладывает правки
# плагина голоса из его чекаута — так музыка, Opus и speak-фиксы остаются под
# поддержкой автора плагина.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="${PASEO_VOICE_CHECKOUT:?укажи чекаут плагина: ~/.paseo/plugins/voice/*/checkout}"
TEAM="${DEVELOPMENT_TEAM:?передай DEVELOPMENT_TEAM, иначе возьмётся просроченный сертификат}"
DEST="${1:-device}"   # device | simulator

free=$(df -g /System/Volumes/Data | awk 'NR==2{print $4}')
[ "$free" -ge 15 ] || { echo "нужно 15 ГБ свободных, есть ${free}"; exit 1; }
[ "$(node -v | cut -d. -f1)" = "v22" ] || { echo "нужен Node 22: PATH=/opt/homebrew/opt/node@22/bin:\$PATH"; exit 1; }

# Правки плагина ложатся прямо в рабочее дерево, и после сборки оно грязное на 38
# файлов — коммит с -a забрал бы их как наши. Поэтому: входим только с чистым деревом
# и откатываем правки после успешной сборки.
[ -z "$(git -C "$HERE" status --porcelain -- packages)" ] || {
  echo "рабочее дерево в packages/ грязное — закоммить или откати перед сборкой"; exit 1; }

node "$PLUGIN/ios-build/patch-app.mjs" "$HERE"
( cd "$HERE" && npm install --no-audit --no-fund && npm run build:app-deps )

# Правка инклюда в поде CarPlay: npm install переписывает node_modules, поэтому после него.
node "$HERE/scripts/patch-carplay-pod.mjs" "$HERE"
export APP_VARIANT=x
( cd "$HERE/packages/app" && npx expo prebuild --platform ios --clean )
( cd "$HERE/packages/app/ios" && pod install )

# Push нам не нужен, а требование `aps-environment` заставляет Xcode искать профиль с
# этой возможностью: он берёт общий профиль команды, тот её не несёт, и подпись падает.
# Без ключа Xcode заводит профиль под наш bundle id — тот самый, в котором приедет CarPlay.
ENT="$(find "$HERE/packages/app/ios" -maxdepth 2 -name '*.entitlements' | head -1)"
if [ -n "$ENT" ]; then
  /usr/libexec/PlistBuddy -c "Delete :aps-environment" "$ENT" 2>/dev/null \
    && echo "  push-разрешение убрано"
fi

WS="$(find "$HERE/packages/app/ios" -maxdepth 1 -name '*.xcworkspace' | head -1)"
SCHEME="$(basename "$WS" .xcworkspace)"
if [ "$DEST" = "simulator" ]; then
  # Подпись ad-hoc и обязательно в ручном режиме.
  #
  # Без подписи entitlements вообще не вшиваются, а без ключа CarPlay система не
  # считает приложение приложением для машины и не показывает иконку на её экране.
  # Но и подписи мало: при автоматическом режиме Xcode фильтрует entitlements по
  # возможностям аккаунта и для симулятора оставляет пустой словарь — это видно по
  # сгенерированному .xcent. В ручном режиме файл берётся как есть.
  # Подписать уже собранный бандл постфактум не выходит — SpringBoard такой
  # отказывается запускать.
  xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath "$HERE/.derived" \
    -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM" \
    build > "$HERE/.derived-build.log" 2>&1 || true
else
  xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=iOS' -derivedDataPath "$HERE/.derived" \
    -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM" \
    build > "$HERE/.derived-build.log" 2>&1 || true
fi
grep -aE "error:" "$HERE/.derived-build.log" | sort -u | head -10 || true
grep -aq "BUILD SUCCEEDED" "$HERE/.derived-build.log" || { echo "сборка упала, подробности в $HERE/.derived-build.log"; exit 1; }
# Дерево возвращаем в то состояние, в котором вошли: артефакты уже собраны.
git -C "$HERE" restore packages
git -C "$HERE" clean -fdq -- packages/app/src/audio packages/expo-two-way-audio/ios
echo "BUILD SUCCEEDED (правки плагина откачены, дерево чистое)"
