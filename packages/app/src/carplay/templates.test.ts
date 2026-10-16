import { describe, expect, it, vi } from "vitest";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import {
  agentRowId,
  chatRows,
  chatTitleFor,
  initialsOf,
  parseAgentRowId,
  projectKeyOf,
  projectNameOf,
  projectRows,
} from "@/carplay/templates";
import { S } from "@/carplay/strings";

vi.mock("@/carplay/plates", () => ({
  projectPlate: (initials: string, state: string) => `plate:${initials}:${state}`,
}));
vi.mock("@/carplay/images", () => ({
  STATES: { needReply: "s:reply", needPerm: "s:perm", work: "s:work", ready: "s:ready" },
}));

// Полдень по местному времени: «Чат от …» зависит от календарного дня.
const NOW = new Date(2026, 9, 15, 12, 0, 0);
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
    createdAt: ago(3 * 3600_000),
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
  workspace({ id: "w2", name: "jobby", projectId: "p2", projectDisplayName: "JobByJobs" }),
];

const known = (list = spaces()) => new Map(list.map((one) => [one.id, one]));
const waiting = (over: Partial<Agent> = {}) =>
  agent({ requiresAttention: true, attentionReason: "finished", ...over });

describe("projectRows", () => {
  it("одна строка на проект с чатами; имя — проекта, а не авто-заголовок пространства", () => {
    const rows = projectRows({
      agents: [agent({}), agent({ id: "a2", workspaceId: "w1b" })],
      workspaces: spaces(),
      now: NOW,
    });
    expect(rows.map((r) => r.text)).toEqual(["paseo-x"]);
    expect(rows[0]?.id).toBe("srv::p1");
    expect(rows[0]?.showsDisclosureIndicator).toBe(true);
  });

  it("состояние первым, счётчик в конце; один чат — без счётчика", () => {
    const two = projectRows({
      agents: [agent({}), agent({ id: "a2" })],
      workspaces: spaces(),
      now: NOW,
    });
    expect(two[0]?.detailText).toBe("1 мин · 2 чата");
    const one = projectRows({
      agents: [agent({ lastActivityAt: ago(5 * 60_000) })],
      workspaces: spaces(),
      now: NOW,
    });
    expect(one[0]?.detailText).toBe("5 мин");
  });

  it("ждущий человека чат важнее работающего, разрешение — своим словом", () => {
    const rows = projectRows({
      agents: [
        agent({ id: "a1" }),
        waiting({ id: "a2" }),
        agent({ id: "a3", turn: { phase: "open" } as never }),
      ],
      workspaces: spaces(),
      now: NOW,
    });
    expect(rows[0]?.detailText).toBe(`${S.awaitingReply} · 3 чата`);
    const perm = projectRows({
      agents: [waiting({ attentionReason: "permission" })],
      workspaces: spaces(),
      now: NOW,
    });
    expect(perm[0]?.detailText).toBe(S.awaitingPermission);
  });

  it("несколько ждущих — «2 ждут тебя»", () => {
    const rows = projectRows({
      agents: [waiting({ id: "a1" }), waiting({ id: "a2" }), agent({ id: "a3" })],
      workspaces: spaces(),
      now: NOW,
    });
    expect(rows[0]?.detailText).toBe("2 ждут тебя · 3 чата");
  });

  it("работа без ожидания — «Работает»", () => {
    const rows = projectRows({
      agents: [agent({ turn: { phase: "open" } as never })],
      workspaces: spaces(),
      now: NOW,
    });
    expect(rows[0]?.detailText).toBe(S.busy);
  });

  it("плашка проекта — инициалы в цвете состояния", () => {
    const rows = projectRows({
      agents: [
        agent({ id: "a1", workspaceId: "w2", turn: { phase: "open" } as never }),
        waiting({ id: "a2" }),
      ],
      workspaces: spaces(),
      now: NOW,
    });
    expect(rows.map((r) => r.image)).toEqual(["plate:PX:need", "plate:JJ:work"]);
  });

  it("проекты, где кто-то ждёт, — сверху, дальше по свежести", () => {
    const rows = projectRows({
      agents: [
        agent({ id: "a1", workspaceId: "w1", lastActivityAt: ago(60_000) }),
        waiting({ id: "a2", workspaceId: "w2", lastActivityAt: ago(3600_000) }),
      ],
      workspaces: spaces(),
      now: NOW,
    });
    expect(rows.map((r) => r.text)).toEqual(["JobByJobs", "paseo-x"]);
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

describe("initialsOf", () => {
  it("две первые буквы двух первых слов, включая CamelCase; одно слово — две буквы", () => {
    expect(initialsOf("SmartDrive")).toBe("SD");
    expect(initialsOf("military-wasp")).toBe("MW");
    expect(initialsOf("JobByJobs")).toBe("JJ");
    expect(initialsOf("Prom")).toBe("PR");
    expect(initialsOf("kd_design bot")).toBe("KD");
    expect(initialsOf("paseo-x")).toBe("PX");
  });
});

describe("chatRows", () => {
  const key = "srv::p1";

  it("в заголовке — тема без приветствия, в подзаголовке — состояние, слева — значок", () => {
    const rows = chatRows({ agents: [agent({})], workspaces: spaces(), key, now: NOW });
    expect(rows[0]?.text).toBe("почему не собирается проект");
    expect(rows[0]?.detailText).toBe("1 мин");
    expect(rows[0]?.image).toBe("s:ready");
    expect(rows[0]?.id).toBe(agentRowId("srv", "a1"));
  });

  it("ожидание и разрешение идут первым словом и своим значком", () => {
    const rows = chatRows({
      agents: [
        waiting({ id: "a1", lastActivityAt: ago(1000) }),
        waiting({
          id: "a2",
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
    expect(rows.map((r) => r.image)).toEqual(["s:reply", "s:perm", "s:work"]);
  });

  it("ждущие сверху, дальше по свежести; чужой проект — нет", () => {
    const rows = chatRows({
      agents: [
        agent({
          id: "a1",
          title: "старый, но ждёт ответа",
          lastActivityAt: ago(3600_000),
          requiresAttention: true,
        }),
        agent({
          id: "a2",
          workspaceId: "w1b",
          title: "свежий чат про сборку",
          lastActivityAt: ago(60_000),
        }),
        agent({ id: "a3", workspaceId: "w2", title: "чужой проект тут" }),
      ],
      workspaces: spaces(),
      key,
      now: NOW,
    });
    expect(rows.map((r) => r.text)).toEqual(["старый, но ждёт ответа", "свежий чат про сборку"]);
  });

  it("короткая или служебная первая фраза темой не считается — «Чат от …»", () => {
    const rows = chatRows({
      agents: [
        agent({ id: "a1", title: "продолжай", createdAt: new Date(2026, 9, 15, 9, 5) }),
        agent({ id: "a2", title: "ок", createdAt: new Date(2026, 9, 14, 18, 40) }),
        agent({ id: "a3", title: null, createdAt: new Date(2026, 9, 2, 8, 0) }),
      ],
      workspaces: spaces(),
      key,
      now: NOW,
    });
    expect(rows.map((r) => r.text)).toEqual([
      "Чат от 09:05",
      "Чат от вчера, 18:40",
      "Чат от 2 окт",
    ]);
  });
});

describe("заголовки", () => {
  it("экран чата называется по теме, обрезанной до сорока знаков", () => {
    expect(chatTitleFor(agent({}), NOW)).toBe("почему не собирается проект");
    expect(chatTitleFor(agent({ title: "а ".repeat(60) }), NOW)).toHaveLength(41);
    expect(chatTitleFor(agent({ title: null, createdAt: new Date(2026, 9, 15, 9, 5) }), NOW)).toBe(
      "Чат от 09:05",
    );
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
