import { ListTemplate } from "@g4rb4g3/react-native-carplay";
import type { BarButton, ListItem, ListSection } from "@g4rb4g3/react-native-carplay";
import type { ImageSourcePropType } from "react-native";
import type { StreamItem } from "@/types/stream";
import { AUTHORS, NAV } from "./images";
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
 * поэтому свежее должно быть там, куда смотрят. Плашка слева — кто говорит; если агент
 * ждёт ответа, его последняя реплика помечена как вопрос. Строка, которую сейчас
 * читают вслух, помечена системным индикатором воспроизведения.
 */
export function messageRows(
  items: StreamItem[],
  now: Date = new Date(),
  limit: number = ROW_LIMIT,
  readingId: string | null = null,
  asking = false,
): ListItem[] {
  const rows: ListItem[] = [];
  let questionPending = asking;
  for (const item of items.toReversed()) {
    if (!isMessage(item)) {
      continue;
    }
    const text = headline(item.text);
    if (!text) {
      continue;
    }
    const mine = item.kind === "user_message";
    const question = !mine && questionPending;
    if (!mine) {
      questionPending = false;
    }
    let who: string = S.agent;
    let image: ImageSourcePropType | undefined = AUTHORS.agent;
    if (mine) {
      who = S.you;
      image = AUTHORS.human;
    } else if (question) {
      who = S.agentAsks;
      image = AUTHORS.agentAsk;
    }
    const row: ListItem = {
      id: item.id,
      text,
      detailText: `${who} · ${shortAgo(item.timestamp, now)}`,
    };
    if (image) {
      row.image = image;
    }
    if (item.id === readingId) {
      row.isPlaying = true;
    }
    rows.push(row);
    if (rows.length >= limit) {
      break;
    }
  }
  return rows;
}

/** Шапка секции несёт состояние голоса — единственное, что меняется во времени. */
export const chatSections = (rows: ListItem[], header: string): ListSection[] => [
  { header, items: rows },
];

const glyph = (id: string, image: ImageSourcePropType | undefined, title: string): BarButton =>
  image ? { id, type: "image", image } : { id, type: "text", title };

/**
 * Кнопки навбара по состоянию: волна — начать разговор, квадрат — стоп; микрофон
 * показывает текущее состояние и есть только пока голос включён. Без картинок —
 * словами.
 */
export function chatButtons(input: { voiceOn: boolean; muted: boolean }): BarButton[] {
  if (!input.voiceOn) {
    return [glyph("voice", NAV.wave, S.voiceButton)];
  }
  return [
    glyph("voice", NAV.stop, S.voiceOff),
    input.muted ? glyph("mute", NAV.micOff, S.unmute) : glyph("mute", NAV.mic, S.mute),
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
    emptyViewSubtitleVariants: [S.noMessagesHint],
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
