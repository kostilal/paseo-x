import { ListTemplate } from "@g4rb4g3/react-native-carplay";
import type { ListItem, ListSection } from "@g4rb4g3/react-native-carplay";
import type { StreamItem } from "@/types/stream";
import { S } from "./strings";
import { shortAgo } from "./time";

const ROW_LIMIT = 20;
const TITLE_LIMIT = 60;

const GREETING = /^(привет|здравствуй(те)?|hi|hello|hey)[\s,!—-]*/i;

/**
 * Выжимка сообщения для строки.
 *
 * В машине читают доли секунды, а система режет строку по ширине экрана, поэтому
 * смысл должен стоять в начале. Ссылка и код целиком бесполезны — от них остаётся
 * пометка, что они там есть.
 */
export function headline(text: string): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " фрагмент кода ")
    .replace(/`[^`]*`/g, " фрагмент кода ")
    .replace(/https?:\/\/\S+/g, "ссылка в чате")
    .replace(/^[\s>#*_-]+/gm, "")
    .replace(/[*_#>]+/g, "")
    .replace(GREETING, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > TITLE_LIMIT ? `${cleaned.slice(0, TITLE_LIMIT)}…` : cleaned;
}

const isMessage = (
  item: StreamItem,
): item is Extract<StreamItem, { kind: "assistant_message" | "user_message" }> =>
  item.kind === "assistant_message" || item.kind === "user_message";

/**
 * Последние двадцать сообщений, новые сверху: пролистать список программно нельзя,
 * поэтому свежее должно быть там, куда смотрят.
 */
export function messageRows(
  items: StreamItem[],
  now: Date = new Date(),
  limit: number = ROW_LIMIT,
): ListItem[] {
  const rows: ListItem[] = [];
  for (const item of items) {
    if (!isMessage(item)) {
      continue;
    }
    const text = headline(item.text);
    if (!text) {
      continue;
    }
    const who = item.kind === "assistant_message" ? S.agent : S.you;
    rows.push({ id: item.id, text, detailText: `${who} · ${shortAgo(item.timestamp, now)}` });
  }
  return rows.toReversed().slice(0, limit);
}

/**
 * Шапка секции несёт всё, что меняется во времени: заголовок шаблона и подписи кнопок
 * после показа править нечем — библиотека умеет только `updateSections`.
 */
export function chatSections(rows: ListItem[], phase: string, muted: boolean): ListSection[] {
  return [{ header: muted ? S.micOff : phase, items: rows }];
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
    emptyViewTitleVariants: [S.noMessages],
    trailingNavigationBarButtons: [
      { id: "voice", type: "text", title: S.voiceButton },
      { id: "mute", type: "text", title: S.mute },
    ],
    onBarButtonPressed: ({ id }) => {
      if (id === "voice") {
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
