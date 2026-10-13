import { describe, expect, it } from "vitest";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { agentRowId, buildAgentSections, parseAgentRowId } from "@/carplay/templates";
import { S } from "@/carplay/strings";

const agent = (over: Partial<Agent>): Agent =>
  ({
    serverId: "srv",
    id: "a1",
    title: "Чат один",
    status: "running",
    turn: { phase: "idle", cancellationRequestId: null },
    workspaceId: "w1",
    cwd: "/tmp",
    labels: {},
    parentAgentId: null,
    model: null,
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUserMessageAt: null,
    lastActivityAt: new Date(),
    ...over,
  }) as Agent;

const workspace = (over: Partial<WorkspaceDescriptor>): WorkspaceDescriptor =>
  ({ id: "w1", name: "jobby", projectDisplayName: "jobby-jobs", ...over }) as WorkspaceDescriptor;

describe("buildAgentSections", () => {
  it("группирует чаты по воркспейсам", () => {
    const sections = buildAgentSections({
      agents: [agent({ id: "a1", title: "Первый" }), agent({ id: "a2", title: "Второй" })],
      workspaces: [workspace({})],
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.header).toBe("jobby");
    expect(sections[0]?.items.map((i) => i.text)).toEqual(["Первый", "Второй"]);
  });

  it("агента без воркспейса не теряет, а кладёт в отдельную секцию", () => {
    const sections = buildAgentSections({
      agents: [agent({ id: "a9", title: "Сирота", workspaceId: undefined })],
      workspaces: [workspace({})],
    });
    expect(sections.map((s) => s.header)).toEqual([S.noWorkspace]);
    expect(sections[0]?.items[0]?.text).toBe("Сирота");
  });

  it("пустые воркспейсы не показывает", () => {
    const sections = buildAgentSections({
      agents: [],
      workspaces: [workspace({}), workspace({ id: "w2", name: "второй" })],
    });
    expect(sections).toEqual([]);
  });

  it("чат без названия подписывает путём", () => {
    const sections = buildAgentSections({
      agents: [agent({ title: null, cwd: "/Users/i/work/thing" })],
      workspaces: [workspace({})],
    });
    expect(sections[0]?.items[0]?.text).toBe("thing");
  });

  it("чат с открытым ходом подписан «Думаю…», простаивающий — «Готов»", () => {
    const sections = buildAgentSections({
      agents: [
        agent({
          id: "a1",
          turn: { phase: "open", turnId: "t", startedAt: new Date(), cancellationRequestId: null },
        }),
        agent({ id: "a2", turn: { phase: "idle", cancellationRequestId: null } }),
      ],
      workspaces: [workspace({})],
    });
    expect(sections[0]?.items.map((i) => i.detailText)).toEqual([S.thinking, S.idle]);
  });

  it("чат, который ждёт разрешения, подписан этим, а не фазой хода", () => {
    const sections = buildAgentSections({
      agents: [agent({ requiresAttention: true, attentionReason: "permission" })],
      workspaces: [workspace({})],
    });
    expect(sections[0]?.items[0]?.detailText).toBe("ждёт разрешения");
  });

  it("агент с воркспейсом, который ещё не подгрузился, не пропадает из списка", () => {
    // Агенты и воркспейсы гидратируются раздельно; на холодном старте в машине
    // дескриптора может не быть, а чат показать надо.
    const sections = buildAgentSections({
      agents: [agent({ id: "a1", title: "Ранний", workspaceId: "ещё-нет" })],
      workspaces: [],
    });
    expect(sections.map((s) => s.header)).toEqual([S.noWorkspace]);
    expect(sections[0]?.items[0]?.text).toBe("Ранний");
  });

  it("архивные чаты не показывает", () => {
    const sections = buildAgentSections({
      agents: [
        agent({ id: "a1", title: "Живой" }),
        agent({ id: "a2", title: "Архив", archivedAt: new Date() }),
      ],
      workspaces: [workspace({})],
    });
    expect(sections[0]?.items.map((i) => i.text)).toEqual(["Живой"]);
  });

  it("субагентов не показывает: это шаги задачи, а не чаты", () => {
    const sections = buildAgentSections({
      agents: [
        agent({ id: "a1", title: "Чат" }),
        agent({ id: "a2", title: "Подзадача", parentAgentId: "a1" }),
      ],
      workspaces: [workspace({})],
    });
    expect(sections[0]?.items.map((i) => i.text)).toEqual(["Чат"]);
  });

  it("сортирует по свежести: недавний сверху", () => {
    const sections = buildAgentSections({
      agents: [
        agent({ id: "a1", title: "Старый", lastActivityAt: new Date(1000) }),
        agent({ id: "a2", title: "Свежий", lastActivityAt: new Date(9000) }),
      ],
      workspaces: [workspace({})],
    });
    expect(sections[0]?.items.map((i) => i.text)).toEqual(["Свежий", "Старый"]);
  });

  it("id строки переживает круг туда-обратно", () => {
    const id = agentRowId("srv-1", "agent-2");
    expect(parseAgentRowId(id)).toEqual({ serverId: "srv-1", agentId: "agent-2" });
    expect(parseAgentRowId("мусор")).toBeNull();
  });
});
