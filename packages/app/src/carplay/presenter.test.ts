import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import type { StreamItem } from "@/types/stream";
import { createCarPlayPresenter, type CarPlayStage, type CarPlayWorld } from "@/carplay/presenter";
import { S } from "@/carplay/strings";

vi.mock("@g4rb4g3/react-native-carplay", () => {
  class Fake {
    id: string;
    config: Record<string, unknown>;
    updateSections = vi.fn();
    destroy = vi.fn();
    constructor(config: Record<string, unknown> = {}) {
      this.config = config;
      this.id = typeof config.id === "string" ? config.id : "anon";
    }
  }
  return { ListTemplate: Fake, VoiceControlTemplate: Fake };
});

type Mock = ReturnType<typeof vi.fn>;
interface FakeTemplate {
  id: string;
  config: Record<string, unknown> & {
    sections?: { header?: string; items: { id: string; isPlaying?: boolean }[] }[];
    onItemSelect?(item: { id: string; index: number; templateId: string }): Promise<void>;
    onBarButtonPressed?(e: { id: string; templateId: string }): void;
    onBackButtonPressed?(): void;
  };
  updateSections: Mock;
  destroy: Mock;
}

const agent = (over: Partial<Agent>): Agent =>
  ({
    serverId: "srv",
    id: "a1",
    title: "привет, почему не собирается проект",
    workspaceId: "w1",
    cwd: "/tmp/jobby",
    labels: {},
    parentAgentId: null,
    pendingPermissions: [],
    turn: { phase: "idle", cancellationRequestId: null },
    lastActivityAt: new Date(),
    ...over,
  }) as Agent;

const workspaces = (): WorkspaceDescriptor[] =>
  [
    { id: "w1", name: "jobby", projectDisplayName: "jobby" },
    { id: "w2", name: "paseo-x", projectDisplayName: "paseo-x" },
  ] as WorkspaceDescriptor[];

const message = (id: string, text: string, kind = "assistant_message"): StreamItem =>
  ({ kind, id, text, timestamp: new Date() }) as StreamItem;

function harness(over: Partial<CarPlayWorld> = {}) {
  const stage: CarPlayStage = {
    setRoot: vi.fn(),
    push: vi.fn(),
    present: vi.fn(),
    dismiss: vi.fn(),
    updateButtons: vi.fn(),
  };
  const world: CarPlayWorld = {
    data: () => ({
      agents: [
        agent({}),
        agent({ id: "a2", title: "второй" }),
        agent({ id: "a3", workspaceId: "w2" }),
      ],
      workspaces: workspaces(),
      connected: true,
    }),
    voice: () => ({ phase: "disabled", isVoiceMode: false, isMuted: false, isSpeaking: false }),
    timeline: () => [message("m1", "Собираю билд"), message("m2", "Да", "user_message")],
    watchTimeline: vi.fn(),
    startVoice: vi.fn().mockResolvedValue(undefined),
    stopVoice: vi.fn().mockResolvedValue(undefined),
    toggleMute: vi.fn(),
    microphoneGranted: vi.fn().mockResolvedValue(true),
    reader: { read: vi.fn().mockReturnValue(true), stop: vi.fn() },
    ...over,
  };
  return { stage, world, presenter: createCarPlayPresenter(stage, world) };
}

const root = (stage: CarPlayStage): FakeTemplate => (stage.setRoot as Mock).mock.calls[0]?.[0];
const pushed = (stage: CarPlayStage, n = -1): FakeTemplate =>
  (stage.push as Mock).mock.calls.at(n)?.[0];
const lastSections = (t: FakeTemplate) =>
  t.updateSections.mock.calls.at(-1)?.[0] as NonNullable<FakeTemplate["config"]["sections"]>;
const header = (t: FakeTemplate) =>
  (t.updateSections.mock.calls.length ? lastSections(t) : t.config.sections)?.[0]?.header;

async function tap(t: FakeTemplate, id: string) {
  await t.config.onItemSelect?.({ id, index: 0, templateId: t.id });
}
const press = (t: FakeTemplate, id: string) =>
  t.config.onBarButtonPressed?.({ id, templateId: t.id });
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** Корень → первое пространство → его первый чат. */
async function openFirstChat(stage: CarPlayStage) {
  const ws = root(stage).config.sections?.[0]?.items[0]?.id ?? "";
  await tap(root(stage), ws);
  const chats = pushed(stage);
  const chatId = chats.config.sections?.[0]?.items[0]?.id ?? "";
  await tap(chats, chatId);
  return pushed(stage);
}

describe("три экрана", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
    h.presenter.connect();
  });

  it("корень — список рабочих пространств, создаётся один раз, апдейты обновляют секции", () => {
    expect(root(h.stage).config.sections?.[0]?.items.map((i) => i.id)).toEqual([
      "srv::w1",
      "srv::w2",
    ]);
    h.presenter.refresh();
    expect(h.stage.setRoot).toHaveBeenCalledOnce();
  });

  it("тап по пространству открывает список только его чатов, без секций по состоянию", async () => {
    await tap(root(h.stage), "srv::w1");
    const chats = pushed(h.stage);
    expect(chats.config.sections).toHaveLength(1);
    expect(chats.config.sections?.[0]?.items.map((i) => i.id)).toEqual(["srv::a1", "srv::a2"]);
  });

  it("тап по чату открывает экран сообщений, подписывает таймлайн и не включает голос сам", async () => {
    const chat = await openFirstChat(h.stage);
    expect(chat.config.sections?.[0]?.items.map((i) => i.id)).toEqual(["m2", "m1"]);
    expect(h.world.watchTimeline).toHaveBeenCalledWith("srv", "a1");
    expect(h.world.startVoice).not.toHaveBeenCalled();
  });

  it("если машина уже подключена при запуске, корень всё равно рисуется", () => {
    expect(h.stage.setRoot).toHaveBeenCalledOnce();
  });
});

describe("голос", () => {
  it("«Голос» включает голос у открытого чата", async () => {
    const h = harness();
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    press(chat, "voice");
    await settle();
    expect(h.world.startVoice).toHaveBeenCalledWith("srv", "a1");
  });

  it("при включённом голосе та же кнопка его выключает — по живому состоянию", async () => {
    let on = false;
    const h = harness({
      voice: () => ({
        phase: on ? "listening" : "disabled",
        isVoiceMode: on,
        isMuted: false,
        isSpeaking: false,
      }),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    on = true;
    press(chat, "voice");
    await settle();
    expect(h.world.stopVoice).toHaveBeenCalledOnce();
    expect(h.world.startVoice).not.toHaveBeenCalled();
  });

  it("пока голос включается, шапка говорит «Включаю…», а не «Готов»", async () => {
    const h = harness({
      voice: () => ({ phase: "starting", isVoiceMode: false, isMuted: false, isSpeaking: false }),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    h.presenter.sync();
    expect(header(chat)).toBe(S.starting);
  });

  it("отказ микрофона виден как просьба разрешить его на телефоне и не затирается следующим sync", async () => {
    const h = harness({
      startVoice: vi
        .fn()
        .mockRejectedValue(new Error("Microphone permission is required to capture audio")),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    press(chat, "voice");
    await settle();
    expect(header(chat)).toBe(S.micDenied);
    h.presenter.sync();
    expect(header(chat)).toBe(S.micDenied);
  });

  it("нет связи с демоном — шапка говорит об этом", async () => {
    const h = harness({
      startVoice: vi.fn().mockRejectedValue(new Error("Host srv is not connected")),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    press(chat, "voice");
    await settle();
    expect(header(chat)).toBe(S.noConnection);
  });

  it("голос, занятый другим устройством, назван так, а не «не включился»", async () => {
    const h = harness({
      startVoice: vi
        .fn()
        .mockRejectedValue(new Error("Voice mode is already active for this agent")),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    press(chat, "voice");
    await settle();
    expect(header(chat)).toBe(S.voiceTaken);
  });

  it("неразрешённый микрофон подсказывается ещё до ответа startVoice — пока на телефоне висит диалог", async () => {
    let resolveStart = () => {};
    const h = harness({
      microphoneGranted: vi.fn().mockResolvedValue(false),
      startVoice: vi.fn().mockReturnValue(new Promise<void>((r) => (resolveStart = r))),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    press(chat, "voice");
    await settle();
    expect(header(chat)).toBe(S.micDenied);
    resolveStart();
  });

  it("подписи кнопок следуют за состоянием: Стоп при включённом голосе, Звук при mute", async () => {
    let on = false;
    let muted = false;
    const h = harness({
      voice: () => ({
        phase: on ? "listening" : "disabled",
        isVoiceMode: on,
        isMuted: muted,
        isSpeaking: false,
      }),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    on = true;
    muted = true;
    h.presenter.sync();
    const buttons = (h.stage.updateButtons as Mock).mock.calls.at(-1)?.[1] as {
      id: string;
      title: string;
    }[];
    expect(buttons.map((b) => b.title)).toEqual([S.voiceOff, S.unmute]);
    expect((h.stage.updateButtons as Mock).mock.calls.at(-1)?.[0]).toBe(chat);
  });

  it("mute при включённом голосе виден в шапке", async () => {
    const h = harness({
      voice: () => ({ phase: "listening", isVoiceMode: true, isMuted: true, isSpeaking: false }),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    press(chat, "mute");
    expect(h.world.toggleMute).toHaveBeenCalledOnce();
    h.presenter.sync();
    expect(header(chat)).toBe(S.micOff);
  });

  it("второе нажатие «Голос», пока первое ещё включает, не запускает второй старт", async () => {
    let resolveStart = () => {};
    const h = harness({
      startVoice: vi.fn().mockReturnValue(new Promise<void>((r) => (resolveStart = r))),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    press(chat, "voice");
    await settle();
    press(chat, "voice");
    await settle();
    expect(h.world.startVoice).toHaveBeenCalledOnce();
    resolveStart();
    await settle();
    press(chat, "voice");
    await settle();
    expect(h.world.startVoice).toHaveBeenCalledTimes(2);
  });

  it("апдейт данных не выключает голос — иначе он умирает на первом же токене ответа", async () => {
    const h = harness();
    h.presenter.connect();
    await openFirstChat(h.stage);
    h.presenter.refresh();
    expect(h.world.stopVoice).not.toHaveBeenCalled();
  });
});

describe("навигация назад и повторное открытие", () => {
  it("повторное открытие чата не дублирует обработчики: старый экран уничтожен, id разные", async () => {
    const h = harness();
    h.presenter.connect();
    const first = await openFirstChat(h.stage);
    first.config.onBackButtonPressed?.();
    const chats = pushed(h.stage, -2);
    await tap(chats, "srv::a1");
    const second = pushed(h.stage);
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(second).not.toBe(first);
    expect(second.id).not.toBe(first.id);
    press(second, "mute");
    expect(h.world.toggleMute).toHaveBeenCalledOnce();
  });

  it("назад из чата выключает голос, останавливает чтение и отписывает таймлайн", async () => {
    const h = harness({
      voice: () => ({ phase: "listening", isVoiceMode: true, isMuted: false, isSpeaking: false }),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    chat.config.onBackButtonPressed?.();
    expect(h.world.stopVoice).toHaveBeenCalledOnce();
    expect(h.world.reader.stop).toHaveBeenCalled();
    expect(h.world.watchTimeline).toHaveBeenLastCalledWith(null, null);
    expect(chat.destroy).toHaveBeenCalledOnce();
  });

  it("назад из списка чатов уничтожает его шаблон", async () => {
    const h = harness();
    h.presenter.connect();
    await tap(root(h.stage), "srv::w1");
    const chats = pushed(h.stage);
    chats.config.onBackButtonPressed?.();
    expect(chats.destroy).toHaveBeenCalledOnce();
    h.presenter.refresh();
    expect(chats.updateSections).not.toHaveBeenCalled();
  });
});

describe("чтение сообщений", () => {
  it("тап по сообщению читает его целиком и помечает строку; повторный тап останавливает", async () => {
    const h = harness();
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    await tap(chat, "m1");
    expect(h.world.reader.read).toHaveBeenCalledWith("Собираю билд", expect.any(Function));
    expect(lastSections(chat)[0]?.items.find((i) => i.id === "m1")?.isPlaying).toBe(true);
    await tap(chat, "m1");
    expect(h.world.reader.stop).toHaveBeenCalled();
    expect(lastSections(chat)[0]?.items.find((i) => i.id === "m1")?.isPlaying).toBeFalsy();
  });

  it("когда чтение закончилось само, пометка снимается", async () => {
    let onEnd = () => {};
    const h = harness({
      reader: {
        read: vi.fn((_text: string, end: () => void) => {
          onEnd = end;
          return true;
        }),
        stop: vi.fn(),
      },
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    await tap(chat, "m1");
    onEnd();
    expect(lastSections(chat)[0]?.items.find((i) => i.id === "m1")?.isPlaying).toBeFalsy();
  });

  it("при включённом голосе чтение глушит микрофон и возвращает его, когда кончилось", async () => {
    let muted = false;
    let onEnd = () => {};
    const h = harness({
      voice: () => ({ phase: "listening", isVoiceMode: true, isMuted: muted, isSpeaking: false }),
      toggleMute: vi.fn(() => {
        muted = !muted;
      }),
      reader: {
        read: vi.fn((_text: string, end: () => void) => {
          onEnd = end;
          return true;
        }),
        stop: vi.fn(),
      },
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    await tap(chat, "m1");
    expect(muted).toBe(true);
    onEnd();
    expect(muted).toBe(false);
  });

  it("микрофон, выключенный руками до чтения, после чтения остаётся выключенным", async () => {
    let muted = true;
    const h = harness({
      voice: () => ({ phase: "listening", isVoiceMode: true, isMuted: muted, isSpeaking: false }),
      toggleMute: vi.fn(() => {
        muted = !muted;
      }),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    await tap(chat, "m1");
    await tap(chat, "m1");
    expect(h.world.toggleMute).not.toHaveBeenCalled();
    expect(muted).toBe(true);
  });

  it("тап по другому сообщению переключает чтение на него", async () => {
    const h = harness();
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    await tap(chat, "m1");
    await tap(chat, "m2");
    expect(h.world.reader.read).toHaveBeenLastCalledWith("Да", expect.any(Function));
    const items = lastSections(chat)[0]?.items ?? [];
    expect(items.find((i) => i.id === "m2")?.isPlaying).toBe(true);
    expect(items.find((i) => i.id === "m1")?.isPlaying).toBeFalsy();
  });
});

describe("обновления", () => {
  it("новые сообщения доезжают до открытого экрана чата", async () => {
    let items = [message("m1", "Первое")];
    const h = harness({ timeline: () => items });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    items = [message("m1", "Первое"), message("m2", "Второе")];
    h.presenter.refresh();
    expect(lastSections(chat)[0]?.items.map((i) => i.id)).toEqual(["m2", "m1"]);
  });

  it("одинаковые секции не отправляются в машину повторно", async () => {
    const h = harness();
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    h.presenter.refresh();
    h.presenter.refresh();
    h.presenter.sync();
    expect(chat.updateSections).not.toHaveBeenCalled();
    expect(root(h.stage).updateSections).not.toHaveBeenCalled();
  });

  it("шаблон речи переиспользуется, а не плодится на каждую фразу", () => {
    let speaking = false;
    const h = harness({
      voice: () => ({
        phase: "listening",
        isVoiceMode: true,
        isMuted: false,
        isSpeaking: speaking,
      }),
    });
    h.presenter.connect();
    speaking = true;
    h.presenter.sync();
    speaking = false;
    h.presenter.sync();
    speaking = true;
    h.presenter.sync();
    const presented = (h.stage.present as Mock).mock.calls;
    expect(presented).toHaveLength(2);
    expect(presented[0]?.[0]).toBe(presented[1]?.[0]);
  });

  it("отключение от машины выключает голос, чтение и убирает все экраны", async () => {
    const h = harness({
      voice: () => ({ phase: "listening", isVoiceMode: true, isMuted: false, isSpeaking: true }),
    });
    h.presenter.connect();
    const chat = await openFirstChat(h.stage);
    h.presenter.sync();
    h.presenter.disconnect();
    expect(h.world.stopVoice).toHaveBeenCalledOnce();
    expect(h.world.reader.stop).toHaveBeenCalled();
    expect(h.stage.dismiss).toHaveBeenCalledOnce();
    expect(chat.destroy).toHaveBeenCalledOnce();
    expect(root(h.stage).destroy).toHaveBeenCalledOnce();
    expect(h.world.watchTimeline).toHaveBeenLastCalledWith(null, null);
  });
});
