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

import { statusLabel } from "../events-shared.ts";
import { exhibitNarrative } from "./narrative.ts";

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

function monthKey(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return `${year}年${month}月`;
}

function displayDay(isoDate: string): string {
  return `${Number(isoDate.slice(5, 7))}月${Number(isoDate.slice(8, 10))}日`;
}

export function buildExhibitionHtml(input: ExportExhibitionInput): string {
  const dated = input.events.filter((event) => event.occurred_on);
  const undated = input.events.filter((event) => !event.occurred_on);
  dated.sort((a, b) =>
    a.occurred_on === b.occurred_on
      ? a.title.localeCompare(b.title)
      : (a.occurred_on ?? "").localeCompare(b.occurred_on ?? ""),
  );

  const groups = new Map<string, ExportExhibitEvent[]>();
  for (const event of dated) {
    const key = monthKey(event.occurred_on as string);
    const bucket = groups.get(key) ?? [];
    bucket.push(event);
    groups.set(key, bucket);
  }

  const confirmedCount = input.events.filter((e) => e.status === "confirmed").length;
  const verifiedCount = input.events.filter((e) => e.status === "verified").length;

  const sectionHtml = (key: string, events: ExportExhibitEvent[]): string => `
    <section class="month">
      <h2>${esc(key)}</h2>
      ${events
        .map(
          (event) => `
        <article class="event">
          <div class="meta">
            ${event.occurred_on ? `<time>${esc(displayDay(event.occurred_on))}</time>` : "<time>日期未定</time>"}
            <span class="chip ${esc(event.status)}">${esc(statusLabel(event.status))}</span>
          </div>
          <h3>${esc(event.title)}</h3>
          <p class="caption">${esc(exhibitNarrative(event))}</p>
        </article>`,
        )
        .join("")}
    </section>`;

  const monthsHtml = [...groups.entries()].map(([key, events]) => sectionHtml(key, events)).join("\n");
  const undatedHtml = undated.length
    ? sectionHtml("未定日期", undated.sort((a, b) => a.title.localeCompare(b.title)))
    : "";

  const exportDate = input.exportedAt.slice(0, 10);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="Digital Museum static exhibition export" />
<title>${esc(input.stageName)} · 数字博物馆静态展览</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0b0b0d; color: #f5f5f7;
    font: 16px/1.75 -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 48px 20px 64px; }
  header.page { border-bottom: 1px solid rgba(245,245,247,0.12); padding-bottom: 32px; margin-bottom: 40px; }
  .eyebrow { letter-spacing: 0.22em; font-size: 11px; color: #9f9fa0; text-transform: uppercase; font-family: ui-monospace, Menlo, monospace; }
  h1 { font-size: clamp(30px, 7vw, 46px); line-height: 1.15; margin: 16px 0 10px; font-weight: 400; letter-spacing: -0.02em; font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif; }
  .range { color: #9f9fa0; font-size: 13px; letter-spacing: 0.14em; font-family: ui-monospace, Menlo, monospace; }
  .stats { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 8px; }
  .stats span { font-size: 12px; border: 1px solid rgba(245,245,247,0.14); border-radius: 999px; padding: 4px 12px; color: #cacacf; font-family: ui-monospace, Menlo, monospace; }
  h2 { font-size: 13px; letter-spacing: 0.22em; color: #9f9fa0; margin: 56px 0 18px; text-transform: uppercase; font-family: ui-monospace, Menlo, monospace; }
  section.month { border-left: 2px solid #847dff; padding-left: 18px; }
  section.month:nth-child(2) { border-left-color: #dd90d8; }
  section.month:nth-child(3) { border-left-color: #90b8f0; }
  section.month:nth-child(4) { border-left-color: #d1c9ff; }
  section.month:nth-child(5) { border-left-color: #847dff; }
  .event { border-left: 2px solid #2a2a31; padding: 4px 0 4px 18px; margin: 0 0 26px 10px; }
  .meta { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .meta time { font-size: 12px; color: #9f9fa0; letter-spacing: 0.12em; font-family: ui-monospace, Menlo, monospace; }
  .chip { font-size: 11px; border-radius: 999px; padding: 2px 10px; letter-spacing: 0.05em; }
  .chip.confirmed { background: rgba(64, 129, 109, 0.25); color: #9fd6c2; border: 1px solid rgba(64, 129, 109, 0.5); }
  .chip.verified { background: rgba(78, 100, 160, 0.25); color: #b9c8f5; border: 1px solid rgba(78, 100, 160, 0.5); }
  .chip.candidate { background: rgba(150, 110, 60, 0.22); color: #e6c89a; border: 1px solid rgba(150, 110, 60, 0.5); }
  h3 { font-size: 20px; font-weight: 600; margin-bottom: 6px; font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif; }
  .caption { color: #b9b9bf; }
  .event p { color: #c7c5be; font-size: 14.5px; margin-bottom: 8px; }
  footer { border-top: 1px solid rgba(245,245,247,0.12); margin-top: 56px; padding-top: 20px; }
  footer p { color: #8a8a90; font-size: 12.5px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="page">
    <div class="eyebrow">Digital Museum · Personal AI Archive</div>
    <h1>${esc(input.stageName)}</h1>
    <p class="range">${esc(input.startsOn)} — ${esc(input.endsOn)}</p>
    <div class="stats">
      <span>${input.events.length} 段经历</span>
      <span>${confirmedCount} 段本人确认</span>
      <span>${verifiedCount} 段系统核实</span>
    </div>
  </header>
  ${monthsHtml}
  ${undatedHtml}
  <footer>
    <p>本页由 Digital Museum 在本机生成，是 ${esc(exportDate)} 的静态快照；可离线浏览与分享。</p>
    <p>证据链细节（原文锚点与文件指纹）保留在本机档案中，未随本页导出。「系统核实」指时间戳/计数等机器确定性读数，不代表对内容的解读。</p>
  </footer>
</div>
</body>
</html>
`;
}
