import { useEffect, useMemo, useRef } from "react";
import { useVoice } from "@/contexts/voice-context";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
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
  const pick = useRef((serverId: string, agentId: string) => {
    void startVoice(serverId, agentId).catch(() => {});
  });
  pick.current = (serverId, agentId) => {
    // Мёртвое соединение не должно ронять контроллер: строка просто не сработает.
    void startVoice(serverId, agentId).catch(() => {});
  };

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
