import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./backend";

// 会话首条用户消息含本机绝对路径：导出扫描必须命中并弹确认框，取消后不落盘。
test("导出脱敏：会话摘录里的路径命中弹确认框，取消后不导出", async ({
  page,
  e2eEnv,
}) => {
  const cwd = join(e2eEnv.projectsRoot, "risk");
  mkdirSync(cwd, { recursive: true });
  const directory = join(e2eEnv.codexSessionsRoot, "2026", "05", "10");
  mkdirSync(directory, { recursive: true });
  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: { cwd, thread_source: "user" },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-05-10T12:00:00.000Z",
      payload: {
        type: "user_message",
        message: "读一下 /Users/e2e-export/secret.md 这个文件",
      },
    }),
  ];
  writeFileSync(
    join(directory, "rollout-risk.jsonl"),
    `${lines.join("\n")}\n`,
    "utf-8",
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "档案时间线 · 1 段经历" }),
  ).toBeVisible({ timeout: 20_000 });

  await page.goto("/exhibition");
  await page.getByRole("button", { name: /开馆 · 展出已选的/ }).click();

  const downloadPromise = page
    .waitForEvent("download", { timeout: 3000 })
    .catch(() => null);
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
