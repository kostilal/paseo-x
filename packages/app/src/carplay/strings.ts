export const S = {
  rootTitle: "Paseo X",
  // Пустые состояния: на экране машины молчаливая пустота неотличима от поломки.
  noConnection: "Нет связи с компьютером",
  noConnectionHint: "Открой Paseo на компьютере",
  noProjects: "Проектов пока нет",
  noAgents: "Чатов пока нет",
  startOnDesktop: "Начни чат в Paseo на компьютере",
  noMessages: "Сообщений пока нет",
  noMessagesHint: "Включи голос и скажи задачу",
  chat: "Чат",
  chatFrom: "Чат от",
  // Состояние идёт первым в подзаголовке: смысл должен попасть в первые символы,
  // хвост система режет по ширине экрана.
  awaitingReply: "Ждёт ответа",
  awaitingPermission: "Нужно разрешение",
  busy: "Работает",
  // Кнопки экрана чата — глифы; слова остаются на случай, если картинка не загрузилась.
  voiceButton: "Говорить",
  voiceOff: "Стоп",
  mute: "Пауза",
  unmute: "Слушай",
  // Шапка секции сообщений — единственное место, где живёт состояние голоса.
  micOff: "Микрофон выключен",
  micDenied: "Нет доступа к микрофону · разреши на телефоне",
  voiceTaken: "Голос занят другим устройством",
  voiceFailed: "Голос не включился · нажми ещё раз",
  starting: "Включаю…",
  listening: "Слушаю…",
  thinking: "Думаю…",
  speaking: "Говорю…",
  idle: "Готов",
  agent: "Агент",
  agentAsks: "Агент спрашивает",
  you: "Ты",
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

/** «2 ждут тебя», «21 ждёт тебя» — когда в проекте человека ждёт не один чат. */
export function waitingCount(n: number): string {
  const one = n % 10 === 1 && n % 100 !== 11;
  return `${n} ${one ? "ждёт" : "ждут"} тебя`;
}
