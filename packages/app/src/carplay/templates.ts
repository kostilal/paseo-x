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

/**
 * Воркспейсы — заголовками секций, чаты — строками. Пустые секции выбрасываются:
 * на экране машины заголовок без строк читается как сломанный список.
 */
export function buildAgentSections(input: {
  agents: Agent[];
  workspaces: WorkspaceDescriptor[];
}): ListSection[] {
  const byWorkspace = new Map<string, Agent[]>();
  const orphans: Agent[] = [];
  for (const one of input.agents) {
    if (!one.workspaceId) {
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
      items: agents.map(rowOf),
    });
  }
  if (orphans.length) {
    sections.push({ header: S.noWorkspace, items: orphans.map(rowOf) });
  }
  return sections;
}
