import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "./backend";

const fixtureDir = fileURLToPath(
  new URL("../../test-data/recent-sessions-2026-08-22", import.meta.url),
);
const noteFiles = [
  join(fixtureDir, "01-digital-museum-phase0-a.md"),
  join(fixtureDir, "02-digital-museum-phase0-b.md"),
  join(fixtureDir, "03-stage2-handoff.md"),
];

async function createStage(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox", { name: "给这段时间取个名字" }).fill(name);
  await page.getByRole("textbox", { name: "从哪一天开始" }).fill("2026-05-22");
  await page.getByRole("textbox", { name: "到哪一天结束" }).fill("2026-08-22");
  await page.getByRole("button", { name: "保存范围，开始导入" }).click();
  await expect(page.getByText("正在回顾")).toBeVisible();
}

test("分级信任：笔记批量确认快速通道", async ({ page }) => {
  await page.goto("/?all-sources");
  await createStage(page, "临时·批量确认");
  await page.locator('input[name="notes"]').setInputFiles(noteFiles);
  await page.getByRole("button", { name: "开始整理这些记录" }).click();
  await expect(page.getByRole("status")).toContainText("已导入 3 份记录");

  const batchButton = page.getByRole("button", {
    name: /这些都是我的笔记，一次确认（2）/,
  });
  await expect(batchButton).toBeVisible();
  await batchButton.click();

  await expect(page.getByRole("status")).toContainText("已一次确认 2 段笔记经历");
  await expect(page.getByText("你已确认")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: /这些都是我的笔记/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "查看整理后的回顾" }),
  ).toBeVisible();

  // 展览馆默认选展包含 confirmed（全部已确认）。
  await page.getByRole("button", { name: /查看回顾/ }).click();
  await expect(page.locator(".mvp-timeline article.confirmed")).toHaveCount(2);
});
