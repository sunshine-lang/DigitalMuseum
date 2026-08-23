import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const photoDir = fileURLToPath(
  new URL("../../test-data/phase0-stage4-photos", import.meta.url),
);
const photoWithExif = `${photoDir}/IMG_20260615_103000.jpg`;

async function createStage(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox", { name: "给这段时间取个名字" }).fill(name);
  await page.getByRole("textbox", { name: "从哪一天开始" }).fill("2026-05-22");
  await page.getByRole("textbox", { name: "到哪一天结束" }).fill("2026-08-22");
  await page.getByRole("button", { name: "保存范围，开始导入" }).click();
  await expect(page.getByText("正在回顾")).toBeVisible();
}

test("分级信任：展览页系统核实徽标与默认选展", async ({ page }) => {
  await page.goto("/");
  await createStage(page, "临时·展览核实");
  await page
    .locator('input[name="photos"]')
    .setInputFiles([photoWithExif]);
  await page.getByRole("button", { name: "开始整理这些照片" }).click();
  await expect(page.getByRole("status")).toContainText("已导入 1 张照片");

  // 直接进展览馆：verified 事件默认选中并展示方章徽标。
  await page.goto("/exhibition");
  await expect(
    page.getByRole("heading", { name: "第一步 · 选择要展出的经历" }),
  ).toBeVisible();
  await expect(
    page.locator(".expo-module li label.checked"),
  ).toHaveCount(1);
  await expect(
    page.getByText("1 段已确认（含系统核实 1）"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /下一步 · 选择展览风格/ })
    .click();
  await page
    .getByRole("button", { name: /暖纸档案馆/ })
    .click();
  const badge = page.locator(".expo-seal.sys");
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveText("系统核实");
  await expect(
    page.getByText("都由系统从确定性记录自动核实"),
  ).toBeVisible();
  await expect(page.locator(".expo-card.draft")).toHaveCount(0);
});
