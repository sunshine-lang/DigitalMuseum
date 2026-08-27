/**
 * 工作台（/）与展览馆（/exhibition、静态导出）共享的事件展示助手：
 * 时间线排序、可见经历过滤、状态文案。纯展示域纯函数，不碰 API 层。
 */

import type { CandidateEvent } from "./phase0-api";

/** 状态 → 展示文案（6 态；disputed 2026-08 起统一为「描述需要修改」）。 */
export const statusLabels: Record<CandidateEvent["status"], string> = {
  candidate: "等待核对",
  verified: "系统核实",
  confirmed: "本人确认",
  disputed: "描述需要修改",
  unknown: "暂不确定",
  rejected: "不进入档案",
};

/** 字符串状态的兜底查询（导出等 status 放宽为 string 的消费者用）。 */
export function statusLabel(status: string): string {
  return statusLabels[status as CandidateEvent["status"]] ?? "等待核对";
}

/** 可展示为一段“经历”的事件：排除用户排除（rejected）。 */
export function isVisibleExperience(event: CandidateEvent): boolean {
  return event.status !== "rejected";
}

/** 时间线排序：无日期沉底，其余按日期升序。 */
export function sortEvents(events: CandidateEvent[]): CandidateEvent[] {
  return [...events].sort((a, b) => {
    if (!a.occurred_on) return 1;
    if (!b.occurred_on) return -1;
    return a.occurred_on.localeCompare(b.occurred_on);
  });
}

/** Agent 产品注册名（origin → 展示名），与后端 AGENT_PRODUCTS 一一对应。 */
export const AGENT_PRODUCT_NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  pi: "pi",
  dsh: "dsh",
};

/** ISO 日期（YYYY-MM-DD 或 YYYY-MM）→ 中文月份标签（站内与导出同一格式）。 */
export function monthLabelOf(isoDate: string): string {
  return `${isoDate.slice(0, 4)} 年 ${Number(isoDate.slice(5, 7))} 月`;
}

/** 未知异常 → 用户可读文案；默认兜底可按场景覆写。 */
export function errorTextOf(error: unknown, fallback = "操作失败，请稍后重试。"): string {
  return error instanceof Error ? error.message : fallback;
}

/** 可见经历的首尾日期（无日期事件不参与；无任何日期时返回 null）。 */
export function dateSpanOf(
  events: CandidateEvent[],
): { startsOn: string; endsOn: string } | null {
  const dated = events
    .map((event) => event.occurred_on)
    .filter((value): value is string => Boolean(value))
    .sort();
  if (!dated.length) return null;
  return { startsOn: dated[0], endsOn: dated[dated.length - 1] };
}
