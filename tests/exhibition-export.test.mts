import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExhibitionHtml,
  scanExportRisks,
  type ExportExhibitEvent,
} from "../app/exhibition/export-html.ts";

const events: ExportExhibitEvent[] = [
  {
    title: "在 DigitalMuseum 与 Claude Code 协作",
    occurred_on: "2026-08-21",
    status: "verified",
    origin: "claude",
    claims: [{ text: "这一天在项目 DigitalMuseum 进行了 2 个 Claude Code 会话、共 5 条用户消息" }],
  },
  {
    title: "在 hipaw 与 Codex 协作",
    occurred_on: "2026-07-02",
    status: "confirmed",
    origin: "codex",
    claims: [{ text: "这一天在项目 hipaw 进行了 3 个 Codex 会话、共 7 条用户消息" }],
  },
  {
    title: "一次未定日期的讨论",
    occurred_on: null,
    status: "candidate",
    origin: "codex",
    claims: [{ text: "等待核对的草稿。" }],
  },
];

test("导出为自包含 HTML：无外部资源、无脚本", () => {
  const html = buildExhibitionHtml({
    stageName: "我的 AI 半年",
    startsOn: "2026-03-01",
    endsOn: "2026-08-31",
    events,
    exportedAt: "2026-08-23T23:59:00.000Z",
  });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="zh-CN">/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<link/i);
  assert.doesNotMatch(html, /src=/i);
  assert.doesNotMatch(html, /href=/i);
  assert.match(html, /<style>/);
  assert.match(html, /你来我往/); // 确定性叙事底稿
});

test("按月分组、组内按日期排序，未定日期在最后", () => {
  const html = buildExhibitionHtml({
    stageName: "阶段",
    startsOn: "2026-03-01",
    endsOn: "2026-08-31",
    events,
    exportedAt: "2026-08-23T00:00:00.000Z",
  });
  const july = html.indexOf("2026年7月");
  const august = html.indexOf("2026年8月");
  const undated = html.indexOf("未定日期");
  assert.ok(july > -1 && august > -1 && undated > -1);
  assert.ok(july < august, "7月应排在8月之前");
  assert.ok(august < undated, "未定日期应排在最后");
});

test("状态徽标与统计口径诚实", () => {
  const html = buildExhibitionHtml({
    stageName: "阶段",
    startsOn: "2026-03-01",
    endsOn: "2026-08-31",
    events,
    exportedAt: "2026-08-23T00:00:00.000Z",
  });
  assert.match(html, /3 段经历/);
  assert.match(html, /1 段本人确认/);
  assert.match(html, /1 段系统核实/);
  assert.match(html, /等待核对/);
  assert.match(html, /不代表对内容的解读/);
  assert.match(html, /未随本页导出/);
});

test("用户文本全部转义，无 HTML 注入", () => {
  const hostile: ExportExhibitEvent[] = [
    {
      title: '<script>alert("x")</script>',
      occurred_on: "2026-05-01",
      status: "confirmed",
      origin: "codex",
      claims: [{ text: '原始证据不随导出公开。"><img src=x onerror="steal()">' }],
    },
  ];
  const html = buildExhibitionHtml({
    stageName: '阶段"名字"&<b>',
    startsOn: "2026-03-01",
    endsOn: "2026-08-31",
    events: hostile,
    exportedAt: "2026-08-23T00:00:00.000Z",
  });
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img src=x"));
  // 恶意 stageName 是 `…&<b>`：未转义的泄漏会原样带出这个序列
  //（模板自身的 <b> 标签是合法标记，不参与哨兵）。
  assert.ok(!html.includes("&<b>"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;/);
});

test("风险扫描：干净内容不拦截", () => {
  const html = buildExhibitionHtml({
    stageName: "我的 AI 半年",
    startsOn: "2026-03-01",
    endsOn: "2026-08-31",
    events,
    exportedAt: "2026-08-23T00:00:00.000Z",
  });
  assert.deepEqual(scanExportRisks(html), []);
});

test("风险扫描：标题带本机路径时命中并给出样例", () => {
  const html = buildExhibitionHtml({
    stageName: "阶段",
    startsOn: "2026-03-01",
    endsOn: "2026-08-31",
    events: [
      {
        title: "调试 /Users/sunshine/secret-project 的部署",
        occurred_on: "2026-05-01",
        status: "confirmed",
        origin: "codex",
        claims: [{ text: "记录。" }],
      },
    ],
    exportedAt: "2026-08-23T00:00:00.000Z",
  });
  const risks = scanExportRisks(html);
  assert.equal(risks.length, 1);
  assert.equal(risks[0].kind, "path");
  assert.ok(risks[0].count >= 1);
  assert.ok(risks[0].sample.startsWith("/Users/"));
});

test("风险扫描：叙事里的密钥与阶段名里的邮箱分别命中", () => {
  const html = buildExhibitionHtml({
    stageName: "me@example.com 的半年",
    startsOn: "2026-03-01",
    endsOn: "2026-08-31",
    events: [
      {
        title: "一次部署",
        occurred_on: "2026-05-01",
        status: "confirmed",
        origin: "codex",
        claims: [{ text: "用的 key 是 sk-ant-abcdefghijklmnopqrst 处理的。" }],
      },
    ],
    exportedAt: "2026-08-23T00:00:00.000Z",
  });
  const kinds = scanExportRisks(html).map((risk) => risk.kind).sort();
  assert.deepEqual(kinds, ["email", "secret"]);
});

test("叙事底稿：同一项目的多天展卡句式各异且里程碑诚实（S5）", () => {
  const days: Array<[string, number, string]> = [
    ["2026-06-01", 2, "先把仓库跑起来"],
    ["2026-06-03", 40, "重构核心模块"],
    ["2026-06-05", 8, "补测试"],
    ["2026-06-08", 15, "修性能问题"],
    ["2026-06-12", 3, "写发布说明"],
  ];
  const marathon = days.map(([day, messages, topic]) => ({
    title: "在 marathon-project 与 Codex 协作",
    occurred_on: day,
    status: "verified",
    origin: "codex",
    claims: [
      {
        text: `这一天在项目 marathon-project 进行了 1 个 Codex 会话、共 ${messages} 条用户消息；最早一个会话从「${topic}」开始`,
      },
    ],
  }));
  const html = buildExhibitionHtml({
    stageName: "里程碑叙事",
    startsOn: "2026-06-01",
    endsOn: "2026-06-30",
    events: marathon,
    exportedAt: "2026-08-23T00:00:00.000Z",
  });
  // 四种里程碑角色都出现，且句式诚实。
  assert.match(html, /第一次交手/);
  assert.match(html, /最密集的一天/);
  assert.match(html, /占了整个项目消息量的/);
  assert.match(html, /天协作的收尾/);
  // 五天的叙事两两不同：没有任何两张同构句式卡片；主题词均可回溯。
  for (const [, , topic] of days) {
    assert.ok(html.includes(topic), `主题「${topic}」应出现在展卡或标签里`);
  }
  const captionMatches = html.match(/<p class="caption">[^<]+<\/p>/g) ?? [];
  const unique = new Set(captionMatches);
  assert.equal(unique.size, captionMatches.length);
  assert.ok(captionMatches.length >= 5);
});

test("协作风格速写：三轴读数确定性归纳（MBTI 式码 + SBTI 式称号）", async () => {
  const { buildCollaborationStyle } = await import("../app/exhibition/narrative.ts");
  const agentDay = (
    title: string,
    day: string,
    origin: string,
    messages: number,
  ) => ({
    title,
    occurred_on: day,
    status: "verified" as const,
    origin,
    claims: [
      { text: `这一天在项目 ${title} 进行了 1 个会话、共 ${messages} 条用户消息` },
    ],
  });

  // 深独爆：单项目三天，Claude 专一，峰值日占 80%。
  const deepSoloBurst = buildCollaborationStyle([
    agentDay("在 Alpha 与 Claude Code 协作", "2026-07-01", "claude", 2),
    agentDay("在 Alpha 与 Claude Code 协作", "2026-07-02", "claude", 20),
    agentDay("在 Alpha 与 Claude Code 协作", "2026-07-03", "claude", 3),
  ]);
  assert.equal(deepSoloBurst.code, "深独爆");
  assert.equal(deepSoloBurst.archetype, "闭关冲刺手");
  assert.equal(deepSoloBurst.axes.length, 3);
  assert.ok(deepSoloBurst.tagline.length > 0);

  // 广合缓：三个项目四天，Codex 与 pi 合奏，峰值日仅占 25%。
  const wideEnsembleSteady = buildCollaborationStyle([
    agentDay("在 Beta 与 Codex 协作", "2026-08-01", "codex", 3),
    agentDay("在 Gamma 与 pi 协作", "2026-08-02", "pi", 3),
    agentDay("在 Beta 与 Codex 协作", "2026-08-03", "codex", 3),
    agentDay("在 Delta 与 Codex 协作", "2026-08-04", "codex", 3),
  ]);
  assert.equal(wideEnsembleSteady.code, "广合缓");
  assert.equal(wideEnsembleSteady.archetype, "调度台主控");
  const flat = wideEnsembleSteady.axes.flatMap((axis) => axis.readings.map((r) => r.text));
  assert.ok(flat.some((text) => text.includes("3 个项目并行")));
  assert.ok(flat.some((text) => text.includes("25%")));
  assert.ok(flat.some((text) => text.includes("2 位搭档")));
  // 每轴恰有一侧胜出。
  for (const axis of wideEnsembleSteady.axes) {
    assert.equal(axis.readings.filter((r) => r.win).length, 1);
  }
});

test("导出携带协作风格速写：同一套三轴归纳随文件分享", async () => {
  const { buildExhibitionHtml } = await import("../app/exhibition/export-html.ts");
  const { buildCollaborationStyle } = await import("../app/exhibition/narrative.ts");
  const day = (title: string, date: string, origin: string, messages: number) => ({
    title,
    occurred_on: date,
    status: "verified" as const,
    origin,
    claims: [{ text: `这一天在项目 ${title} 进行了 1 个会话、共 ${messages} 条用户消息` }],
  });
  const events = [
    day("在 Beta 与 Codex 协作", "2026-08-01", "codex", 3),
    day("在 Gamma 与 pi 协作", "2026-08-02", "pi", 3),
    day("在 Beta 与 Codex 协作", "2026-08-03", "codex", 3),
    day("在 Delta 与 Codex 协作", "2026-08-04", "codex", 3),
  ];
  // 站内与导出共用同一聚合：结果必须一致。
  const style = buildCollaborationStyle(events);
  const html = buildExhibitionHtml({
    stageName: "风格导出",
    startsOn: "2026-08-01",
    endsOn: "2026-08-31",
    events,
    exportedAt: "2026-08-27T00:00:00.000Z",
  });
  assert.equal(style.code, "广合缓");
  assert.match(html, /协作风格速写/);
  assert.match(html, /广 · 合 · 缓/);
  assert.match(html, /调度台主控/);
  assert.match(html, /25%/);
  assert.match(html, /不是性格测评/);
  assert.doesNotMatch(html, /<script/i);
});
