import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type E2eEnv } from "./backend";

// 正午 UTC：在任何时区归日都不会跨日。
const TS = "2026-05-10T12:00:00.000Z";

function writeClaudeSession(
  e2eEnv: E2eEnv,
  munged: string,
  filename: string,
  options?: { timestamp?: string; message?: string },
) {
  const directory = join(e2eEnv.claudeProjectsRoot, munged);
  mkdirSync(directory, { recursive: true });
  const record = {
    type: "user",
    timestamp: options?.timestamp ?? TS,
    message: { content: options?.message ?? "整理一下这个项目的思路" },
  };
  writeFileSync(
    join(directory, filename),
    `${JSON.stringify(record)}\n`,
    "utf-8",
  );
}

function writeCodexRollout(
  e2eEnv: E2eEnv,
  day: string,
  filename: string,
  projectName: string,
  options?: { firstUser?: string },
) {
  const cwd = join(e2eEnv.projectsRoot, projectName);
  mkdirSync(cwd, { recursive: true });
  const [year, month, datePart] = day.split("-");
  const directory = join(e2eEnv.codexSessionsRoot, year, month, datePart);
  mkdirSync(directory, { recursive: true });
  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: { cwd, thread_source: "user" },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: `${day}T12:00:00.000Z`,
      payload: {
        type: "user_message",
        message: options?.firstUser ?? "帮我看下这个报错",
      },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: `${day}T12:01:00.000Z`,
      payload: { type: "agent_message", message: "好的，我来看看。" },
    }),
  ];
  writeFileSync(join(directory, filename), `${lines.join("\n")}\n`, "utf-8");
}

test("新用户一键同步：会话转档案，时间线全部系统核实", async ({
  page,
  e2eEnv,
}) => {
  writeClaudeSession(e2eEnv, "-Users-e2e-Projects-alpha", "a.jsonl");
  writeCodexRollout(e2eEnv, "2026-05-11", "rollout-a.jsonl", "proj");

  await page.goto("/");
  // 打开即自动同步；档案有内容直接落到时间线（第一价值时刻）。
  await expect(
    page.getByRole("heading", { name: "档案时间线 · 2 段经历" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator(".mvp-timeline").getByText("在 alpha 与 Claude Code 协作"),
  ).toBeVisible();
  await expect(
    page.locator(".mvp-timeline").getByText("在 proj 与 Codex 协作"),
  ).toBeVisible();
  await expect(page.locator(".mvp-status.verified").first()).toBeVisible();
  // 发现面板在同步视图里可见（手动切回查看项目清单）。
  await page.getByRole("button", { name: /1 同步会话/ }).click();
  await expect(
    page.getByText("本机 Agent 会话", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Claude Code · 1 个项目")).toBeVisible();
  await expect(page.getByText("Codex · 1 个项目")).toBeVisible();
});

test("增量同步：新会话并入，旧经历不重复", async ({ page, e2eEnv }) => {
  writeCodexRollout(e2eEnv, "2026-05-10", "rollout-a.jsonl", "proj");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "档案时间线 · 1 段经历" }),
  ).toBeVisible({ timeout: 20_000 });

  writeCodexRollout(e2eEnv, "2026-05-12", "rollout-b.jsonl", "proj");
  await page.getByRole("button", { name: /1 同步会话/ }).click();
  await page.getByRole("button", { name: "同步本机全部会话" }).click();
  await expect(page.getByRole("status")).toContainText("同步完成：新增 1 段经历");
  await expect(
    page.getByRole("heading", { name: "档案时间线 · 2 段经历" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".mvp-timeline")
      .getByText("在 proj 与 Codex 协作", { exact: true }),
  ).toHaveCount(2);
});

test("Codex 新格式：读取真实发言，忽略镜像，未知结构保留旧档案并说明原因", async ({ page, e2eEnv }) => {
  const cwd = join(e2eEnv.projectsRoot, "modern-project");
  mkdirSync(cwd, { recursive: true });
  const root = e2eEnv.codexSessionsRoot;
  const file = join(root, "rollout-modern.jsonl");
  const user = { timestamp: TS, type: "event_msg", payload: {
    type: "item_completed", thread_id: "thread-one", turn_id: "turn-one",
    item: { type: "UserMessage", id: "u1", content: [{ type: "text", text: "请检查新版会话读取" }] },
  } };
  const original = [
    { type: "session_meta", payload: { cwd, thread_source: "user", id: "thread-one" } },
    user,
    { timestamp: TS, type: "response_item", payload: { type: "message", role: "user", id: "mirror-u1",
      content: [{ type: "input_text", text: "请检查新版会话读取" }], internal_chat_message_metadata_passthrough: { turn_id: "turn-one" } } },
  ].map(record => JSON.stringify(record)).join("\n") + "\n";
  writeFileSync(file, original);
  writeCodexRollout(e2eEnv, "2026-05-11", "rollout-old.jsonl", "legacy-project");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "档案时间线 · 2 段经历" })).toBeVisible({ timeout: 20_000 });
  const before = await (await page.request.get("http://127.0.0.1:8010/api/v1/archive/events")).json();
  const modern = before.data.find((event: { project_label: string }) => event.project_label === "modern-project");
  expect(modern.claims[0].text).toContain("共 1 条用户消息");
  expect(modern.claims[0].text).toContain("请检查新版会话读取");
  const bad = { timestamp: TS, type: "event_msg", payload: { type: "item_completed", item: { type: "FutureUserMessage" } } };
  writeFileSync(file, original + JSON.stringify(bad) + "\n");
  await page.getByRole("button", { name: /1 同步会话/ }).click();
  await page.getByRole("button", { name: "同步本机全部会话" }).click();
  await expect(page.locator(".mvp-sync-failures")).toContainText("Codex 消息格式暂不支持，该项目原档案保持不变");
  const after = await (await page.request.get("http://127.0.0.1:8010/api/v1/archive/events")).json();
  expect(after).toEqual(before);
});

test("异议通道：verified 经历可被用户推翻", async ({ page, e2eEnv }) => {
  writeCodexRollout(e2eEnv, "2026-05-10", "rollout-a.jsonl", "proj");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "档案时间线 · 1 段经历" }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "在 proj 与 Codex 协作" }).click();
  await page.getByRole("button", { name: "对这段记录提出异议" }).click();
  await expect(
    page.getByRole("heading", { name: "这段记录符合你的实际经历吗？" }),
  ).toBeVisible();
  await page
    .getByLabel("补充说明（选择「发生过，但描述要改」时必填）")
    .fill("这天其实在休假，会话是误触。");
  await page.getByRole("button", { name: /发生过，但描述要改/ }).click();
  await expect(page.getByRole("status")).toContainText("已保存你的修正说明");
  await expect(page.locator(".mvp-status.disputed").first()).toBeVisible();
});

test("展览：档案封面由数据推导，系统核实徽标与导出就位", async ({
  page,
  e2eEnv,
}) => {
  writeCodexRollout(e2eEnv, "2026-05-10", "rollout-a.jsonl", "proj");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "档案时间线 · 1 段经历" }),
  ).toBeVisible({ timeout: 20_000 });

  await page.goto("/exhibition");
  await expect(
    page.getByRole("heading", { name: "选择这次想回看的项目" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /开馆 · 展出已选的/ }).click();
  await expect(
    page.getByRole("heading", { name: "我的协作时刻" }),
  ).toBeVisible();
  await expect(page.getByText("2026-05-10 — 2026-05-10")).toBeVisible();
  const badge = page.locator(".depth-status").first();
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("系统核实");
  await expect(
    page.getByRole("button", { name: "导出展览（HTML）" }),
  ).toBeVisible();
});

test("清空档案库：唯一破坏性操作，两步确认后归零", async ({ page, e2eEnv }) => {
  writeCodexRollout(e2eEnv, "2026-05-10", "rollout-a.jsonl", "proj");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "档案时间线 · 1 段经历" }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /1 同步会话/ }).click();
  await page.getByRole("button", { name: "清空档案库…" }).click();
  await expect(page.getByText("清空后无法恢复")).toBeVisible();
  await page.getByRole("button", { name: "确认清空档案库" }).click();
  await expect(page.getByRole("status")).toContainText("档案库已清空");
  // 回到同步首屏；再同步可重建档案。
  await page.getByRole("button", { name: "同步本机全部会话" }).click();
  await expect(page.getByRole("status")).toContainText("同步完成：新增 1 段经历");
});
