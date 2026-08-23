import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExhibitionHtml,
  type ExportExhibitEvent,
} from "../app/exhibition/export-html.ts";

const events: ExportExhibitEvent[] = [
  {
    title: "在 DigitalMuseum 与 Claude Code 协作",
    occurred_on: "2026-08-21",
    status: "verified",
    claims: [{ text: "这一天在项目 DigitalMuseum 进行了 2 个 Claude Code 会话、共 5 条用户消息" }],
  },
  {
    title: "完成开源发布准备",
    occurred_on: "2026-07-02",
    status: "confirmed",
    claims: [{ text: "本人确认的关键经历。" }],
  },
  {
    title: "一次未定日期的讨论",
    occurred_on: null,
    status: "candidate",
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
  assert.match(html, /本人确认/);
  assert.match(html, /系统核实/);
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
      claims: [{ text: '"><img src=x onerror="steal()"> 说明文字' }],
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
