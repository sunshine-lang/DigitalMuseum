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
  assert.ok(!html.includes("<b>"));
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
