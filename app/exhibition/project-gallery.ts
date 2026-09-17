import type { CandidateEvent } from "../phase0-api.ts";
import { AGENT_PRODUCT_NAMES, dateSpanOf, statusLabel } from "../events-shared.ts";

export const PROJECT_ART = [
  { image: "/gallery/paper-study.png", background: "#f3ede0", accent: "#987743", name: "纸页与金线" },
  { image: "/gallery/thread-study.png", background: "#e9e6f0", accent: "#79708d", name: "缎带与圆环" },
  { image: "/gallery/bridge-study.png", background: "#e7edef", accent: "#5f7d87", name: "纸桥与玻璃" },
];

export type GalleryProject = {
  id: string;
  label: string;
  path: string | null;
  identityNote: string | null;
  events: CandidateEvent[];
  agents: string;
  dateLabel: string;
  latest: string;
  days: number;
  art: typeof PROJECT_ART[number];
};

/** 封面只跟随身份，选展顺序和日期变化不会换图。 */
export function projectArt(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return PROJECT_ART[(hash >>> 0) % PROJECT_ART.length];
}

export function agentLabel(event: CandidateEvent) {
  const products = event.agent_products?.length ? event.agent_products : [event.origin];
  return [...new Set(products.map(product => AGENT_PRODUCT_NAMES[product] ?? "来源待确认"))].sort().join(" · ");
}

export function projectPathLabel(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}

/** 来源不明确的事件独立展示，绝不凭同名标题合并；这里只组织视图，不改档案。 */
export function groupProjects(events: CandidateEvent[]): GalleryProject[] {
  const groups = new Map<string, CandidateEvent[]>();
  for (const event of events) {
    const id = event.project_key ?? `event:${event.id}`;
    const group = groups.get(id) ?? [];
    group.push(event);
    groups.set(id, group);
  }
  return [...groups].map(([id, records]) => {
    const sorted = [...records].sort((a, b) => (a.occurred_on ?? "9999").localeCompare(b.occurred_on ?? "9999") || a.id.localeCompare(b.id));
    const first = sorted[0];
    const span = dateSpanOf(sorted);
    const agents = [...new Set(sorted.flatMap(event => (event.agent_products?.length ? event.agent_products : [event.origin])))];
    return {
      id, label: first.project_label ?? first.title,
      path: first.project_path ?? null,
      identityNote: !first.project_key ? "项目归属待确认 · 暂作为独立记录展示" : !first.project_path ? "会话目录归档 · 跨 Agent 归属待确认" : null,
      events: sorted,
      agents: agents.map(product => AGENT_PRODUCT_NAMES[product] ?? "来源待确认").sort().join(" · "),
      dateLabel: span ? span.startsOn === span.endsOn ? span.startsOn : `${span.startsOn} — ${span.endsOn}` : "时间待定",
      latest: span?.endsOn ?? "",
      days: new Set(sorted.map(event => event.occurred_on).filter(Boolean)).size,
      art: projectArt(id),
    };
  }).sort((a, b) => b.latest.localeCompare(a.latest) || a.id.localeCompare(b.id));
}

export function projectStatus(project: GalleryProject) {
  const statuses = new Set(project.events.map(event => event.status));
  if (statuses.size === 1) return `${statusLabel(project.events[0].status)} · ${project.events.length} 条记录`;
  const pending = project.events.filter(event => event.status !== "verified" && event.status !== "confirmed").length;
  return pending ? `${pending} 条记录待核对 · 逐条保留状态` : "系统核实 / 本人确认 · 逐条保留状态";
}

/** 只取确定性展签已有的摘录，不再清洗、改写其中的原话。 */
export function projectQuote(project: GalleryProject) {
  for (const event of project.events) {
    for (const claim of event.claims) {
      const quote = claim.text.match(/；最早一个会话从「([\s\S]*)」开始$/)?.[1];
      if (quote) return { text: quote, date: event.occurred_on ?? "时间待定" };
    }
  }
  return null;
}
