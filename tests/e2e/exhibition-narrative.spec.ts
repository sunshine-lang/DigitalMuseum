import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./backend";

// S5 展厅叙事层专项验收：开馆序列 / 侧滑证据抽屉 / 导出产物叙事结构。
// 种子：单条 Codex 用户线程（消息不含密钥/路径/邮箱，脱敏扫描应零命中）。

function seedCodexSession(
  e2eEnv: { projectsRoot: string; codexSessionsRoot: string },
  isoDay: string,
) {
  const cwd = join(e2eEnv.projectsRoot, "narrative");
  mkdirSync(cwd, { recursive: true });
  const directory = join(
    e2eEnv.codexSessionsRoot,
    isoDay.slice(0, 4),
    isoDay.slice(5, 7),
    isoDay.slice(8, 10),
  );
  mkdirSync(directory, { recursive: true });
  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: { cwd, thread_source: "user" },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: `${isoDay}T12:00:00.000Z`,
      payload: { type: "user_message", message: "帮我梳理这个项目的思路" },
    }),
  ];
  writeFileSync(
    join(directory, `rollout-${isoDay}.jsonl`),
    `${lines.join("\n")}\n`,
    "utf-8",
  );
}

async function openExhibition(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "档案时间线 · 1 段经历" }),
  ).toBeVisible({ timeout: 20_000 });
  await page.goto("/exhibition");
  await page.getByRole("button", { name: /开馆 · 展出已选的/ }).click();
}

test("开馆序列：终端开场自动完成，封面随后升起", async ({ page, e2eEnv }) => {
  seedCodexSession(e2eEnv, "2026-05-10");
  await openExhibition(page);
  await expect(page.locator(".expo-boot")).toBeAttached();
  await expect(page.locator(".expo-boot.done")).toBeAttached({ timeout: 8_000 });
  await expect(page.locator(".expo-cover-inner.risen")).toBeAttached();
  await expect(
    page.getByRole("heading", { name: "我的 Agent 协作档案" }),
  ).toBeVisible();
});

test("证据抽屉：Esc 与遮罩两路关闭，锚定原文以诗行呈现", async ({
  page,
  e2eEnv,
}) => {
  seedCodexSession(e2eEnv, "2026-05-10");
  await openExhibition(page);
  await expect(page.locator(".expo-boot.done")).toBeAttached({ timeout: 8_000 });

  const trigger = page.locator(".expo-evidence-btn").first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "展品标签详情" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".expo-poem .cl").first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);

  await trigger.click();
  await expect(drawer).toBeVisible();
  await page
    .locator(".expo-drawer-overlay")
    .click({ position: { x: 10, y: 300 } });
  await expect(drawer).toHaveCount(0);
});

test("导出产物：叙事结构齐全且无脚本外链", async ({ page, e2eEnv }) => {
  seedCodexSession(e2eEnv, "2026-05-10");
  await openExhibition(page);
  await expect(page.locator(".expo-boot.done")).toBeAttached({ timeout: 8_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5_000 }),
    page.getByRole("button", { name: "导出展览（HTML）" }).click(),
  ]);
  const target = test.info().outputPath("exhibition-export.html");
  await download.saveAs(target);
  const html = readFileSync(target, "utf8");

  expect(html).toContain("编年 CHRONICLE");
  expect(html).toContain("month-head");
  expect(html).toContain('class="spine"');
  expect(html).toContain('class="node"');
  expect(html).toMatch(/<p class="caption">/);
  expect(html).toContain("协作风格速写");
  expect(html).toContain("未随本页导出");
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/<link/i);
  expect(html).not.toMatch(/src=/i);
  expect(html).not.toMatch(/href=/i);
});
