import { useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { CarPlay } from "@g4rb4g3/react-native-carplay";
import { useVoice, useVoiceTelemetry } from "@/contexts/voice-context";
import { useHostRuntimeConnectionStatuses } from "@/runtime/host-runtime";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { selectAgentTimelineState, useSessionStore } from "@/stores/session-store";
import {
  dismiss,
  onCarPlayConnect,
  onCarPlayDisconnect,
  present,
  push,
  setRoot,
} from "./connection";
import { createCarPlayPresenter, type CarPlayStage, type CarPlayWorld } from "./presenter";

/** Чем подписывается видимость чатов — у каждого источника видимости своё имя. */
const VISIBILITY_SOURCE = "carplay";

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

  // Живые ссылки: ведущий читает состояние в момент вызова, а не то, что было
  // замкнуто при создании обработчика.
  const latest = useRef({ sessions, statuses, voice, telemetry });
  latest.current = { sessions, statuses, voice, telemetry };

  const presenter = useMemo(() => {
    const stage: CarPlayStage = { setRoot, push, present, dismiss };
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
    };
    return createCarPlayPresenter(stage, world);
  }, []);

  // Подписка одна на всё время жизни: пересоздавать её на каждый апдейт стора значит
  // выключать голос в его cleanup — то есть терять голосовой режим на первом же
  // токене ответа агента.
  useEffect(() => {
    const offConnect = onCarPlayConnect(() => presenter.connect());
    const offDisconnect = onCarPlayDisconnect(() => presenter.disconnect());
    // Машина могла подключиться до того, как приложение поднялось: библиотека
    // переигрывает `didConnect` только один раз, из своего конструктора.
    if (CarPlay.connected) {
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
  }, [presenter, voice.phase, voice.isMuted, telemetry.isSpeaking]);

  return null;
}
