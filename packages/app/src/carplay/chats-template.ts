import { ListTemplate } from "@g4rb4g3/react-native-carplay";
import type { ListItem, ListSection } from "@g4rb4g3/react-native-carplay";
import { S } from "./strings";
import { parseAgentRowId } from "./templates";

export const chatsSections = (rows: ListItem[]): ListSection[] => [{ items: rows }];

/**
 * Второй экран — чаты одного пространства. Свой id у каждого экземпляра: нативное
 * хранилище держит шаблоны по id, а JS-слушатели фильтруют события по нему же, и два
 * живых шаблона с одним id означают два срабатывания на один тап.
 */
export function createChatsTemplate(input: {
  id: string;
  title: string;
  rows: ListItem[];
  onPick: (serverId: string, agentId: string) => void;
  onBack: () => void;
}): ListTemplate {
  return new ListTemplate({
    id: input.id,
    title: input.title,
    sections: chatsSections(input.rows),
    emptyViewTitleVariants: [S.noAgents],
    emptyViewSubtitleVariants: [S.startOnDesktop],
    onItemSelect: async ({ id }) => {
      const parsed = typeof id === "string" ? parseAgentRowId(id) : null;
      if (parsed) {
        input.onPick(parsed.serverId, parsed.agentId);
      }
    },
    onBackButtonPressed: input.onBack,
    onPoppedToRoot: input.onBack,
  });
}
