import * as Speech from "expo-speech";
import type { StreamItem } from "@/types/stream";

/**
 * Синтез на телефоне, а не голосом агента: демон озвучивает только новые ответы через
 * tool `speak`, «прочитай вот этот текст» протокол не умеет. Локальный синтез работает
 * и в машине по LTE, ценой того, что голос другой.
 */
export function speakMessage(input: {
  items: StreamItem[];
  id: string;
  speak?: (text: string, options?: Speech.SpeechOptions) => void;
  stop?: () => void;
}): boolean {
  const speak = input.speak ?? Speech.speak;
  const stop = input.stop ?? Speech.stop;
  const found = input.items.find(
    (item) =>
      item.id === input.id && (item.kind === "assistant_message" || item.kind === "user_message"),
  );
  if (!found || !("text" in found) || !found.text.trim()) {
    return false;
  }
  stop();
  speak(found.text, { language: "ru-RU" });
  return true;
}
