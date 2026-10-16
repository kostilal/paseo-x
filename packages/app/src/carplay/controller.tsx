import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { CarPlay } from "@g4rb4g3/react-native-carplay";
import { useVoice, useVoiceTelemetry } from "@/contexts/voice-context";
import {
  getHostRuntimeStore,
  useHostRuntimeConnectionStatuses,
  useHosts,
} from "@/runtime/host-runtime";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { selectAgentTimelineState, useSessionStore } from "@/stores/session-store";
import {
  dismiss,
  onCarPlayConnect,
  onCarPlayDisconnect,
  present,
  push,
  setRoot,
  updateButtons,
} from "./connection";
import { createCarPlayPresenter, type CarPlayStage, type CarPlayWorld } from "./presenter";
import { createReader } from "./speak";

/** Чем подписывается видимость чатов — у каждого источника видимости своё имя. */
const VISIBILITY_SOURCE = "carplay";

/**
 * Разрешение на микрофон, как его видит система. Модуль тот же, что у аудиодвижка, и
 * берётся так же лениво; если его нет, считаем, что разрешение есть — тогда ответит сам
 * запуск голоса.
 */
async function microphoneGranted(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require("@getpaseo/expo-two-way-audio") as {
      getMicrophonePermissionsAsync(): Promise<{ granted: boolean }>;
    };
    return (await audio.getMicrophonePermissionsAsync()).granted;
  } catch {
    return true;
  }
}

/**
 * Ничего не рисует на телефоне: живёт в дереве провайдеров ради useVoice() и сторов,
 * а всю работу отдаёт ведущему (`presenter`), который и проверяется тестами.
 *
 * Только iOS: на вебе и в десктопном рендерере нативного модуля нет, и построение
 * любого шаблона там бросает исключение. Экран машины существует лишь на телефоне.
 */
export function CarPlayController() {
  // Хуки ниже не должны выполняться вне iOS, поэтому ветка — отдельным компонентом.
  return Platform.OS === "ios" ? <CarPlayBridge /> : null;
}

function CarPlayBridge(): null {
  const sessions = useSessionStore((state) => state.sessions);
  const serverIds = useMemo(() => Object.keys(sessions), [sessions]);
  // Живой статус соединения, а не наличие данных: после падения демона реплика
  // сессии остаётся, и список иначе показывал бы живые с виду чаты, тапы по которым
  // молча ничего не делают.
  const statuses = useHostRuntimeConnectionStatuses(serverIds);
  const voice = useVoice();
  const telemetry = useVoiceTelemetry();
  const [carConnected, setCarConnected] = useState(() => CarPlay.connected);

  // Каталог агентов приложение загружает только по требованию: пока какой-нибудь экран
  // не заявит спрос, стор пуст. На телефоне спрос держит боковая панель; в машине телефон
  // лежит в кармане, и без своего спроса экран CarPlay показывал «Чатов пока нет» при
  // десятке живых чатов.
  const hosts = useHosts();
  const hostIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  useEffect(() => {
    if (!carConnected) {
      return;
    }
    const runtime = getHostRuntimeStore();
    const releases = hostIds.map((serverId) => runtime.acquireDirectoryDemand(serverId));
    return () => releases.forEach((release) => release());
  }, [carConnected, hostIds]);

  // Живые ссылки: ведущий читает состояние в момент вызова, а не то, что было
  // замкнуто при создании обработчика.
  const latest = useRef({ sessions, statuses, voice, telemetry });
  latest.current = { sessions, statuses, voice, telemetry };

  const presenter = useMemo(() => {
    const stage: CarPlayStage = { setRoot, push, present, dismiss, updateButtons };
    const world: CarPlayWorld = {
      data: () => {
        const agents: Agent[] = [];
        const workspaces: WorkspaceDescriptor[] = [];
        for (const session of Object.values(latest.current.sessions)) {
          agents.push(...session.agents.values());
          workspaces.push(...session.workspaces.values());
        }
        const connected = [...latest.current.statuses.values()].some(
          (status) => status === "online",
        );
        return { agents, workspaces, connected };
      },
      voice: () => ({
        phase: latest.current.voice.phase,
        isVoiceMode: latest.current.voice.isVoiceMode,
        isMuted: latest.current.voice.isMuted,
        isSpeaking: latest.current.telemetry.isSpeaking,
      }),
      timeline: (serverId, agentId) => {
        const state = selectAgentTimelineState(
          useSessionStore.getState().sessions[serverId],
          agentId,
        );
        return state.status === "cold" ? [] : state.items;
      },
      watchTimeline: (serverId, agentId) => {
        for (const [id, session] of Object.entries(useSessionStore.getState().sessions)) {
          session.viewedTimelineSync?.replaceVisibleAgentIds(
            VISIBILITY_SOURCE,
            serverId === id && agentId ? [agentId] : [],
          );
        }
      },
      startVoice: (serverId, agentId) => latest.current.voice.startVoice(serverId, agentId),
      stopVoice: () => latest.current.voice.stopVoice(),
      toggleMute: () => latest.current.voice.toggleMute(),
      microphoneGranted,
      reader: createReader(),
    };
    return createCarPlayPresenter(stage, world);
  }, []);

  // Подписка одна на всё время жизни: пересоздавать её на каждый апдейт стора значит
  // выключать голос в его cleanup — то есть терять голосовой режим на первом же
  // токене ответа агента.
  useEffect(() => {
    const offConnect = onCarPlayConnect(() => {
      setCarConnected(true);
      presenter.connect();
    });
    const offDisconnect = onCarPlayDisconnect(() => {
      setCarConnected(false);
      presenter.disconnect();
    });
    // Машина могла подключиться до того, как приложение поднялось: библиотека
    // переигрывает `didConnect` только один раз, из своего конструктора.
    if (CarPlay.connected) {
      setCarConnected(true);
      presenter.connect();
    }
    return () => {
      offConnect();
      offDisconnect();
      presenter.disconnect();
    };
  }, [presenter]);

  useEffect(() => {
    presenter.refresh();
  }, [presenter, sessions, statuses]);

  useEffect(() => {
    presenter.sync();
  }, [presenter, voice.phase, voice.isVoiceMode, voice.isMuted, telemetry.isSpeaking]);

  return null;
}
