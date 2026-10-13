import type { ListTemplate, VoiceControlTemplate } from "@g4rb4g3/react-native-carplay";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import type { StreamItem } from "@/types/stream";
import { chatSections, createChatTemplate, messageRows } from "./chat-template";
import { createRootTemplate } from "./root-template";
import { speakMessage } from "./speak";
import { S } from "./strings";
import { buildAgentSections } from "./templates";
import { createVoiceTemplate, shouldShowVoice } from "./voice-screen";

/** Поверхность CarPlay. Отдельным портом, чтобы жизненный цикл проверялся тестом. */
export interface CarPlayStage {
  setRoot(template: ListTemplate): void;
  push(template: ListTemplate): void;
  present(template: VoiceControlTemplate): void;
  dismiss(): void;
}

/** Всё, что ведущий читает и делает в приложении. Читается живым, на каждый вызов. */
export interface CarPlayWorld {
  data(): { agents: Agent[]; workspaces: WorkspaceDescriptor[]; connected: boolean };
  voice(): { phase: string; isVoiceMode: boolean; isMuted: boolean; isSpeaking: boolean };
  timeline(serverId: string, agentId: string): StreamItem[];
  /** Объявляет чат видимым: без этого демон не присылает его таймлайн. */
  watchTimeline(serverId: string | null, agentId: string | null): void;
  startVoice(serverId: string, agentId: string): Promise<void>;
  stopVoice(): Promise<void>;
  toggleMute(): void;
}

const PHASE_LABELS: Record<string, string> = {
  listening: S.listening,
  submitting: S.thinking,
  waiting: S.thinking,
  playing: S.speaking,
};

/**
 * Жизненный цикл экрана машины, вынесенный из React.
 *
 * Два правила, из которых следует всё остальное. Первое: шаблоны создаются один раз и
 * дальше только обновляют секции — повторный `setRoot` сбрасывает стек (открытый чат
 * срывается с экрана), а каждый новый экземпляр навешивает слушатели, которые никто не
 * снимает, и один тап начинает срабатывать столько раз, сколько экземпляров пережило
 * апдейты. Второе: состояние читается живым через `world`, а не замыкается при создании
 * обработчика, иначе кнопка микрофона навсегда остаётся в том положении, в каком была
 * при открытии чата.
 */
export function createCarPlayPresenter(stage: CarPlayStage, world: CarPlayWorld) {
  let root: ListTemplate | null = null;
  let chat: { template: ListTemplate; serverId: string; agentId: string; status: string } | null =
    null;
  let voiceTemplate: VoiceControlTemplate | null = null;
  let voiceShown = false;
  let connected = false;

  const statusOf = (override?: string): string =>
    override ?? PHASE_LABELS[world.voice().phase] ?? S.idle;

  const paintChat = (override?: string): void => {
    if (!chat) {
      return;
    }
    const status = override ?? statusOf();
    chat.status = status;
    const rows = messageRows(world.timeline(chat.serverId, chat.agentId));
    chat.template.updateSections(chatSections(rows, status, world.voice().isMuted));
  };

  const openChat = (serverId: string, agentId: string): void => {
    const { agents } = world.data();
    const agent = agents.find((one) => one.serverId === serverId && one.id === agentId);
    // Объявляем чат видимым до запроса таймлайна: подписка — единственный путь,
    // которым демон начинает присылать его сообщения.
    world.watchTimeline(serverId, agentId);
    const rows = messageRows(world.timeline(serverId, agentId));
    const template = createChatTemplate({
      title: agent?.title?.trim() || "Чат",
      rows,
      phase: statusOf(),
      muted: world.voice().isMuted,
      onSpeak: (id) => {
        speakMessage({ items: world.timeline(serverId, agentId), id });
      },
      onMic: () => {
        if (world.voice().isVoiceMode) {
          void world.stopVoice().catch(() => {});
        } else {
          void world.startVoice(serverId, agentId).catch(() => paintChat(S.noConnection));
        }
      },
      onMute: () => {
        world.toggleMute();
        paintChat();
      },
    });
    chat = { template, serverId, agentId, status: statusOf() };
    stage.push(template);
    // Тап по чату сразу включает микрофон: лишний тап за рулём не нужен. Отказ не
    // должен выглядеть как «Готов» — иначе человек говорит в пустоту.
    void world.startVoice(serverId, agentId).catch(() => paintChat(S.noConnection));
  };

  const paintRoot = (): void => {
    const { agents, workspaces, connected: online } = world.data();
    const sections = buildAgentSections({ agents, workspaces });
    if (root) {
      root.updateSections(sections);
      return;
    }
    root = createRootTemplate({ sections, connected: online, onPick: openChat });
    stage.setRoot(root);
  };

  return {
    /** Машина подключилась — или уже была подключена, когда приложение поднялось. */
    connect(): void {
      connected = true;
      paintRoot();
    },

    /** Данные в сторах изменились. Голос при этом не трогаем. */
    refresh(): void {
      if (!connected) {
        return;
      }
      paintRoot();
      paintChat();
    },

    /** Изменилось состояние голоса: фаза, mute или то, что человек заговорил. */
    sync(): void {
      if (!connected) {
        return;
      }
      const { phase, isMuted, isSpeaking } = world.voice();
      const show = shouldShowVoice({ phase, isSpeaking, muted: isMuted });
      if (show && !voiceShown) {
        voiceTemplate ??= createVoiceTemplate();
        voiceShown = true;
        stage.present(voiceTemplate);
      } else if (!show && voiceShown) {
        voiceShown = false;
        stage.dismiss();
      }
      paintChat();
    },

    disconnect(): void {
      if (!connected) {
        return;
      }
      connected = false;
      if (voiceShown) {
        voiceShown = false;
        stage.dismiss();
      }
      chat = null;
      root = null;
      world.watchTimeline(null, null);
      void world.stopVoice().catch(() => {});
    },
  };
}
