import { CarPlay } from "@g4rb4g3/react-native-carplay";
import type { ListTemplate, VoiceControlTemplate } from "@g4rb4g3/react-native-carplay";

/** Подписка на подключение к машине. Возвращает функцию снятия. */
export function onCarPlayConnect(handler: () => void): () => void {
  const wrapped = () => handler();
  CarPlay.registerOnConnect(wrapped);
  return () => CarPlay.unregisterOnConnect(wrapped);
}

export function onCarPlayDisconnect(handler: () => void): () => void {
  const wrapped = () => handler();
  CarPlay.registerOnDisconnect(wrapped);
  return () => CarPlay.unregisterOnDisconnect(wrapped);
}

export const setRoot = (template: ListTemplate): void => CarPlay.setRootTemplate(template);
export const push = (template: ListTemplate): void => CarPlay.pushTemplate(template);
export const pop = (): void => CarPlay.popTemplate();
/** VoiceControlTemplate модальный: он накрывает экран чата и уходит, не трогая стек. */
export const present = (template: VoiceControlTemplate): void => CarPlay.presentTemplate(template);
export const dismiss = (): void => CarPlay.dismissTemplate();
