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
