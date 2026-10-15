import type { ListItem, ListSection } from "@g4rb4g3/react-native-carplay";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { S } from "./strings";
import { shortAgo } from "./time";

const SEP = "::";

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

type Bucket = "needYou" | "working" | "ready";

/** Что сейчас с чатом. От этого зависит и секция, и первое слово подзаголовка. */
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

/** Имя рабочего пространства: своё, иначе последний сегмент рабочей папки. */
function workspaceOf(one: Agent, known: Map<string, WorkspaceDescriptor>): string {
  const descriptor = one.workspaceId ? known.get(one.workspaceId) : undefined;
  const named = descriptor?.title?.trim() || descriptor?.name || descriptor?.projectDisplayName;
  return named || one.cwd.split("/").filter(Boolean).findLast(Boolean) || one.id;
}

/** Одно слово, которым чаты одного пространства отличаются друг от друга. */
function tagOf(one: Agent): string {
  const first = topicOf(one)
    .split(" ")
    .find((word) => word.length > 2);
  return first ? first.toLowerCase().replace(/[.,!?:;]+$/, "") : "";
}

/** Что именно просит разрешить — название действия, иначе имя инструмента. */
function permissionOf(one: Agent): string {
  const first = one.pendingPermissions[0];
  return first?.title?.trim() || first?.name || "действие";
}

function detailOf(one: Agent, state: Bucket, now: Date): string {
  const topic = topicOf(one);
  if (state === "needYou") {
    const head =
      one.attentionReason === "permission"
        ? `${S.awaitingPermission} · ${permissionOf(one)}`
        : `${S.awaitingReply}${topic ? ` · ${topic}` : ""}`;
    return head;
  }
  if (state === "working") {
    return topic ? `${S.busy} · ${topic}` : S.busy;
  }
  const when = shortAgo(one.lastActivityAt, now);
  return topic ? `${when} · ${topic}` : when;
}

/** В списке только настоящие чаты: архивные скрыты, субагенты — шаги задачи. */
const isChat = (one: Agent): boolean => !one.archivedAt && !one.parentAgentId;

const byFreshness = (a: Agent, b: Agent): number =>
  b.lastActivityAt.getTime() - a.lastActivityAt.getTime();

/**
 * Секции — по состоянию чата, а не по рабочим пространствам: за рулём первый вопрос
 * «что меня ждёт», а не «где это лежит». Девять пространств на десять чатов давали
 * девять заголовков по одной строке — список, который невозможно охватить взглядом.
 *
 * Заголовок строки — пространство, потому что первая фраза переписки у всех чатов
 * похожа («привет, мне нужно чтобы ты…») и за рулём не различается. Если в одном
 * пространстве несколько чатов, к нему добавляется различающее слово из темы.
 */
/**
 * Заголовок для экрана чата — тот же, что в строке списка, чтобы человек узнал место,
 * куда провалился.
 */
export function chatTitleFor(input: {
  agent: Agent;
  agents: Agent[];
  workspaces: WorkspaceDescriptor[];
}): string {
  const known = new Map(input.workspaces.map((one) => [one.id, one]));
  const name = workspaceOf(input.agent, known);
  const sameName = input.agents.filter(
    (one) => isChat(one) && workspaceOf(one, known) === name,
  ).length;
  const tag = sameName > 1 ? tagOf(input.agent) : "";
  return tag ? `${name} · ${tag}` : name;
}

export function buildAgentSections(input: {
  agents: Agent[];
  workspaces: WorkspaceDescriptor[];
  now?: Date;
}): ListSection[] {
  const now = input.now ?? new Date();
  const known = new Map(input.workspaces.map((one) => [one.id, one]));
  const chats = input.agents.filter(isChat);

  const crowded = new Set<string>();
  const seen = new Map<string, number>();
  for (const one of chats) {
    const name = workspaceOf(one, known);
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (count > 1) {
      crowded.add(name);
    }
  }

  const rowOf = (one: Agent): ListItem => {
    const name = workspaceOf(one, known);
    const tag = crowded.has(name) ? tagOf(one) : "";
    const state = stateOf(one);
    return {
      id: agentRowId(one.serverId, one.id),
      text: tag ? `${name} · ${tag}` : name,
      detailText: detailOf(one, state, now),
      showsDisclosureIndicator: true,
    };
  };

  const buckets: { key: Bucket; header: string }[] = [
    { key: "needYou", header: S.needYou },
    { key: "working", header: S.working },
    { key: "ready", header: S.ready },
  ];

  const sections: ListSection[] = [];
  for (const bucket of buckets) {
    const items = chats.filter((one) => stateOf(one) === bucket.key).sort(byFreshness);
    if (items.length) {
      sections.push({ header: bucket.header, items: items.map(rowOf) });
    }
  }
  return sections;
}
