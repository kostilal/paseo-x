import { describe, expect, it, vi } from "vitest";
import type { StreamItem } from "@/types/stream";
import { speakMessage } from "@/carplay/speak";

// Нативный модуль: в node-окружении его импорт не поднимется.
vi.mock("expo-speech", () => ({ speak: vi.fn(), stop: vi.fn() }));

const message = (id: string, text: string): StreamItem =>
  ({ kind: "assistant_message", id, text, timestamp: new Date() }) as StreamItem;

describe("speakMessage", () => {
  it("проговаривает полный текст, а не обрезанный заголовок", () => {
    const speak = vi.fn();
    const long = "а".repeat(200);
    const ok = speakMessage({ items: [message("m1", long)], id: "m1", speak, stop: () => {} });
    expect(ok).toBe(true);
    expect(speak).toHaveBeenCalledWith(long, expect.objectContaining({ language: "ru-RU" }));
  });

  it("прерывает предыдущее проговаривание", () => {
    const stop = vi.fn();
    speakMessage({ items: [message("m1", "раз")], id: "m1", speak: () => {}, stop });
    expect(stop).toHaveBeenCalledOnce();
  });

  it("на неизвестный id ничего не делает", () => {
    const speak = vi.fn();
    const ok = speakMessage({ items: [message("m1", "раз")], id: "нет", speak, stop: () => {} });
    expect(ok).toBe(false);
    expect(speak).not.toHaveBeenCalled();
  });

  it("пустое сообщение не проговаривает", () => {
    const speak = vi.fn();
    const ok = speakMessage({ items: [message("m1", "   ")], id: "m1", speak, stop: () => {} });
    expect(ok).toBe(false);
    expect(speak).not.toHaveBeenCalled();
  });
});
