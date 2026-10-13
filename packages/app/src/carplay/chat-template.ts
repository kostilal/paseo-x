import { ListTemplate } from "@g4rb4g3/react-native-carplay";
import type { ListItem, ListSection } from "@g4rb4g3/react-native-carplay";
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
 * Последние двадцать сообщений, новейшее первым. Пустые пропускаются: строка без текста
 * в CarPlay выглядит сломанной. Заголовок обрезан — CarPlay всё равно режет его по ширине
 * экрана, — а на проговаривание уходит полный текст, который берётся из таймлайна по id.
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
  return rows.toReversed().slice(0, limit);
}

/**
 * Шапка секции несёт всё, что меняется во времени: заголовок шаблона и кнопки после
 * показа править нечем — библиотека умеет только `updateSections`, — а секции можно
 * пересобрать на месте, не трогая стек шаблонов.
 */
export function chatSections(rows: ListItem[], phase: string, muted: boolean): ListSection[] {
  return [{ header: muted ? `${phase} · ${S.muted}` : phase, items: rows }];
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
  return new ListTemplate({
    id: "chat",
    title: input.title,
    sections: chatSections(input.rows, input.phase, input.muted),
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
