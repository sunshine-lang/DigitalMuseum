/**
 * 工作台（/）与展览馆（/exhibition、静态导出）共享的事件展示助手：
 * 时间线排序、可见经历过滤、状态文案。纯展示域纯函数，不碰 API 层。
 */

import type { CandidateEvent } from "./phase0-api";

/** 状态 → 展示文案（全部 8 态；disputed 2026-08 起统一为「描述需要修改」）。 */
export const statusLabels: Record<CandidateEvent["status"], string> = {
  candidate: "等待核对",
  verified: "系统核实",
  confirmed: "本人确认",
  disputed: "描述需要修改",
  unknown: "暂不确定",
  rejected: "不进入档案",
  merged: "已整理到其他经历",
  split: "已拆成其他经历",
};

/** 字符串状态的兜底查询（导出等 status 放宽为 string 的消费者用）。 */
export function statusLabel(status: string): string {
  return statusLabels[status as CandidateEvent["status"]] ?? "等待核对";
}

/** 可展示为一段“经历”的事件：排除整理结构态（merged/split）与用户排除（rejected）。 */
export function isVisibleExperience(event: CandidateEvent): boolean {
  return (
    event.status !== "merged" &&
    event.status !== "split" &&
    event.status !== "rejected"
  );
}

/** 时间线排序：无日期沉底，其余按日期升序。 */
export function sortEvents(events: CandidateEvent[]): CandidateEvent[] {
  return [...events].sort((a, b) => {
    if (!a.occurred_on) return 1;
    if (!b.occurred_on) return -1;
    return a.occurred_on.localeCompare(b.occurred_on);
  });
}
