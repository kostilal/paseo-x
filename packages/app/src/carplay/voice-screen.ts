import { VoiceControlTemplate } from "@g4rb4g3/react-native-carplay";
import { S } from "./strings";

/**
 * Модальный шаблон поднимается только на время собственной речи: если держать его
 * всю поездку, он накроет экран чата, а вместе с ним кнопку mute — единственную,
 * которая нужна, когда поворачиваешься к пассажиру.
 */
export function createVoiceTemplate(): VoiceControlTemplate {
  return new VoiceControlTemplate({
    voiceControlStates: [{ identifier: "listening", titleVariants: [S.listening], repeats: true }],
  });
}

export function shouldShowVoice(input: {
  phase: string;
  isSpeaking: boolean;
  muted: boolean;
}): boolean {
  return input.phase === "listening" && input.isSpeaking && !input.muted;
}
