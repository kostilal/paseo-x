import { describe, expect, it } from "vitest";
import { clockOf, shortAgo } from "@/carplay/time";

// Полдень по местному времени: календарные проверки не зависят от часового пояса.
const now = new Date(2026, 9, 15, 12, 0, 0);
const at = (ms: number) => new Date(now.getTime() - ms);

describe("shortAgo", () => {
  it("свежее минуты — «сейчас»", () => {
    expect(shortAgo(at(20_000), now)).toBe("сейчас");
  });

  it("минуты до часа", () => {
    expect(shortAgo(at(60_000), now)).toBe("1 мин");
    expect(shortAgo(at(25 * 60_000), now)).toBe("25 мин");
  });

  it("часы до суток", () => {
    expect(shortAgo(at(2 * 3600_000), now)).toBe("2 ч");
    expect(shortAgo(at(23 * 3600_000), now)).toBe("23 ч");
  });

  it("сутки — «вчера», дальше в днях, с недели — дата", () => {
    expect(shortAgo(at(25 * 3600_000), now)).toBe("вчера");
    expect(shortAgo(at(3 * 24 * 3600_000), now)).toBe("3 дня");
    expect(shortAgo(at(5 * 24 * 3600_000), now)).toBe("5 дней");
    expect(shortAgo(at(9 * 24 * 3600_000), now)).toBe("6 окт");
  });

  it("время из будущего не ломает подпись", () => {
    expect(shortAgo(at(-5000), now)).toBe("сейчас");
  });
});

describe("clockOf", () => {
  it("сегодня — только часы и минуты", () => {
    expect(clockOf(new Date(2026, 9, 15, 9, 5), now)).toBe("09:05");
  });

  it("вчера — со словом", () => {
    expect(clockOf(new Date(2026, 9, 14, 18, 40), now)).toBe("вчера, 18:40");
  });

  it("раньше — дата", () => {
    expect(clockOf(new Date(2026, 9, 2, 18, 40), now)).toBe("2 окт");
  });
});
