import { describe, expect, it, vi } from "vitest";
import { createChatsTemplate } from "@/carplay/chats-template";
import { S } from "@/carplay/strings";

vi.mock("@g4rb4g3/react-native-carplay", () => ({
  ListTemplate: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  },
}));

interface Config {
  id: string;
  title: string;
  emptyViewTitleVariants: string[];
  onItemSelect(item: { id: string; index: number; templateId: string }): Promise<void>;
  onBackButtonPressed(): void;
  onPoppedToRoot(): void;
}

function build(over: Partial<Parameters<typeof createChatsTemplate>[0]> = {}) {
  const onPick = vi.fn();
  const onBack = vi.fn();
  const template = createChatsTemplate({
    id: "chats-1",
    title: "jobby",
    rows: [{ id: "srv::a1", text: "тема" }],
    onPick,
    onBack,
    ...over,
  });
  return { config: (template as unknown as { config: Config }).config, onPick, onBack };
}

describe("createChatsTemplate", () => {
  it("носит свой id и имя пространства в заголовке", () => {
    const { config } = build();
    expect(config.id).toBe("chats-1");
    expect(config.title).toBe("jobby");
  });

  it("тап по строке отдаёт serverId и agentId", async () => {
    const { config, onPick } = build();
    await config.onItemSelect({ id: "srv::a1", index: 0, templateId: "chats-1" });
    expect(onPick).toHaveBeenCalledWith("srv", "a1");
  });

  it("мусорный id никого не зовёт", async () => {
    const { config, onPick } = build();
    await config.onItemSelect({ id: "::", index: 0, templateId: "chats-1" });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("назад и возврат к корню сообщаются одним колбэком", () => {
    const { config, onBack } = build();
    config.onBackButtonPressed();
    config.onPoppedToRoot();
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("без чатов объясняет пустоту", () => {
    const { config } = build({ rows: [] });
    expect(config.emptyViewTitleVariants).toEqual([S.noAgents]);
  });
});
