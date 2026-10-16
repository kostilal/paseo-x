import type { ImageSourcePropType } from "react-native";

/**
 * Картинки строк. CarPlay не рисует пузыри сообщений — только системные строки с
 * картинкой слева; плашка в цвете автора — максимум, чем реплики агента и человека
 * можно различить взглядом.
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

export const BUBBLES = {
  agent: asset(() => require("./assets/bubble-agent.png") as ImageSourcePropType),
  you: asset(() => require("./assets/bubble-you.png") as ImageSourcePropType),
};
