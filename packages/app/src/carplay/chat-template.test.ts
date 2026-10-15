import { describe, expect, it, vi } from "vitest";
import type { StreamItem } from "@/types/stream";
import { chatSections, createChatTemplate, headline, messageRows } from "@/carplay/chat-template";
import { S } from "@/carplay/strings";

vi.mock("@g4rb4g3/react-native-carplay", () => ({
  ListTemplate: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  },
}));

interface ChatConfig {
  title: string;
  sections: { header?: string; items: { id?: string }[] }[];
  trailingNavigationBarButtons: { id: string; title: string }[];
  onBarButtonPressed(event: { id: string; templateId: string }): void;
  onItemSelect(item: { id: string; index: number; templateId: string }): Promise<void>;
}
const configOf = (t: unknown): ChatConfig => (t as { config: ChatConfig }).config;

const NOW = new Date(Date.UTC(2026, 9, 15, 12, 0, 0));
const msg = (id: string, text: string, kind = "assistant_message", agoMs = 180_000): StreamItem =>
  ({ kind, id, text, timestamp: new Date(NOW.getTime() - agoMs) }) as StreamItem;

const base = {
  title: "paseo-x · сборка",
  rows: [],
  phase: S.idle,
  muted: false,
  onSpeak: () => {},
  onMic: () => {},
  onMute: () => {},
};

describe("headline", () => {
  it("убирает приветствие", () => {
    expect(headline("Привет! обновил плагин голоса")).toBe("обновил плагин голоса");
  });

  it("ссылку заменяет словами, а не тянет её целиком", () => {
    expect(headline("смотри https://github.com/kostilal/paseo-x/pull/1 там диф")).toBe(
      "смотри ссылка в чате там диф",
    );
  });

  it("блок кода превращает в пометку", () => {
    expect(headline("вот так:\n```swift\nlet a = 1\n```")).toBe("вот так: фрагмент кода");
  });

  it("режет длинное и ставит многоточие", () => {
    const long = "очень длинное сообщение ".repeat(10);
    expect(headline(long).length).toBeLessThanOrEqual(61);
    expect(headline(long).endsWith("…")).toBe(true);
  });
});

describe("messageRows", () => {
  it("автор и время в подзаголовке", () => {
    const rows = messageRows([msg("m1", "готово", "assistant_message", 180_000)], NOW);
    expect(rows[0]?.detailText).toBe("Агент · 3 мин");
  });

  it("свои сообщения подписаны иначе", () => {
    const rows = messageRows([msg("m1", "сделай", "user_message", 300_000)], NOW);
    expect(rows[0]?.detailText).toBe("Ты · 5 мин");
  });

  it("новые сверху и не больше двадцати", () => {
    const many = Array.from({ length: 25 }, (_, i) => msg(`m${i}`, `номер ${i}`));
    const rows = messageRows(many, NOW);
    expect(rows).toHaveLength(20);
    expect(rows[0]?.id).toBe("m24");
  });

  it("пустые пропускает", () => {
    expect(messageRows([msg("m1", "   "), msg("m2", "есть")], NOW).map((r) => r.id)).toEqual([
      "m2",
    ]);
  });
});

describe("createChatTemplate", () => {
  it("две кнопки: голос и mute", () => {
    const onMic = vi.fn();
    const onMute = vi.fn();
    const config = configOf(createChatTemplate({ ...base, onMic, onMute }));
    expect(config.trailingNavigationBarButtons.map((b) => b.title)).toEqual([
      S.voiceButton,
      S.mute,
    ]);
    config.onBarButtonPressed({ id: "voice", templateId: "chat" });
    config.onBarButtonPressed({ id: "mute", templateId: "chat" });
    expect(onMic).toHaveBeenCalledOnce();
    expect(onMute).toHaveBeenCalledOnce();
  });

  it("выключенный микрофон виден в шапке вместо фазы", () => {
    expect(chatSections([], S.listening, true)[0]?.header).toBe(S.micOff);
    expect(chatSections([], S.listening, false)[0]?.header).toBe(S.listening);
  });

  it("имя чата остаётся в заголовке", () => {
    expect(configOf(createChatTemplate({ ...base })).title).toBe("paseo-x · сборка");
  });
});
