import { describe, expect, it, vi } from "vitest";
import { createRootTemplate, handleCarPlayDisconnect } from "@/carplay/root-template";
import { S } from "@/carplay/strings";

vi.mock("@g4rb4g3/react-native-carplay", () => ({
  ListTemplate: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  },
}));

interface RootConfig {
  title: string;
  emptyViewTitleVariants: string[];
  emptyViewSubtitleVariants: string[];
  onItemSelect(item: { id: string; index: number; templateId: string }): Promise<void>;
}
const configOf = (template: unknown): RootConfig => (template as { config: RootConfig }).config;

describe("createRootTemplate", () => {
  it("без связи с демоном объясняет это в пустом состоянии", () => {
    const template = createRootTemplate({ sections: [], connected: false, onPick: () => {} });
    expect(configOf(template).emptyViewTitleVariants).toEqual([S.noConnection]);
    expect(configOf(template).emptyViewSubtitleVariants).toEqual([S.noConnectionHint]);
  });

  it("со связью и без чатов говорит, что чатов нет", () => {
    const template = createRootTemplate({ sections: [], connected: true, onPick: () => {} });
    expect(configOf(template).emptyViewTitleVariants).toEqual([S.noAgents]);
  });

  it("тап по строке отдаёт serverId и agentId", async () => {
    const onPick = vi.fn();
    const template = createRootTemplate({
      sections: [{ header: "ws", items: [{ id: "srv::a1", text: "Чат" }] }],
      connected: true,
      onPick,
    });
    await configOf(template).onItemSelect({ id: "srv::a1", index: 0, templateId: "root" });
    expect(onPick).toHaveBeenCalledWith("srv", "a1");
  });

  it("тап по строке с мусорным id никого не зовёт", async () => {
    const onPick = vi.fn();
    const template = createRootTemplate({
      sections: [{ header: "ws", items: [{ id: "мусор", text: "Чат" }] }],
      connected: true,
      onPick,
    });
    await configOf(template).onItemSelect({ id: "мусор", index: 0, templateId: "root" });
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("handleCarPlayDisconnect", () => {
  it("выходит из голоса: иначе микрофон слушает после выхода из машины", () => {
    const stopVoice = vi.fn().mockResolvedValue(undefined);
    handleCarPlayDisconnect({ wasConnected: true, stopVoice });
    expect(stopVoice).toHaveBeenCalledOnce();
  });

  it("ничего не делает, если подключения не было", () => {
    const stopVoice = vi.fn().mockResolvedValue(undefined);
    handleCarPlayDisconnect({ wasConnected: false, stopVoice });
    expect(stopVoice).not.toHaveBeenCalled();
  });

  it("не падает, если выход из голоса отверг обещание", () => {
    const stopVoice = vi.fn().mockRejectedValue(new Error("мёртвое соединение"));
    expect(() => handleCarPlayDisconnect({ wasConnected: true, stopVoice })).not.toThrow();
  });
});
