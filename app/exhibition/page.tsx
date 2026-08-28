"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { CandidateEvent, Claim, listArchiveEvents } from "../phase0-api";
import {
  dateSpanOf,
  errorTextOf,
  isVisibleExperience,
  monthLabelOf,
  sortEvents,
  statusLabel,
} from "../events-shared";
import {
  EXPORT_RISK_LABELS,
  buildExhibitionHtml,
  scanExportRisks,
  type ExportRisk,
} from "./export-html";
import {
  buildCollaborationStyle,
  buildProjectMilestones,
  exhibitNarrative,
  mediumLineOf,
  milestoneKeyFor,
  openingQuoteOf,
  type ProjectMilestone,
} from "./narrative";

// 档案库为根（ADR-0001）：展览不再挂阶段，封面信息由档案数据推导。
const ARCHIVE_TITLE = "我的 Agent 协作档案";

type ExpoPhase = "select" | "show";
type LoadStatus = "loading" | "ready" | "empty" | "error";

// 展览只有一种视觉：午夜档案馆（与 export-html 导出文件的同色系精简模板呼应）。
const EXPO_THEME = "museum-night";

const HALL_ACCENTS = ["#847dff", "#dd90d8", "#90b8f0", "#d1c9ff"];

// 开馆终端序列的行距（ms）与收尾停留（ms）：总时长约 2.4s，可随时跳过。
const BOOT_STEP_MS = 240;
const BOOT_HOLD_MS = 900;

type ArchiveMeta = {
  name: string;
  starts_on: string;
  ends_on: string;
  evidence_count: number;
};

// 证据抽屉的状态：只存定位键，正文渲染时再从事件里取，避免复制数据。
type DrawerState = { eventId: string; claimIndex: number } | null;

// 封面元数据全部由档案数据推导：跨度取可见经历的首尾日期，
// 原始记录数取事件锚点引用的不同证据文档（blob 指纹）数。
function deriveArchiveMeta(visibleEvents: CandidateEvent[]): ArchiveMeta | null {
  const span = dateSpanOf(visibleEvents);
  if (!span) return null;
  const blobs = new Set<string>();
  for (const event of visibleEvents) {
    for (const claim of event.claims) {
      for (const anchor of claim.anchors) blobs.add(anchor.blob_sha256);
    }
  }
  return {
    name: ARCHIVE_TITLE,
    starts_on: span.startsOn,
    ends_on: span.endsOn,
    evidence_count: blobs.size,
  };
}

function monthKey(event: CandidateEvent): string {
  return event.occurred_on?.slice(0, 7) ?? "undated";
}

function monthLabel(key: string): string {
  return key === "undated" ? "时间待定" : monthLabelOf(key);
}

function monthsBetween(startsOn: string, endsOn: string): number {
  const [startYear, startMonth] = startsOn.split("-").map(Number);
  const [endYear, endMonth] = endsOn.split("-").map(Number);
  return endYear * 12 + endMonth - (startYear * 12 + startMonth) + 1;
}

/* —— 主展位（刀一·展陈节奏）：每厅由里程碑数据选一件主展 ——
 * 优先级：项目最密集的一天 > 第一次交手 > 收官之作；
 * 同分依次比来源数、日期、标题，全程确定性。
 */
function heroRank(milestone: ProjectMilestone | undefined): number {
  if (milestone?.isPeakDay) return 3;
  if (milestone?.isFirstDay) return 2;
  if (milestone?.isLastDay) return 1;
  return 0;
}

function heroRoleLabel(milestone: ProjectMilestone | undefined): string {
  if (milestone?.isPeakDay) return "最密集的一天";
  if (milestone?.isFirstDay) return "第一次交手";
  if (milestone?.isLastDay) return "收官之作";
  return "";
}

function pickHallHero(
  shown: CandidateEvent[],
  milestoneFor: (event: CandidateEvent) => ProjectMilestone | undefined,
): CandidateEvent | undefined {
  if (!shown.length) return undefined;
  return [...shown].sort((a, b) => {
    const rank = heroRank(milestoneFor(b)) - heroRank(milestoneFor(a));
    if (rank !== 0) return rank;
    const sources = b.source_count - a.source_count;
    if (sources !== 0) return sources;
    const day = (a.occurred_on ?? "9999").localeCompare(b.occurred_on ?? "9999");
    if (day !== 0) return day;
    return a.title.localeCompare(b.title);
  })[0];
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* —— 读数滚动（S5）：进入视野后缓出计数；reduced-motion 直接落值 —— */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // animated 为 null 表示尚未开始：此时按环境降级直接显示终值或 0。
  const [animated, setAnimated] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    let raf = 0;
    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((entry) => entry.isIntersecting)) return;
        started = true;
        observer.disconnect();
        const t0 = performance.now();
        const duration = 1200;
        const frame = (t: number) => {
          const progress = Math.min(1, (t - t0) / duration);
          setAnimated(Math.round(value * (1 - Math.pow(1 - progress, 3))));
          if (progress < 1) raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  const display =
    animated ?? (prefersReducedMotion() || !("IntersectionObserver" in window) ? value : 0);
  return (
    <span ref={ref}>
      {display.toLocaleString("zh-Hans-CN")}
    </span>
  );
}

/* —— 代码诗意排版（S5）：锚定原文按行渲染为等宽诗行。
 * React 文本节点自动转义，不拼 HTML；着色只按行内容确定性分类。
 */
function poemLineClass(line: string): string {
  if (/^\s*\$/.test(line) || /^\[\d/.test(line) || /\d{1,2}:\d{2}/.test(line)) return "cl meta";
  if (/(FAILED|ERROR|Traceback)/i.test(line)) return "cl warn";
  if (/(passed|ready|blob stored|sync ok)/i.test(line)) return "cl ok";
  return "cl";
}

function PoemText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <span className={poemLineClass(line)} key={index}>
          {line.length ? line : "\u00A0"}
        </span>
      ))}
    </>
  );
}

/* —— 分级信任印章：confirmed=已入馆钢印 / verified=系统核实方章 / 其余=草稿状态药丸 —— */
function StatusSeal({ status }: { status: string }) {
  if (status === "confirmed") return <span className="expo-seal">已入馆</span>;
  if (status === "verified") return <span className="expo-seal sys">系统核实</span>;
  return <span className="expo-card-status">{statusLabel(status)}</span>;
}

/* —— 编目号：厅号两位 + 展位两位（主展占 01，脊线卡从 02 起编） —— */
function catalogNo(chapterIndex: number, slot: number): string {
  return `No. ${String(chapterIndex + 1).padStart(2, "0")}${String(slot + 1).padStart(2, "0")}`;
}

export default function ExhibitionWorkspace() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [phase, setPhase] = useState<ExpoPhase>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const progressRef = useRef<HTMLDivElement | null>(null);
  const showRef = useRef<HTMLElement | null>(null);

  // 开馆终端序列：bootDone 后覆盖层淡出、封面升起、解锁滚动。
  const [bootDone, setBootDone] = useState(false);
  const [bootStep, setBootStep] = useState(0);

  // 证据抽屉：drawer 存定位键，drawerOpen 驱动滑入/滑出过渡。
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerTimerRef = useRef<number | null>(null);

  const visibleEvents = useMemo(() => sortEvents(events.filter(isVisibleExperience)), [events]);
  const archive = useMemo(() => deriveArchiveMeta(visibleEvents), [visibleEvents]);

  const groups = useMemo(() => {
    const byMonth = new Map<string, CandidateEvent[]>();
    for (const event of visibleEvents) {
      const key = monthKey(event);
      byMonth.set(key, [...(byMonth.get(key) ?? []), event]);
    }
    return [...byMonth.entries()].sort((a, b) => {
      if (a[0] === "undated") return 1;
      if (b[0] === "undated") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [visibleEvents]);

  const selectedEvents = useMemo(
    () => visibleEvents.filter((event) => selectedIds.has(event.id)),
    [visibleEvents, selectedIds],
  );
  const confirmedCount = useMemo(
    () => selectedEvents.filter((event) => event.status === "confirmed").length,
    [selectedEvents],
  );
  const selectedMilestones = useMemo(
    () => buildProjectMilestones(selectedEvents),
    [selectedEvents],
  );
  const milestoneFor = (event: CandidateEvent): ProjectMilestone | undefined =>
    selectedMilestones.get(milestoneKeyFor(event));
  const verifiedCount = useMemo(
    () => selectedEvents.filter((event) => event.status === "verified").length,
    [selectedEvents],
  );
  const draftCount = selectedEvents.length - confirmedCount - verifiedCount;
  const spanMonths = archive ? monthsBetween(archive.starts_on, archive.ends_on) : groups.length;

  // 开馆序列的行数据：全部来自确定性读数，不含任何推断性文案。
  const bootLines = useMemo(() => {
    const lines = [
      "$ museum --open",
      "mounting local archive ............ ok",
      `selected exhibits ................. ${selectedEvents.length} 段`,
    ];
    if (archive) {
      lines.push(
        `covering ${archive.starts_on} — ${archive.ends_on} · ${spanMonths} 个月`,
        `evidence blobs ................... ${archive.evidence_count} 份 · 只读`,
      );
    }
    lines.push(
      `本人确认 ${confirmedCount} · 系统核实 ${verifiedCount} · 草稿 ${draftCount}`,
      "midnight archive ................. ready",
    );
    return lines;
  }, [archive, confirmedCount, draftCount, selectedEvents.length, spanMonths, verifiedCount]);

  useEffect(() => {
    listArchiveEvents()
      .then((nextEvents) => {
        setEvents(nextEvents);
        const visible = nextEvents.filter(isVisibleExperience);
        if (!visible.length) {
          setStatus("empty");
          return;
        }
        // 默认选展：confirmed + verified 合集（本人确认与系统核实都算“已确认真”），
        // 合集为空时退回全部可见事件。
        const settled = visible.filter(
          (event) => event.status === "confirmed" || event.status === "verified",
        );
        setSelectedIds(
          new Set((settled.length ? settled : visible).map((event) => event.id)),
        );
        setStatus("ready");
      })
      .catch((error: unknown) => {
        setErrorMessage(errorTextOf(error, "读取回顾档案失败"));
        setStatus("error");
      });
  }, []);

  // 开馆终端序列：逐行打出，点击/按键跳过；reduced-motion 由派生值直接视为完成。
  const bootComplete = bootDone || prefersReducedMotion();
  useEffect(() => {
    if (phase !== "show" || bootDone || prefersReducedMotion()) return;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setBootDone(true);
    };
    const onSkip = () => finish();
    window.addEventListener("keydown", onSkip, { once: true });
    document.addEventListener("pointerdown", onSkip, { once: true });
    const stepper = window.setInterval(() => {
      setBootStep((step) => (step >= bootLines.length ? step : step + 1));
    }, BOOT_STEP_MS);
    const total = window.setTimeout(finish, bootLines.length * BOOT_STEP_MS + BOOT_HOLD_MS);
    return () => {
      window.clearInterval(stepper);
      window.clearTimeout(total);
      window.removeEventListener("keydown", onSkip);
      document.removeEventListener("pointerdown", onSkip);
    };
  }, [phase, bootDone, bootLines]);

  // 开馆期间锁定滚动（覆盖层淡出即解锁）。
  useEffect(() => {
    if (phase !== "show" || bootDone || prefersReducedMotion()) return;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [phase, bootDone]);

  useEffect(() => {
    if (phase !== "show") return;
    const elements = document.querySelectorAll<HTMLElement>(".expo-reveal");
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [phase, selectedIds, bootDone]);

  useEffect(() => {
    if (phase !== "show") return;
    const progressEl = progressRef.current;
    if (!progressEl) return;
    const updateProgress = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      progressEl.style.transform = `scaleX(${ratio})`;
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [phase, selectedIds]);

  // 手电筒微光（S5）：指针跟随 + 惯性拖尾；触屏与 reduced-motion 退出。
  useEffect(() => {
    if (phase !== "show") return;
    if (prefersReducedMotion()) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const showEl = showRef.current;
    if (!showEl) return;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight * 0.35;
    let x = targetX;
    let y = targetY;
    let raf = 0;
    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
    };
    const tick = () => {
      if (!document.hidden) {
        x += (targetX - x) * 0.12;
        y += (targetY - y) * 0.12;
        showEl.style.setProperty("--e-mx", `${x}px`);
        showEl.style.setProperty("--e-my", `${y}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [phase]);

  const openEvidenceDrawer = useCallback(
    (eventId: string, claimIndex: number, trigger: HTMLButtonElement) => {
      // 取消尚在飞行的关闭定时器，避免旧 timeout 把刚打开的抽屉强制关掉。
      if (drawerTimerRef.current !== null) {
        window.clearTimeout(drawerTimerRef.current);
        drawerTimerRef.current = null;
      }
      drawerTriggerRef.current = trigger;
      setDrawer({ eventId, claimIndex });
      requestAnimationFrame(() => setDrawerOpen(true));
    },
    [],
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    drawerTimerRef.current = window.setTimeout(
      () => {
        drawerTimerRef.current = null;
        setDrawer(null);
        drawerTriggerRef.current?.focus();
      },
      prefersReducedMotion() ? 0 : 400,
    );
  }, []);

  // 组件卸载（回到选展）时掐掉飞行中的关闭定时器，防止过期 setState。
  useEffect(
    () => () => {
      if (drawerTimerRef.current !== null) window.clearTimeout(drawerTimerRef.current);
    },
    [],
  );

  // 抽屉打开时：锁定背景滚动（记录原值，与开馆序列的锁互不踩踏）、
  // 焦点与键盘圈闭（Esc 关闭、Tab 收拢到关闭按钮）。
  useEffect(() => {
    if (!drawer) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    drawerCloseRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      } else if (event.key === "Tab") {
        event.preventDefault();
        drawerCloseRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawer, closeDrawer]);

  const drawerEvent = drawer ? events.find((event) => event.id === drawer.eventId) : undefined;
  const drawerClaim: Claim | undefined = drawerEvent?.claims[drawer?.claimIndex ?? -1];

  function toggleEvent(eventId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  function toggleGroup(key: string) {
    const groupEvents = groups.find(([groupKey]) => groupKey === key)?.[1] ?? [];
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = groupEvents.every((event) => next.has(event.id));
      groupEvents.forEach((event) => {
        if (allSelected) next.delete(event.id);
        else next.add(event.id);
      });
      return next;
    });
  }

  function openExhibition() {
    // 每次开馆都重放开馆序列（约 2.4s，可跳过）。
    setBootDone(false);
    setBootStep(0);
    setPhase("show");
    window.scrollTo({ top: 0 });
  }

  // 展签改写：机器给底稿，人是策展人。只改展示层，不触碰证据与状态机。
  // 导出风险拦截：扫描命中后暂存待确认的 HTML，人工确认才允许落盘。
  const [exportConfirm, setExportConfirm] = useState<{ html: string; risks: ExportRisk[] } | null>(null);

  function exportStaticExhibition() {
    if (!archive || selectedEvents.length === 0) return;
    const html = buildExhibitionHtml({
      stageName: archive.name,
      startsOn: archive.starts_on,
      endsOn: archive.ends_on,
      events: selectedEvents.map((event) => ({
        title: event.title,
        occurred_on: event.occurred_on,
        status: event.status,
        origin: event.origin,
        claims: event.claims.map((claim) => ({ text: claim.text })),
      })),
      exportedAt: new Date().toISOString(),
    });
    // PRD §9：导出前单独检查密钥、邮箱、路径。命中即拦截，交还人工逐项确认。
    const risks = scanExportRisks(html);
    if (risks.length > 0) {
      setExportConfirm({ html, risks });
      return;
    }
    downloadExhibitionHtml(html, archive.name);
  }

  function confirmExport() {
    if (!exportConfirm || !archive) return;
    downloadExhibitionHtml(exportConfirm.html, archive.name);
    setExportConfirm(null);
  }

  function downloadExhibitionHtml(html: string, stageName: string) {
    // 只含展出内容、不含证据链细节；文件名取阶段名，去除文件系统危险字符。
    const safeName = stageName.replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 60) || "exhibition";
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `digital-museum-${safeName}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (status === "loading") {
    return <main className="expo-shell expo-neutral"><p className="expo-loading">正在读取本地回顾档案…</p></main>;
  }

  if (status === "empty") {
    return (
      <main className="expo-shell expo-neutral">
        <section className="expo-empty">
          <span>DIGITAL MUSEUM</span>
          <h1>展览馆还没有内容</h1>
          <p>先回到工作台同步本机 Agent 会话，档案里有经历之后，展览馆会为你开馆。</p>
          <Link className="expo-button" href="/">回到工作台</Link>
        </section>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="expo-shell expo-neutral">
        <section className="expo-empty">
          <span>出错了</span>
          <h1>暂时打不开展览馆</h1>
          <p>{errorMessage}</p>
          <Link className="expo-button" href="/">回到工作台</Link>
        </section>
      </main>
    );
  }

  if (phase === "select") {
    return (
      <main className="expo-shell expo-neutral">
        <ExpoTopbar stageName={archive?.name ?? ""} />
        <section className="expo-prep">
          <header className="expo-prep-head">
            <span className="expo-kicker">EXHIBITION SETUP · 布展</span>
            <h1>第一步 · 选择要展出的经历</h1>
            <p>系统已按月份把 {visibleEvents.length} 段经历整理成 {groups.length} 个展区。勾选要展出的内容；未经核对的经历会以“草稿”标识展出。</p>
          </header>
          <div className="expo-modules">
            {groups.map(([key, groupEvents]) => {
              const selectedInGroup = groupEvents.filter((event) => selectedIds.has(event.id)).length;
              const confirmedInGroup = groupEvents.filter((event) => event.status === "confirmed").length;
              const verifiedInGroup = groupEvents.filter((event) => event.status === "verified").length;
              return (
                <article className="expo-module" key={key}>
                  <header>
                    <button type="button" onClick={() => toggleGroup(key)} aria-pressed={selectedInGroup === groupEvents.length}>
                      <i className={selectedInGroup === groupEvents.length ? "on" : selectedInGroup > 0 ? "half" : ""} aria-hidden />
                      <strong>{monthLabel(key)}</strong>
                    </button>
                    <small>{groupEvents.length} 段经历 · {confirmedInGroup + verifiedInGroup} 段已确认{verifiedInGroup > 0 ? `（含系统核实 ${verifiedInGroup}）` : ""}</small>
                  </header>
                  <ul>
                    {groupEvents.map((event) => (
                      <li key={event.id}>
                        <label className={selectedIds.has(event.id) ? "checked" : ""}>
                          <input type="checkbox" checked={selectedIds.has(event.id)} onChange={() => toggleEvent(event.id)} />
                          <span>
                            <strong>{event.title}</strong>
                            <small>{event.occurred_on ?? "时间待定"} · {statusLabel(event.status)}</small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
          <div className="expo-prep-actions">
            <button className="expo-button" type="button" disabled={!selectedIds.size} onClick={openExhibition}>
              开馆 · 展出已选的 {selectedIds.size} 段经历
            </button>
            <button className="expo-text-button" type="button" onClick={() => setSelectedIds(new Set(visibleEvents.map((event) => event.id)))}>
              全部展出
            </button>
          </div>
        </section>
      </main>
    );
  }

  const style = buildCollaborationStyle(selectedEvents);
  let closingLine: string;
  if (confirmedCount === 0 && verifiedCount === 0) {
    closingLine = "今天展出的仍是草稿。完成核对之后，它们会真正属于你。";
  } else if (verifiedCount === 0 && confirmedCount === selectedEvents.length) {
    closingLine = `这 ${spanMonths} 个月里的每一段展出经历，都由你亲自确认。`;
  } else if (confirmedCount === 0 && verifiedCount === selectedEvents.length) {
    closingLine = `这 ${spanMonths} 个月里展出的每一段经历，都由系统从确定性记录自动核实。`;
  } else {
    const trustParts = [`你亲自确认了 ${confirmedCount} 段`, `系统核实了 ${verifiedCount} 段`].filter(
      (part, index) => (index === 0 ? confirmedCount > 0 : verifiedCount > 0),
    );
    closingLine =
      `这 ${spanMonths} 个月里，${trustParts.join("、")}经历；` +
      (draftCount > 0
        ? `其余 ${draftCount} 段仍在等待你的核对。`
        : "每一段都有明确的可信来源。");
  }

  return (
    <main className="expo-show" data-expo-theme={EXPO_THEME} ref={showRef}>
      <div className="expo-progress" ref={progressRef} aria-hidden="true" />
      <div className="expo-glow" aria-hidden="true" />

      {/* 开馆终端序列：bootComplete 后淡出（覆盖层低于顶栏与风险确认弹窗，不挡终点动作） */}
      <div className={`expo-boot${bootComplete ? " done" : ""}`} aria-hidden="true">
        <div className="expo-boot-box">
          <div className="expo-boot-bar"><i aria-hidden="true" />ARCHIVE BOOT · 午夜档案馆</div>
          <div className="expo-boot-log">
            {bootLines.slice(0, bootStep).map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
          <div className="expo-boot-skip">点击任意处跳过 SKIP ▸</div>
        </div>
      </div>

      <header className="expo-show-topbar">
        <span className="expo-show-brand">DIGITAL MUSEUM</span>
        <span className="expo-show-theme">午夜档案馆</span>
        <button
          className="expo-topbar-export"
          type="button"
          title="把当前勾选展出的经历导出为一个自包含 HTML 文件：断网可双击打开、可发给朋友；不含证据链细节（原文锚点与文件指纹留在本机）。"
          onClick={exportStaticExhibition}
        >
          导出展览（HTML）
        </button>
        <Link href="/">回到工作台</Link>
      </header>

      <section className="expo-cover">
        <div className={`expo-cover-inner${bootComplete ? " risen" : ""}`}>
          <p className="expo-cover-kicker">PRIVATE EXHIBITION · 未公开</p>
          <h1>{archive?.name ?? "我的回顾"}</h1>
          <p className="expo-cover-sub">原始证据 · 分级核实 · 未由模型补写</p>
          <p className="expo-cover-dates">{archive?.starts_on} — {archive?.ends_on}</p>
          <dl className="expo-cover-stats">
            <div><dt>展出经历</dt><dd><CountUp value={selectedEvents.length} /></dd></div>
            <div><dt>本人确认</dt><dd><CountUp value={confirmedCount} /></dd></div>
            <div><dt>原始记录</dt><dd><CountUp value={archive?.evidence_count ?? 0} /></dd></div>
            <div><dt>时间跨度</dt><dd><CountUp value={spanMonths} /><small> 个月</small></dd></div>
          </dl>
          <button className="expo-cover-cta" type="button" onClick={() => document.getElementById("expo-prologue")?.scrollIntoView({ behavior: "smooth" })}>
            开始观展 <span aria-hidden>↓</span>
          </button>
        </div>
        <div className="expo-scroll-cue" aria-hidden="true">
          <i />
          <span>向下滚动 · 进入档案</span>
        </div>
      </section>

      <section className="expo-section" id="expo-prologue">
        <div className="expo-timeline expo-reveal" aria-label="展览时间线">
          {groups
            .filter(([, groupEvents]) => groupEvents.some((event) => selectedIds.has(event.id)))
            .map(([key]) => (
              <button type="button" key={key} onClick={() => document.getElementById(`chapter-${key}`)?.scrollIntoView({ behavior: "smooth" })}>
                {monthLabel(key)}
              </button>
            ))}
        </div>
      </section>

      {groups
        .filter(([, groupEvents]) => groupEvents.some((event) => selectedIds.has(event.id)))
        .map(([key, groupEvents], chapterIndex) => {
          const shown = groupEvents.filter((event) => selectedIds.has(event.id));
          const confirmedHere = shown.filter((event) => event.status === "confirmed").length;
          const verifiedHere = shown.filter((event) => event.status === "verified").length;
          const hero = pickHallHero(shown, milestoneFor);
          const heroRole = hero ? heroRoleLabel(milestoneFor(hero)) : "";
          const rest = hero ? shown.filter((event) => event.id !== hero.id) : shown;
          return (
            <section
              className="expo-chapter"
              id={`chapter-${key}`}
              key={key}
              style={{ "--hall-accent": HALL_ACCENTS[chapterIndex % HALL_ACCENTS.length] } as CSSProperties}
            >
              <header className="expo-reveal">
                <span className="expo-chapter-num">{String(chapterIndex + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{monthLabel(key)}</h2>
                  <p>{shown.length} 段经历 · {confirmedHere} 段本人确认{verifiedHere > 0 ? ` · ${verifiedHere} 段系统核实` : ""}</p>
                </div>
              </header>
              <div className="expo-hall">
                {hero && (
                  <article
                    className={`expo-card hero expo-reveal${hero.status === "confirmed" || hero.status === "verified" ? "" : " draft"}`}
                    key={hero.id}
                  >
                    <figure className="expo-art">
                      <SpecimenArt seed={hero.claims[0]?.anchors[0]?.blob_sha256 ?? hero.id} />
                      <span className="expo-card-no">{catalogNo(chapterIndex, 0)}</span>
                      <StatusSeal status={hero.status} />
                    </figure>
                    <div className="expo-card-caption">
                      <span className="expo-hero-role">主展{heroRole ? ` · ${heroRole}` : ""}</span>
                      <time>{hero.occurred_on ?? "时间待定"}</time>
                      <h3>{hero.title}</h3>
                      <p className="expo-card-medium">{mediumLineOf(hero.origin, hero.source_count)}</p>
                      <p className="expo-card-narrative">{exhibitNarrative(hero, milestoneFor(hero))}</p>
                      {(() => {
                        const quote = openingQuoteOf(hero);
                        return quote ? <blockquote className="expo-hero-quote">「{quote}」</blockquote> : null;
                      })()}
                    </div>
                    <EvidenceSection event={hero} chapterIndex={chapterIndex} exhibitIndex={0} onOpen={openEvidenceDrawer} />
                  </article>
                )}
                {rest.length > 0 && (
                  <div className="expo-spine">
                    {rest.map((event, exhibitIndex) => (
                      <div className={`expo-spine-item${exhibitIndex % 2 === 1 ? " flip" : ""} expo-reveal`} key={event.id}>
                        <span className="expo-spine-node" aria-hidden="true" />
                        <article
                          className={`expo-card${event.status === "confirmed" || event.status === "verified" ? "" : " draft"}`}
                        >
                          <header className="expo-card-head">
                            <time>{catalogNo(chapterIndex, exhibitIndex + 1)} · {event.occurred_on ?? "时间待定"}</time>
                            <StatusSeal status={event.status} />
                          </header>
                          <h3>{event.title}</h3>
                          <p className="expo-card-medium">{mediumLineOf(event.origin, event.source_count)}</p>
                          <p className="expo-card-narrative">{exhibitNarrative(event, milestoneFor(event))}</p>
                          <EvidenceSection event={event} chapterIndex={chapterIndex} exhibitIndex={exhibitIndex + 1} onOpen={openEvidenceDrawer} />
                        </article>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}

      <section className="expo-epilogue">
        <div className="expo-reveal">
          <span className="expo-kicker">EPILOGUE · 尾声 · 协作风格速写</span>
          <div className="expo-style-card">
            <p className="expo-style-code" aria-label={`协作风格 ${style.code}`}>
              {style.code.split("").join(" · ")}
            </p>
            <h2 className="expo-style-name">{style.archetype}</h2>
            <p className="expo-style-tagline">「{style.tagline}」</p>
            <div className="expo-style-axes">
              {style.axes.map((axis) => (
                <div className="expo-style-row" key={axis.key}>
                  <span className={axis.readings[0].win ? "win" : ""}>
                    <b>{axis.readings[0].pole}</b>
                    <small>{axis.readings[0].text}</small>
                  </span>
                  <i aria-hidden="true">vs</i>
                  <span className={axis.readings[1].win ? "win" : ""}>
                    <b>{axis.readings[1].pole}</b>
                    <small>{axis.readings[1].text}</small>
                  </span>
                </div>
              ))}
            </div>
            <p className="expo-style-note">
              基于本次展出 {selectedEvents.length} 段经历的确定性读数归纳，供对照一乐，不是性格测评。
            </p>
          </div>
          <div className="expo-epilogue-stats" aria-label="阶段统计">
            <div><strong><CountUp value={selectedEvents.length} /></strong><span>段经历</span></div>
            <div><strong><CountUp value={confirmedCount} /></strong><span>你亲自确认</span></div>
            <div><strong><CountUp value={verifiedCount} /></strong><span>系统核实</span></div>
            <div><strong><CountUp value={archive?.evidence_count ?? 0} /></strong><span>份原始记录</span></div>
          </div>
          <p className="expo-epilogue-trust">
            {closingLine} 所有展品由本地真实档案确定性生成，未经模型补写。
          </p>
          <div className="expo-show-actions">
            <button className="expo-button ghost" type="button" onClick={() => setPhase("select")}>
              回到选展 · 调整展出内容
            </button>
            <Link className="expo-button" href="/">回到工作台</Link>
          </div>
          <div
            className="expo-archive-stamp"
            role="img"
            aria-label={`馆藏编号 ARCHIVE-${(archive?.ends_on ?? "").replaceAll("-", "") || "00000000"}，入档 ${new Date().toISOString().slice(0, 10)}`}
          >
            <span>ARCHIVE</span>
            <strong>{(archive?.ends_on ?? "").replaceAll("-", "") || "00000000"}</strong>
            <span>数字档案馆 · {new Date().toISOString().slice(0, 10)}</span>
          </div>
        </div>
      </section>

      {exportConfirm && (
        <div className="expo-export-confirm" role="dialog" aria-label="导出内容风险确认">
          <div>
            <span className="expo-kicker">EXPORT CHECK · 导出前检查</span>
            <h2>导出内容包含疑似敏感信息</h2>
            <p>
              静态导出不携带证据链，但标题与展签取自你的记录原文。以下内容将随文件一起离开本机，
              请逐项确认可以公开；不确定时请取消并先改写对应展签。
            </p>
            <ul>
              {exportConfirm.risks.map((risk) => (
                <li key={risk.kind}>
                  <strong>{EXPORT_RISK_LABELS[risk.kind]}</strong>
                  <span>命中 {risk.count} 处，如 <code>{risk.sample}…</code></span>
                </li>
              ))}
            </ul>
            <div>
              <button type="button" onClick={() => setExportConfirm(null)}>取消，回去修改</button>
              <button type="button" onClick={confirmExport}>我已逐项核对，仍然导出</button>
            </div>
          </div>
        </div>
      )}

      {drawer && drawerEvent && drawerClaim && (
        <>
          <div className={`expo-drawer-overlay${drawerOpen ? " open" : ""}`} onClick={closeDrawer} />
          <aside
            className={`expo-drawer${drawerOpen ? " open" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="展品标签详情"
          >
            <header className="expo-drawer-head">
              <div>
                <h3>展品标签{drawerEvent.claims.length > 1 ? ` ${(drawer?.claimIndex ?? 0) + 1}` : ""}</h3>
                <p>{drawerEvent.source_count} 份来源 · {drawerClaim.anchors.length} 个证据位置 · {statusLabel(drawerEvent.status)}</p>
              </div>
              <button
                ref={drawerCloseRef}
                type="button"
                className="expo-drawer-close"
                aria-label="关闭展品标签"
                title="关闭 (Esc)"
                onClick={closeDrawer}
              >
                ✕
              </button>
            </header>
            <div className="expo-drawer-body">
              <blockquote className="expo-drawer-claim">{drawerClaim.text}</blockquote>
              {drawerClaim.anchors.map((anchor) => (
                <figure className="expo-poem" key={`${anchor.blob_sha256}-${anchor.char_start}`}>
                  <figcaption>
                    锚定原文 · 行 {anchor.line_start}{anchor.line_end !== anchor.line_start ? `–${anchor.line_end}` : ""} · sha256 {anchor.blob_sha256.slice(0, 10)}…
                  </figcaption>
                  <pre><PoemText text={anchor.quote} /></pre>
                </figure>
              ))}
            </div>
            <footer className="expo-drawer-foot">
              {drawerClaim.processor_version ? `${drawerClaim.processor_version} · ` : ""}确定性锚定 · 只读 · 不随导出携带
            </footer>
          </aside>
        </>
      )}
    </main>
  );
}

/* —— 证据区（RAW EVIDENCE）：卡片内的等宽脚注层，点击打开侧滑抽屉 ——
 * 必须留在组件外定义：放进去会让每次父渲染（开馆序列逐行 tick）都
 * 重挂载证据按钮，丢掉 IO 揭示状态与抽屉的焦点返回引用。
 */
function EvidenceSection({
  event,
  chapterIndex,
  exhibitIndex,
  onOpen,
}: {
  event: CandidateEvent;
  chapterIndex: number;
  exhibitIndex: number;
  onOpen: (eventId: string, claimIndex: number, trigger: HTMLButtonElement) => void;
}) {
  if (!event.claims.length) return null;
  return (
    <div className="expo-evidence">
        <div className="expo-evidence-head">
          <span>RAW EVIDENCE · 展品标签</span>
          <span>{String(event.claims.length).padStart(2, "0")} 份 · {catalogNo(chapterIndex, exhibitIndex)}</span>
        </div>
      <div className="expo-evidence-stack">
        {event.claims.map((claim, claimIndex) => (
          <button
            type="button"
            className="expo-evidence-btn"
            key={claim.id}
            aria-haspopup="dialog"
            onClick={(clickEvent) => onOpen(event.id, claimIndex, clickEvent.currentTarget)}
          >
            <span className="expo-evidence-kind" aria-hidden="true">◇</span>
            <span className="expo-evidence-main">
              <strong>展品标签{event.claims.length > 1 ? ` ${claimIndex + 1}` : ""}</strong>
              <small>{event.source_count} 份来源 · {claim.anchors.length} 个证据位置</small>
              <em>{claim.text}</em>
            </span>
            <span className="expo-evidence-cta" aria-hidden="true">溯源 →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ExpoTopbar({ stageName }: { stageName: string }) {
  return (
    <header className="expo-topbar">
      <div>
        <span>DIGITAL MUSEUM · 展览准备间</span>
        <strong>{stageName || "未命名回顾"}</strong>
      </div>
      <Link href="/">回到工作台</Link>
    </header>
  );
}

/**
 * 证据标本版画：从证据指纹（blob sha256）确定性生成的 SVG 图形。
 * 同一证据永远得到同一幅画，不含任何随机数；主题色经 CSS 变量注入。
 * S5 之后只随每厅主展位展出，普通叙事卡让位给文字。
 */
function SpecimenArt({ seed }: { seed: string }) {
  const hex = (seed.match(/[0-9a-f]/g) ?? ["0"]).join("").padEnd(24, "0");
  const byte = (index: number) => parseInt(hex.slice((index % 12) * 2, (index % 12) * 2 + 2), 16);
  const variant = byte(0) % 4;
  const ink = "var(--e-ink)";
  const accent = "var(--e-accent)";

  const marks: ReactNode[] = [];
  if (variant === 0) {
    const cx = 110 + (byte(1) % 180);
    const cy = 80 + (byte(2) % 130);
    const count = 6 + (byte(3) % 5);
    for (let i = 0; i < count; i++) {
      const r = 16 + i * (13 + (byte(4) % 9));
      marks.push(
        <circle key={`arc-${i}`} cx={cx} cy={cy} r={r} fill="none"
          stroke={i === count - 1 ? accent : ink} strokeWidth={i % 3 === 0 ? 1.6 : 1.0}
          opacity={i === count - 1 ? 0.95 : 0.45 + (i % 3) * 0.15} />,
      );
    }
  } else if (variant === 1) {
    for (let i = 0; i < 40; i++) {
      const b = byte(i);
      if (b % 5 === 4) continue;
      const x = 36 + (i % 8) * 42;
      const y = 30 + Math.floor(i / 8) * 36;
      if (b % 5 === 0) {
        marks.push(<rect key={`cell-${i}`} x={x} y={y} width={26} height={24} fill={accent} opacity={0.34 + (b % 3) * 0.13} />);
      } else if (b % 5 === 1) {
        marks.push(<rect key={`cell-${i}`} x={x} y={y} width={26} height={24} fill="none" stroke={ink} strokeWidth={1.0} opacity={0.62} />);
      } else if (b % 5 === 2) {
        marks.push(<circle key={`cell-${i}`} cx={x + 13} cy={y + 12} r={2.6} fill={ink} opacity={0.8} />);
      }
    }
  } else if (variant === 2) {
    const angle = -30 + (byte(1) % 14);
    for (let i = 0; i < 7; i++) {
      const w = 10 + (byte(i + 2) % 34);
      marks.push(
        <rect key={`band-${i}`} x={-80 + i * 82} y={-60} width={w} height={420}
          transform={`rotate(${angle} 200 150)`}
          fill={i === (byte(3) % 7) ? accent : ink}
          opacity={i === (byte(3) % 7) ? 0.45 : 0.1 + (byte(i + 5) % 4) * 0.08} />,
      );
    }
    marks.push(<line key="axis" x1={24} y1={252} x2={376} y2={252} stroke={ink} strokeWidth={0.8} opacity={0.65} />);
  } else {
    for (let i = 0; i < 26; i++) {
      const b = byte(i);
      const cx = 24 + (b * 3 + byte(i + 4) * 2) % 352;
      const cy = 20 + (byte(i + 6) + b) % 244;
      const accentDot = i % 9 === (byte(2) % 9);
      marks.push(
        <circle key={`dot-${i}`} cx={cx} cy={cy} r={2 + (b % 6)}
          fill={accentDot ? accent : "none"} stroke={accentDot ? "none" : ink}
          strokeWidth={1.1} opacity={accentDot ? 0.9 : 0.62} />,
      );
    }
    marks.push(<circle key={`ring-${marks.length}`} cx={200} cy={150} r={104} fill="none" stroke={accent} strokeWidth={0.7} opacity={0.5} />);
  }

  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {marks}
      <g stroke="var(--e-ink)" strokeWidth={0.9} opacity={0.7}>
        <line x1={16} y1={16} x2={16} y2={28} /><line x1={16} y1={16} x2={28} y2={16} />
        <line x1={384} y1={16} x2={384} y2={28} /><line x1={384} y1={16} x2={372} y2={16} />
        <line x1={16} y1={284} x2={16} y2={272} /><line x1={16} y1={284} x2={28} y2={284} />
        <line x1={384} y1={284} x2={384} y2={272} /><line x1={384} y1={284} x2={372} y2={284} />
      </g>
    </svg>
  );
}
