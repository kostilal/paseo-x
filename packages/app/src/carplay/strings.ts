export const S = {
  rootTitle: "Paseo X",
  // Пустые состояния: на экране машины молчаливая пустота неотличима от поломки.
  noConnection: "Нет связи с компьютером",
  noConnectionHint: "Открой Paseo на компьютере",
  noAgents: "Чатов пока нет",
  chat: "Чат",
  // Состояние идёт первым в подзаголовке: смысл должен попасть в первые символы,
  // хвост система режет по ширине экрана.
  awaitingReply: "Ждёт ответа",
  awaitingPermission: "Нужно разрешение",
  busy: "Работает",
  // Кнопки экрана чата. Подпись меняется вместе с состоянием через нативный мост.
  voiceButton: "Голос",
  voiceOff: "Стоп",
  mute: "Mute",
  unmute: "Звук",
  // Шапка секции сообщений — единственное место, где живёт состояние голоса.
  micOff: "Микрофон выключен",
  micDenied: "Разреши микрофон на телефоне",
  voiceTaken: "Голос уже включён на другом устройстве",
  voiceFailed: "Голос не включился",
  starting: "Включаю…",
  listening: "Слушаю…",
  thinking: "Думаю…",
  speaking: "Говорю…",
  idle: "Готов",
  agent: "Агент",
  you: "Ты",
  noMessages: "Сообщений пока нет",
} as const;

/** «1 чат», «2 чата», «5 чатов» — по правилам русского счёта. */
export function chatCount(n: number): string {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) {
    return `${n} чатов`;
  }
  if (last === 1) {
    return `${n} чат`;
  }
  if (last >= 2 && last <= 4) {
    return `${n} чата`;
  }
  return `${n} чатов`;
}
