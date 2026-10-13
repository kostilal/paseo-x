import { describe, expect, it, vi } from "vitest";
import type { StreamItem } from "@/types/stream";
import { chatSections, createChatTemplate, messageRows } from "@/carplay/chat-template";
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
  trailingNavigationBarButtons: { id: string }[];
  onBarButtonPressed(event: { id: string; templateId: string }): void;
  onItemSelect(item: { id: string; index: number; templateId: string }): Promise<void>;
}
const configOf = (template: unknown): ChatConfig => (template as { config: ChatConfig }).config;

const message = (id: string, text: string): StreamItem =>
  ({ kind: "assistant_message", id, text, timestamp: new Date() }) as StreamItem;

const base = {
  title: "Чат",
  rows: [],
  phase: S.idle,
  muted: false,
  onSpeak: () => {},
  onMic: () => {},
  onMute: () => {},
};

describe("messageRows", () => {
  it("берёт только сообщения и отбрасывает остальное", () => {
    const rows = messageRows([
      message("m1", "Ответ"),
      { kind: "thought", id: "t1", text: "думаю", timestamp: new Date() } as unknown as StreamItem,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("m1");
  });

  it("пустые сообщения пропускает: строка без текста в CarPlay выглядит сломанной", () => {
    const rows = messageRows([message("m1", "   "), message("m2", "Есть")]);
    expect(rows.map((r) => r.id)).toEqual(["m2"]);
  });

  it("длинный текст режет в заголовке", () => {
    const rows = messageRows([message("m1", "а".repeat(200))]);
    expect(rows[0]?.text.length).toBeLessThanOrEqual(61);
    expect(rows[0]?.text.endsWith("…")).toBe(true);
  });

  it("оставляет последние двадцать, новейшее первым", () => {
    const many = Array.from({ length: 25 }, (_, index) => message(`m${index}`, `номер ${index}`));
    const rows = messageRows(many);
    expect(rows).toHaveLength(20);
    expect(rows[0]?.id).toBe("m24");
  });
});

describe("createChatTemplate", () => {
  it("даёт кнопки микрофона и mute и зовёт их обработчики", () => {
    const onMic = vi.fn();
    const onMute = vi.fn();
    const template = createChatTemplate({ ...base, onMic, onMute });
    const config = configOf(template);
    expect(config.trailingNavigationBarButtons.map((b) => b.id)).toEqual(["mic", "mute"]);
    config.onBarButtonPressed({ id: "mic", templateId: "chat" });
    config.onBarButtonPressed({ id: "mute", templateId: "chat" });
    expect(onMic).toHaveBeenCalledOnce();
    expect(onMute).toHaveBeenCalledOnce();
  });

  it("держит имя чата в заголовке, а фазу и mute — в шапке секции", () => {
    // Заголовок шаблона после показа не меняется: библиотека умеет обновлять только
    // секции. Поэтому всё, что живёт во времени, лежит в шапке секции.
    const template = createChatTemplate({ ...base, phase: S.listening, muted: true });
    expect(configOf(template).title).toBe("Чат");
    expect(configOf(template).sections[0]?.header).toContain(S.listening);
    expect(configOf(template).sections[0]?.header).toContain(S.muted);
  });

  it("статусную шапку можно пересобрать отдельно от шаблона", () => {
    expect(chatSections([], S.speaking, false)[0]?.header).toBe(S.speaking);
    expect(chatSections([], S.idle, true)[0]?.header).toBe(`${S.idle} · ${S.muted}`);
  });

  it("тап по строке отдаёт её id на проговаривание", async () => {
    const onSpeak = vi.fn();
    const template = createChatTemplate({ ...base, onSpeak });
    await configOf(template).onItemSelect({ id: "m1", index: 0, templateId: "chat" });
    expect(onSpeak).toHaveBeenCalledWith("m1");
  });
});
