import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const fixtureDir = fileURLToPath(
  new URL("../../test-data/recent-sessions-2026-08-22", import.meta.url),
);
// 01 与 02 标题和日期完全相同，用于验证自动聚合；03 独立成事件。
const noteFiles = [
  join(fixtureDir, "01-digital-museum-phase0-a.md"),
  join(fixtureDir, "02-digital-museum-phase0-b.md"),
  join(fixtureDir, "03-stage2-handoff.md"),
];
const unsupportedPdf = join(fixtureDir, "09-intentionally-unsupported.pdf");

async function createStage(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox", { name: "给这段时间取个名字" }).fill(name);
  await page.getByRole("textbox", { name: "从哪一天开始" }).fill("2026-05-22");
  await page.getByRole("textbox", { name: "到哪一天结束" }).fill("2026-08-22");
  await page.getByRole("button", { name: "保存范围，开始导入" }).click();
  await expect(page.getByText("正在回顾")).toBeVisible();
}

test("完整链路：导入 → 自动聚合 → 合并 → 拆分 → 确认 → 刷新恢复", async ({
  page,
}) => {
  await page.goto("/");
  await createStage(page, "E2E 自动验收·主链路");

  await page.locator('input[name="notes"]').setInputFiles(noteFiles);
  await page.getByRole("button", { name: "开始整理这些记录" }).click();
  await expect(page.getByRole("status")).toContainText("已导入 3 份记录");

  await expect(
    page.getByRole("heading", { name: "系统整理出 2 段可能的经历" }),
  ).toBeVisible();
  await expect(page.getByText("聚合自 2 份")).toBeVisible();
  await expect(page.getByText("系统发现 2 份标题和日期都相同的记录")).toBeVisible();

  const mergePicks = page.locator(".mvp-pick input");
  await expect(mergePicks).toHaveCount(2);
  await mergePicks.nth(0).check();
  await mergePicks.nth(1).check();
  await page.getByRole("button", { name: "合并为一段经历" }).click();
  await page.getByRole("button", { name: "确认合并" }).click();
  await expect(page.getByRole("status")).toContainText("已合并为一段新的候选经历");
  await expect(
    page.getByRole("heading", { name: "系统整理出 1 段可能的经历" }),
  ).toBeVisible();
  await expect(page.getByText("合并产生")).toBeVisible();
  await expect(page.getByText("3 份来源记录 · 3 条原文摘录")).toBeVisible();

  await page.getByRole("button", { name: "拆回独立经历" }).click();
  await page.getByRole("button", { name: "确认拆分" }).click();
  await expect(page.getByRole("status")).toContainText("已按来源拆回 3 段候选经历");
  await expect(
    page.getByRole("heading", { name: "系统整理出 3 段可能的经历" }),
  ).toBeVisible();
  await expect(page.getByText("拆分产生")).toHaveCount(3);

  await page.getByRole("button", { name: "核对这段经历" }).click();
  await page.getByRole("button", { name: "是，已经发生" }).click();
  await expect(page.getByRole("status")).toContainText("已加入你的正式经历");
  await page.getByRole("button", { name: "先跳过，稍后再说" }).click();

  await page.getByRole("button", { name: /查看回顾/ }).click();
  await expect(page.locator(".mvp-timeline article.confirmed")).toHaveCount(1);
  await expect(page.getByText("这是一份实时草稿")).toBeVisible();

  await page.reload();
  await expect(page.getByText("正在回顾")).toBeVisible();
  await expect(page.getByText("你已确认")).toBeVisible();
});

test("坏文件单独失败：PDF 不影响其他记录导入", async ({ page }) => {
  await page.goto("/");
  await expect(
    page
      .getByRole("button", { name: "切换回顾范围" })
      .or(page.getByRole("heading", { name: "选择回顾时间" })),
  ).toBeVisible();
  const exitButton = page.getByRole("button", { name: "切换回顾范围" });
  if (await exitButton.isVisible()) {
    await exitButton.click();
  }
  await createStage(page, "E2E 自动验收·坏文件");

  await page
    .locator('input[name="notes"]')
    .setInputFiles([noteFiles[0], unsupportedPdf]);
  await page.getByRole("button", { name: "开始整理这些记录" }).click();
  await expect(page.getByRole("status")).toContainText("已导入 1 份，1 份需要处理");

  // 导入完成后页面自动切到“发现经历”，先回到导入页再核对逐份结果。
  await page.getByRole("button", { name: /导入记录/ }).click();
  const reportRows = page.locator(".mvp-import-rows > div");
  await expect(reportRows).toHaveCount(2);
  await expect(
    reportRows.filter({ hasText: "01-digital-museum-phase0-a.md" }),
  ).toContainText("已导入并形成经历草稿");
  await expect(
    reportRows.filter({ hasText: "09-intentionally-unsupported.pdf" }),
  ).toContainText("只支持 Markdown 或 TXT 文件");
});
