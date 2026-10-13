# Paseo X CarPlay — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** голосовая работа с агентами с экрана машины: список воркспейсов и чатов, тап по чату сразу включает голос.

**Architecture:** форк Paseo от тега, аддитивный слой `packages/app/src/carplay/` поверх существующего голосового рантайма. Клиент в голосовом режиме — тонкий терминал звука: микрофон уходит в демон, аудио приходит обратно, STT/TTS на демоне. CarPlay-слой только выбирает агента и дёргает `useVoice()`.

**Tech Stack:** Expo 54, RN 0.81.5 (New Architecture), TypeScript, vitest, `@g4rb4g3/react-native-carplay`, `expo-speech`, свой Expo config plugin.

**Spec:** `docs/superpowers/specs/2026-10-13-paseo-x-carplay-design.md`

## Global Constraints

- Форк только от **тега**: `carplay` отрезана от `v0.11.2`; обновление — `git rebase` на следующий тег, никогда на `main`.
- Node 22 обязателен: все сборки запускать с `PATH=/opt/homebrew/opt/node@22/bin:$PATH` (глобальный node 26 ломает Metro в Expo 54).
- `DEVELOPMENT_TEAM=8556UCQ95M` передавать руками; скрипт плагина иначе берёт первый сертификат в связке (просроченный).
- Перед сборкой — **12–15 ГБ свободного диска**; при нехватке `pod install` падает с `ENOSPC` под видом поломки CocoaPods. Проверять `df -h /System/Volumes/Data`.
- Сборка варианта: `APP_VARIANT=x`. Вариант `development` в `app.config.js` не трогать.
- **Одиннадцать файлов, которые нельзя редактировать** (их патчит плагин голоса, его сплайсы откажут и остановят сборку): `packages/app/app.config.js` (якорь `bundleIdentifier`), `packages/app/src/audio/opus-uplink.ts`, `packages/app/src/contexts/session-context.tsx`, `packages/app/src/contexts/voice-context.tsx`, `packages/app/src/dictation/dictation-stream-sender.ts`, `packages/app/src/plugins/evaluate.ts`, `packages/app/src/utils/thinking-tone.native-pcm.ts`, `packages/app/src/utils/thinking-tone.test.ts`, `packages/app/src/voice/voice-runtime.ts`, `packages/expo-two-way-audio/ios/ExpoTwoWayAudioModule.swift`, `packages/expo-two-way-audio/ios/VoiceOpusEncoder.swift`, `packages/expo-two-way-audio/src/core.ts`. Вызывать их API можно.
- Исключение по `app.config.js`: нужный нам вариант добавляется **новым блоком**, якорь `bundleIdentifier` остаётся дословно на месте.
- CarPlay: не больше трёх одобренных экранов включая главный; текст и картинки в ответах не показывать; `VoiceControlTemplate` — модальный (`presentTemplate`/`dismissTemplate`), не из стека.
- Тесты — vitest: `npm test` в `packages/app`. Типы — `npm run typecheck` (`tsgo --noEmit`). Линт — `npm run lint`.
- Строки интерфейса — русские, в `src/carplay/strings.ts`; в общий i18n апки не лезем, чтобы не плодить правки в файлах апстрима.

## Review Focus

- **Агент без `workspaceId`** (поле опциональное) — потеряется из списка целиком. Ожидание: попадает в секцию «Без воркспейса». Тест в задаче 3.
- **Воркспейс без агентов** — секция с заголовком и пустотой. Ожидание: такая секция не показывается. Тест в задаче 3.
- **Отключение от машины посреди голосового режима** — подписки и голос остаются висеть, JS-контекст удержан. Ожидание: `stopVoice()` и снятие подписок на `disconnect`. Тест в задаче 4.
- **Пустой или очень длинный текст сообщения** — строка без текста (CarPlay покажет пустую) или нечитаемая. Ожидание: пустые пропускаем, длинные режем до 60 символов в заголовке. Тест в задаче 5.
- **Демон отвалился: список пуст и `startVoice` на мёртвом соединении** — молча пустой экран и зависший тап. Ожидание: `emptyViewTitleVariants` с объяснением; ошибка `startVoice` не роняет контроллер. Тесты в задачах 3 и 4.

---

### Task 1: Форк, ветка, документы

**Files:**
- Create: `~/Documents/Work/Projects/paseo-x` (чекаут форка)
- Create: `README.x.md`, `NOTICE`
- Create: `docs/superpowers/specs/2026-10-13-paseo-x-carplay-design.md` (перенос)

**Interfaces:**
- Consumes: ничего.
- Produces: репозиторий `kostilal/paseo-x`, ветка `carplay` на теге `v0.11.2`, remote `upstream` → `getpaseo/paseo`.

- [ ] **Step 1: Создать публичный форк**

```bash
gh repo fork getpaseo/paseo --fork-name paseo-x --clone=false --default-branch-only=false
gh repo edit kostilal/paseo-x --visibility public --accept-visibility-change-consequences
```

- [ ] **Step 2: Склонировать и встать на тег**

```bash
cd ~/Documents/Work/Projects
git clone git@github.com:kostilal/paseo-x.git paseo-x
cd paseo-x
git remote add upstream https://github.com/getpaseo/paseo.git
git fetch upstream --tags
git checkout -b carplay v0.11.2
git log -1 --format='%h %s'   # ожидается 7595325 chore(release): cut 0.11.2
```

- [ ] **Step 3: Заявить форк в документах**

`README.x.md`:

```markdown
# Paseo X

Неофициальный форк [Paseo](https://github.com/getpaseo/paseo) с поддержкой CarPlay
для голосовой работы с агентами из машины.

Апстрим: `getpaseo/paseo`, Apache-2.0. Это производная работа; имя «Paseo»
принадлежит автору апстрима, лицензия Apache-2.0 прав на знак не даёт (§6).
Изменения перечислены в NOTICE.

Ветка `carplay` всегда отрезана от релизного **тега** апстрима, никогда от `main`:
клиент обязан совпадать с версией демона, иначе соединение закрывается через
десять секунд после `hello`, и это выглядит как таймаут пайринга.
```

`NOTICE` (дописать в конец, если файл есть; иначе создать):

```
Paseo X — производная работа от Paseo (https://github.com/getpaseo/paseo),
Copyright (c) 2025-present Mohamed Boudra, Apache License 2.0.

Изменения в этом форке:
- добавлена поддержка Apple CarPlay (packages/app/src/carplay/, config-плагин,
  вариант сборки `x`);
- добавлен скрипт сборки scripts/build-x.sh.
```

- [ ] **Step 4: Перенести спеку**

```bash
mkdir -p docs/superpowers/specs
cp ~/Documents/Work/Projects/JobbyJobs/docs/superpowers/specs/2026-10-13-paseo-x-carplay-design.md docs/superpowers/specs/
mkdir -p docs/superpowers/plans
cp ~/Documents/Work/Projects/JobbyJobs/docs/superpowers/plans/2026-10-13-paseo-x-carplay.md docs/superpowers/plans/
```

- [ ] **Step 5: Коммит**

```bash
git add README.x.md NOTICE docs/superpowers
git commit -m "docs: заявить форк и перенести спеку с планом CarPlay"
git push -u origin carplay
```

---

### Task 2: Шаг 0 — сцена CarPlay поднимается, телефон жив

Самая рискованная задача: Expo-апка живёт на `AppDelegate` без scene-манифеста, а CarPlay требует `UIApplicationSceneManifest`. Неаккуратный манифест даёт чёрное окно на телефоне. Здесь же проверяется библиотека против RN 0.81.5.

**Files:**
- Create: `packages/app/plugins/with-carplay.js`
- Create: `packages/app/src/carplay/strings.ts`
- Create: `packages/app/src/carplay/connection.ts`
- Create: `packages/app/src/carplay/controller.tsx`
- Create: `scripts/build-x.sh`
- Modify: `packages/app/app.config.js` (новый вариант `x` + подключение плагина; якорь `bundleIdentifier` не трогать)
- Modify: `packages/app/app/_layout.tsx` (одна строка — монтаж контроллера внутри `VoiceProvider`)

**Interfaces:**
- Consumes: ничего из предыдущих задач.
- Produces:
  - `src/carplay/connection.ts`: `onCarPlayConnect(handler: () => void): () => void`, `onCarPlayDisconnect(handler: () => void): () => void`, `setRoot(template: ListTemplate): void`, `push(template: ListTemplate): void`, `pop(): void`, `present(template: VoiceControlTemplate): void`, `dismiss(): void`
  - `src/carplay/controller.tsx`: `export function CarPlayController(): null`
  - `src/carplay/strings.ts`: `export const S: Record<string, string>`

- [ ] **Step 1: Поставить зависимости**

```bash
cd ~/Documents/Work/Projects/paseo-x
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
npm install --workspace packages/app @g4rb4g3/react-native-carplay expo-speech
```

- [ ] **Step 2: Config-плагин — манифест сцены, фоновое аудио, entitlement**

`packages/app/plugins/with-carplay.js`:

```js
const { withInfoPlist, withEntitlementsPlist } = require("expo/config-plugins");

/**
 * CarPlay требует UIApplicationSceneManifest с ролью
 * CPTemplateApplicationSceneSessionRoleApplication. У Expo-апки манифеста нет вообще,
 * поэтому телефонную роль описываем тоже — без неё окно телефона остаётся чёрным.
 * Делегат CarPlay-сцены берётся из библиотеки (RNCarPlayApp.swift).
 */
const withCarPlay = (config) => {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: true,
      UISceneConfigurations: {
        CPTemplateApplicationSceneSessionRoleApplication: [
          {
            UISceneClassName: "CPTemplateApplicationScene",
            UISceneConfigurationName: "CarPlay",
            UISceneDelegateClassName: "RNCarPlaySceneDelegate",
          },
        ],
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    // Голос в машине продолжается при погасшем экране телефона.
    const modes = new Set(cfg.modResults.UIBackgroundModes ?? []);
    modes.add("audio");
    cfg.modResults.UIBackgroundModes = [...modes];
    return cfg;
  });

  // Для симулятора: ключ нужен локально, настоящий придёт в профиле от Apple.
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["com.apple.developer.carplay-voice-based-conversation"] = true;
    return cfg;
  });
};

module.exports = withCarPlay;
```

- [ ] **Step 3: Вариант сборки `x` в `app.config.js`**

В объекте `variants` добавить блок рядом с существующими, **не меняя** строки с `bundleIdentifier`:

```js
  x: {
    name: "Paseo X",
    packageId: "work.jobbyjobs.paseox",
  },
```

и в массив плагинов добавить `require("./plugins/with-carplay")`.

- [ ] **Step 4: Строки**

`packages/app/src/carplay/strings.ts`:

```ts
export const S = {
  rootTitle: "Paseo X",
  noConnection: "Нет связи с демоном",
  noConnectionHint: "Проверь, запущен ли Paseo на компьютере",
  noAgents: "Чатов пока нет",
  noWorkspace: "Без воркспейса",
  mic: "Микрофон",
  micOff: "Выключить",
  mute: "Mute",
  muted: "Mute вкл.",
  listening: "Слушаю…",
  thinking: "Думаю…",
  speaking: "Говорю…",
  idle: "Готов",
} as const;
```

- [ ] **Step 5: Обёртка над библиотекой**

`packages/app/src/carplay/connection.ts`:

```ts
import { CarPlay } from "@g4rb4g3/react-native-carplay";
import type { ListTemplate } from "@g4rb4g3/react-native-carplay";
import type { VoiceControlTemplate } from "@g4rb4g3/react-native-carplay";

/** Подписка на подключение к машине. Возвращает функцию снятия. */
export function onCarPlayConnect(handler: () => void): () => void {
  const wrapped = () => handler();
  CarPlay.registerOnConnect(wrapped);
  return () => CarPlay.unregisterOnConnect(wrapped);
}

export function onCarPlayDisconnect(handler: () => void): () => void {
  const wrapped = () => handler();
  CarPlay.registerOnDisconnect(wrapped);
  return () => CarPlay.unregisterOnDisconnect(wrapped);
}

export const setRoot = (template: ListTemplate): void => CarPlay.setRootTemplate(template);
export const push = (template: ListTemplate): void => CarPlay.pushTemplate(template);
export const pop = (): void => CarPlay.popTemplate();
/** VoiceControlTemplate модальный: он накрывает экран чата и уходит, не трогая стек. */
export const present = (template: VoiceControlTemplate): void => CarPlay.presentTemplate(template);
export const dismiss = (): void => CarPlay.dismissTemplate();
```

- [ ] **Step 6: Контроллер-заглушка — пустой список**

`packages/app/src/carplay/controller.tsx`:

```tsx
import { useEffect } from "react";
import { ListTemplate } from "@g4rb4g3/react-native-carplay";
import { onCarPlayConnect, onCarPlayDisconnect, setRoot } from "./connection";
import { S } from "./strings";

/** Ничего не рисует на телефоне: живёт в дереве провайдеров ради доступа к сторам и голосу. */
export function CarPlayController(): null {
  useEffect(() => {
    const offConnect = onCarPlayConnect(() => {
      setRoot(
        new ListTemplate({
          id: "root",
          title: S.rootTitle,
          sections: [],
          emptyViewTitleVariants: [S.noAgents],
        }),
      );
    });
    const offDisconnect = onCarPlayDisconnect(() => {});
    return () => {
      offConnect();
      offDisconnect();
    };
  }, []);

  return null;
}
```

- [ ] **Step 7: Смонтировать контроллер**

В `packages/app/app/_layout.tsx` — импорт и одна строка внутри `<VoiceProvider>` (файл плагин не патчит):

```tsx
import { CarPlayController } from "@/carplay/controller";
// …
      <VoiceProvider>
        <CarPlayController />
        {/* существующее содержимое без изменений */}
      </VoiceProvider>
```

- [ ] **Step 8: Скрипт сборки**

`scripts/build-x.sh`:

```bash
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

node "$PLUGIN/ios-build/patch-app.mjs" "$HERE"
( cd "$HERE" && npm ci --no-audit --no-fund && npm run build:app-deps )
export APP_VARIANT=x
( cd "$HERE/packages/app" && npx expo prebuild --platform ios --clean )
( cd "$HERE/packages/app/ios" && pod install )

WS="$(find "$HERE/packages/app/ios" -maxdepth 1 -name '*.xcworkspace' | head -1)"
SCHEME="$(basename "$WS" .xcworkspace)"
if [ "$DEST" = "simulator" ]; then
  # Ручная подпись: при автоматической Xcode молча выбрасывает entitlements даже для симулятора.
  xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath "$HERE/.derived" \
    CODE_SIGNING_ALLOWED=NO build | tail -5
else
  xcodebuild -workspace "$WS" -scheme "$SCHEME" -configuration Release \
    -destination 'generic/platform=iOS' -derivedDataPath "$HERE/.derived" \
    -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM" build | tail -5
fi
```

```bash
chmod +x scripts/build-x.sh
echo ".derived/" >> .gitignore
```

- [ ] **Step 9: Проверить типы и собрать под симулятор**

```bash
cd ~/Documents/Work/Projects/paseo-x && export PATH=/opt/homebrew/opt/node@22/bin:$PATH
npm run --workspace packages/app typecheck
PASEO_VOICE_CHECKOUT=$(ls -d ~/.paseo/plugins/voice/*/checkout | head -1) \
  DEVELOPMENT_TEAM=8556UCQ95M ./scripts/build-x.sh simulator
```

Ожидается `BUILD SUCCEEDED`. Если библиотека не собирается против RN 0.81.5 — зафиксировать ошибку и остановиться: дальше идёт развилка «свой нативный модуль», её решает человек.

- [ ] **Step 10: Критерий шага 0 — руками**

```bash
xcrun simctl boot "iPhone 16 Pro" 2>/dev/null || true
xcrun simctl install booted "$(find .derived/Build/Products/Release-iphonesimulator -maxdepth 1 -name '*.app' | head -1)"
xcrun simctl launch booted work.jobbyjobs.paseox
```

Затем в Simulator: I/O → External Displays → CarPlay.

Зелёный результат — **оба** условия: на CarPlay-дисплее виден пустой список с заголовком «Paseo X», **и** окно телефона работает как раньше (не чёрное). Если телефон почернел — виноват scene-манифест из шага 2, а не контроллер.

- [ ] **Step 11: Коммит**

```bash
git add packages/app/plugins/with-carplay.js packages/app/app.config.js \
  packages/app/src/carplay packages/app/app/_layout.tsx scripts/build-x.sh .gitignore package-lock.json
git commit -m "feat(carplay): поднять сцену CarPlay и смонтировать контроллер"
```

---

### Task 3: Список воркспейсов и чатов

**Files:**
- Create: `packages/app/src/carplay/templates.ts`
- Create: `packages/app/src/carplay/templates.test.ts`

**Interfaces:**
- Consumes: `S` из `./strings`.
- Produces: `buildAgentSections(input: { agents: Agent[]; workspaces: WorkspaceDescriptor[] }): ListSection[]`, `agentRowId(serverId: string, agentId: string): string`, `parseAgentRowId(id: string): { serverId: string; agentId: string } | null`.

- [ ] **Step 1: Написать падающий тест**

`packages/app/src/carplay/templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { agentRowId, buildAgentSections, parseAgentRowId } from "@/carplay/templates";
import { S } from "@/carplay/strings";

const agent = (over: Partial<Agent>): Agent =>
  ({
    serverId: "srv",
    id: "a1",
    title: "Чат один",
    status: "running",
    workspaceId: "w1",
    cwd: "/tmp",
    labels: {},
    parentAgentId: null,
    model: null,
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUserMessageAt: null,
    lastActivityAt: new Date(),
    ...over,
  }) as Agent;

const workspace = (over: Partial<WorkspaceDescriptor>): WorkspaceDescriptor =>
  ({ id: "w1", name: "jobby", projectDisplayName: "jobby-jobs", ...over }) as WorkspaceDescriptor;

describe("buildAgentSections", () => {
  it("группирует чаты по воркспейсам", () => {
    const sections = buildAgentSections({
      agents: [agent({ id: "a1", title: "Первый" }), agent({ id: "a2", title: "Второй" })],
      workspaces: [workspace({})],
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.header).toBe("jobby");
    expect(sections[0]?.items.map((i) => i.text)).toEqual(["Первый", "Второй"]);
  });

  it("агента без воркспейса не теряет, а кладёт в отдельную секцию", () => {
    const sections = buildAgentSections({
      agents: [agent({ id: "a9", title: "Сирота", workspaceId: undefined })],
      workspaces: [workspace({})],
    });
    expect(sections.map((s) => s.header)).toEqual([S.noWorkspace]);
    expect(sections[0]?.items[0]?.text).toBe("Сирота");
  });

  it("пустые воркспейсы не показывает", () => {
    const sections = buildAgentSections({
      agents: [],
      workspaces: [workspace({}), workspace({ id: "w2", name: "второй" })],
    });
    expect(sections).toEqual([]);
  });

  it("чат без названия подписывает путём", () => {
    const sections = buildAgentSections({
      agents: [agent({ title: null, cwd: "/Users/i/work/thing" })],
      workspaces: [workspace({})],
    });
    expect(sections[0]?.items[0]?.text).toBe("thing");
  });

  it("id строки переживает круг туда-обратно", () => {
    const id = agentRowId("srv-1", "agent-2");
    expect(parseAgentRowId(id)).toEqual({ serverId: "srv-1", agentId: "agent-2" });
    expect(parseAgentRowId("мусор")).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd packages/app && npx vitest run src/carplay/templates.test.ts`
Expected: FAIL — `Failed to resolve import "@/carplay/templates"`.

- [ ] **Step 3: Реализовать**

`packages/app/src/carplay/templates.ts`:

```ts
import type { ListItem, ListSection } from "@g4rb4g3/react-native-carplay";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { S } from "./strings";

const SEP = "::";

export const agentRowId = (serverId: string, agentId: string): string =>
  `${serverId}${SEP}${agentId}`;

export function parseAgentRowId(id: string): { serverId: string; agentId: string } | null {
  const at = id.indexOf(SEP);
  if (at <= 0) {
    return null;
  }
  const serverId = id.slice(0, at);
  const agentId = id.slice(at + SEP.length);
  return agentId ? { serverId, agentId } : null;
}

/** Название чата: своё, иначе последний сегмент рабочей папки. */
const titleOf = (one: Agent): string =>
  one.title?.trim() || one.cwd.split("/").filter(Boolean).pop() || one.id;

/** Подзаголовок — состояние, а не текст сообщений: текст в ответах CarPlay показывать нельзя. */
const detailOf = (one: Agent): string => {
  if (one.requiresAttention) {
    return one.attentionReason === "permission" ? "ждёт разрешения" : "ждёт тебя";
  }
  return one.turn === "running" ? S.thinking : S.idle;
};

const rowOf = (one: Agent): ListItem => ({
  id: agentRowId(one.serverId, one.id),
  text: titleOf(one),
  detailText: detailOf(one),
  showsDisclosureIndicator: true,
});

/**
 * Воркспейсы — заголовками секций, чаты — строками. Пустые секции выбрасываются:
 * на экране машины заголовок без строк читается как сломанный список.
 */
export function buildAgentSections(input: {
  agents: Agent[];
  workspaces: WorkspaceDescriptor[];
}): ListSection[] {
  const byWorkspace = new Map<string, Agent[]>();
  const orphans: Agent[] = [];
  for (const one of input.agents) {
    if (!one.workspaceId) {
      orphans.push(one);
      continue;
    }
    const list = byWorkspace.get(one.workspaceId) ?? [];
    list.push(one);
    byWorkspace.set(one.workspaceId, list);
  }

  const sections: ListSection[] = [];
  for (const workspace of input.workspaces) {
    const agents = byWorkspace.get(workspace.id);
    if (!agents?.length) {
      continue;
    }
    sections.push({
      header: workspace.title?.trim() || workspace.name || workspace.projectDisplayName,
      items: agents.map(rowOf),
    });
  }
  if (orphans.length) {
    sections.push({ header: S.noWorkspace, items: orphans.map(rowOf) });
  }
  return sections;
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `cd packages/app && npx vitest run src/carplay/templates.test.ts`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Коммит**

```bash
git add packages/app/src/carplay/templates.ts packages/app/src/carplay/templates.test.ts
git commit -m "feat(carplay): список чатов секциями по воркспейсам"
```

---

### Task 4: Контроллер — данные, подключение, отключение

**Files:**
- Modify: `packages/app/src/carplay/controller.tsx`
- Create: `packages/app/src/carplay/root-template.ts`
- Create: `packages/app/src/carplay/root-template.test.ts`

**Interfaces:**
- Consumes: `buildAgentSections`, `parseAgentRowId`, `setRoot`, `onCarPlayConnect`, `onCarPlayDisconnect`.
- Produces: `createRootTemplate(input: { sections: ListSection[]; connected: boolean; onPick: (serverId: string, agentId: string) => void }): ListTemplate`, `teardown(): void` в контроллере.

- [ ] **Step 1: Написать падающий тест**

`packages/app/src/carplay/root-template.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createRootTemplate } from "@/carplay/root-template";
import { S } from "@/carplay/strings";

vi.mock("@g4rb4g3/react-native-carplay", () => ({
  ListTemplate: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  },
}));

describe("createRootTemplate", () => {
  it("без связи с демоном объясняет это в пустом состоянии", () => {
    const template = createRootTemplate({ sections: [], connected: false, onPick: () => {} });
    expect((template as never as { config: Record<string, string[]> }).config.emptyViewTitleVariants)
      .toEqual([S.noConnection]);
  });

  it("со связью и без чатов говорит, что чатов нет", () => {
    const template = createRootTemplate({ sections: [], connected: true, onPick: () => {} });
    expect((template as never as { config: Record<string, string[]> }).config.emptyViewTitleVariants)
      .toEqual([S.noAgents]);
  });

  it("тап по строке отдаёт serverId и agentId", async () => {
    const onPick = vi.fn();
    const template = createRootTemplate({
      sections: [{ header: "ws", items: [{ id: "srv::a1", text: "Чат" }] }],
      connected: true,
      onPick,
    });
    const config = (template as never as { config: { onItemSelect(i: { id: string; index: number; templateId: string }): Promise<void> } }).config;
    await config.onItemSelect({ id: "srv::a1", index: 0, templateId: "root" });
    expect(onPick).toHaveBeenCalledWith("srv", "a1");
  });

  it("тап по строке с мусорным id никого не зовёт", async () => {
    const onPick = vi.fn();
    const template = createRootTemplate({
      sections: [{ header: "ws", items: [{ id: "мусор", text: "Чат" }] }],
      connected: true,
      onPick,
    });
    const config = (template as never as { config: { onItemSelect(i: { id: string; index: number; templateId: string }): Promise<void> } }).config;
    await config.onItemSelect({ id: "мусор", index: 0, templateId: "root" });
    expect(onPick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd packages/app && npx vitest run src/carplay/root-template.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать корневой шаблон**

`packages/app/src/carplay/root-template.ts`:

```ts
import { ListTemplate } from "@g4rb4g3/react-native-carplay";
import type { ListSection } from "@g4rb4g3/react-native-carplay";
import { parseAgentRowId } from "./templates";
import { S } from "./strings";

/**
 * Пустой экран всегда объясняет себя: на экране машины молчаливая пустота неотличима
 * от поломки, а разбираться за рулём нечем.
 */
export function createRootTemplate(input: {
  sections: ListSection[];
  connected: boolean;
  onPick: (serverId: string, agentId: string) => void;
}): ListTemplate {
  return new ListTemplate({
    id: "root",
    title: S.rootTitle,
    sections: input.sections,
    emptyViewTitleVariants: [input.connected ? S.noAgents : S.noConnection],
    emptyViewSubtitleVariants: input.connected ? [] : [S.noConnectionHint],
    onItemSelect: async ({ id }) => {
      const parsed = typeof id === "string" ? parseAgentRowId(id) : null;
      if (parsed) {
        input.onPick(parsed.serverId, parsed.agentId);
      }
    },
  });
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `cd packages/app && npx vitest run src/carplay/root-template.test.ts`
Expected: PASS, 4 теста.

- [ ] **Step 4b: Тест на отключение от машины (обещан в Review Focus)**

Дописать в `packages/app/src/carplay/root-template.test.ts`:

```ts
import { handleCarPlayDisconnect } from "@/carplay/root-template";

describe("handleCarPlayDisconnect", () => {
  it("выходит из голоса: иначе микрофон слушает после выхода из машины", () => {
    const stopVoice = vi.fn().mockResolvedValue(undefined);
    handleCarPlayDisconnect({ wasConnected: true, stopVoice });
    expect(stopVoice).toHaveBeenCalledOnce();
  });

  it("ничего не делает, если подключения не было", () => {
    const stopVoice = vi.fn().mockResolvedValue(undefined);
    handleCarPlayDisconnect({ wasConnected: false, stopVoice });
    expect(stopVoice).not.toHaveBeenCalled();
  });

  it("не падает, если выход из голоса отверг обещание", () => {
    const stopVoice = vi.fn().mockRejectedValue(new Error("мёртвое соединение"));
    expect(() => handleCarPlayDisconnect({ wasConnected: true, stopVoice })).not.toThrow();
  });
});
```

Прогнать: `cd packages/app && npx vitest run src/carplay/root-template.test.ts` — ожидается FAIL, функции нет.

Дописать в `packages/app/src/carplay/root-template.ts`:

```ts
/**
 * Отключение от машины. Вынесено из компонента, чтобы поведение проверялось тестом:
 * оставленный включённым голос продолжает слушать микрофон после выхода из автомобиля.
 */
export function handleCarPlayDisconnect(input: {
  wasConnected: boolean;
  stopVoice: () => Promise<void>;
}): void {
  if (!input.wasConnected) {
    return;
  }
  void input.stopVoice().catch(() => {});
}
```

Прогнать снова — ожидается PASS, 7 тестов в файле. Коммит:

```bash
git add packages/app/src/carplay/root-template.ts packages/app/src/carplay/root-template.test.ts
git commit -m "feat(carplay): выходить из голоса при отключении от машины"
```

- [ ] **Step 5: Связать контроллер со сторами**

`packages/app/src/carplay/controller.tsx` целиком:

```tsx
import { useEffect, useMemo, useRef } from "react";
import { useVoice } from "@/contexts/voice-context";
import { useSessionStore } from "@/stores/session-store";
import { onCarPlayConnect, onCarPlayDisconnect, setRoot } from "./connection";
import { createRootTemplate, handleCarPlayDisconnect } from "./root-template";
import { buildAgentSections } from "./templates";

/**
 * Ничего не рисует на телефоне: живёт в дереве провайдеров ради useVoice() и сторов.
 * При отключении от машины обязан снять подписки и выйти из голоса — иначе
 * удержанный JS-контекст продолжает слушать микрофон после выхода из автомобиля.
 */
export function CarPlayController(): null {
  // Стор держит сессии на каждый демон (sessions: Record<string, SessionState>),
  // а агенты и воркспейсы лежат внутри сессии — верхнего уровня у них нет.
  const sessions = useSessionStore((state) => state.sessions);
  const { startVoice, stopVoice } = useVoice();
  const connectedRef = useRef(false);

  const { agents, workspaces } = useMemo(() => {
    const agents = [];
    const workspaces = [];
    for (const session of Object.values(sessions)) {
      agents.push(...session.agents.values());
      workspaces.push(...session.workspaces.values());
    }
    return { agents, workspaces };
  }, [sessions]);

  const sections = useMemo(() => buildAgentSections({ agents, workspaces }), [agents, workspaces]);

  // Живая ссылка, чтобы обработчик тапа не пересоздавал шаблон на каждый апдейт стора.
  const pick = useRef((serverId: string, agentId: string) => {
    void startVoice(serverId, agentId).catch(() => {
      // Мёртвое соединение не должно ронять контроллер: строка просто не сработает.
    });
  });
  pick.current = (serverId, agentId) => {
    void startVoice(serverId, agentId).catch(() => {});
  };

  useEffect(() => {
    const offConnect = onCarPlayConnect(() => {
      connectedRef.current = true;
      setRoot(
        createRootTemplate({
          sections,
          connected: agents.length > 0 || workspaces.length > 0,
          onPick: (serverId, agentId) => pick.current(serverId, agentId),
        }),
      );
    });
    const offDisconnect = onCarPlayDisconnect(() => {
      handleCarPlayDisconnect({ wasConnected: connectedRef.current, stopVoice });
      connectedRef.current = false;
    });
    return () => {
      offConnect();
      offDisconnect();
      handleCarPlayDisconnect({ wasConnected: connectedRef.current, stopVoice });
    };
  }, [agents.length, sections, stopVoice, workspaces.length]);

  // Обновляем корневой список, пока машина подключена.
  useEffect(() => {
    if (!connectedRef.current) {
      return;
    }
    setRoot(
      createRootTemplate({
        sections,
        connected: agents.length > 0 || workspaces.length > 0,
        onPick: (serverId, agentId) => pick.current(serverId, agentId),
      }),
    );
  }, [agents.length, sections, workspaces.length]);

  return null;
}
```

- [ ] **Step 6: Типы и тесты целиком**

```bash
cd packages/app && npx vitest run src/carplay && npm run typecheck
```
Expected: PASS, типы чистые.

- [ ] **Step 7: Коммит**

```bash
git add packages/app/src/carplay
git commit -m "feat(carplay): корневой список из сторов, выход из голоса при отключении"
```

---

### Task 5: Экран чата с кнопками микрофона и mute

**Files:**
- Create: `packages/app/src/carplay/chat-template.ts`
- Create: `packages/app/src/carplay/chat-template.test.ts`
- Modify: `packages/app/src/carplay/controller.tsx` (push экрана чата по тапу)

**Interfaces:**
- Consumes: `S`, `StreamItem` из `@/types/stream`.
- Produces: `messageRows(items: StreamItem[], limit?: number): ListItem[]`, `createChatTemplate(input: { title: string; rows: ListItem[]; phase: string; muted: boolean; onSpeak: (id: string) => void; onMic: () => void; onMute: () => void }): ListTemplate`.

- [ ] **Step 1: Написать падающий тест**

`packages/app/src/carplay/chat-template.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { StreamItem } from "@/types/stream";
import { createChatTemplate, messageRows } from "@/carplay/chat-template";
import { S } from "@/carplay/strings";

vi.mock("@g4rb4g3/react-native-carplay", () => ({
  ListTemplate: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  },
}));

const message = (over: Partial<Extract<StreamItem, { kind: "assistant_message" }>>): StreamItem =>
  ({ kind: "assistant_message", id: "m1", text: "Привет", timestamp: new Date(), ...over }) as StreamItem;

describe("messageRows", () => {
  it("берёт только сообщения и отбрасывает остальное", () => {
    const rows = messageRows([
      message({ id: "m1", text: "Ответ" }),
      { kind: "thought", id: "t1", text: "думаю", timestamp: new Date() } as never as StreamItem,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("m1");
  });

  it("пустые сообщения пропускает: строка без текста в CarPlay выглядит сломанной", () => {
    const rows = messageRows([message({ id: "m1", text: "   " }), message({ id: "m2", text: "Есть" })]);
    expect(rows.map((r) => r.id)).toEqual(["m2"]);
  });

  it("длинный текст режет в заголовке, но отдаёт целиком на проговаривание", () => {
    const long = "а".repeat(200);
    const rows = messageRows([message({ text: long })]);
    expect(rows[0]?.text.length).toBeLessThanOrEqual(61);
    expect(rows[0]?.text.endsWith("…")).toBe(true);
  });

  it("оставляет последние двадцать, новейшее первым", () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      message({ id: `m${index}`, text: `номер ${index}` }),
    );
    const rows = messageRows(many);
    expect(rows).toHaveLength(20);
    expect(rows[0]?.id).toBe("m24");
  });
});

describe("createChatTemplate", () => {
  it("даёт кнопки микрофона и mute и зовёт их обработчики", () => {
    const onMic = vi.fn();
    const onMute = vi.fn();
    const template = createChatTemplate({
      title: "Чат",
      rows: [],
      phase: S.idle,
      muted: false,
      onSpeak: () => {},
      onMic,
      onMute,
    });
    const config = (template as never as {
      config: {
        trailingNavigationBarButtons: { id: string }[];
        onBarButtonPressed(event: { id: string; templateId: string }): void;
      };
    }).config;
    expect(config.trailingNavigationBarButtons.map((b) => b.id)).toEqual(["mic", "mute"]);
    config.onBarButtonPressed({ id: "mic", templateId: "chat" });
    config.onBarButtonPressed({ id: "mute", templateId: "chat" });
    expect(onMic).toHaveBeenCalledOnce();
    expect(onMute).toHaveBeenCalledOnce();
  });

  it("показывает фазу голоса в заголовке", () => {
    const template = createChatTemplate({
      title: "Чат",
      rows: [],
      phase: S.listening,
      muted: true,
      onSpeak: () => {},
      onMic: () => {},
      onMute: () => {},
    });
    const config = (template as never as { config: { title: string } }).config;
    expect(config.title).toContain(S.listening);
    expect(config.title).toContain(S.muted);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd packages/app && npx vitest run src/carplay/chat-template.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

`packages/app/src/carplay/chat-template.ts`:

```ts
import { ListTemplate } from "@g4rb4g3/react-native-carplay";
import type { ListItem } from "@g4rb4g3/react-native-carplay";
import type { StreamItem } from "@/types/stream";
import { S } from "./strings";

const ROW_LIMIT = 20;
const TITLE_LIMIT = 60;

const isMessage = (
  item: StreamItem,
): item is Extract<StreamItem, { kind: "assistant_message" | "user_message" }> =>
  item.kind === "assistant_message" || item.kind === "user_message";

const shorten = (text: string): string =>
  text.length > TITLE_LIMIT ? `${text.slice(0, TITLE_LIMIT)}…` : text;

/**
 * Последние двадцать сообщений, новейшее первым. Полный текст не теряется: он лежит
 * в detailText и уходит на проговаривание, а в заголовке обрезан — CarPlay режет
 * строку по ширине экрана, и середина длинного ответа всё равно не видна.
 */
export function messageRows(items: StreamItem[], limit: number = ROW_LIMIT): ListItem[] {
  const rows: ListItem[] = [];
  for (const item of items) {
    if (!isMessage(item)) {
      continue;
    }
    const text = item.text.trim();
    if (!text) {
      continue;
    }
    rows.push({
      id: item.id,
      text: shorten(text),
      detailText: item.kind === "assistant_message" ? "агент" : "ты",
    });
  }
  return rows.reverse().slice(0, limit);
}

export function createChatTemplate(input: {
  title: string;
  rows: ListItem[];
  phase: string;
  muted: boolean;
  onSpeak: (id: string) => void;
  onMic: () => void;
  onMute: () => void;
}): ListTemplate {
  const title = input.muted ? `${input.title} · ${input.phase} · ${S.muted}` : `${input.title} · ${input.phase}`;
  return new ListTemplate({
    id: "chat",
    title,
    sections: [{ items: input.rows }],
    emptyViewTitleVariants: ["Сообщений пока нет"],
    trailingNavigationBarButtons: [
      { id: "mic", type: "text", title: S.mic },
      { id: "mute", type: "text", title: S.mute },
    ],
    onBarButtonPressed: ({ id }) => {
      if (id === "mic") {
        input.onMic();
      }
      if (id === "mute") {
        input.onMute();
      }
    },
    onItemSelect: async ({ id }) => {
      if (typeof id === "string") {
        input.onSpeak(id);
      }
    },
  });
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `cd packages/app && npx vitest run src/carplay/chat-template.test.ts`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Открыть экран чата по тапу**

В `controller.tsx`: после `startVoice` пушим экран чата. Добавить к импортам `push` из `./connection`, `createChatTemplate`, `messageRows`, `selectAgentTimelineState` из `@/stores/session-store`, `useVoice` уже есть; добавить `toggleMute` и снапшот фазы:

```tsx
  const { startVoice, stopVoice, toggleMute, snapshot } = useVoice();

  const phaseLabel = snapshot.phase === "listening" ? S.listening
    : snapshot.phase === "waiting" || snapshot.phase === "submitting" ? S.thinking
    : snapshot.phase === "playing" ? S.speaking
    : S.idle;

  pick.current = (serverId, agentId) => {
    const agent = agents.find((one) => one.serverId === serverId && one.id === agentId);
    // Селектор принимает саму сессию и только agentId; читаем императивно через
    // getState(), чтобы не подписывать контроллер на каждый апдейт таймлайна.
    const state = selectAgentTimelineState(useSessionStore.getState().sessions[serverId], agentId);
    const items = state.status === "cold" ? [] : state.items;
    push(
      createChatTemplate({
        title: agent?.title?.trim() || "Чат",
        rows: messageRows(items),
        phase: phaseLabel,
        muted: snapshot.isMuted,
        onSpeak: () => {},
        onMic: () => {
          if (snapshot.isVoiceMode) {
            void stopVoice().catch(() => {});
          } else {
            void startVoice(serverId, agentId).catch(() => {});
          }
        },
        onMute: () => toggleMute(),
      }),
    );
    void startVoice(serverId, agentId).catch(() => {});
  };
```

- [ ] **Step 6: Типы и тесты**

```bash
cd packages/app && npx vitest run src/carplay && npm run typecheck
```

- [ ] **Step 7: Коммит**

```bash
git add packages/app/src/carplay
git commit -m "feat(carplay): экран чата с последними сообщениями, микрофоном и mute"
```

---

### Task 6: Voice Control на время речи

**Files:**
- Create: `packages/app/src/carplay/voice-screen.ts`
- Create: `packages/app/src/carplay/voice-screen.test.ts`
- Modify: `packages/app/src/carplay/controller.tsx`

**Interfaces:**
- Consumes: `present`, `dismiss` из `./connection`.
- Produces: `createVoiceTemplate(): VoiceControlTemplate`, `shouldShowVoice(input: { phase: string; isSpeaking: boolean; muted: boolean }): boolean`.

- [ ] **Step 1: Написать падающий тест**

`packages/app/src/carplay/voice-screen.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { shouldShowVoice } from "@/carplay/voice-screen";

vi.mock("@g4rb4g3/react-native-carplay", () => ({
  VoiceControlTemplate: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  },
}));

describe("shouldShowVoice", () => {
  it("показывает, пока человек действительно говорит", () => {
    expect(shouldShowVoice({ phase: "listening", isSpeaking: true, muted: false })).toBe(true);
  });

  it("не показывает в тишине: иначе шаблон висит всю поездку и прячет mute", () => {
    expect(shouldShowVoice({ phase: "listening", isSpeaking: false, muted: false })).toBe(false);
  });

  it("не показывает, когда говорит агент", () => {
    expect(shouldShowVoice({ phase: "playing", isSpeaking: true, muted: false })).toBe(false);
  });

  it("не показывает при включённом mute", () => {
    expect(shouldShowVoice({ phase: "listening", isSpeaking: true, muted: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd packages/app && npx vitest run src/carplay/voice-screen.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

`packages/app/src/carplay/voice-screen.ts`:

```ts
import { VoiceControlTemplate } from "@g4rb4g3/react-native-carplay";
import { S } from "./strings";

/**
 * Модальный шаблон поднимается только на время собственной речи: если держать его
 * всю поездку, он накроет экран чата, а вместе с ним кнопку mute — единственную,
 * которая нужна, когда поворачиваешься к пассажиру.
 */
export function createVoiceTemplate(): VoiceControlTemplate {
  return new VoiceControlTemplate({
    voiceControlStates: [
      { identifier: "listening", titleVariants: [S.listening], repeats: true },
    ],
  });
}

export function shouldShowVoice(input: {
  phase: string;
  isSpeaking: boolean;
  muted: boolean;
}): boolean {
  return input.phase === "listening" && input.isSpeaking && !input.muted;
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `cd packages/app && npx vitest run src/carplay/voice-screen.test.ts`
Expected: PASS, 4 теста.

- [ ] **Step 5: Поднимать и убирать шаблон в контроллере**

В `controller.tsx` добавить импорт `useVoiceTelemetry` из `@/contexts/voice-context`, `present`/`dismiss`, `createVoiceTemplate`, `shouldShowVoice` и эффект:

```tsx
  const telemetry = useVoiceTelemetry();
  const voiceShownRef = useRef(false);

  useEffect(() => {
    const show = shouldShowVoice({
      phase: snapshot.phase,
      isSpeaking: telemetry.isSpeaking,
      muted: snapshot.isMuted,
    });
    if (show && !voiceShownRef.current) {
      voiceShownRef.current = true;
      present(createVoiceTemplate());
      return;
    }
    if (!show && voiceShownRef.current) {
      voiceShownRef.current = false;
      dismiss();
    }
  }, [snapshot.isMuted, snapshot.phase, telemetry.isSpeaking]);
```

- [ ] **Step 6: Типы и тесты**

```bash
cd packages/app && npx vitest run src/carplay && npm run typecheck
```

- [ ] **Step 7: Коммит**

```bash
git add packages/app/src/carplay
git commit -m "feat(carplay): Voice Control поднимается только на время речи"
```

---

### Task 7: Проговорить сообщение

**Files:**
- Create: `packages/app/src/carplay/speak.ts`
- Create: `packages/app/src/carplay/speak.test.ts`
- Modify: `packages/app/src/carplay/controller.tsx` (`onSpeak`)

**Interfaces:**
- Consumes: `expo-speech`.
- Produces: `speakMessage(input: { items: StreamItem[]; id: string; speak?: (text: string, options?: unknown) => void; stop?: () => void }): boolean`.

- [ ] **Step 1: Написать падающий тест**

`packages/app/src/carplay/speak.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { StreamItem } from "@/types/stream";
import { speakMessage } from "@/carplay/speak";

const message = (id: string, text: string): StreamItem =>
  ({ kind: "assistant_message", id, text, timestamp: new Date() }) as StreamItem;

describe("speakMessage", () => {
  it("проговаривает полный текст, а не обрезанный заголовок", () => {
    const speak = vi.fn();
    const long = "а".repeat(200);
    const ok = speakMessage({ items: [message("m1", long)], id: "m1", speak, stop: () => {} });
    expect(ok).toBe(true);
    expect(speak).toHaveBeenCalledWith(long, expect.objectContaining({ language: "ru-RU" }));
  });

  it("прерывает предыдущее проговаривание", () => {
    const stop = vi.fn();
    speakMessage({ items: [message("m1", "раз")], id: "m1", speak: () => {}, stop });
    expect(stop).toHaveBeenCalledOnce();
  });

  it("на неизвестный id ничего не делает", () => {
    const speak = vi.fn();
    const ok = speakMessage({ items: [message("m1", "раз")], id: "нет", speak, stop: () => {} });
    expect(ok).toBe(false);
    expect(speak).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd packages/app && npx vitest run src/carplay/speak.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

`packages/app/src/carplay/speak.ts`:

```ts
import * as Speech from "expo-speech";
import type { StreamItem } from "@/types/stream";

/**
 * Синтез на телефоне, а не голосом агента: демон озвучивает только новые ответы через
 * tool `speak`, «прочитай вот этот текст» протокол не умеет. Локальный синтез работает
 * и в машине по LTE, ценой того, что голос другой.
 */
export function speakMessage(input: {
  items: StreamItem[];
  id: string;
  speak?: (text: string, options?: unknown) => void;
  stop?: () => void;
}): boolean {
  const speak = input.speak ?? Speech.speak;
  const stop = input.stop ?? Speech.stop;
  const found = input.items.find(
    (item) =>
      item.id === input.id &&
      (item.kind === "assistant_message" || item.kind === "user_message"),
  );
  if (!found || !("text" in found) || !found.text.trim()) {
    return false;
  }
  stop();
  speak(found.text, { language: "ru-RU" });
  return true;
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `cd packages/app && npx vitest run src/carplay/speak.test.ts`
Expected: PASS, 3 теста.

- [ ] **Step 5: Подключить к строке чата**

В `controller.tsx` заменить `onSpeak: () => {}` на:

```tsx
        onSpeak: (id) => {
          speakMessage({ items, id });
        },
```

- [ ] **Step 6: Полный прогон**

```bash
cd packages/app && npx vitest run src/carplay && npm run typecheck && npm run lint
```

- [ ] **Step 7: Коммит**

```bash
git add packages/app/src/carplay
git commit -m "feat(carplay): проговаривать выбранное сообщение"
```

---

### Task 8: Живой прогон в симуляторе

Код не меняется — это приёмка того, ради чего всё делалось.

**Files:** никаких.

**Interfaces:**
- Consumes: всё предыдущее.
- Produces: заключение «работать так удобно / неудобно» и список замечаний.

- [ ] **Step 1: Собрать под симулятор**

```bash
cd ~/Documents/Work/Projects/paseo-x && export PATH=/opt/homebrew/opt/node@22/bin:$PATH
df -h /System/Volumes/Data | tail -1   # нужно 15 ГБ
PASEO_VOICE_CHECKOUT=$(ls -d ~/.paseo/plugins/voice/*/checkout | head -1) \
  DEVELOPMENT_TEAM=8556UCQ95M ./scripts/build-x.sh simulator
```

- [ ] **Step 2: Поставить, запустить, открыть CarPlay-дисплей**

```bash
xcrun simctl install booted "$(find .derived/Build/Products/Release-iphonesimulator -maxdepth 1 -name '*.app' | head -1)"
xcrun simctl launch booted work.jobbyjobs.paseox
```

Simulator → I/O → External Displays → CarPlay.

- [ ] **Step 3: Подключить к живому демону**

В телефонном окне: добавить хост руками (`add-host-modal`) — адрес этой машины и порт демона — либо вставить pairing-ссылку. Камеры в симуляторе нет, QR не нужен.

- [ ] **Step 4: Пройти сценарий и записать замечания**

1. На CarPlay видны секции воркспейсов и строки чатов, подписи состояний осмысленны.
2. Тап по чату: открылся экран чата, микрофон включился сам, слышно, что агент отвечает.
3. Во время собственной речи поднимается Voice Control и уходит после фразы.
4. Mute: агент продолжает говорить, микрофон не слышит.
5. Тап по строке сообщения проговаривает его целиком.
6. Выключить демон посреди работы: список объясняет отсутствие связи, приложение не падает.
7. Отключить CarPlay-дисплей: голос прекращается, телефонное окно живо.

- [ ] **Step 5: Записать результат**

Добавить в `docs/superpowers/plans/2026-10-13-paseo-x-carplay.md` раздел «Прогон 1» с тем, что работает, что нет, и что менять. Коммит:

```bash
git add docs/superpowers/plans
git commit -m "docs: результаты первого прогона CarPlay в симуляторе"
```

---

## Известные пробелы

Оставлены сознательно, чтобы исполнитель не считал их забытыми:

- **Отказ в правах на микрофон никак не подписан.** Спека просила подпись в заголовке, но
  `useVoice()` состояние разрешений не отдаёт, а `startVoice` только отвергает обещание —
  на CarPlay диалог не покажешь. Сейчас строка просто не сработает. Чинится отдельно, когда
  станет понятно, как разрешения доходят до контекста.
- **Идентификаторы воркспейсов не несут `serverId`.** При двух подключённых демонах с
  совпадающими id воркспейсов чаты могут попасть в чужую секцию. Для одного демона — а это
  наш случай — не проявляется.
- **Падение демона посреди голосового режима** не возвращает на экран чата отдельным
  действием: фаза уедет в `disabled`, и заголовок сам станет «Готов». Проверяется руками в
  задаче 8, шаг 4, пункт 6.
