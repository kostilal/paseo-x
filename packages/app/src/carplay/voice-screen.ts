import { VoiceControlTemplate } from "@g4rb4g3/react-native-carplay";
import type { VoiceControlState } from "@g4rb4g3/react-native-carplay";
import type { ImageSourcePropType } from "react-native";
import { LISTENING } from "./images";
import { S } from "./strings";

/** Один оборот анимации: точка дышит, кольца расходятся. */
const CYCLE_SECONDS = 1;

/**
 * Кадры для нативной стороны. Библиотека сама разворачивает только поле `image`;
 * массив кадров разворачиваем здесь, тем же `resolveAssetSource`, что и она.
 */
function frames(): ImageSourcePropType[] {
  if (LISTENING.length === 0) {
    return [];
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image } = require("react-native") as typeof import("react-native");
    return LISTENING.map((frame) => Image.resolveAssetSource(frame));
  } catch {
    return [];
  }
}

/**
 * Модальный шаблон поднимается только на время собственной речи: если держать его
 * всю поездку, он накроет экран чата, а вместе с ним кнопку mute — единственную,
 * которая нужна, когда поворачиваешься к пассажиру.
 *
 * Анимированная картинка (`images` + `duration`) — наша правка библиотеки, см.
 * `scripts/patch-carplay-pod.mjs`; штатно она принимает один кадр.
 */
export function createVoiceTemplate(): VoiceControlTemplate {
  const animated = frames();
  const state: VoiceControlState & { images?: ImageSourcePropType[]; duration?: number } = {
    identifier: "listening",
    titleVariants: [S.listening],
    repeats: true,
    ...(animated.length ? { images: animated, duration: CYCLE_SECONDS } : {}),
  };
  return new VoiceControlTemplate({ voiceControlStates: [state] });
}

export function shouldShowVoice(input: {
  phase: string;
  isSpeaking: boolean;
  muted: boolean;
}): boolean {
  return input.phase === "listening" && input.isSpeaking && !input.muted;
}
