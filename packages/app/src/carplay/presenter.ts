import type {
  BarButton,
  ListSection,
  ListTemplate,
  VoiceControlTemplate,
} from "@g4rb4g3/react-native-carplay";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import type { StreamItem } from "@/types/stream";
import { chatButtons, chatSections, createChatTemplate, messageRows } from "./chat-template";
import { chatsSections, createChatsTemplate } from "./chats-template";
import { createRootTemplate, rootSections } from "./root-template";
import type { Reader } from "./speak";
import { S } from "./strings";
import { chatRows, chatTitleFor, projectKeyOf, projectNameOf, projectRows } from "./templates";
import { createVoiceTemplate, shouldShowVoice } from "./voice-screen";

/** Поверхность CarPlay. Отдельным портом, чтобы жизненный цикл проверялся тестом. */
export interface CarPlayStage {
  setRoot(template: ListTemplate): void;
  push(template: ListTemplate): void;
  present(template: VoiceControlTemplate): void;
  dismiss(): void;
  /** Подписи кнопок навбара после показа: класс библиотеки не умеет, нативный мост — умеет. */
  updateButtons(template: ListTemplate, buttons: BarButton[]): void;
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
  /**
   * Дано ли приложению разрешение на микрофон. Без него запуск голоса висит на
   * системном диалоге, который показывается на телефоне, а не на экране машины.
   */
  microphoneGranted(): Promise<boolean>;
  /** Чтение сообщения вслух голосом телефона. */
  reader: Reader;
}

const PHASE_LABELS: Record<string, string> = {
  starting: S.starting,
  listening: S.listening,
  submitting: S.thinking,
  waiting: S.thinking,
  playing: S.speaking,
};

/** Почему голос не включился — словами, по которым за рулём понятно, что делать. */
export function reasonFor(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/microphone/i.test(text)) {
    return S.micDenied;
  }
  if (/not connected|not ready/i.test(text)) {
    return S.noConnection;
  }
  // Демон отвечает так, когда голос у этого чата держит другой клиент — компьютер или
  // телефон. За рулём это не поломка, а подсказка, где его выключить.
  if (/already active/i.test(text)) {
    return S.voiceTaken;
  }
  return S.voiceFailed;
}

/** Шаблон и то, что в него отправлено последним: одинаковое не шлём в машину повторно. */
interface Painted {
  template: ListTemplate;
  sections: string;
}

interface OpenChat extends Painted {
  serverId: string;
  agentId: string;
  /** Что пошло не так с голосом; держится в шапке, пока человек не попробует снова. */
  problem: string;
  /** Сообщение, которое сейчас читается вслух. */
  reading: string | null;
  /** Микрофон заглушён на время чтения — вернуть, когда чтение кончится. */
  mutedForReading: boolean;
  /** Запуск голоса в полёте: второе нажатие в этот момент не должно запускать ещё один. */
  starting: boolean;
  buttons: string;
}

/**
 * Жизненный цикл экрана машины, вынесенный из React: три экрана — пространства, чаты
 * пространства, сообщения чата.
 *
 * Правила, из которых следует всё остальное. Шаблоны создаются один раз и дальше только
 * обновляют секции: повторный `setRoot` сбрасывает стек. У каждого экземпляра свой id, и
 * ушедший с экрана шаблон уничтожается: нативное хранилище держит шаблоны по id, а
 * JS-слушатели фильтруют события по нему же, так что два живых экземпляра с одним id —
 * это два срабатывания на один тап (Mute, нажатый один раз, включался и тут же
 * выключался). Состояние читается живым через `world`, а не замыкается при создании
 * обработчика. Голос включает только кнопка — открытие чата микрофон не трогает.
 */
export function createCarPlayPresenter(stage: CarPlayStage, world: CarPlayWorld) {
  let root: Painted | null = null;
  let chats: (Painted & { key: string }) | null = null;
  let chat: OpenChat | null = null;
  let voiceTemplate: VoiceControlTemplate | null = null;
  let voiceShown = false;
  let connected = false;
  let serial = 0;

  const paint = (target: Painted, sections: ListSection[]): void => {
    const encoded = JSON.stringify(sections);
    if (encoded === target.sections) {
      return;
    }
    target.sections = encoded;
    target.template.updateSections(sections);
  };

  const statusOf = (): string => {
    const { phase, isVoiceMode, isMuted } = world.voice();
    if (chat?.problem && !isVoiceMode && phase !== "starting") {
      return chat.problem;
    }
    if (isVoiceMode && isMuted) {
      return S.micOff;
    }
    return PHASE_LABELS[phase] ?? S.idle;
  };

  const paintChat = (): void => {
    if (!chat) {
      return;
    }
    const rows = messageRows(
      world.timeline(chat.serverId, chat.agentId),
      new Date(),
      undefined,
      chat.reading,
    );
    paint(chat, chatSections(rows, statusOf()));
    const { isVoiceMode, isMuted } = world.voice();
    const buttons = chatButtons({ voiceOn: isVoiceMode, muted: isMuted });
    const encoded = JSON.stringify(buttons);
    if (encoded !== chat.buttons) {
      chat.buttons = encoded;
      stage.updateButtons(chat.template, buttons);
    }
  };

  const paintChats = (): void => {
    if (!chats) {
      return;
    }
    const { agents, workspaces } = world.data();
    paint(chats, chatsSections(chatRows({ agents, workspaces, key: chats.key })));
  };

  const paintRoot = (): void => {
    const { agents, workspaces, connected: online } = world.data();
    const rows = projectRows({ agents, workspaces });
    if (root) {
      paint(root, rootSections(rows));
      return;
    }
    const template = createRootTemplate({ rows, connected: online, onPick: openWorkspace });
    root = { template, sections: JSON.stringify(rootSections(rows)) };
    stage.setRoot(template);
  };

  const closeChat = (): void => {
    if (!chat) {
      return;
    }
    const closing = chat;
    chat = null;
    stopReading(closing);
    const { isVoiceMode, phase } = world.voice();
    // Микрофон не должен слушать чат, которого нет на экране. Включающийся голос тоже
    // гасим: иначе он доедет до «слушаю» уже без экрана.
    if (isVoiceMode || phase === "starting") {
      void world.stopVoice().catch(() => {});
    }
    world.watchTimeline(null, null);
    closing.template.destroy();
  };

  const closeChats = (): void => {
    if (!chats) {
      return;
    }
    const closing = chats;
    chats = null;
    closing.template.destroy();
  };

  /**
   * Чтение вслух идёт из динамиков машины прямо в её же микрофон, и при включённом
   * голосе демон принял бы прочитанное за речь водителя. На время чтения микрофон
   * глушится, после — возвращается, если его не выключили руками.
   */
  const muteForReading = (current: OpenChat): void => {
    const { isVoiceMode, isMuted } = world.voice();
    if (isVoiceMode && !isMuted && !current.mutedForReading) {
      world.toggleMute();
      current.mutedForReading = true;
    }
  };

  const unmuteAfterReading = (current: OpenChat): void => {
    if (!current.mutedForReading) {
      return;
    }
    current.mutedForReading = false;
    if (world.voice().isMuted) {
      world.toggleMute();
    }
  };

  const stopReading = (current: OpenChat): void => {
    world.reader.stop();
    current.reading = null;
    unmuteAfterReading(current);
  };

  const readMessage = (id: string): void => {
    if (!chat) {
      return;
    }
    // Тап по тому, что уже читается, — это «хватит».
    if (chat.reading === id) {
      stopReading(chat);
      paintChat();
      return;
    }
    const item = world
      .timeline(chat.serverId, chat.agentId)
      .find(
        (one) => one.id === id && (one.kind === "assistant_message" || one.kind === "user_message"),
      );
    if (!item || !("text" in item)) {
      return;
    }
    const current = chat;
    const started = world.reader.read(item.text, () => {
      if (chat === current && chat.reading === id) {
        chat.reading = null;
        unmuteAfterReading(current);
        paintChat();
      }
    });
    current.reading = started ? id : null;
    if (started) {
      muteForReading(current);
    }
    paintChat();
  };

  const toggleVoice = (): void => {
    if (!chat || chat.starting) {
      return;
    }
    const current = chat;
    current.problem = "";
    const { serverId, agentId } = current;
    if (world.voice().isVoiceMode) {
      void world.stopVoice().catch(() => {});
      return;
    }
    current.starting = true;
    void (async () => {
      // Подсказка раньше ответа: пока на телефоне висит диалог разрешения, экран машины
      // иначе показывал бы «Включаю…» без конца.
      const granted = await world.microphoneGranted().catch(() => true);
      if (!granted && chat === current) {
        current.problem = S.micDenied;
        paintChat();
      }
      try {
        await world.startVoice(serverId, agentId);
        if (chat === current) {
          current.problem = "";
        }
      } catch (error) {
        if (chat === current) {
          current.problem = reasonFor(error);
        }
      }
      current.starting = false;
      if (chat === current) {
        paintChat();
      }
    })();
  };

  const openChat = (serverId: string, agentId: string): void => {
    closeChat();
    const agent = world
      .data()
      .agents.find((one) => one.serverId === serverId && one.id === agentId);
    // Объявляем чат видимым до запроса таймлайна: подписка — единственный путь,
    // которым демон начинает присылать его сообщения.
    world.watchTimeline(serverId, agentId);
    const rows = messageRows(world.timeline(serverId, agentId));
    const header = statusOf();
    const { isVoiceMode, isMuted } = world.voice();
    const buttons = chatButtons({ voiceOn: isVoiceMode, muted: isMuted });
    const template = createChatTemplate({
      id: `chat-${++serial}`,
      title: agent ? chatTitleFor(agent) : S.chat,
      rows,
      header,
      voiceOn: isVoiceMode,
      muted: isMuted,
      onSpeak: readMessage,
      onMic: toggleVoice,
      onMute: () => world.toggleMute(),
      onBack: closeChat,
    });
    chat = {
      template,
      serverId,
      agentId,
      problem: "",
      reading: null,
      mutedForReading: false,
      starting: false,
      sections: JSON.stringify(chatSections(rows, header)),
      buttons: JSON.stringify(buttons),
    };
    stage.push(template);
  };

  const openWorkspace = (key: string): void => {
    closeChat();
    closeChats();
    const { agents, workspaces } = world.data();
    const rows = chatRows({ agents, workspaces, key });
    const known = new Map(workspaces.map((space) => [space.id, space]));
    const sample = agents.find((one) => projectKeyOf(one, known) === key);
    const template = createChatsTemplate({
      id: `chats-${++serial}`,
      title: sample ? projectNameOf(sample, workspaces) : S.rootTitle,
      rows,
      onPick: openChat,
      onBack: closeChats,
    });
    chats = { template, key, sections: JSON.stringify(chatsSections(rows)) };
    stage.push(template);
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
      paintChats();
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
      closeChat();
      closeChats();
      root?.template.destroy();
      root = null;
    },
  };
}
