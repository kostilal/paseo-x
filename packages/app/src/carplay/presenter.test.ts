import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import type { StreamItem } from "@/types/stream";
import { createCarPlayPresenter, type CarPlayStage, type CarPlayWorld } from "@/carplay/presenter";
import { S } from "@/carplay/strings";

vi.mock("@g4rb4g3/react-native-carplay", () => {
  class Fake {
    config: Record<string, unknown>;
    updateSections = vi.fn();
    destroy = vi.fn();
    constructor(config: Record<string, unknown> = {}) {
      this.config = config;
    }
  }
  return { ListTemplate: Fake, VoiceControlTemplate: Fake };
});

const agent = (over: Partial<Agent>): Agent =>
  ({
    serverId: "srv",
    id: "a1",
    title: "Чат",
    workspaceId: "w1",
    cwd: "/tmp",
    labels: {},
    parentAgentId: null,
    turn: { phase: "idle", cancellationRequestId: null },
    lastActivityAt: new Date(),
    ...over,
  }) as Agent;

const workspace = (): WorkspaceDescriptor =>
  ({ id: "w1", name: "jobby", projectDisplayName: "jobby" }) as WorkspaceDescriptor;

const message = (id: string, text: string): StreamItem =>
  ({ kind: "assistant_message", id, text, timestamp: new Date() }) as StreamItem;

function harness(over: Partial<CarPlayWorld> = {}) {
  const stage: CarPlayStage = {
    setRoot: vi.fn(),
    push: vi.fn(),
    present: vi.fn(),
    dismiss: vi.fn(),
  };
  const world: CarPlayWorld = {
    data: () => ({ agents: [agent({})], workspaces: [workspace()], connected: true }),
    voice: () => ({ phase: "disabled", isVoiceMode: false, isMuted: false, isSpeaking: false }),
    timeline: () => [message("m1", "Привет")],
    watchTimeline: vi.fn(),
    startVoice: vi.fn().mockResolvedValue(undefined),
    stopVoice: vi.fn().mockResolvedValue(undefined),
    toggleMute: vi.fn(),
    ...over,
  };
  return { stage, world, presenter: createCarPlayPresenter(stage, world) };
}

/** Тап по первой строке корневого списка. */
async function tapFirstRow(stage: CarPlayStage) {
  const root = (stage.setRoot as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
  const config = root.config as {
    sections: { items: { id: string }[] }[];
    onItemSelect(item: { id: string; index: number; templateId: string }): Promise<void>;
  };
  const id = config.sections[0]?.items[0]?.id ?? "";
  await config.onItemSelect({ id, index: 0, templateId: "root" });
  return id;
}

describe("жизненный цикл экрана машины", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("корневой список создаётся один раз, апдейты данных обновляют секции", () => {
    h.presenter.connect();
    h.presenter.refresh();
    h.presenter.refresh();
    expect(h.stage.setRoot).toHaveBeenCalledOnce();
    const root = (h.stage.setRoot as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(root.updateSections).toHaveBeenCalledTimes(2);
  });

  it("апдейт данных не выключает голос — иначе он умирает на первом же токене ответа", () => {
    h.presenter.connect();
    h.presenter.refresh();
    expect(h.world.stopVoice).not.toHaveBeenCalled();
  });

  it("отключение от машины выключает голос и убирает шаблон речи", () => {
    const h2 = harness({
      voice: () => ({ phase: "listening", isVoiceMode: true, isMuted: false, isSpeaking: true }),
    });
    h2.presenter.connect();
    h2.presenter.sync();
    expect(h2.stage.present).toHaveBeenCalledOnce();
    h2.presenter.disconnect();
    expect(h2.world.stopVoice).toHaveBeenCalledOnce();
    expect(h2.stage.dismiss).toHaveBeenCalledOnce();
    expect(h2.world.watchTimeline).toHaveBeenLastCalledWith(null, null);
  });

  it("тап по чату открывает экран, включает голос и подписывает таймлайн", async () => {
    h.presenter.connect();
    await tapFirstRow(h.stage);
    expect(h.stage.push).toHaveBeenCalledOnce();
    expect(h.world.startVoice).toHaveBeenCalledWith("srv", "a1");
    expect(h.world.watchTimeline).toHaveBeenCalledWith("srv", "a1");
  });

  it("кнопка микрофона смотрит на живое состояние, а не на то, что было при открытии", async () => {
    let voiceOn = false;
    const h2 = harness({
      voice: () => ({
        phase: voiceOn ? "listening" : "disabled",
        isVoiceMode: voiceOn,
        isMuted: false,
        isSpeaking: false,
      }),
    });
    h2.presenter.connect();
    await tapFirstRow(h2.stage);
    voiceOn = true; // голос включился уже после того, как экран создан
    const chat = (h2.stage.push as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    (
      chat.config as { onBarButtonPressed(e: { id: string; templateId: string }): void }
    ).onBarButtonPressed({
      id: "mic",
      templateId: "chat",
    });
    expect(h2.world.stopVoice).toHaveBeenCalledOnce();
  });

  it("новые сообщения доезжают до открытого экрана чата", async () => {
    let items = [message("m1", "Первое")];
    const h2 = harness({ timeline: () => items });
    h2.presenter.connect();
    await tapFirstRow(h2.stage);
    items = [message("m1", "Первое"), message("m2", "Второе")];
    h2.presenter.refresh();
    const chat = (h2.stage.push as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const sections = chat.updateSections.mock.calls.at(-1)?.[0];
    expect(sections[0].items.map((i: { id: string }) => i.id)).toEqual(["m2", "m1"]);
  });

  it("шаблон речи переиспользуется, а не плодится на каждую фразу", () => {
    let speaking = false;
    const h2 = harness({
      voice: () => ({
        phase: "listening",
        isVoiceMode: true,
        isMuted: false,
        isSpeaking: speaking,
      }),
    });
    h2.presenter.connect();
    speaking = true;
    h2.presenter.sync();
    speaking = false;
    h2.presenter.sync();
    speaking = true;
    h2.presenter.sync();
    const presented = (h2.stage.present as ReturnType<typeof vi.fn>).mock.calls;
    expect(presented).toHaveLength(2);
    expect(presented[0]?.[0]).toBe(presented[1]?.[0]);
  });

  it("неудачный запуск голоса виден в шапке, а не выглядит как «Готов»", async () => {
    const h2 = harness({
      startVoice: vi.fn().mockRejectedValue(new Error("демон недоступен")),
    });
    h2.presenter.connect();
    await tapFirstRow(h2.stage);
    await Promise.resolve();
    await Promise.resolve();
    const chat = (h2.stage.push as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const sections = chat.updateSections.mock.calls.at(-1)?.[0];
    expect(sections[0].header).toContain(S.noConnection);
  });

  it("если машина уже подключена при запуске, корень всё равно рисуется", () => {
    h.presenter.connect();
    expect(h.stage.setRoot).toHaveBeenCalledOnce();
  });
});
