import type { ListItem } from "@g4rb4g3/react-native-carplay";
import type { ImageSourcePropType } from "react-native";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { STATES } from "./images";
import { projectPlate, type ProjectState } from "./plates";
import { chatCount, S, waitingCount } from "./strings";
import { clockOf, shortAgo } from "./time";

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
/** Первая фраза, которая темой быть не может: команда продолжать, согласие, междометие. */
const SERVICE = /^(продолжай|продолжаем|ок|окей|ok|да|нет|давай|го|погнали|дальше|ну|так)$/i;

/**
 * Тема чата. Поля для неё в протоколе нет, поэтому берём первую фразу и чистим:
 * приветствие, разметку и ссылки, от которых за рулём нет никакой пользы. Короткая
 * или служебная фраза темой не считается.
 */
function topicOf(one: Agent): string {
  const raw = (one.title ?? "").trim();
  if (!raw) {
    return "";
  }
  const cleaned = raw
    .replace(GREETING, "")
    .replace(/https?:\/\/\S+/g, "ссылка")
    .replace(/[`*_#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length < 3 || SERVICE.test(cleaned.replace(/[.,!?…]+$/, ""))) {
    return "";
  }
  return cleaned;
}

/** Название чата для строки и навбара: тема, иначе — когда он начался. */
function chatNameOf(one: Agent, now: Date): string {
  return topicOf(one) || `${S.chatFrom} ${clockOf(one.createdAt, now)}`;
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

/** Служебные слова внутри имени, которые в инициалы не идут: JobByJobs → JJ, не JB. */
const CONNECTORS = new Set(["by", "of", "the", "and", "for", "to", "de", "и", "для"]);

/**
 * Две заглавные буквы для плашки: первые буквы двух первых слов, где слово отделяется
 * пробелом, дефисом, подчёркиванием или заглавной внутри CamelCase (SmartDrive → SD,
 * military-wasp → MW, JobByJobs → JJ); одно слово — первые две буквы (Prom → PR).
 */
export function initialsOf(name: string): string {
  const parts = name
    .replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, "$1 $2")
    .split(/[\s_\-./]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const meaningful = parts.filter((word) => !CONNECTORS.has(word.toLowerCase()));
  const words = meaningful.length >= 2 ? meaningful : parts;
  const letters =
    words.length >= 2
      ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
      : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "··";
}

/** Заголовок экрана чата: тема, обрезанная до того, что влезает в навбар. */
export function chatTitleFor(one: Agent, now: Date = new Date()): string {
  const name = chatNameOf(one, now);
  return name.length > TITLE_LIMIT ? `${name.slice(0, TITLE_LIMIT)}…` : name;
}

/** Что именно просит разрешить — название действия, иначе имя инструмента. */
function permissionOf(one: Agent): string {
  const first = one.pendingPermissions[0];
  return first?.title?.trim() || first?.name || "действие";
}

const isPermission = (one: Agent): boolean => one.attentionReason === "permission";

function stateDetail(one: Agent, now: Date): string {
  const state = stateOf(one);
  if (state === "needYou") {
    return isPermission(one) ? `${S.awaitingPermission} · ${permissionOf(one)}` : S.awaitingReply;
  }
  if (state === "working") {
    return S.busy;
  }
  return shortAgo(one.lastActivityAt, now);
}

function stateImage(one: Agent): ImageSourcePropType | undefined {
  const state = stateOf(one);
  if (state === "needYou") {
    return isPermission(one) ? STATES.needPerm : STATES.needReply;
  }
  return state === "working" ? STATES.work : STATES.ready;
}

/** В списках только настоящие чаты: архивные скрыты, субагенты — шаги задачи. */
const isChat = (one: Agent): boolean => !one.archivedAt && !one.parentAgentId;

const byFreshness = (a: Agent, b: Agent): number =>
  b.lastActivityAt.getTime() - a.lastActivityAt.getTime();

/** Ждущие человека — сверху, дальше по свежести: иначе работающий агент всегда наверху. */
const byUrgency = (a: Agent, b: Agent): number => {
  const needA = stateOf(a) === "needYou" ? 1 : 0;
  const needB = stateOf(b) === "needYou" ? 1 : 0;
  return needB - needA || byFreshness(a, b);
};

/**
 * Первый экран: проекты, в которых есть чаты. Пустой проект в машине бесполезен —
 * завести чат оттуда нельзя, — поэтому его нет в списке. Подзаголовок: состояние
 * первым, счётчик чатов в конце; один чат — без счётчика.
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

  const rows: { waiting: number; newest: Agent; item: ListItem }[] = [];
  for (const [key, chats] of groups) {
    chats.sort(byFreshness);
    const newest = chats[0];
    if (!newest) {
      continue;
    }
    const needYou = chats.filter((one) => stateOf(one) === "needYou");
    const working = chats.some((one) => stateOf(one) === "working");
    let lead = shortAgo(newest.lastActivityAt, now);
    let state: ProjectState = "quiet";
    if (needYou.length >= 2) {
      lead = waitingCount(needYou.length);
      state = "need";
    } else if (needYou[0]) {
      lead = isPermission(needYou[0]) ? S.awaitingPermission : S.awaitingReply;
      state = "need";
    } else if (working) {
      lead = S.busy;
      state = "work";
    }
    const name = nameOf(newest, known);
    const item: ListItem = {
      id: key,
      text: name,
      detailText: chats.length > 1 ? `${lead} · ${chatCount(chats.length)}` : lead,
      showsDisclosureIndicator: true,
    };
    const image = projectPlate(initialsOf(name), state);
    if (image) {
      item.image = image;
    }
    rows.push({ waiting: needYou.length, newest, item });
  }
  rows.sort(
    (a, b) => Math.sign(b.waiting) - Math.sign(a.waiting) || byFreshness(a.newest, b.newest),
  );
  return rows.map((row) => row.item);
}

/** Второй экран: чаты одного проекта, ждущие сверху, состояние — в подзаголовке. */
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
    .sort(byUrgency)
    .map((one) => {
      const row: ListItem = {
        id: agentRowId(one.serverId, one.id),
        text: chatNameOf(one, now),
        detailText: stateDetail(one, now),
        showsDisclosureIndicator: true,
      };
      const image = stateImage(one);
      if (image) {
        row.image = image;
      }
      return row;
    });
}
