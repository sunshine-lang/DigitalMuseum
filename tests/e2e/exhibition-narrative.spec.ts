import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type E2eEnv, type Page } from "./backend";

// 纵深画廊专项验收：项目导航、项目内日期记录、原文阅读、轻量降级与无脚本导出。
// 种子只含临时 Codex 用户线程，不读本机真实会话；脱敏扫描应零命中。

function seedCodexSession(
  e2eEnv: E2eEnv,
  isoDay: string,
  projectName = "narrative",
  message = "帮我梳理这个项目的思路",
) {
  const cwd = join(e2eEnv.projectsRoot, projectName);
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
      payload: { type: "user_message", message },
    }),
  ];
  writeFileSync(
    join(directory, `rollout-${isoDay}.jsonl`),
    `${lines.join("\n")}\n`,
    "utf-8",
  );
}

async function openExhibition(page: Page, count = 1) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: `档案时间线 · ${count} 段经历` }),
  ).toBeVisible({ timeout: 20_000 });
  await page.goto("/exhibition");
  await page.getByRole("button", { name: /开馆 · 展出已选的/ }).click();
  await expect(
    page.getByRole("heading", { name: "我的协作时刻" }),
  ).toBeVisible();
}

function seedThreeDays(e2eEnv: E2eEnv) {
  for (let index = 1; index <= 3; index += 1) {
    seedCodexSession(
      e2eEnv,
      `2026-05-${index + 9}`,
      `narrative-${index}`,
      `这是第${index}天的原始协作请求`,
    );
  }
}

test("三个项目：按最近活动排序，前后与目录导航，重新选展保留勾选结果", async ({ page, e2eEnv }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  seedThreeDays(e2eEnv);
  await openExhibition(page, 3);
  const previous = page.getByRole("button", { name: "上一个项目" });
  const next = page.getByRole("button", { name: "下一个项目" });
  const directory = page.getByRole("navigation", { name: "展项目录" });
  const currentTitle = (index: number) => page.getByRole("heading", { name: `narrative-${index}`, exact: true });

  await expect(currentTitle(3)).toBeVisible();
  await expect(page.locator(".depth-scene canvas")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("depth-desktop.png") });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(currentTitle(2)).toBeVisible();
  await previous.click();
  await expect(currentTitle(3)).toBeVisible();
  await page.getByRole("button", { name: "打开展项目录" }).click();
  await directory.getByRole("button", { name: /narrative-1/ }).click();
  await expect(currentTitle(1)).toBeVisible();
  await expect(next).toBeDisabled();
  const lastProjectArt = await page.locator(".depth-caption").getAttribute("data-art");
  expect(lastProjectArt).toMatch(/^\/gallery\/.+\.png$/);

  await page.getByRole("button", { name: "重新选展" }).click();
  await expect(page.getByRole("heading", { name: "选择这次想回看的项目" })).toBeVisible();
  const secondProject = page.locator(".expo-module").filter({ hasText: "narrative-2" });
  await secondProject.locator("summary").click();
  await secondProject.getByRole("checkbox", { name: /在 narrative-2 与 Codex 协作/ }).uncheck();
  await page.getByRole("button", { name: "开馆 · 展出已选的 2 个展项" }).click();
  await expect(currentTitle(3)).toBeVisible();
  await next.click();
  await expect(currentTitle(1)).toBeVisible();
  await expect(page.locator(".depth-caption")).toHaveAttribute("data-art", lastProjectArt!);
  await expect(next).toBeDisabled();
});

test("同一项目的三天只占一个入口，按日核对原文，取消一天后封面与导出范围一致", async ({ page, e2eEnv }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (let index = 1; index <= 3; index += 1) {
    seedCodexSession(
      e2eEnv,
      `2026-05-${index + 9}`,
      "shared-project",
      `这是第${index}天的独立原始请求`,
    );
  }
  await openExhibition(page, 3);
  await expect(page.getByRole("heading", { name: "shared-project", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "上一个项目" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "下一个项目" })).toBeDisabled();
  const art = await page.locator(".depth-caption").getAttribute("data-art");
  expect(art).toMatch(/^\/gallery\/.+\.png$/);
  await page.getByRole("button", { name: "打开展项目录" }).click();
  await expect(page.getByRole("navigation", { name: "展项目录" }).getByRole("button")).toHaveCount(1);
  await page.getByRole("navigation", { name: "展项目录" }).getByRole("button").click();

  await page.getByRole("button", { name: "回看这个项目" }).click();
  const dialog = page.getByRole("dialog", { name: "展品标签详情" });
  const records = dialog.getByRole("navigation", { name: "项目内的记录" });
  await expect(records.getByRole("button")).toHaveCount(3);
  for (let index = 1; index <= 3; index += 1) {
    const record = records.getByRole("button").nth(index - 1);
    await expect(record).toContainText(`2026-05-${index + 9}`);
    await record.click();
    await expect(dialog.locator("pre").filter({ hasText: `这是第${index}天的独立原始请求` })).toBeVisible();
    await expect(dialog.locator("pre").filter({ hasText: `这是第${index === 3 ? 1 : index + 1}天的独立原始请求` })).toHaveCount(0);
  }
  await dialog.getByRole("button", { name: "关闭展品标签" }).click();

  await page.getByRole("button", { name: "重新选展" }).click();
  await expect(page.locator(".expo-module")).toHaveCount(1);
  const project = page.locator(".expo-module");
  await project.locator("summary").click();
  const middleRecord = project.locator("li").filter({ hasText: "2026-05-11" });
  await middleRecord.getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "开馆 · 展出已选的 1 个展项" }).click();
  await expect(page.locator(".depth-caption")).toHaveAttribute("data-art", art!);
  await page.getByRole("button", { name: "回看这个项目" }).click();
  await expect(records.getByRole("button")).toHaveCount(2);
  await expect(records).not.toContainText("2026-05-11");
  await dialog.getByRole("button", { name: "关闭展品标签" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5_000 }),
    page.getByRole("button", { name: "导出展览（HTML）" }).click(),
  ]);
  const target = test.info().outputPath("selected-project-records.html");
  await download.saveAs(target);
  const html = readFileSync(target, "utf8");
  expect(html).toContain("这是第1天的独立原始请求");
  expect(html).toContain("这是第3天的独立原始请求");
  expect(html).not.toContain("这是第2天的独立原始请求");
  expect(html).not.toMatch(/<script/i);
});

test("时间范围：同项目只展出和导出当月记录，切回全部时间保留原勾选", async ({ page, e2eEnv }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  seedCodexSession(e2eEnv, "2026-05-10", "monthly-project", "五月的独立原始请求");
  seedCodexSession(e2eEnv, "2026-06-10", "monthly-project", "六月的独立原始请求");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "档案时间线 · 2 段经历" })).toBeVisible({ timeout: 20_000 });
  await page.goto("/exhibition");
  await page.getByRole("combobox", { name: "时间范围" }).selectOption("2026-05");
  await expect(page.locator(".depth-prep-filter")).toContainText("1 个展项 / 1 条记录");
  await page.getByRole("button", { name: "开馆 · 展出已选的 1 个展项" }).click();
  await page.getByRole("button", { name: "回看这个项目" }).click();
  const dialog = page.getByRole("dialog", { name: "展品标签详情" });
  const records = dialog.getByRole("navigation", { name: "项目内的记录" });
  await expect(records.getByRole("button")).toHaveCount(1);
  await expect(records).toContainText("2026-05-10");
  await expect(dialog).toContainText("五月的独立原始请求");
  await expect(dialog).not.toContainText("六月的独立原始请求");
  await dialog.getByRole("button", { name: "关闭展品标签" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5_000 }),
    page.getByRole("button", { name: "导出展览（HTML）" }).click(),
  ]);
  const target = test.info().outputPath("selected-month.html");
  await download.saveAs(target);
  const html = readFileSync(target, "utf8");
  expect(html).toContain("五月的独立原始请求");
  expect(html).not.toContain("六月的独立原始请求");

  await page.getByRole("button", { name: "重新选展" }).click();
  await page.getByRole("combobox", { name: "时间范围" }).selectOption("all");
  await expect(page.locator(".depth-prep-filter")).toContainText("1 个展项 / 2 条记录");
  await expect(page.locator(".expo-module")).toContainText("2/2 条已选");
  await page.getByRole("button", { name: "开馆 · 展出已选的 1 个展项" }).click();
  await page.getByRole("button", { name: "回看这个项目" }).click();
  await expect(records.getByRole("button")).toHaveCount(2);
  await expect(records).toContainText("2026-06-10");
});

test("阅读原文：对话框保留证据，三路关闭均将焦点还给阅读按钮", async ({ page, e2eEnv }) => {
  seedCodexSession(e2eEnv, "2026-05-10");
  await openExhibition(page);
  const trigger = page.getByRole("button", { name: "回看这个项目" }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "展品标签详情" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("共 1 条用户消息");
  await expect(dialog.locator("pre").filter({ hasText: "帮我梳理这个项目的思路" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("depth-reader.png") });
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: "关闭展品标签" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x > 8 || bounds!.y > 8).toBe(true);
  await page.mouse.click(4, 4);
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("轻量阅读：用户可主动切换，经历与阅读入口仍然完整", async ({ page, e2eEnv }) => {
  seedThreeDays(e2eEnv);
  await openExhibition(page, 3);
  await page.getByRole("button", { name: "切换轻量阅读" }).click();
  await expect(page.locator(".depth-simple")).toBeVisible();
  await expect(page.locator(".depth-scene canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "回看这个项目" }).first()).toBeVisible();
});

test("减少动态效果：自动使用轻量阅读并仍能查看原文", async ({ page, e2eEnv }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  seedCodexSession(e2eEnv, "2026-05-10");
  await openExhibition(page);
  await expect(page.locator(".depth-simple")).toBeVisible();
  await expect(page.locator(".depth-scene canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "回看这个项目" }).click();
  await expect(page.getByRole("dialog", { name: "展品标签详情" })).toContainText("帮我梳理这个项目的思路");
});

test("手机阅读：自动降级，图文与操作均不横向溢出", async ({ page, e2eEnv }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  seedCodexSession(e2eEnv, "2026-05-10");
  await openExhibition(page);
  await expect(page.locator(".depth-simple")).toBeVisible();
  await expect(page.locator(".depth-scene canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "回看这个项目" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("depth-mobile.png"), fullPage: true });
});

test("WebGL 不可用：仍显示真实经历并可打开阅读原文", async ({ page, e2eEnv }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(contextId)) return null;
      return Reflect.apply(original, this, [contextId, ...args]);
    } as typeof original;
  });
  seedCodexSession(e2eEnv, "2026-05-10");
  await openExhibition(page);
  await expect(page.locator(".depth-simple")).toBeVisible();
  await expect(page.locator(".depth-scene canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "回看这个项目" }).click();
  const dialog = page.getByRole("dialog", { name: "展品标签详情" });
  await expect(dialog).toContainText("共 1 条用户消息");
  await expect(dialog.locator("pre").filter({ hasText: "帮我梳理这个项目的思路" })).toBeVisible();
});

test("导出产物：叙事结构齐全且无脚本外链", async ({ page, e2eEnv }) => {
  seedCodexSession(e2eEnv, "2026-05-10");
  await openExhibition(page);
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

test("A 展馆：目录不改变当前项目，点击远处画框走近，再点击主画框阅读", async ({ page, e2eEnv }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  seedThreeDays(e2eEnv);
  await openExhibition(page, 3);
  await expect(page.locator('.depth-scene')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.depth-scene')).toHaveAttribute('data-visible-frames', '3');
  const first = page.getByRole('heading', { name: 'narrative-3', exact: true });
  await page.getByRole('button', { name: '打开展项目录' }).click();
  await page.getByRole('button', { name: '打开展项目录' }).click();
  await expect(first).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  // At this viewport A's second frame is visible to the right of the main mount.
  await page.mouse.click(710, 350);
  await expect(page.getByRole('heading', { name: 'narrative-2', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.abs(window.scrollY - innerHeight * .9) < 2)).toBe(true);
  await page.mouse.click(400, 450);
  const dialog = page.getByRole('dialog', { name: '展品标签详情' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('这是第2天的原始协作请求');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '回看这个项目' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => Math.abs(window.scrollY - innerHeight * .9) < 2)).toBe(true);
  await page.getByRole('button', { name: '切换轻量阅读' }).click();
  await expect(page.locator('.depth-scene canvas')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'narrative-2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '切换纵深画廊' }).click();
  await expect(page.locator('.depth-scene')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '重新选展' }).click();
  await expect(page.locator('.depth-scene canvas')).toHaveCount(0);
  await page.getByRole('button', { name: /开馆 · 展出已选的/ }).click();
  await expect(page.locator('.depth-scene canvas')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.depth-simple')).toBeVisible();
  await expect(page.locator('.depth-scene canvas')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.depth-scene')).toHaveAttribute('data-ready', 'true');
});
