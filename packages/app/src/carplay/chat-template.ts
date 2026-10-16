import { ListTemplate } from "@g4rb4g3/react-native-carplay";
import type { BarButton, ListItem, ListSection } from "@g4rb4g3/react-native-carplay";
import type { StreamItem } from "@/types/stream";
import { BUBBLES } from "./images";
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
    // Картинка в markdown — это строка «![Image](file:///var/…)» на весь экран машины.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " картинка ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "ссылка в чате")
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
 * поэтому свежее должно быть там, куда смотрят. Плашка слева — кто говорит; строка,
 * которую сейчас читают вслух, помечена системным индикатором воспроизведения.
 */
export function messageRows(
  items: StreamItem[],
  now: Date = new Date(),
  limit: number = ROW_LIMIT,
  readingId: string | null = null,
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
    const mine = item.kind === "user_message";
    const row: ListItem = {
      id: item.id,
      text,
      detailText: `${mine ? S.you : S.agent} · ${shortAgo(item.timestamp, now)}`,
    };
    const image = mine ? BUBBLES.you : BUBBLES.agent;
    if (image) {
      row.image = image;
    }
    if (item.id === readingId) {
      row.isPlaying = true;
    }
    rows.push(row);
  }
  return rows.toReversed().slice(0, limit);
}

/** Шапка секции несёт состояние голоса — единственное, что меняется во времени. */
export const chatSections = (rows: ListItem[], header: string): ListSection[] => [
  { header, items: rows },
];

/** Подписи кнопок по состоянию: «Голос»/«Стоп» и «Mute»/«Звук». */
export function chatButtons(input: { voiceOn: boolean; muted: boolean }): BarButton[] {
  return [
    { id: "voice", type: "text", title: input.voiceOn ? S.voiceOff : S.voiceButton },
    { id: "mute", type: "text", title: input.muted ? S.unmute : S.mute },
  ];
}

export function createChatTemplate(input: {
  id: string;
  title: string;
  rows: ListItem[];
  header: string;
  voiceOn: boolean;
  muted: boolean;
  onSpeak: (id: string) => void;
  onMic: () => void;
  onMute: () => void;
  onBack: () => void;
}): ListTemplate {
  return new ListTemplate({
    id: input.id,
    title: input.title,
    sections: chatSections(input.rows, input.header),
    emptyViewTitleVariants: [S.noMessages],
    trailingNavigationBarButtons: chatButtons(input),
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
    onBackButtonPressed: input.onBack,
    onPoppedToRoot: input.onBack,
  });
}
