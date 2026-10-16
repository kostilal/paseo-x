import { describe, expect, it, vi } from "vitest";
import type { StreamItem } from "@/types/stream";
import {
  chatButtons,
  chatSections,
  createChatTemplate,
  headline,
  messageRows,
} from "@/carplay/chat-template";
import { S } from "@/carplay/strings";

vi.mock("@g4rb4g3/react-native-carplay", () => ({
  ListTemplate: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  },
}));

vi.mock("@/carplay/images", () => ({
  AUTHORS: { agent: "a:agent", agentAsk: "a:ask", human: "a:human" },
  NAV: { wave: "n:wave", stop: "n:stop", mic: "n:mic", micOff: "n:micoff" },
}));

interface ChatConfig {
  id: string;
  title: string;
  sections: { header?: string; items: { id?: string }[] }[];
  emptyViewSubtitleVariants: string[];
  trailingNavigationBarButtons: { id: string; type: string; image?: string; title?: string }[];
  onBarButtonPressed(event: { id: string; templateId: string }): void;
  onItemSelect(item: { id: string; index: number; templateId: string }): Promise<void>;
  onBackButtonPressed(): void;
  onPoppedToRoot(): void;
}
const configOf = (t: unknown): ChatConfig => (t as { config: ChatConfig }).config;

const NOW = new Date(Date.UTC(2026, 9, 15, 12, 0, 0));
const msg = (id: string, text: string, kind = "assistant_message", agoMs = 180_000): StreamItem =>
  ({ kind, id, text, timestamp: new Date(NOW.getTime() - agoMs) }) as StreamItem;

const base = {
  id: "chat-1",
  title: "почему не собирается проект",
  rows: [],
  header: S.idle,
  voiceOn: false,
  muted: false,
  onSpeak: () => {},
  onMic: () => {},
  onMute: () => {},
  onBack: () => {},
};

describe("headline", () => {
  it("убирает приветствие", () => {
    expect(headline("Привет! Собираю билд")).toBe("Собираю билд");
  });

  it("ссылку заменяет словами, а не тянет её целиком", () => {
    expect(headline("Смотри https://example.com/very/long/path тут")).toBe(
      "Смотри ссылка в чате тут",
    );
  });

  it("картинку и ссылку markdown не показывает как разметку", () => {
    expect(headline("![Image](file:///var/folders/x/shot.png) Смотрю снимок")).toBe(
      "картинка Смотрю снимок",
    );
    expect(headline("Открой [отчёт](https://example.com/r) сейчас")).toBe("Открой отчёт сейчас");
    expect(headline("Файл file:///tmp/a.txt готов")).toBe("Файл ссылка в чате готов");
  });

  it("блок кода превращает в пометку", () => {
    expect(headline("Вот:\n```\nnpm test\n```")).toBe("Вот: фрагмент кода");
  });

  it("режет длинное и ставит многоточие", () => {
    const long = "а".repeat(100);
    expect(headline(long)).toHaveLength(61);
    expect(headline(long).endsWith("…")).toBe(true);
  });
});

describe("messageRows", () => {
  it("автор и время в подзаголовке, плашка автора слева", () => {
    const rows = messageRows([msg("m1", "Готово")], NOW);
    expect(rows[0]).toMatchObject({
      text: "Готово",
      detailText: `${S.agent} · 3 мин`,
      image: "a:agent",
    });
  });

  it("свои сообщения подписаны и выглядят иначе", () => {
    const rows = messageRows([msg("m1", "Собери", "user_message")], NOW);
    expect(rows[0]).toMatchObject({ detailText: `${S.you} · 3 мин`, image: "a:human" });
  });

  it("когда агент ждёт ответа, его последняя реплика — вопрос; остальные — нет", () => {
    const rows = messageRows(
      [
        msg("m1", "Сделал первое", "assistant_message", 600_000),
        msg("m2", "Ок", "user_message", 300_000),
        msg("m3", "Куда деплоить?"),
      ],
      NOW,
      20,
      null,
      true,
    );
    expect(rows.map((r) => r.image)).toEqual(["a:ask", "a:human", "a:agent"]);
    expect(rows[0]?.detailText).toBe(`${S.agentAsks} · 3 мин`);
  });

  it("новые сверху и не больше двадцати", () => {
    const items = Array.from({ length: 25 }, (_, i) => msg(`m${i}`, `Сообщение ${i}`));
    const rows = messageRows(items, NOW);
    expect(rows).toHaveLength(20);
    expect(rows[0]?.id).toBe("m24");
  });

  it("пустые пропускает", () => {
    const rows = messageRows([msg("m1", "   "), msg("m2", "Есть")], NOW);
    expect(rows.map((r) => r.id)).toEqual(["m2"]);
  });

  it("читаемое сейчас сообщение помечено индикатором, остальные — нет", () => {
    const rows = messageRows([msg("m1", "Раз"), msg("m2", "Два")], NOW, 20, "m1");
    expect(rows.find((r) => r.id === "m1")?.isPlaying).toBe(true);
    expect(rows.find((r) => r.id === "m2")?.isPlaying).toBeUndefined();
  });
});

describe("chatButtons", () => {
  it("голос выключен — одна кнопка «начать»; включён — стоп и микрофон; заглушён — перечёркнутый", () => {
    expect(chatButtons({ voiceOn: false, muted: false })).toEqual([
      { id: "voice", type: "image", image: "n:wave" },
    ]);
    expect(chatButtons({ voiceOn: true, muted: false })).toEqual([
      { id: "voice", type: "image", image: "n:stop" },
      { id: "mute", type: "image", image: "n:mic" },
    ]);
    expect(chatButtons({ voiceOn: true, muted: true })[1]).toEqual({
      id: "mute",
      type: "image",
      image: "n:micoff",
    });
  });
});

describe("createChatTemplate", () => {
  it("кнопки с устойчивыми id: голос и mute", () => {
    const onMic = vi.fn();
    const onMute = vi.fn();
    const config = configOf(createChatTemplate({ ...base, voiceOn: true, onMic, onMute }));
    expect(config.trailingNavigationBarButtons.map((b) => b.id)).toEqual(["voice", "mute"]);
    config.onBarButtonPressed({ id: "voice", templateId: "chat-1" });
    config.onBarButtonPressed({ id: "mute", templateId: "chat-1" });
    expect(onMic).toHaveBeenCalledOnce();
    expect(onMute).toHaveBeenCalledOnce();
  });

  it("состояние голоса живёт в шапке секции", () => {
    expect(chatSections([], S.micOff)[0]?.header).toBe(S.micOff);
    expect(configOf(createChatTemplate({ ...base, header: S.listening })).sections[0]?.header).toBe(
      S.listening,
    );
  });

  it("носит свой id, тему в заголовке и подсказку в пустом состоянии", () => {
    const config = configOf(createChatTemplate({ ...base }));
    expect(config.id).toBe("chat-1");
    expect(config.title).toBe("почему не собирается проект");
    expect(config.emptyViewSubtitleVariants).toEqual([S.noMessagesHint]);
  });

  it("тап по строке отдаёт id сообщения", async () => {
    const onSpeak = vi.fn();
    const config = configOf(createChatTemplate({ ...base, onSpeak }));
    await config.onItemSelect({ id: "m1", index: 0, templateId: "chat-1" });
    expect(onSpeak).toHaveBeenCalledWith("m1");
  });

  it("назад и возврат к корню сообщаются одним колбэком", () => {
    const onBack = vi.fn();
    const config = configOf(createChatTemplate({ ...base, onBack }));
    config.onBackButtonPressed();
    config.onPoppedToRoot();
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
