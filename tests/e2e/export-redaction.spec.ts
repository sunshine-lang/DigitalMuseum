import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const fixtureDir = fileURLToPath(
  new URL("../../test-data/recent-sessions-2026-08-22", import.meta.url),
);
// 标题含本机绝对路径：导出扫描必须命中并弹确认框，取消后不落盘。
const riskyNote = join(fixtureDir, "10-export-risk-note.md");

async function createStage(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox", { name: "给这段时间取个名字" }).fill(name);
  await page.getByRole("textbox", { name: "从哪一天开始" }).fill("2026-05-22");
  await page.getByRole("textbox", { name: "到哪一天结束" }).fill("2026-08-22");
  await page.getByRole("button", { name: "保存范围，开始导入" }).click();
  await expect(page.getByText("正在回顾")).toBeVisible();
}

test("导出脱敏：路径命中弹确认框，取消后不导出", async ({ page }) => {
  await page.goto("/?all-sources");
  await createStage(page, "临时·导出脱敏");
  await page.locator('input[name="notes"]').setInputFiles([riskyNote]);
  await page.getByRole("button", { name: "开始整理这些记录" }).click();
  await expect(page.getByRole("status")).toContainText("已导入 1 份记录");

  await page.goto("/exhibition");
  await page.getByRole("button", { name: /开馆 · 展出已选的/ }).click();

  const downloadPromise = page.waitForEvent("download", { timeout: 3000 }).catch(() => null);
  await page.getByRole("button", { name: "导出展览（HTML）" }).click();

  const dialog = page.getByRole("dialog", { name: "导出内容风险确认" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("本机绝对路径")).toBeVisible();
  await expect(dialog.getByText(/\/Users\/e2e-export/)).toBeVisible();

  // 取消：确认框关闭，且没有触发任何文件下载。
  await dialog.getByRole("button", { name: "取消，回去修改" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await downloadPromise).toBeNull();
});
