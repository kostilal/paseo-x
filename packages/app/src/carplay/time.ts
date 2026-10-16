const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const dayOf = (when: Date): string => `${when.getFullYear()}-${when.getMonth()}-${when.getDate()}`;

/** «12 окт» — день и месяц, когда уже не важно, сколько именно дней прошло. */
const calendar = (when: Date): string => `${when.getDate()} ${MONTHS[when.getMonth()]}`;

const clock = (when: Date): string =>
  `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;

/**
 * Короткая подпись времени для строки на экране машины: смысл должен попасть в пару
 * символов, потому что хвост подзаголовка система всё равно режет по ширине.
 * «сейчас · 5 мин · 2 ч · вчера · 3 дня · 12 окт».
 */
export function shortAgo(when: Date, now: Date = new Date()): string {
  const passed = now.getTime() - when.getTime();
  if (passed < MINUTE) {
    return "сейчас";
  }
  if (passed < HOUR) {
    return `${Math.floor(passed / MINUTE)} мин`;
  }
  if (passed < DAY) {
    return `${Math.floor(passed / HOUR)} ч`;
  }
  const days = Math.floor(passed / DAY);
  if (days === 1) {
    return "вчера";
  }
  if (days < 7) {
    return `${days} ${days < 5 ? "дня" : "дней"}`;
  }
  return calendar(when);
}

/** Когда чат начался, для чата без темы: «14:20», «вчера, 18:40», «12 окт». */
export function clockOf(when: Date, now: Date = new Date()): string {
  if (dayOf(when) === dayOf(now)) {
    return clock(when);
  }
  if (dayOf(when) === dayOf(new Date(now.getTime() - DAY))) {
    return `вчера, ${clock(when)}`;
  }
  return calendar(when);
}
