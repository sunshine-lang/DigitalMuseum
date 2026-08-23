/**
 * 静态展览导出：把勾选展出的事件渲染为一个自包含 HTML 文件。
 *
 * 宪法约束（PRD v0.2 §7.2/§9）：
 * - 只含用户勾选进入展览的事件；证据链细节（原文锚点、文件指纹、blob）
 *   默认不随导出公开；
 * - 无外部资源、无脚本：断网双击 file:// 可看，手机 390px 可读；
 * - 所有用户产生的文本一律 HTML 转义。
 */

export type ExportExhibitEvent = {
  title: string;
  occurred_on: string | null;
  status: string;
  claims: { text: string }[];
};

export type ExportExhibitionInput = {
  stageName: string;
  startsOn: string;
  endsOn: string;
  events: ExportExhibitEvent[];
  exportedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "本人确认",
  verified: "系统核实",
  candidate: "等待核对",
  disputed: "本人存疑",
  unknown: "暂不确定",
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? "已整理";
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
          ${event.claims
            .map((claim) => `<p>${esc(claim.text)}</p>`)
            .join("\n          ")}
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
    background: #101014; color: #e8e6e1;
    font: 16px/1.75 -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 48px 20px 64px; }
  header.page { border-bottom: 1px solid #2c2c33; padding-bottom: 32px; margin-bottom: 40px; }
  .eyebrow { letter-spacing: 0.22em; font-size: 11px; color: #8f8d86; text-transform: uppercase; }
  h1 { font-size: clamp(26px, 6vw, 38px); line-height: 1.3; margin: 14px 0 10px; font-weight: 700; }
  .range { color: #a9a7a0; font-size: 14px; }
  .stats { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 8px; }
  .stats span { font-size: 12px; border: 1px solid #33333b; border-radius: 999px; padding: 4px 12px; color: #b9b7b0; }
  h2 { font-size: 13px; letter-spacing: 0.18em; color: #8f8d86; margin: 44px 0 16px; text-transform: uppercase; }
  .event { border-left: 2px solid #33333b; padding: 4px 0 4px 18px; margin-bottom: 26px; }
  .meta { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .meta time { font-size: 13px; color: #8f8d86; }
  .chip { font-size: 11px; border-radius: 999px; padding: 2px 10px; letter-spacing: 0.05em; }
  .chip.confirmed { background: rgba(64, 129, 109, 0.25); color: #9fd6c2; border: 1px solid rgba(64, 129, 109, 0.5); }
  .chip.verified { background: rgba(78, 100, 160, 0.25); color: #b9c8f5; border: 1px solid rgba(78, 100, 160, 0.5); }
  .chip.candidate { background: rgba(150, 110, 60, 0.22); color: #e6c89a; border: 1px solid rgba(150, 110, 60, 0.5); }
  h3 { font-size: 19px; font-weight: 600; margin-bottom: 8px; }
  .event p { color: #c7c5be; font-size: 14.5px; margin-bottom: 8px; }
  footer { border-top: 1px solid #2c2c33; margin-top: 56px; padding-top: 20px; }
  footer p { color: #7c7a74; font-size: 12.5px; }
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
