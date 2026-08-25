import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// 用本仓库真实路径制造 verified 事件；E2E 后端 allowed_repo_roots 默认 "~" 覆盖它。
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

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

  // Git 提交日是确定性读数：导入即 verified，不进人工核对队列。
  await page.locator('input[name="gitPath"]').fill(repoRoot);
  await page.getByRole("button", { name: "读取仓库提交记录" }).click();
  await expect(page.getByRole("status")).toContainText("已从 Git 仓库整理出");

  // 直接进展览馆：verified 事件默认选中并展示方章徽标。
  await page.goto("/exhibition");
  await expect(
    page.getByRole("heading", { name: "第一步 · 选择要展出的经历" }),
  ).toBeVisible();
  await expect(
    page.locator(".expo-module li label.checked").first(),
  ).toBeVisible();
  await expect(page.getByText(/段已确认（含系统核实/).first()).toBeVisible();
  await page.getByRole("button", { name: /开馆 · 展出已选的/ }).click();
  const badge = page.locator(".expo-seal.sys").first();
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText("系统核实");
  await expect(
    page.getByText("都由系统从确定性记录自动核实"),
  ).toBeVisible();
  await expect(page.locator(".expo-card.draft")).toHaveCount(0);
});
