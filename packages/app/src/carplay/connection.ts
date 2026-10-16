import { CarPlay } from "@g4rb4g3/react-native-carplay";
import type { BarButton, ListTemplate, VoiceControlTemplate } from "@g4rb4g3/react-native-carplay";
import { Image } from "react-native";

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

/**
 * Подписи кнопок навбара после показа. Класс `ListTemplate` этого не умеет, но нативный
 * модуль экспортирует `updateListTemplate`, который заново ставит кнопки — с теми же id,
 * так что обработчик `onBarButtonPressed` продолжает их получать.
 */
export const updateButtons = (template: ListTemplate, buttons: BarButton[]): void => {
  const bridge = CarPlay.bridge as unknown as {
    updateListTemplate?: (templateId: string, config: unknown) => void;
  };
  // При создании шаблона картинки разворачивает библиотека (`parseConfig`); здесь мы
  // идём к мосту напрямую, и без `resolveAssetSource` нативная сторона получает номер
  // ассета вместо пути — кнопка рисуется пустой пилюлей.
  const resolved = buttons.map((button) =>
    button.type === "image" ? { ...button, image: Image.resolveAssetSource(button.image) } : button,
  );
  bridge.updateListTemplate?.(template.id, { trailingNavigationBarButtons: resolved });
};
