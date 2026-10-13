import { describe, expect, it, vi } from "vitest";
import { shouldShowVoice } from "@/carplay/voice-screen";

vi.mock("@g4rb4g3/react-native-carplay", () => ({
  VoiceControlTemplate: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  },
}));

describe("shouldShowVoice", () => {
  it("показывает, пока человек действительно говорит", () => {
    expect(shouldShowVoice({ phase: "listening", isSpeaking: true, muted: false })).toBe(true);
  });

  it("не показывает в тишине: иначе шаблон висит всю поездку и прячет mute", () => {
    expect(shouldShowVoice({ phase: "listening", isSpeaking: false, muted: false })).toBe(false);
  });

  it("не показывает, когда говорит агент", () => {
    expect(shouldShowVoice({ phase: "playing", isSpeaking: true, muted: false })).toBe(false);
  });

  it("не показывает при включённом mute", () => {
    expect(shouldShowVoice({ phase: "listening", isSpeaking: true, muted: true })).toBe(false);
  });
});
