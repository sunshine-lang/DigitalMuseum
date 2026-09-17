import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type E2eEnv, type Page } from "./backend";

function seedSession(env: E2eEnv, day: string, project = "story-project") {
  const cwd = join(env.projectsRoot, project);
  mkdirSync(cwd, { recursive: true });
  const directory = join(env.codexSessionsRoot, day.slice(0, 4), day.slice(5, 7), day.slice(8, 10));
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `rollout-${project}-${day}.jsonl`), [
    JSON.stringify({ type: "session_meta", payload: { cwd, thread_source: "user" } }),
    JSON.stringify({ type: "event_msg", timestamp: `${day}T12:00:00.000Z`, payload: { type: "user_message", message: `${day} 的原始协作请求` } }),
    "",
  ].join("\n"));
  return cwd;
}

function seedStory(env: E2eEnv, cwd: string, outcomeFirst = false, id = "sample") {
  const directory = join(env.retrospectivesDir, id);
  mkdirSync(directory, { recursive: true });
  const filename = join(directory, "story.json");
  writeFileSync(filename, JSON.stringify({
    id,
    title: "从一次请求到一个项目",
    project_key: `path:${cwd}`,
    status: "candidate",
    starts_on: "2026-05-01",
    ends_on: "2026-06-01",
    chapters: [
      { id: "opening", title: "先留下自己的问题", paragraphs: ["五月，我决定整理和 Agent 一起工作的过程。"], source_ids: ["S1"] },
      { id: "turning", title: "让记录有一个入口", paragraphs: ["六月，展示方式转为一个项目一个入口。"], source_ids: ["S2"] },
    ],
    sources: [
      { id: "S1", role: "user", text: "我想留下自己的问题。先从这个项目开始。", quote: "我想留下自己的问题。", filename: "session-may.jsonl", line: 1, timestamp: "2026-05-01T12:00:00Z" },
      { id: "S2", role: "assistant", text: "已按项目整理展示入口，记录可按日期查看。", quote: null, filename: "session-june.jsonl", line: 2, timestamp: "2026-06-01T12:00:00Z" },
    ],
    open_questions: ["这次调整是否让你更愿意回看？"],
    ...(outcomeFirst ? { exhibit: {
      title: "把重复记录整理为一个入口", summary: "项目内可以按日期回看记录和原话，这一版已经在本地跑通。",
      starts_on: "2026-05-01", ends_on: "2026-06-01", artwork: "gathered-pages", source_ids: ["S1", "S2"],
      goal: { actor: "user", text: "我想把同一个项目的事情连起来回看。", source_ids: ["S1"] },
      process: [
        { actor: "user", text: "我选择先按项目整理入口。", source_ids: ["S1"] },
        { actor: "agent", text: "Agent 的交付说明记录了项目入口和日期阅读的改动。", source_ids: ["S2"] },
      ],
      result: { actor: "record", text: "当前留下本地可阅读的版本；外部使用反馈尚未验证。", source_ids: ["S2"] },
    } } : {}),
  }));
  return filename;
}

async function openGallery(page: Page, count = 1, month?: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: `档案时间线 · ${count} 段经历` })).toBeVisible({ timeout: 20_000 });
  await page.goto("/exhibition");
  if (month) await page.getByRole("combobox", { name: "时间范围" }).selectOption(month);
  await page.getByRole("button", { name: /开馆 · 展出已选的/ }).click();
  await page.getByRole("button", { name: "回看这个项目" }).click();
  return page.getByRole("dialog", { name: "展品标签详情" });
}

test("阶段故事：按章阅读出处，保留待确认状态与原始记录，并隔离其他项目", async ({ page, e2eEnv }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cwd = seedSession(e2eEnv, "2026-05-10");
  seedSession(e2eEnv, "2026-05-09", "other-project");
  seedStory(e2eEnv, cwd);
  const dialog = await openGallery(page, 2);
  const modes = dialog.getByRole("navigation", { name: "项目阅读方式" });
  const chapters = dialog.getByRole("navigation", { name: "故事章节" });
  const sources = dialog.getByRole("complementary", { name: "本章出处" });
  await expect(dialog).toContainText("待本人确认");
  await expect(chapters.getByRole("button")).toHaveCount(2);
  await expect(dialog).toContainText("五月，我决定整理和 Agent 一起工作的过程。");
  await expect(sources).toContainText("我想留下自己的问题。");
  await sources.locator("summary").click();
  await expect(sources).toContainText("先从这个项目开始。");
  await dialog.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: test.info().outputPath("story-desktop.png") });
  await dialog.getByRole("button", { name: "下一章" }).click();
  await expect(dialog).toContainText("六月，展示方式转为一个项目一个入口。");
  await sources.getByText("展开原始记录", { exact: true }).click();
  await expect(sources.getByText("已按项目整理展示入口，记录可按日期查看。", { exact: true })).toBeVisible();
  await expect(sources).not.toContainText("我想留下自己的问题。");
  await dialog.getByRole("button", { name: "上一章" }).click();
  await expect(dialog).toContainText("五月，我决定整理和 Agent 一起工作的过程。");
  await chapters.getByRole("button", { name: /让记录有一个入口/ }).click();
  await expect(dialog).toContainText("六月，展示方式转为一个项目一个入口。");

  await modes.getByRole("button", { name: "原始记录" }).click();
  await expect(dialog.getByRole("navigation", { name: "项目内的记录" }).getByRole("button")).toHaveCount(1);
  await expect(dialog).toContainText("2026-05-10 的原始协作请求");
  await expect(chapters).toHaveCount(0);
  await modes.getByRole("button", { name: "阶段故事" }).click();
  await expect(chapters).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "回看这个项目" }).click();
  await expect(dialog).toContainText("待本人确认");
  await expect(chapters).toBeVisible();

  await dialog.getByRole("button", { name: "关闭展品标签" }).click();
  await page.getByRole("button", { name: "下一个项目" }).click();
  await page.getByRole("button", { name: "回看这个项目" }).click();
  await expect(dialog).toContainText("2026-05-09 的原始协作请求");
  await expect(dialog).not.toContainText("从一次请求到一个项目");
  await expect(chapters).toHaveCount(0);
});

test("故事展示完整范围，月份筛选与无脚本导出仍只含所选原始记录", async ({ page, e2eEnv }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cwd = seedSession(e2eEnv, "2026-05-10");
  seedSession(e2eEnv, "2026-06-10");
  seedStory(e2eEnv, cwd);
  const dialog = await openGallery(page, 2, "2026-05");
  await expect(dialog).toContainText("完整项目故事");
  await expect(dialog).toContainText("2026-05-01");
  await expect(dialog).toContainText("2026-06-01");
  await dialog.getByRole("navigation", { name: "项目阅读方式" }).getByRole("button", { name: "原始记录" }).click();
  await expect(dialog.getByRole("navigation", { name: "项目内的记录" }).getByRole("button")).toHaveCount(1);
  await expect(dialog).toContainText("2026-05-10 的原始协作请求");
  await expect(dialog).not.toContainText("2026-06-10 的原始协作请求");
  await dialog.getByRole("button", { name: "关闭展品标签" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出展览（HTML）" }).click(),
  ]);
  const target = test.info().outputPath("raw-records-only.html");
  await download.saveAs(target);
  const html = readFileSync(target, "utf8");
  expect(html).toContain("2026-05-10 的原始协作请求");
  expect(html).not.toContain("2026-06-10 的原始协作请求");
  expect(html).not.toContain("从一次请求到一个项目");
  expect(html).not.toContain("五月，我决定整理和 Agent 一起工作的过程。");
  expect(html).not.toMatch(/<script/i);
});

test("故事读取失败仍保留原始记录，不把损坏草稿当成可用故事", async ({ page, e2eEnv }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cwd = seedSession(e2eEnv, "2026-05-10");
  writeFileSync(seedStory(e2eEnv, cwd), "{invalid story json");
  const dialog = await openGallery(page);
  await expect(dialog.getByRole("alert")).toContainText("故事草稿暂时无法读取");
  await expect(dialog).toContainText("2026-05-10 的原始协作请求");
  await expect(dialog.getByRole("navigation", { name: "故事章节" })).toHaveCount(0);
});

test("手机故事阅读：章节、出处与操作无横向溢出", async ({ page, e2eEnv }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cwd = seedSession(e2eEnv, "2026-05-10");
  seedStory(e2eEnv, cwd);
  const dialog = await openGallery(page);
  await expect(dialog).toContainText("待本人确认");
  await expect(dialog.getByRole("navigation", { name: "故事章节" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("story-mobile.png") });
  await dialog.getByRole("button", { name: "下一章" }).click();
  await expect(dialog).toContainText("六月，展示方式转为一个项目一个入口。");
  await expect(dialog.getByRole("complementary", { name: "本章出处" })).toContainText("已按项目整理展示入口，记录可按日期查看。");
});


test("成果优先展品：直达外层概述，打开后依次阅读目标过程结果与原话", async ({ page, e2eEnv }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const cwd = seedSession(e2eEnv, "2026-05-10");
  seedSession(e2eEnv, "2026-05-09", "other-project");
  seedStory(e2eEnv, cwd, true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "档案时间线 · 2 段经历" })).toBeVisible({ timeout: 20_000 });
  await page.goto("/exhibition?exhibit=sample");
  const outer = page.getByRole("article", { name: "当前展项" });
  await expect(outer.getByRole("heading", { name: "把重复记录整理为一个入口" })).toBeVisible();
  await expect(outer).toContainText("项目内可以按日期回看记录和原话");
  await expect(outer).toContainText("待本人确认");
  await expect(outer).toHaveAttribute("data-art", "/gallery/gathered-pages-v2.png");
  await page.reload();
  await expect(outer.getByRole("heading", { name: "把重复记录整理为一个入口" })).toBeVisible();
  await expect(outer).toHaveAttribute("data-art", "/gallery/gathered-pages-v2.png");
  await expect(page.locator(".depth-scene canvas")).toBeVisible();
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".depth-caption")!).opacity === "1");
  await page.screenshot({ path: test.info().outputPath("experience-desktop-cover.png") });
  const trigger = outer.getByRole("button", { name: "走近这段经历" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "展品标签详情" });
  await expect(dialog.getByRole("button", { name: "这段经历", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.locator(".depth-reader-cover img")).toHaveAttribute("src", "/gallery/gathered-pages-v2.png");
  await expect(dialog.locator(".depth-experience-prose h4")).toHaveText(["当时想解决什么", "怎么一步步推进", "做到了哪里"]);
  await expect(dialog).toContainText("我的目标与选择");
  await expect(dialog).toContainText("Agent 的执行");
  await expect(dialog).toContainText("外部使用反馈尚未验证");
  const sources = dialog.getByRole("complementary", { name: "经历出处" });
  await expect(sources).toContainText("我想留下自己的问题。");
  await sources.getByText("查看完整出处", { exact: true }).click();
  await expect(sources.locator("pre").first()).toContainText("先从这个项目开始。");
  await dialog.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: test.info().outputPath("experience-desktop-process.png") });
  await dialog.getByRole("button", { name: "阶段故事", exact: true }).click();
  await expect(dialog.getByRole("navigation", { name: "故事章节" })).toBeVisible();
  await dialog.getByRole("button", { name: "原始记录", exact: true }).click();
  await expect(dialog).toContainText("2026-05-10 的原始协作请求");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: "关闭展品标签" }).click();
  await expect(trigger).toBeFocused();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "导出展览（HTML）" }).click()]);
  const target = test.info().outputPath("exhibit-keeps-raw-export.html");
  await download.saveAs(target);
  const html = readFileSync(target, "utf8");
  expect(html).toContain("2026-05-10 的原始协作请求");
  expect(html).not.toContain("把重复记录整理为一个入口");
  expect(html).not.toContain("2026-05-09 的原始协作请求");
  expect(html).not.toMatch(/<script/i);
  await page.getByRole("button", { name: "重新选展" }).click();
  await expect(page.locator(".expo-module")).toHaveCount(2);
});

test("手机成果展品：保留轻量回退、过程阅读与无效直达链接回退", async ({ page, e2eEnv }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cwd = seedSession(e2eEnv, "2026-05-10");
  seedStory(e2eEnv, cwd, true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "档案时间线 · 1 段经历" })).toBeVisible({ timeout: 20_000 });
  await page.goto("/exhibition?exhibit=sample");
  await expect(page.locator(".depth-simple")).toBeVisible();
  const caption = page.getByRole("article", { name: "当前展项" });
  await caption.scrollIntoViewIfNeeded();
  await expect(caption).toContainText("项目内可以按日期回看记录和原话");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("experience-mobile-cover.png") });
  const trigger = page.getByRole("button", { name: "走近这段经历" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "展品标签详情" });
  await expect(dialog.getByRole("heading", { name: "当时想解决什么" })).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("experience-mobile-process.png") });
  await dialog.getByRole("heading", { name: "怎么一步步推进" }).scrollIntoViewIfNeeded();
  await expect(dialog).toContainText("Agent 的交付说明");
  await dialog.getByRole("complementary", { name: "经历出处" }).getByText("查看完整出处", { exact: true }).click();
  await expect(dialog.getByRole("complementary", { name: "经历出处" }).locator("pre").first()).toContainText("先从这个项目开始。");
  await dialog.getByRole("button", { name: "关闭展品标签" }).click();
  await expect(trigger).toBeFocused();
  await page.goto("/exhibition?exhibit=missing");
  await expect(page.getByRole("status")).toContainText("暂时无法定位");
  await expect(page.getByRole("heading", { name: "选择这次想回看的项目" })).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`三项目纪念插画：绑定隔离、刷新与阅读复用 ${viewport.width}px`, async ({ page, e2eEnv }) => {
    await page.setViewportSize(viewport);
    const samples = [
      { id: "sample-one", artwork: "gathered-pages", image: "/gallery/gathered-pages-v2.png" },
      { id: "sample-two", artwork: "everyday-steps", image: "/gallery/everyday-steps.png" },
      { id: "sample-three", artwork: "continuous-light", image: "/gallery/continuous-light.png" },
    ];
    for (const [index, sample] of samples.entries()) {
      const cwd = seedSession(e2eEnv, `2026-05-0${9 - index}`, sample.id);
      const filename = seedStory(e2eEnv, cwd, true, sample.id);
      const story = JSON.parse(readFileSync(filename, "utf8"));
      story.exhibit.artwork = sample.artwork;
      story.exhibit.title = `项目 ${index + 1} 的独立经历`;
      story.sources[0].text = story.sources[0].quote = `这是项目 ${index + 1} 的原话。`;
      writeFileSync(filename, JSON.stringify(story));
    }
    seedSession(e2eEnv, "2026-05-06", "without-story");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "档案时间线 · 4 段经历" })).toBeVisible({ timeout: 20_000 });
    for (const [index, sample] of samples.entries()) {
      await page.goto(`/exhibition?exhibit=${sample.id}`);
      const caption = page.getByRole("article", { name: "当前展项" });
      await expect(caption).toHaveAttribute("data-art", sample.image);
      await page.reload();
      await expect(caption.getByRole("heading")).toHaveText(`项目 ${index + 1} 的独立经历`);
      await expect(caption).toHaveAttribute("data-art", sample.image);
      if (viewport.width < 760) await expect(page.locator(".depth-flat-art img")).toHaveAttribute("src", sample.image);
      const trigger = page.getByRole("button", { name: "走近这段经历" });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "展品标签详情" });
      await expect(dialog.locator(".depth-reader-cover img")).toHaveAttribute("src", sample.image);
      await expect(dialog.getByRole("complementary", { name: "经历出处" })).toContainText(`这是项目 ${index + 1} 的原话。`);
      await expect(dialog).toContainText("待本人确认");
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
    await page.goto("/exhibition?view=gallery");
    for (let index = 0; index < 3; index++) {
      await page.getByRole("button", { name: "下一个项目", exact: true }).click();
      await expect(page.locator(".depth-caption h2")).toHaveText(index < 2 ? `项目 ${index + 2} 的独立经历` : "without-story");
    }
    await expect(page.getByRole("button", { name: "回看这个项目" })).toBeVisible();
    await expect(page.locator(".depth-caption")).toHaveAttribute("data-art", /\/gallery\/(paper|thread|bridge)-study\.png/);
  });
}

test("A 正式视图：长标题与窄窗口可读，单件不提示下一项目", async ({ page, e2eEnv }) => {
  await page.setViewportSize({ width: 960, height: 700 });
  const cwd = seedSession(e2eEnv, '2026-05-10');
  const filename = seedStory(e2eEnv, cwd, true);
  const story = JSON.parse(readFileSync(filename, 'utf8'));
  story.exhibit.title = '把跨越多个阶段与不同工具的协作记录整理为可以逐项回看的经历，'.repeat(4);
  writeFileSync(filename, JSON.stringify(story));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '档案时间线 · 1 段经历' })).toBeVisible({ timeout: 20_000 });
  await page.goto('/exhibition?view=gallery');
  await expect(page.locator('.depth-direction')).toContainText('本次只选了一个项目');
  await expect(page.getByRole('button', { name: '下一个项目' })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '走近这段经历' }).click();
  const dialog = page.getByRole('dialog', { name: '展品标签详情' });
  await expect(dialog.getByRole('heading', { name: '当时想解决什么' })).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: '关闭展品标签' }).click();
  await page.setViewportSize({ width: 960, height: 540 });
  await expect(page.locator('.depth-simple')).toBeVisible();
  await expect(page.locator('.depth-scene canvas')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '走近这段经历' }).click();
  await expect(dialog).toBeVisible();
});
