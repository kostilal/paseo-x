import type { ListItem, ListSection } from "@g4rb4g3/react-native-carplay";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { S } from "./strings";

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

/** Название чата: своё, иначе последний сегмент рабочей папки. */
const titleOf = (one: Agent): string =>
  one.title?.trim() || one.cwd.split("/").findLast(Boolean) || one.id;

/** Подзаголовок — состояние, а не текст сообщений: текст в ответах CarPlay показывать нельзя. */
const detailOf = (one: Agent): string => {
  if (one.requiresAttention) {
    return one.attentionReason === "permission" ? "ждёт разрешения" : "ждёт тебя";
  }
  // `turn` — это TurnLiveness, объект с фазой, а не строка.
  return one.turn.phase === "open" ? S.thinking : S.idle;
};

const rowOf = (one: Agent): ListItem => ({
  id: agentRowId(one.serverId, one.id),
  text: titleOf(one),
  detailText: detailOf(one),
  showsDisclosureIndicator: true,
});

/** Свежие сверху: за рулём нужен тот чат, с которым только что работали. */
const byFreshness = (a: Agent, b: Agent): number =>
  b.lastActivityAt.getTime() - a.lastActivityAt.getTime();

/**
 * В список попадают только настоящие чаты: архивные скрыты, субагенты — это шаги
 * задачи, а не собеседники. Строк на экране машины немного, и каждая лишняя
 * выталкивает нужную за пределы видимого.
 */
const isChat = (one: Agent): boolean => !one.archivedAt && !one.parentAgentId;

/**
 * Воркспейсы — заголовками секций, чаты — строками. Пустые секции выбрасываются:
 * на экране машины заголовок без строк читается как сломанный список.
 *
 * Агент, чей воркспейс ещё не подгрузился, попадает в «Без воркспейса», а не пропадает:
 * агенты и дескрипторы воркспейсов гидратируются раздельно, и на холодном старте в
 * машине список иначе оказался бы пустым при живых чатах.
 */
export function buildAgentSections(input: {
  agents: Agent[];
  workspaces: WorkspaceDescriptor[];
}): ListSection[] {
  const known = new Set(input.workspaces.map((one) => one.id));
  const byWorkspace = new Map<string, Agent[]>();
  const orphans: Agent[] = [];
  for (const one of input.agents) {
    if (!isChat(one)) {
      continue;
    }
    if (!one.workspaceId || !known.has(one.workspaceId)) {
      orphans.push(one);
      continue;
    }
    const list = byWorkspace.get(one.workspaceId) ?? [];
    list.push(one);
    byWorkspace.set(one.workspaceId, list);
  }

  const sections: ListSection[] = [];
  for (const workspace of input.workspaces) {
    const agents = byWorkspace.get(workspace.id);
    if (!agents?.length) {
      continue;
    }
    sections.push({
      header: workspace.title?.trim() || workspace.name || workspace.projectDisplayName,
      items: agents.sort(byFreshness).map(rowOf),
    });
  }
  if (orphans.length) {
    sections.push({ header: S.noWorkspace, items: orphans.sort(byFreshness).map(rowOf) });
  }
  return sections;
}
