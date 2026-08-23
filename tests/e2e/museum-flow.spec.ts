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

const photoDir = fileURLToPath(
  new URL("../../test-data/phase0-stage4-photos", import.meta.url),
);
// JPEG 自带 EXIF 拍摄时间（2026-06-15，在阶段范围内）；PNG 没有拍摄时间，应被单独拒绝。
const photoWithExif = join(photoDir, "IMG_20260615_103000.jpg");
const photoWithoutExif = join(photoDir, "screenshot-no-exif.png");

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
  await page.getByRole("button", { name: "对，没问题" }).click();
  await expect(page.getByRole("status")).toContainText("已加入你的正式经历");
  await page.getByRole("button", { name: "先跳过，稍后再说" }).click();

  await page.getByRole("button", { name: /查看回顾/ }).click();
  await expect(page.locator(".mvp-timeline article.confirmed")).toHaveCount(1);
  await expect(page.getByText("这是一份实时草稿")).toBeVisible();

  await page.reload();
  await expect(page.getByText("正在回顾")).toBeVisible();
  await expect(page.getByText("你已确认")).toBeVisible();
});

test("照片导入：EXIF 时间归入时间线，无拍摄时间的照片单独失败", async ({
  page,
}) => {
  await page.goto("/");
  await createStage(page, "E2E 自动验收·照片");

  await page
    .locator('input[name="photos"]')
    .setInputFiles([photoWithExif, photoWithoutExif]);
  await page.getByRole("button", { name: "开始整理这些照片" }).click();
  await expect(page.getByRole("status")).toContainText("已导入 1 张，1 张需要处理");

  await expect(page.getByText("来自照片")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "系统整理出 1 段可能的经历" }),
  ).toBeVisible();

  // 确定性证据获得“系统核实”身份：卡片带状态徽标，且不进入人工核对队列。
  await expect(page.locator(".mvp-experience-card.st-verified")).toHaveCount(1);
  await expect(
    page.locator(".mvp-experience-card.st-verified .mvp-status.verified"),
  ).toHaveText("系统核实");
  await expect(
    page.getByRole("button", { name: /用几分钟核对/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "查看整理后的回顾" }),
  ).toBeVisible();

  // 回到导入页核对逐份结果：成功的 JPEG 与被拒绝的 PNG 分别提示。
  await page.getByRole("button", { name: /导入记录/ }).click();
  const reportRows = page.locator(".mvp-import-rows > div");
  await expect(reportRows).toHaveCount(2);
  await expect(
    reportRows.filter({ hasText: "IMG_20260615_103000.jpg" }),
  ).toContainText("已导入并形成经历草稿");
  await expect(
    reportRows.filter({ hasText: "screenshot-no-exif.png" }),
  ).toContainText("照片缺少可读的 EXIF 拍摄时间");
});

test("坏文件单独失败：PDF 不影响其他记录导入", async ({ page }) => {
  await page.goto("/");
  await expect(
    page
      .getByRole("button", { name: "切换回顾范围" })
      .or(page.getByRole("heading", { name: "选择回顾时间" })),
  ).toBeVisible();
  // “切换回顾范围”现在跳 /stages；若本地残留阶段指针，需从那里新建回到建馆表单。
  const exitButton = page.getByRole("button", { name: "切换回顾范围" });
  if (await exitButton.isVisible()) {
    await exitButton.click();
    await page.getByRole("button", { name: "＋ 新建回顾阶段" }).click();
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

test("阶段管理：创建两个阶段可互相切换、重命名、删除", async ({ page }) => {
  await page.goto("/");
  await createStage(page, "E2E 阶段管理·甲");
  await page.locator('input[name="notes"]').setInputFiles([noteFiles[0]]);
  await page.getByRole("button", { name: "开始整理这些记录" }).click();
  await expect(page.getByRole("status")).toContainText("已导入 1 份记录");
  await expect(
    page.getByRole("heading", { name: "系统整理出 1 段可能的经历" }),
  ).toBeVisible();

  // 从工作台进入 /stages，再回到甲阶段，验证内容还在（跨 context 的自救路径）。
  await page.getByRole("button", { name: "切换回顾范围" }).click();
  await expect(
    page.getByRole("heading", { name: "管理你的回顾阶段" }),
  ).toBeVisible();
  const stageACard = page.locator(".mvp-stage-card", {
    hasText: "E2E 阶段管理·甲",
  });
  await expect(stageACard).toBeVisible();
  await expect(stageACard.getByText("已保存记录")).toBeVisible();
  await stageACard.getByRole("button", { name: "进入回顾" }).click();
  await expect(page.getByText("正在回顾")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "系统整理出 1 段可能的经历" }),
  ).toBeVisible();

  // 新建阶段乙：/stages → 新建回顾阶段 → 首页建馆表单（含“继续已有的回顾”区块）。
  await page.getByRole("button", { name: "切换回顾范围" }).click();
  await page.getByRole("button", { name: "＋ 新建回顾阶段" }).click();
  await expect(
    page.getByRole("heading", { name: "选择回顾时间" }),
  ).toBeVisible();
  await expect(page.getByText("继续已有的回顾")).toBeVisible();
  await createStage(page, "E2E 阶段管理·乙");

  // 回 /stages 把甲重命名。
  await page.goto("/stages");
  await stageACard.getByRole("button", { name: "重命名" }).click();
  const renameForm = page.locator(".mvp-stage-rename");
  await renameForm.locator("input").fill("E2E 阶段管理·甲改名");
  await renameForm.getByRole("button", { name: "保存新名称" }).click();
  await expect(page.getByRole("status")).toContainText("阶段已重命名");
  await expect(
    page.locator(".mvp-stage-card", { hasText: "E2E 阶段管理·甲改名" }),
  ).toBeVisible();

  // 两步确认删除乙；甲不受影响。
  const stageBCard = page.locator(".mvp-stage-card", {
    hasText: "E2E 阶段管理·乙",
  });
  await stageBCard.getByRole("button", { name: "删除", exact: true }).click();
  await expect(stageBCard.getByText("将永久删除")).toBeVisible();
  await stageBCard.getByRole("button", { name: "删除这个阶段" }).click();
  await stageBCard.getByRole("button", { name: "确认永久删除" }).click();
  await expect(page.getByRole("status")).toContainText(
    "已删除「E2E 阶段管理·乙」",
  );
  await expect(stageBCard).toHaveCount(0);

  // 甲仍完整可进：从 /stages 一步找回。
  await page
    .locator(".mvp-stage-card", { hasText: "E2E 阶段管理·甲改名" })
    .getByRole("button", { name: "进入回顾" })
    .click();
  await expect(page.getByText("正在回顾")).toBeVisible();
  await expect(page.getByText("E2E 阶段管理·甲改名")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "系统整理出 1 段可能的经历" }),
  ).toBeVisible();
});
