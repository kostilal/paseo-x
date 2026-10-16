import { describe, expect, it, vi } from "vitest";
import { createRootTemplate } from "@/carplay/root-template";
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
  title: string;
  emptyViewTitleVariants: string[];
  emptyViewSubtitleVariants: string[];
  onItemSelect(item: { id: string; index: number; templateId: string }): Promise<void>;
}

const build = (connected: boolean, rows: { id: string; text: string }[] = []) => {
  const onPick = vi.fn();
  const template = createRootTemplate({ rows, connected, onPick });
  return { config: (template as unknown as { config: Config }).config, onPick };
};

describe("createRootTemplate", () => {
  it("без связи с компьютером объясняет это в пустом состоянии", () => {
    const { config } = build(false);
    expect(config.emptyViewTitleVariants).toEqual([S.noConnection]);
    expect(config.emptyViewSubtitleVariants).toEqual([S.noConnectionHint]);
  });

  it("со связью и без проектов говорит, где начать", () => {
    const { config } = build(true);
    expect(config.emptyViewTitleVariants).toEqual([S.noProjects]);
    expect(config.emptyViewSubtitleVariants).toEqual([S.startOnDesktop]);
  });

  it("тап по пространству отдаёт его ключ", async () => {
    const { config, onPick } = build(true, [{ id: "srv::w1", text: "jobby" }]);
    await config.onItemSelect({ id: "srv::w1", index: 0, templateId: "root" });
    expect(onPick).toHaveBeenCalledWith("srv::w1");
  });

  it("без кнопки «Назад»: на корне она выкидывает из приложения", () => {
    const { config } = build(true);
    expect((config as unknown as { backButtonHidden: boolean }).backButtonHidden).toBe(true);
  });

  it("тап без id никого не зовёт", async () => {
    const { config, onPick } = build(true);
    await config.onItemSelect({ id: "", index: 0, templateId: "root" });
    expect(onPick).not.toHaveBeenCalled();
  });
});
