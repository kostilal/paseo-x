const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Короткая подпись времени для строки на экране машины: смысл должен попасть в пару
 * символов, потому что хвост подзаголовка система всё равно режет по ширине.
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
  return days === 1 ? "вчера" : `${days} дн`;
}
