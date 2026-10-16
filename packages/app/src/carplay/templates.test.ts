import { describe, expect, it } from "vitest";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import {
  agentRowId,
  chatRows,
  chatTitleFor,
  parseAgentRowId,
  projectKeyOf,
  projectNameOf,
  projectRows,
} from "@/carplay/templates";
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
  ({
    id: "w1",
    name: "продолжай",
    title: "продолжай",
    projectId: "p1",
    projectDisplayName: "paseo-x",
    ...over,
  }) as WorkspaceDescriptor;

/** Второе пространство того же проекта и одно — другого. */
const spaces = () => [
  workspace(),
  workspace({ id: "w1b", name: "fix-build", title: null }),
  workspace({ id: "w2", name: "jobby", projectId: "p2", projectDisplayName: "jobby" }),
];

const known = (list = spaces()) => new Map(list.map((one) => [one.id, one]));

describe("projectRows", () => {
  it("одна строка на проект с чатами; имя — проекта, а не авто-заголовок пространства", () => {
    const rows = projectRows({
      agents: [agent({}), agent({ id: "a2", workspaceId: "w1b" })],
      workspaces: spaces(),
      now: NOW,
    });
    expect(rows.map((r) => r.text)).toEqual(["paseo-x"]);
    expect(rows[0]?.id).toBe("srv::p1");
    expect(rows[0]?.detailText).toBe("2 чата · 1 мин");
    expect(rows[0]?.showsDisclosureIndicator).toBe(true);
  });

  it("считает чаты по-русски и ставит вперёд то, что требует человека", () => {
    const rows = projectRows({
      agents: [
        agent({ id: "a1" }),
        agent({ id: "a2", requiresAttention: true, attentionReason: "finished" }),
        agent({ id: "a3", turn: { phase: "open" } as never }),
      ],
      workspaces: spaces(),
      now: NOW,
    });
    expect(rows[0]?.detailText).toBe(`3 чата · ${S.awaitingReply}`);
  });

  it("без ожидания показывает работу, а без работы — время последнего сообщения", () => {
    const working = projectRows({
      agents: [agent({ turn: { phase: "open" } as never })],
      workspaces: spaces(),
      now: NOW,
    });
    expect(working[0]?.detailText).toBe(`1 чат · ${S.busy}`);
    const quiet = projectRows({
      agents: [agent({ lastActivityAt: ago(5 * 60_000) })],
      workspaces: spaces(),
      now: NOW,
    });
    expect(quiet[0]?.detailText).toBe("1 чат · 5 мин");
  });

  it("проекты идут по свежести последнего чата", () => {
    const rows = projectRows({
      agents: [
        agent({ id: "a1", workspaceId: "w1", lastActivityAt: ago(3600_000) }),
        agent({ id: "a2", workspaceId: "w2", lastActivityAt: ago(60_000) }),
      ],
      workspaces: spaces(),
      now: NOW,
    });
    expect(rows.map((r) => r.text)).toEqual(["jobby", "paseo-x"]);
  });

  it("чат без дескриптора пространства попадает в строку по имени папки", () => {
    const rows = projectRows({
      agents: [agent({ workspaceId: undefined })],
      workspaces: [],
      now: NOW,
    });
    expect(rows[0]?.text).toBe("paseo-x");
    expect(rows[0]?.id).toBe(projectKeyOf(agent({ workspaceId: undefined }), known([])));
  });

  it("архивные чаты и субагенты не считаются", () => {
    const rows = projectRows({
      agents: [agent({ archivedAt: new Date() }), agent({ id: "a2", parentAgentId: "a1" })],
      workspaces: spaces(),
      now: NOW,
    });
    expect(rows).toEqual([]);
  });
});

describe("chatRows", () => {
  const key = "srv::p1";

  it("в заголовке — тема без приветствия, в подзаголовке — состояние", () => {
    const rows = chatRows({ agents: [agent({})], workspaces: spaces(), key, now: NOW });
    expect(rows[0]?.text).toBe("почему не собирается проект");
    expect(rows[0]?.detailText).toBe("1 мин");
    expect(rows[0]?.id).toBe(agentRowId("srv", "a1"));
  });

  it("ожидание и разрешение идут первым словом", () => {
    const rows = chatRows({
      agents: [
        agent({
          id: "a1",
          requiresAttention: true,
          attentionReason: "finished",
          lastActivityAt: ago(1000),
        }),
        agent({
          id: "a2",
          requiresAttention: true,
          attentionReason: "permission",
          pendingPermissions: [{ title: "push в master" }] as never,
          lastActivityAt: ago(2000),
        }),
        agent({ id: "a3", turn: { phase: "open" } as never, lastActivityAt: ago(3000) }),
      ],
      workspaces: spaces(),
      key,
      now: NOW,
    });
    expect(rows.map((r) => r.detailText)).toEqual([
      S.awaitingReply,
      `${S.awaitingPermission} · push в master`,
      S.busy,
    ]);
  });

  it("все чаты проекта из разных пространств, новые сверху, чужой проект — нет", () => {
    const rows = chatRows({
      agents: [
        agent({ id: "a1", title: "старый", lastActivityAt: ago(3600_000) }),
        agent({ id: "a2", workspaceId: "w1b", title: "свежий", lastActivityAt: ago(60_000) }),
        agent({ id: "a3", workspaceId: "w2", title: "чужой" }),
      ],
      workspaces: spaces(),
      key,
      now: NOW,
    });
    expect(rows.map((r) => r.text)).toEqual(["свежий", "старый"]);
  });

  it("чат без темы называется просто чатом", () => {
    const rows = chatRows({
      agents: [agent({ title: null })],
      workspaces: spaces(),
      key,
      now: NOW,
    });
    expect(rows[0]?.text).toBe(S.chat);
  });
});

describe("заголовки", () => {
  it("экран чата называется по теме, обрезанной до сорока знаков", () => {
    expect(chatTitleFor(agent({}))).toBe("почему не собирается проект");
    expect(chatTitleFor(agent({ title: "а".repeat(80) }))).toHaveLength(41);
    expect(chatTitleFor(agent({ title: null }))).toBe(S.chat);
  });

  it("имя проекта — своё, иначе папка", () => {
    expect(projectNameOf(agent({}), spaces())).toBe("paseo-x");
    expect(projectNameOf(agent({ workspaceId: undefined }), [])).toBe("paseo-x");
  });
});

describe("agentRowId", () => {
  it("разбирается обратно, даже если agentId содержит разделитель", () => {
    expect(parseAgentRowId(agentRowId("srv", "a::b"))).toEqual({
      serverId: "srv",
      agentId: "a::b",
    });
  });

  it("на мусор отвечает null", () => {
    expect(parseAgentRowId("")).toBeNull();
    expect(parseAgentRowId("::a")).toBeNull();
    expect(parseAgentRowId("srv::")).toBeNull();
  });
});
