import { describe, expect, it } from "vitest";
import { shortAgo } from "@/carplay/time";

const at = (ms: number) => new Date(Date.UTC(2026, 9, 15, 12, 0, 0) - ms);
const now = new Date(Date.UTC(2026, 9, 15, 12, 0, 0));

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

  it("сутки — «вчера», дальше в днях", () => {
    expect(shortAgo(at(25 * 3600_000), now)).toBe("вчера");
    expect(shortAgo(at(3 * 24 * 3600_000), now)).toBe("3 дн");
  });

  it("время из будущего не ломает подпись", () => {
    expect(shortAgo(at(-5000), now)).toBe("сейчас");
  });
});
