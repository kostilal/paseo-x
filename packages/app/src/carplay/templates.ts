import type { ListItem } from "@g4rb4g3/react-native-carplay";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { chatCount, S } from "./strings";
import { shortAgo } from "./time";

const SEP = "::";
const TITLE_LIMIT = 40;

export const agentRowId = (serverId: string, agentId: string): string =>
  `${serverId}${SEP}${agentId}`;

export function parseAgentRowId(id: string): { serverId: string; agentId: string } | null {
  const at = id.indexOf(SEP);
  if (at <= 0) {
    return null;
  }
  const serverId = id.slice(0, at);
  const agentId = id.slice(at + SEP.length);
  return agentId ? { serverId, agentId } : null;
}

type Known = Map<string, WorkspaceDescriptor>;

const knownOf = (workspaces: WorkspaceDescriptor[]): Known =>
  new Map(workspaces.map((space) => [space.id, space]));

const descriptorOf = (one: Agent, known: Known): WorkspaceDescriptor | undefined =>
  one.workspaceId ? known.get(one.workspaceId) : undefined;

/**
 * Чем один экран списка чатов отличается от другого: хост и проект. Группируем по
 * проекту, а не по рабочему пространству: у человека пространство — это один чат
 * (ворктри под задачу), и список пространств повторял бы список чатов, только с
 * авто-заголовками вроде «продолжай» вместо названия проекта.
 */
export function projectKeyOf(one: Agent, known: Known): string {
  const descriptor = descriptorOf(one, known);
  return `${one.serverId}${SEP}${descriptor?.projectId ?? one.workspaceId ?? one.cwd}`;
}

type Bucket = "needYou" | "working" | "ready";

/** Что сейчас с чатом. От этого зависит подзаголовок и что проект говорит о себе. */
function stateOf(one: Agent): Bucket {
  if (one.requiresAttention) {
    return "needYou";
  }
  return one.turn.phase === "open" ? "working" : "ready";
}

const GREETING = /^(привет|здравствуй(те)?|hi|hello|hey)[\s,!—-]*/i;

/**
 * Тема чата. Поля для неё в протоколе нет, поэтому берём первую фразу и чистим:
 * приветствие, разметку и ссылки, от которых за рулём нет никакой пользы.
 */
function topicOf(one: Agent): string {
  const raw = (one.title ?? "").trim();
  if (!raw) {
    return "";
  }
  return raw
    .replace(GREETING, "")
    .replace(/https?:\/\/\S+/g, "ссылка")
    .replace(/[`*_#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Имя проекта: своё, иначе последний сегмент рабочей папки. */
function nameOf(one: Agent, known: Known): string {
  const descriptor = descriptorOf(one, known);
  const named = descriptor?.projectDisplayName?.trim() || descriptor?.name?.trim();
  return named || one.cwd.split("/").filter(Boolean).findLast(Boolean) || one.id;
}

export function projectNameOf(one: Agent, workspaces: WorkspaceDescriptor[]): string {
  return nameOf(one, knownOf(workspaces));
}

/** Заголовок экрана чата: тема, обрезанная до того, что влезает в навбар. */
export function chatTitleFor(one: Agent): string {
  const topic = topicOf(one);
  if (!topic) {
    return S.chat;
  }
  return topic.length > TITLE_LIMIT ? `${topic.slice(0, TITLE_LIMIT)}…` : topic;
}

/** Что именно просит разрешить — название действия, иначе имя инструмента. */
function permissionOf(one: Agent): string {
  const first = one.pendingPermissions[0];
  return first?.title?.trim() || first?.name || "действие";
}

function stateDetail(one: Agent, now: Date): string {
  const state = stateOf(one);
  if (state === "needYou") {
    return one.attentionReason === "permission"
      ? `${S.awaitingPermission} · ${permissionOf(one)}`
      : S.awaitingReply;
  }
  if (state === "working") {
    return S.busy;
  }
  return shortAgo(one.lastActivityAt, now);
}

/** В списках только настоящие чаты: архивные скрыты, субагенты — шаги задачи. */
const isChat = (one: Agent): boolean => !one.archivedAt && !one.parentAgentId;

const byFreshness = (a: Agent, b: Agent): number =>
  b.lastActivityAt.getTime() - a.lastActivityAt.getTime();

/**
 * Первый экран: проекты, в которых есть чаты. Пустой проект в машине бесполезен —
 * завести чат оттуда нельзя, — поэтому его нет в списке. Подзаголовок говорит,
 * сколько чатов и что самое важное среди них: ждёт ли кто-то человека, работает ли
 * кто-то, иначе — когда было последнее сообщение.
 */
export function projectRows(input: {
  agents: Agent[];
  workspaces: WorkspaceDescriptor[];
  now?: Date;
}): ListItem[] {
  const now = input.now ?? new Date();
  const known = knownOf(input.workspaces);
  const groups = new Map<string, Agent[]>();
  for (const one of input.agents.filter(isChat)) {
    const key = projectKeyOf(one, known);
    groups.set(key, [...(groups.get(key) ?? []), one]);
  }

  const rows: { newest: Agent; item: ListItem }[] = [];
  for (const [key, chats] of groups) {
    chats.sort(byFreshness);
    const newest = chats[0];
    if (!newest) {
      continue;
    }
    const needYou = chats.find((one) => stateOf(one) === "needYou");
    const working = chats.find((one) => stateOf(one) === "working");
    let summary = shortAgo(newest.lastActivityAt, now);
    if (needYou) {
      summary = needYou.attentionReason === "permission" ? S.awaitingPermission : S.awaitingReply;
    } else if (working) {
      summary = S.busy;
    }
    rows.push({
      newest,
      item: {
        id: key,
        text: nameOf(newest, known),
        detailText: `${chatCount(chats.length)} · ${summary}`,
        showsDisclosureIndicator: true,
      },
    });
  }
  rows.sort((a, b) => byFreshness(a.newest, b.newest));
  return rows.map((row) => row.item);
}

/** Второй экран: чаты одного проекта, новые сверху, состояние — в подзаголовке. */
export function chatRows(input: {
  agents: Agent[];
  workspaces: WorkspaceDescriptor[];
  key: string;
  now?: Date;
}): ListItem[] {
  const now = input.now ?? new Date();
  const known = knownOf(input.workspaces);
  return input.agents
    .filter((one) => isChat(one) && projectKeyOf(one, known) === input.key)
    .sort(byFreshness)
    .map((one) => ({
      id: agentRowId(one.serverId, one.id),
      text: topicOf(one) || S.chat,
      detailText: stateDetail(one, now),
      showsDisclosureIndicator: true,
    }));
}
