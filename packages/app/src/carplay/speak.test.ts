import { describe, expect, it, vi } from "vitest";
import { createReader, languageOf } from "@/carplay/speak";

describe("createReader", () => {
  it("не роняет приложение, если синтез недоступен", () => {
    const reader = createReader(() => null);
    expect(reader.read("Привет", () => {})).toBe(false);
    expect(() => reader.stop()).not.toThrow();
  });

  it("проговаривает текст и сообщает, когда закончил — сам, по остановке или по ошибке", () => {
    const speak = vi.fn();
    const reader = createReader(() => ({ speak, stop: vi.fn() }));
    const onEnd = vi.fn();
    expect(reader.read("Привет", onEnd)).toBe(true);
    const options = speak.mock.calls[0]?.[1] as {
      language: string;
      onDone(): void;
      onStopped(): void;
      onError(): void;
    };
    expect(speak.mock.calls[0]?.[0]).toBe("Привет");
    options.onDone();
    options.onStopped();
    options.onError();
    expect(onEnd).toHaveBeenCalledTimes(3);
  });

  it("новое чтение прерывает предыдущее", () => {
    const stop = vi.fn();
    const reader = createReader(() => ({ speak: vi.fn(), stop }));
    reader.read("раз", () => {});
    reader.read("два", () => {});
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("пустой текст не читает", () => {
    const speak = vi.fn();
    const reader = createReader(() => ({ speak, stop: vi.fn() }));
    expect(reader.read("   ", () => {})).toBe(false);
    expect(speak).not.toHaveBeenCalled();
  });

  it("упавший синтез — неудобство, а не падение за рулём", () => {
    const reader = createReader(() => ({
      speak: () => {
        throw new Error("нет голоса");
      },
      stop: vi.fn(),
    }));
    expect(reader.read("Привет", () => {})).toBe(false);
  });
});

describe("languageOf", () => {
  it("кириллица читается русским голосом, остальное — английским", () => {
    expect(languageOf("Собираю билд")).toBe("ru-RU");
    expect(languageOf("Build succeeded")).toBe("en-US");
  });
});
