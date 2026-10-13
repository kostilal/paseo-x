import type { StreamItem } from "@/types/stream";

interface Speaker {
  speak(text: string, options?: { language?: string }): void;
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

/**
 * Синтез на телефоне, а не голосом агента: демон озвучивает только новые ответы через
 * tool `speak`, «прочитай вот этот текст» протокол не умеет. Локальный синтез работает
 * и в машине по LTE, ценой того, что голос другой.
 */
export function speakMessage(input: {
  items: StreamItem[];
  id: string;
  speak?: (text: string, options?: { language?: string }) => void;
  stop?: () => void;
}): boolean {
  const found = input.items.find(
    (item) =>
      item.id === input.id && (item.kind === "assistant_message" || item.kind === "user_message"),
  );
  if (!found || !("text" in found) || !found.text.trim()) {
    return false;
  }

  const speaker = input.speak && input.stop ? null : loadSpeaker();
  const speak = input.speak ?? speaker?.speak.bind(speaker);
  const stop = input.stop ?? speaker?.stop.bind(speaker);
  if (!speak || !stop) {
    return false;
  }

  // Непроговорённая строка — это неудобство; упавшее приложение за рулём — нет.
  try {
    stop();
    speak(found.text, { language: "ru-RU" });
    return true;
  } catch {
    return false;
  }
}
