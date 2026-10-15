import { describe, expect, it } from "vitest";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { agentRowId, buildAgentSections, parseAgentRowId } from "@/carplay/templates";
import { S } from "@/carplay/strings";

const NOW = new Date(Date.UTC(2026, 9, 15, 12, 0, 0));
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const agent = (over: Partial<Agent>): Agent =>
  ({
    serverId: "srv",
    id: "a1",
    title: "привет, почему не собирается проект",
    status: "running",
    turn: { phase: "idle", cancellationRequestId: null },
    workspaceId: "w1",
    cwd: "/Users/i/work/paseo-x",
    labels: {},
    parentAgentId: null,
    pendingPermissions: [],
    lastActivityAt: ago(60_000),
    ...over,
  }) as Agent;

const workspace = (over: Partial<WorkspaceDescriptor> = {}): WorkspaceDescriptor =>
  ({ id: "w1", name: "paseo-x", projectDisplayName: "paseo-x", ...over }) as WorkspaceDescriptor;

const build = (agents: Agent[], workspaces = [workspace()]) =>
  buildAgentSections({ agents, workspaces, now: NOW });

describe("секции по состоянию", () => {
  it("раскладывает чаты в три секции в порядке важности", () => {
    const sections = build([
      agent({ id: "a1", lastActivityAt: ago(5 * 60_000) }),
      agent({ id: "a2", turn: { phase: "open" } as never, lastActivityAt: ago(60_000) }),
      agent({ id: "a3", requiresAttention: true, attentionReason: "finished" }),
    ]);
    expect(sections.map((s) => s.header)).toEqual([S.needYou, S.working, S.ready]);
  });

  it("пустые секции не показывает", () => {
    const sections = build([agent({})]);
    expect(sections.map((s) => s.header)).toEqual([S.ready]);
  });

  it("внутри секции новые сверху", () => {
    const sections = build([
      agent({ id: "a1", title: "старый", lastActivityAt: ago(3 * 3600_000) }),
      agent({ id: "a2", title: "свежий", lastActivityAt: ago(60_000) }),
    ]);
    expect(sections[0]?.items.map((i) => i.detailText)).toEqual(["1 мин · свежий", "3 ч · старый"]);
  });

  it("в заголовке строки — рабочее пространство, а не первая фраза", () => {
    const sections = build([agent({})]);
    expect(sections[0]?.items[0]?.text).toBe("paseo-x");
  });

  it("если в пространстве несколько чатов, добавляет различающий тег", () => {
    const sections = build([
      agent({ id: "a1", title: "привет, почему не собирается проект" }),
      agent({ id: "a2", title: "нужно обновить плагин голоса" }),
    ]);
    expect(sections[0]?.items.map((i) => i.text)).toEqual(["paseo-x · почему", "paseo-x · нужно"]);
  });

  it("состояние идёт первым в подзаголовке", () => {
    const waiting = build([agent({ requiresAttention: true, attentionReason: "finished" })]);
    expect(waiting[0]?.items[0]?.detailText).toBe("Ждёт ответа · почему не собирается проект");

    const working = build([agent({ turn: { phase: "open" } as never })]);
    expect(working[0]?.items[0]?.detailText).toBe("Работает · почему не собирается проект");
  });

  it("для разрешения показывает, что именно просят", () => {
    const sections = build([
      agent({
        requiresAttention: true,
        attentionReason: "permission",
        pendingPermissions: [{ id: "p1", name: "Bash", title: "push в master" }] as never,
      }),
    ]);
    expect(sections[0]?.items[0]?.detailText).toBe("Нужно разрешение · push в master");
  });

  it("без названия разрешения берёт имя инструмента", () => {
    const sections = build([
      agent({
        requiresAttention: true,
        attentionReason: "permission",
        pendingPermissions: [{ id: "p1", name: "Bash" }] as never,
      }),
    ]);
    expect(sections[0]?.items[0]?.detailText).toBe("Нужно разрешение · Bash");
  });

  it("чистит приветствие из темы", () => {
    const sections = build([agent({ title: "Привет! мне нужно чтобы ты обновил плагин" })]);
    expect(sections[0]?.items[0]?.detailText).toContain("мне нужно чтобы ты обновил плагин");
  });

  it("архивные и субагентов не показывает", () => {
    const sections = build([
      agent({ id: "a1" }),
      agent({ id: "a2", archivedAt: new Date() }),
      agent({ id: "a3", parentAgentId: "a1" }),
    ]);
    expect(sections[0]?.items).toHaveLength(1);
  });

  it("чат без воркспейса подписан папкой", () => {
    const sections = build([agent({ workspaceId: undefined, cwd: "/Users/i/work/military-wasp" })]);
    expect(sections[0]?.items[0]?.text).toBe("military-wasp");
  });

  it("id строки переживает круг туда-обратно", () => {
    expect(parseAgentRowId(agentRowId("srv-1", "agent-2"))).toEqual({
      serverId: "srv-1",
      agentId: "agent-2",
    });
    expect(parseAgentRowId("мусор")).toBeNull();
  });
});
