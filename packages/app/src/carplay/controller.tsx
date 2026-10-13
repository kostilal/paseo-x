import { useEffect, useMemo, useRef } from "react";
import { useVoice, useVoiceTelemetry } from "@/contexts/voice-context";
import type { ListItem, ListTemplate } from "@g4rb4g3/react-native-carplay";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { selectAgentTimelineState, useSessionStore } from "@/stores/session-store";
import { chatSections, createChatTemplate, messageRows } from "./chat-template";
import {
  dismiss,
  onCarPlayConnect,
  onCarPlayDisconnect,
  present,
  push,
  setRoot,
} from "./connection";
import { speakMessage } from "./speak";
import { createVoiceTemplate, shouldShowVoice } from "./voice-screen";
import { S } from "./strings";
import { createRootTemplate, handleCarPlayDisconnect } from "./root-template";
import { buildAgentSections } from "./templates";

/**
 * Ничего не рисует на телефоне: живёт в дереве провайдеров ради useVoice() и сторов.
 * При отключении от машины обязан снять подписки и выйти из голоса — иначе
 * удержанный JS-контекст продолжает слушать микрофон после выхода из автомобиля.
 */
/** Фазы голосового рантайма в подписи для экрана машины. */
const PHASE_LABELS: Record<string, string> = {
  listening: S.listening,
  submitting: S.thinking,
  waiting: S.thinking,
  playing: S.speaking,
};

export function CarPlayController(): null {
  // Стор держит сессии на каждый демон (sessions: Record<string, SessionState>),
  // а агенты и воркспейсы лежат внутри сессии — верхнего уровня у них нет.
  const sessions = useSessionStore((state) => state.sessions);
  const { startVoice, stopVoice, toggleMute, phase, isVoiceMode, isMuted } = useVoice();
  const telemetry = useVoiceTelemetry();
  const connectedRef = useRef(false);
  const voiceShownRef = useRef(false);
  // Показанный экран чата: его секции пересобираются на месте, пока он открыт.
  const chatRef = useRef<{ template: ListTemplate; rows: ListItem[] } | null>(null);

  const phaseLabel = PHASE_LABELS[phase] ?? S.idle;

  const { agents, workspaces } = useMemo(() => {
    const allAgents: Agent[] = [];
    const allWorkspaces: WorkspaceDescriptor[] = [];
    for (const session of Object.values(sessions)) {
      allAgents.push(...session.agents.values());
      allWorkspaces.push(...session.workspaces.values());
    }
    return { agents: allAgents, workspaces: allWorkspaces };
  }, [sessions]);

  const sections = useMemo(() => buildAgentSections({ agents, workspaces }), [agents, workspaces]);

  // Живая ссылка, чтобы обработчик тапа не пересоздавал шаблон на каждый апдейт стора.
  const pick = useRef((_serverId: string, _agentId: string) => {});
  pick.current = (serverId, agentId) => {
    const agent = agents.find((one) => one.serverId === serverId && one.id === agentId);
    // Селектор принимает саму сессию и только agentId; читаем императивно через
    // getState(), чтобы не подписывать контроллер на каждый апдейт таймлайна.
    const timeline = selectAgentTimelineState(
      useSessionStore.getState().sessions[serverId],
      agentId,
    );
    const items = timeline.status === "cold" ? [] : timeline.items;
    const rows = messageRows(items);
    const template = createChatTemplate({
      title: agent?.title?.trim() || "Чат",
      rows,
      phase: phaseLabel,
      muted: isMuted,
      onSpeak: (id) => {
        speakMessage({ items, id });
      },
      onMic: () => {
        if (isVoiceMode) {
          void stopVoice().catch(() => {});
        } else {
          void startVoice(serverId, agentId).catch(() => {});
        }
      },
      onMute: () => toggleMute(),
    });
    chatRef.current = { template, rows };
    push(template);
    // Тап по чату сразу включает микрофон: лишний тап за рулём не нужен.
    // Мёртвое соединение не должно ронять контроллер — строка просто не сработает.
    void startVoice(serverId, agentId).catch(() => {});
  };

  // Шаблон голоса — только на время собственной речи, чтобы он не накрывал кнопку mute.
  useEffect(() => {
    const show = shouldShowVoice({ phase, isSpeaking: telemetry.isSpeaking, muted: isMuted });
    if (show && !voiceShownRef.current) {
      voiceShownRef.current = true;
      present(createVoiceTemplate());
      return;
    }
    if (!show && voiceShownRef.current) {
      voiceShownRef.current = false;
      dismiss();
    }
  }, [isMuted, phase, telemetry.isSpeaking]);

  // Фаза и mute живут в шапке секции: заголовок шаблона после показа не меняется.
  useEffect(() => {
    const chat = chatRef.current;
    if (chat) {
      chat.template.updateSections(chatSections(chat.rows, phaseLabel, isMuted));
    }
  }, [isMuted, phaseLabel]);

  const paint = useMemo(
    () => () =>
      setRoot(
        createRootTemplate({
          sections,
          connected: agents.length > 0 || workspaces.length > 0,
          onPick: (serverId, agentId) => pick.current(serverId, agentId),
        }),
      ),
    [agents.length, sections, workspaces.length],
  );

  useEffect(() => {
    const offConnect = onCarPlayConnect(() => {
      connectedRef.current = true;
      paint();
    });
    const offDisconnect = onCarPlayDisconnect(() => {
      handleCarPlayDisconnect({ wasConnected: connectedRef.current, stopVoice });
      connectedRef.current = false;
      chatRef.current = null;
    });
    return () => {
      offConnect();
      offDisconnect();
      handleCarPlayDisconnect({ wasConnected: connectedRef.current, stopVoice });
    };
  }, [paint, stopVoice]);

  // Обновляем корневой список, пока машина подключена.
  useEffect(() => {
    if (connectedRef.current) {
      paint();
    }
  }, [paint]);

  return null;
}
