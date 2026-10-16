import type { ImageSourcePropType } from "react-native";

/**
 * Картинки строк и кнопок. CarPlay не рисует произвольный интерфейс — только системные
 * строки с картинкой слева и кнопки навбара с глифом; всё, что в этом интерфейсе
 * «дизайн», живёт в этих PNG (дизайн-хэндофф v2, `assets/`).
 *
 * `require` под try: в тестах без Metro картинки нет, и строка просто идёт без неё.
 */
function asset(load: () => ImageSourcePropType): ImageSourcePropType | undefined {
  try {
    return load();
  } catch {
    return undefined;
  }
}

/** Плашки автора сообщения: квадрат с ромбом — агент, круг с силуэтом — человек. */
export const AUTHORS = {
  agent: asset(() => require("./assets/author_agent.png") as ImageSourcePropType),
  /** Агент задал вопрос и ждёт — тот же оранжевый, что «нужен ты» в списках. */
  agentAsk: asset(() => require("./assets/author_agent-ask.png") as ImageSourcePropType),
  human: asset(() => require("./assets/author_human.png") as ImageSourcePropType),
};

/** Значки состояния чата: «?» ждёт ответа, «!» нужно разрешение, точки — работает, галочка — готово. */
export const STATES = {
  needReply: asset(() => require("./assets/state_need-reply.png") as ImageSourcePropType),
  needPerm: asset(() => require("./assets/state_need-perm.png") as ImageSourcePropType),
  work: asset(() => require("./assets/state_work.png") as ImageSourcePropType),
  ready: asset(() => require("./assets/state_ready.png") as ImageSourcePropType),
};

/** Глифы кнопок навбара: монохромные, система тонирует их сама. */
export const NAV = {
  wave: asset(() => require("./assets/nav_wave.png") as ImageSourcePropType),
  stop: asset(() => require("./assets/nav_stop.png") as ImageSourcePropType),
  mic: asset(() => require("./assets/nav_mic.png") as ImageSourcePropType),
  micOff: asset(() => require("./assets/nav_micoff.png") as ImageSourcePropType),
};

/** Кадры анимации прослушивания: точка дышит, кольца расходятся; цикл в секунду. */
export const LISTENING: ImageSourcePropType[] = [
  asset(() => require("./assets/listening_00.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_01.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_02.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_03.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_04.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_05.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_06.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_07.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_08.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_09.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_10.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_11.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_12.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_13.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_14.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_15.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_16.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_17.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_18.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_19.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_20.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_21.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_22.png") as ImageSourcePropType),
  asset(() => require("./assets/listening_23.png") as ImageSourcePropType),
].filter((frame): frame is ImageSourcePropType => frame !== undefined);
