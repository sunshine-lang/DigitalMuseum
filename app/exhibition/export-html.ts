/**
 * 静态展览导出：把勾选展出的事件渲染为一个自包含 HTML 文件。
 *
 * 宪法约束（PRD v0.2 §7.2/§9）：
 * - 只含用户勾选进入展览的事件；证据链细节（原文锚点、文件指纹、blob）
 *   默认不随导出公开；
 * - 无外部资源、无脚本：断网双击 file:// 可看，手机 390px 可读；
 * - 所有用户产生的文本一律 HTML 转义；
 * - 导出前做敏感信息风险扫描（密钥/路径/邮箱），命中必须经人工确认。
 */

import { monthLabelOf, statusLabel } from "../events-shared.ts";
import {
  buildCollaborationStyle,
  buildProjectMilestones,
  exhibitNarrative,
  milestoneKeyFor,
} from "./narrative.ts";

export type ExportExhibitEvent = {
  title: string;
  occurred_on: string | null;
  status: string;
  origin: string;
  claims: { text: string }[];
};

/** 导出内容里的疑似敏感信息（PRD §9：导出前需单独检查密钥、邮箱、路径）。 */
export type ExportRisk = {
  kind: "secret" | "path" | "email";
  count: number;
  sample: string;
};

export const EXPORT_RISK_LABELS: Record<ExportRisk["kind"], string> = {
  secret: "常见密钥 / 令牌",
  path: "本机绝对路径",
  email: "邮箱地址",
};

// 高精度模式优先：宁可漏报交还人工，不可误报淹没确认弹窗。
const RISK_PATTERNS: Array<[ExportRisk["kind"], RegExp]> = [
  [
    "secret",
    /\b(?:sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{30,}|glpat-[A-Za-z0-9_-]{20,})/g,
  ],
  [
    "path",
    /(?:\/(?:Users|home|Volumes)\/[^\s"'<>）。，、；]+|~\/[^\s"'<>）。，、；]+|[A-Za-z]:\\Users\\[^\s"'<>）。，、；]+)/g,
  ],
  ["email", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
];

/** 扫描最终导出 HTML：命中任意一类即返回清单（UI 据此拦截并要求人工确认）。 */
export function scanExportRisks(html: string): ExportRisk[] {
  const risks: ExportRisk[] = [];
  for (const [kind, pattern] of RISK_PATTERNS) {
    const matches = html.match(pattern);
    if (matches?.length) {
      risks.push({ kind, count: matches.length, sample: matches[0].slice(0, 24) });
    }
  }
  return risks;
}

export type ExportExhibitionInput = {
  stageName: string;
  startsOn: string;
  endsOn: string;
  events: ExportExhibitEvent[];
  exportedAt: string;
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayDay(isoDate: string): string {
  return `${Number(isoDate.slice(5, 7))}月${Number(isoDate.slice(8, 10))}日`;
}

export function buildExhibitionHtml(input: ExportExhibitionInput): string {
  // 展出事件的叙事视图（里程碑 + 协作风格共用同一份确定性聚合）。
  const narrativeEvents = input.events.map((event) => ({
    title: event.title,
    occurred_on: event.occurred_on,
    origin: event.origin,
    claims: event.claims,
  }));
  // 项目级里程碑：全部展出事件聚合一次，卡片按其在项目中的位置取叙事。
  const milestones = buildProjectMilestones(narrativeEvents);
  // 协作风格速写（尾声）：与站内同一套三轴确定性归纳。
  const style = buildCollaborationStyle(narrativeEvents);
  const dated = input.events.filter((event) => event.occurred_on);
  const undated = input.events.filter((event) => !event.occurred_on);
  dated.sort((a, b) =>
    a.occurred_on === b.occurred_on
      ? a.title.localeCompare(b.title)
      : (a.occurred_on ?? "").localeCompare(b.occurred_on ?? ""),
  );

  const groups = new Map<string, ExportExhibitEvent[]>();
  for (const event of dated) {
    const key = monthLabelOf(event.occurred_on as string);
    const bucket = groups.get(key) ?? [];
    bucket.push(event);
    groups.set(key, bucket);
  }

  const confirmedCount = input.events.filter((e) => e.status === "confirmed").length;
  const verifiedCount = input.events.filter((e) => e.status === "verified").length;

  const sectionHtml = (key: string, events: ExportExhibitEvent[], index: number): string => `
    <section class="month hall-${(index % 4) + 1}">
      <header class="month-head">
        <span class="month-no">${String(index + 1).padStart(2, "0")}</span>
        <h2>${esc(key)}</h2>
        <span class="month-count">${events.length} 段经历</span>
      </header>
      <div class="spine">
      ${events
        .map(
          (event) => `
        <article class="event">
          <span class="node" aria-hidden="true"></span>
          <div class="meta">
            ${event.occurred_on ? `<time>${esc(displayDay(event.occurred_on))}</time>` : "<time>日期未定</time>"}
            <span class="chip ${esc(event.status)}">${esc(statusLabel(event.status))}</span>
          </div>
          <h3>${esc(event.title)}</h3>
          <p class="caption">${esc(exhibitNarrative(event, milestones.get(milestoneKeyFor(event))))}</p>
        </article>`,
        )
        .join("")}
      </div>
    </section>`;

  const monthsHtml = [...groups.entries()]
    .map(([key, events], index) => sectionHtml(key, events, index))
    .join("\n");
  const undatedHtml = undated.length
    ? sectionHtml("未定日期", undated.sort((a, b) => a.title.localeCompare(b.title)), groups.size)
    : "";

  const exportDate = input.exportedAt.slice(0, 10);

  const styleAxisHtml = style.axes
    .map(
      (axis) => `
      <div class="style-row">
        <span class="${axis.readings[0].win ? "win" : ""}">
          <b>${esc(axis.readings[0].pole)}</b>
          <small>${esc(axis.readings[0].text)}</small>
        </span>
        <i>vs</i>
        <span class="${axis.readings[1].win ? "win" : ""}">
          <b>${esc(axis.readings[1].pole)}</b>
          <small>${esc(axis.readings[1].text)}</small>
        </span>
      </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="Digital Museum static exhibition export" />
<title>${esc(input.stageName)} · 数字博物馆静态展览</title>
<style>
  /* 午夜档案馆 · 静态叙事版（与站内 S5 层同源的精简 CSS 降级：无脚本、无外链、系统字体） */
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0b0b0d; color: #f5f5f7;
    font: 16px/1.75 -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  body::before {
    content: "";
    position: fixed; inset: 0; pointer-events: none;
    background:
      radial-gradient(52% 30% at 50% -4%, rgba(132, 125, 255, 0.10), transparent 70%),
      radial-gradient(60% 26% at 50% 106%, rgba(245, 245, 247, 0.05), transparent 72%);
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 22px 72px; position: relative; }

  /* —— 封面：深夜开卷 —— */
  header.page { padding: 84px 0 40px; text-align: center; }
  .eyebrow {
    letter-spacing: 0.34em; text-indent: 0.34em; font-size: 11px; color: #e6c89a;
    text-transform: uppercase; font-family: ui-monospace, Menlo, monospace;
  }
  h1 {
    font-size: clamp(34px, 7.5vw, 54px); line-height: 1.14; margin: 18px auto 0; font-weight: 700;
    letter-spacing: -0.02em; max-width: 14ch;
    font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif;
  }
  .cover-sub {
    margin-top: 14px; font-size: 12px; color: #a89dff; letter-spacing: 0.3em; text-indent: 0.3em;
    font-family: ui-monospace, Menlo, monospace;
  }
  .range {
    color: #9f9fa0; font-size: 13px; letter-spacing: 0.18em; margin-top: 16px;
    font-family: ui-monospace, Menlo, monospace;
  }
  .stats { margin-top: 22px; display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; }
  .stats span {
    font-size: 12px; border: 1px solid rgba(245, 245, 247, 0.14); border-radius: 999px;
    padding: 4px 13px; color: #cacacf; background: rgba(20, 20, 22, 0.6);
    font-family: ui-monospace, Menlo, monospace;
  }
  @keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  header.page > :nth-child(1) { animation: rise 0.7s ease both; }
  header.page > :nth-child(2) { animation: rise 0.7s ease 0.12s both; }
  header.page > :nth-child(3) { animation: rise 0.7s ease 0.24s both; }
  header.page > :nth-child(4) { animation: rise 0.7s ease 0.36s both; }
  header.page > :nth-child(5) { animation: rise 0.7s ease 0.48s both; }

  /* —— 展厅标签 —— */
  .gallery-label {
    display: flex; align-items: center; gap: 14px; margin: 10px 0 0;
    font-size: 10px; letter-spacing: 0.38em; text-indent: 0.38em; color: #c9a25e;
    white-space: nowrap; font-family: ui-monospace, Menlo, monospace;
  }
  .gallery-label::before, .gallery-label::after { content: ""; height: 1px; flex: 1; }
  .gallery-label::before { background: linear-gradient(90deg, transparent, rgba(245, 245, 247, 0.12)); }
  .gallery-label::after { background: linear-gradient(90deg, rgba(245, 245, 247, 0.12), transparent); }

  /* —— 月份章：厅色 + 章头铭牌 —— */
  section.month { margin-top: 68px; --hall: #847dff; }
  section.month.hall-2 { --hall: #dd90d8; }
  section.month.hall-3 { --hall: #90b8f0; }
  section.month.hall-4 { --hall: #d1c9ff; }
  .month-head {
    display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
    border-bottom: 1px solid rgba(245, 245, 247, 0.1); padding-bottom: 12px;
  }
  .month-no {
    font-family: ui-monospace, Menlo, monospace; font-size: 11px; letter-spacing: 0.3em;
    color: var(--hall); border: 1px solid rgba(245, 245, 247, 0.2); padding: 5px 9px; border-radius: 3px;
    background: rgba(20, 20, 22, 0.6);
  }
  .month-head h2 {
    font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif;
    font-size: clamp(24px, 4.5vw, 34px); font-weight: 700; letter-spacing: 0.02em; line-height: 1.2;
  }
  .month-count {
    margin-left: auto; font-size: 11px; color: #7b7b80; letter-spacing: 0.18em;
    font-family: ui-monospace, Menlo, monospace;
  }

  /* —— 脊线编年：左脊光线 + 节点 + 卡片 —— */
  .spine { position: relative; margin-top: 26px; }
  .spine::before {
    content: ""; position: absolute; left: 5px; top: -8px; bottom: -8px; width: 1px;
    background: linear-gradient(180deg,
      transparent, rgba(132, 125, 255, 0.4) 6%, rgba(132, 125, 255, 0.3) 94%, transparent);
  }
  section.month.hall-2 .spine::before { background: linear-gradient(180deg, transparent, rgba(221, 144, 216, 0.4) 6%, rgba(221, 144, 216, 0.3) 94%, transparent); }
  section.month.hall-3 .spine::before { background: linear-gradient(180deg, transparent, rgba(144, 184, 240, 0.4) 6%, rgba(144, 184, 240, 0.3) 94%, transparent); }
  section.month.hall-4 .spine::before { background: linear-gradient(180deg, transparent, rgba(209, 201, 255, 0.4) 6%, rgba(209, 201, 255, 0.3) 94%, transparent); }
  .event {
    position: relative; margin: 0 0 18px 26px; padding: 16px 18px 14px;
    background: #141416; border: 1px solid rgba(245, 245, 247, 0.08); border-radius: 12px;
  }
  .event .node {
    position: absolute; left: -27px; top: 22px; width: 9px; height: 9px; border-radius: 50%;
    background: #0b0b0d; border: 2px solid var(--hall); box-shadow: 0 0 10px rgba(132, 125, 255, 0.35);
  }
  .event::after {
    content: ""; position: absolute; left: -20px; top: 27px; width: 20px; height: 1px;
    background: linear-gradient(90deg, var(--hall), transparent); opacity: 0.35;
  }
  .meta { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .meta time {
    font-size: 11px; color: #e6c89a; letter-spacing: 0.2em; text-transform: uppercase;
    font-family: ui-monospace, Menlo, monospace;
  }
  .chip { font-size: 11px; border-radius: 999px; padding: 2px 10px; letter-spacing: 0.05em; }
  .chip.confirmed { background: rgba(64, 129, 109, 0.25); color: #9fd6c2; border: 1px solid rgba(64, 129, 109, 0.5); }
  .chip.verified { background: rgba(78, 100, 160, 0.25); color: #b9c8f5; border: 1px solid rgba(78, 100, 160, 0.5); }
  .chip.candidate { background: rgba(150, 110, 60, 0.22); color: #e6c89a; border: 1px solid rgba(150, 110, 60, 0.5); }
  h3 {
    font-size: 20px; font-weight: 600; margin-bottom: 8px; line-height: 1.4;
    font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif;
  }
  .caption {
    color: #d3d3d8; font-size: 15px; line-height: 2;
    font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif;
  }

  /* —— 尾声 · 协作风格速写（与站内同款三轴读数；纯 CSS 无脚本） —— */
  section.style { border-top: 1px solid rgba(245, 245, 247, 0.12); margin-top: 72px; padding-top: 6px; text-align: center; }
  section.style h2 {
    margin: 14px 0 0; font-size: 11px; letter-spacing: 0.34em; text-indent: 0.34em; color: #c9a25e;
    text-transform: uppercase; font-family: ui-monospace, Menlo, monospace;
  }
  .style-code { margin: 8px 0 0; font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif; font-size: clamp(40px, 9vw, 64px); line-height: 1.1; letter-spacing: 0.04em; }
  .style-name { margin: 8px 0 0; font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif; font-size: 21px; }
  .style-tagline { margin: 4px 0 0; color: #9f9fa0; font-size: 13.5px; }
  .style-rows { margin: 18px auto 0; display: grid; gap: 8px; text-align: left; }
  .style-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; border: 1px solid rgba(245, 245, 247, 0.1); border-radius: 10px; padding: 10px 14px; background: rgba(20, 20, 22, 0.5); }
  .style-row b { display: block; margin-bottom: 3px; font: 500 11px/1 ui-monospace, Menlo, monospace; letter-spacing: 0.2em; color: #7b7b80; }
  .style-row small { font-size: 11.5px; line-height: 1.6; color: #9f9fa0; overflow-wrap: anywhere; }
  .style-row i { font: 400 9px/1 ui-monospace, Menlo, monospace; font-style: normal; letter-spacing: 0.12em; color: #7b7b80; }
  .style-row .win b { color: #a89dff; }
  .style-row .win small { color: #e8e8ec; }
  .style-note { margin: 14px 0 0; color: #8a8a90; font-size: 10.5px; line-height: 1.7; }

  footer { border-top: 1px solid rgba(245, 245, 247, 0.12); margin-top: 64px; padding-top: 22px; text-align: center; }
  footer p { color: #8a8a90; font-size: 12.5px; line-height: 2; }

  @media (max-width: 560px) {
    .style-row { grid-template-columns: 1fr; gap: 6px; }
    .style-row i { display: none; }
    .style-row .win { border-left: 2px solid #a89dff; padding-left: 8px; }
    .event { margin-left: 22px; }
    .event .node { left: -23px; }
    .event::after { left: -16px; width: 16px; }
    .month-count { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    header.page > * { animation: none; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="page">
    <div class="eyebrow">PRIVATE EXHIBITION · Digital Museum</div>
    <h1>${esc(input.stageName)}</h1>
    <p class="cover-sub">原始证据 · 分级核实 · 未由模型补写</p>
    <p class="range">${esc(input.startsOn)} — ${esc(input.endsOn)}</p>
    <div class="stats">
      <span>${input.events.length} 段经历</span>
      <span>${confirmedCount} 段本人确认</span>
      <span>${verifiedCount} 段系统核实</span>
    </div>
  </header>
  <p class="gallery-label">EXHIBIT Ⅰ · 编年 CHRONICLE</p>
  ${monthsHtml}
  ${undatedHtml}
  <section class="style">
    <h2>Collaboration Style · 协作风格速写</h2>
    <p class="style-code">${esc(style.code.split("").join(" · "))}</p>
    <p class="style-name">${esc(style.archetype)}</p>
    <p class="style-tagline">「${esc(style.tagline)}」</p>
    <div class="style-rows">${styleAxisHtml}</div>
    <p class="style-note">基于本次展出 ${input.events.length} 段经历的确定性读数归纳，供对照一乐，不是性格测评。</p>
  </section>
  <footer>
    <p>本页由 Digital Museum 在本机生成，是 ${esc(exportDate)} 的静态快照；可离线浏览与分享。</p>
    <p>证据链细节（原文锚点与文件指纹）保留在本机档案中，未随本页导出。「系统核实」指时间戳/计数等机器确定性读数，不代表对内容的解读。</p>
  </footer>
</div>
</body>
</html>
`;
}
