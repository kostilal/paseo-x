export interface Speaker {
  speak(text: string, options?: Record<string, unknown>): void;
  stop(): unknown;
}

/** Чтение сообщения вслух голосом телефона. `onEnd` — когда замолчал, по любой причине. */
export interface Reader {
  read(text: string, onEnd: () => void): boolean;
  stop(): void;
}

/**
 * Модуль берётся лениво и только при первом проговаривании. Статический импорт здесь
 * уже стоил падения на старте: `expo-speech` встал версией под другой SDK, нативная
 * часть не слинковалась, и необработанное исключение на уровне модуля убивало всё
 * приложение — не только эту кнопку.
 */
function loadSpeaker(): Speaker | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-speech") as Speaker;
  } catch {
    return null;
  }
}

/** Кириллица — русским голосом, остальное — английским: русский голос читает латиницу по буквам. */
export const languageOf = (text: string): "ru-RU" | "en-US" =>
  /[а-яёіїє]/i.test(text) ? "ru-RU" : "en-US";

/**
 * Синтез на телефоне, а не голосом агента: демон озвучивает только новые ответы через
 * tool `speak`, «прочитай вот этот текст» протокол не умеет. Локальный синтез работает
 * и в машине по LTE, ценой того, что голос другой.
 */
export function createReader(load: () => Speaker | null = loadSpeaker): Reader {
  let speaker: Speaker | null | undefined;
  const get = (): Speaker | null => {
    if (speaker === undefined) {
      speaker = load();
    }
    return speaker;
  };
  const quietStop = (one: Speaker): void => {
    try {
      void Promise.resolve(one.stop()).catch(() => {});
    } catch {
      // Непрерванное чтение — неудобство; упавшее приложение за рулём — нет.
    }
  };

  return {
    read(text, onEnd) {
      const trimmed = text.trim();
      const one = get();
      if (!trimmed || !one) {
        return false;
      }
      try {
        quietStop(one);
        one.speak(trimmed, {
          language: languageOf(trimmed),
          onDone: onEnd,
          onStopped: onEnd,
          onError: onEnd,
        });
        return true;
      } catch {
        return false;
      }
    },

    stop() {
      const one = get();
      if (one) {
        quietStop(one);
      }
    },
  };
}
