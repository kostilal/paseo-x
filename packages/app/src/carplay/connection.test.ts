import { describe, expect, it, vi } from "vitest";

const updateListTemplate = vi.fn();

vi.mock("@g4rb4g3/react-native-carplay", () => ({
  CarPlay: { bridge: { updateListTemplate } },
}));

vi.mock("react-native", () => ({
  Image: {
    resolveAssetSource: (source: number) => ({
      uri: `asset-${source}.png`,
      scale: 3,
      width: 28,
      height: 28,
    }),
  },
}));

const { updateButtons } = await import("@/carplay/connection");

describe("updateButtons", () => {
  it("картинки кнопок уходят в нативную сторону развёрнутыми — номер ассета она не понимает", () => {
    updateButtons({ id: "chat-1" } as never, [
      { id: "voice", type: "image", image: 7 as never },
      { id: "mute", type: "text", title: "Пауза" },
    ]);
    expect(updateListTemplate).toHaveBeenCalledWith("chat-1", {
      trailingNavigationBarButtons: [
        {
          id: "voice",
          type: "image",
          image: { uri: "asset-7.png", scale: 3, width: 28, height: 28 },
        },
        { id: "mute", type: "text", title: "Пауза" },
      ],
    });
  });
});
