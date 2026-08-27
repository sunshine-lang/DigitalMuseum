"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { CandidateEvent, listArchiveEvents } from "../phase0-api";
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

type ArchiveMeta = {
  name: string;
  starts_on: string;
  ends_on: string;
  evidence_count: number;
};

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

export default function ExhibitionWorkspace() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [phase, setPhase] = useState<ExpoPhase>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const progressRef = useRef<HTMLDivElement | null>(null);

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
  }, [phase, selectedIds]);

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

  const spanMonths = archive ? monthsBetween(archive.starts_on, archive.ends_on) : groups.length;
  const style = buildCollaborationStyle(selectedEvents);
  const draftCount = selectedEvents.length - confirmedCount - verifiedCount;
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
    <main className="expo-show" data-expo-theme={EXPO_THEME}>
      <div className="expo-progress" ref={progressRef} aria-hidden="true" />
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
        <span className="expo-cover-ghost" aria-hidden="true">
          {(archive?.ends_on ?? "").slice(0, 4) || "EXPO"}
        </span>
        <div className="expo-cover-inner">
          <p className="expo-cover-kicker">PRIVATE EXHIBITION · 未公开</p>
          <h1>{archive?.name ?? "我的回顾"}</h1>
          <p className="expo-cover-dates">{archive?.starts_on} — {archive?.ends_on}</p>
          <dl className="expo-cover-stats">
            <div><dt>展出经历</dt><dd>{selectedEvents.length}</dd></div>
            <div><dt>本人确认</dt><dd>{confirmedCount}</dd></div>
            <div><dt>原始记录</dt><dd>{archive?.evidence_count ?? 0}</dd></div>
            <div><dt>时间跨度</dt><dd>{spanMonths}<small> 个月</small></dd></div>
          </dl>
          <button className="expo-cover-cta" type="button" onClick={() => document.getElementById("expo-prologue")?.scrollIntoView({ behavior: "smooth" })}>
            开始观展 <span aria-hidden>↓</span>
          </button>
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
          const ordered = hero
            ? [hero, ...shown.filter((event) => event.id !== hero.id)]
            : shown;
          return (
            <section
              className="expo-chapter"
              id={`chapter-${key}`}
              key={key}
              style={{ "--hall-accent": HALL_ACCENTS[chapterIndex % HALL_ACCENTS.length] } as CSSProperties}
            >
              <div className="expo-gate" aria-hidden="true">
                <span className="expo-gate-month">{key === "undated" ? "··" : key.slice(5, 7)}</span>
              </div>
              <header className="expo-reveal">
                <span className="expo-chapter-num">{String(chapterIndex + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{monthLabel(key)}</h2>
                  <p>{shown.length} 段经历 · {confirmedHere} 段本人确认{verifiedHere > 0 ? ` · ${verifiedHere} 段系统核实` : ""}</p>
                </div>
              </header>
              <div className="expo-hall">
                {ordered.map((event, exhibitIndex) => {
                  const isHero = event.id === hero?.id;
                  const milestone = milestoneFor(event);
                  const roleLabel = heroRoleLabel(milestone);
                  const openingQuote = isHero ? openingQuoteOf(event) : "";
                  return (
                  <article
                    className={`expo-card expo-reveal${isHero ? " hero" : ""}${event.status === "confirmed" || event.status === "verified" ? "" : " draft"}`}
                    key={event.id}
                  >
                    <figure className="expo-art">
                      <SpecimenArt seed={event.claims[0]?.anchors[0]?.blob_sha256 ?? event.id} />
                      <span className="expo-card-no">No. {String(chapterIndex + 1).padStart(2, "0")}{String(exhibitIndex + 1).padStart(2, "0")}</span>
                      {event.status === "confirmed" ? (
                        <span className="expo-seal">已入馆</span>
                      ) : event.status === "verified" ? (
                        <span className="expo-seal sys">系统核实</span>
                      ) : (
                        <span className="expo-card-status">
                          {statusLabel(event.status)}
                        </span>
                      )}
                    </figure>
                    <div className="expo-card-caption">
                      {isHero && (
                        <span className="expo-hero-role">主展{roleLabel ? ` · ${roleLabel}` : ""}</span>
                      )}
                      <time>{event.occurred_on ?? "时间待定"}</time>
                      <h3>{event.title}</h3>
                      <p className="expo-card-medium">{mediumLineOf(event.origin, event.source_count)}</p>
                      <p className="expo-card-narrative">{exhibitNarrative(event, milestone)}</p>
                      {isHero && openingQuote && (
                        <blockquote className="expo-hero-quote">「{openingQuote}」</blockquote>
                      )}
                    </div>
                    <div className="expo-labels">
                      {event.claims.map((claim, claimIndex) => (
                        <details className="expo-label" key={claim.id}>
                          <summary>
                            <span>展品标签{event.claims.length > 1 ? ` ${claimIndex + 1}` : ""}</span>
                            <small>{event.source_count} 份来源 · {claim.anchors.length} 个证据位置</small>
                          </summary>
                          <blockquote>{claim.text}</blockquote>
                          {claim.anchors.map((anchor) => (
                            <div className="expo-anchor" key={`${anchor.blob_sha256}-${anchor.char_start}`}>
                              <p>{anchor.quote}</p>
                              <dl>
                                <div><dt>行号</dt><dd>{anchor.line_start}{anchor.line_end !== anchor.line_start ? `–${anchor.line_end}` : ""}</dd></div>
                                <div><dt>文件指纹</dt><dd title={anchor.blob_sha256}>{anchor.blob_sha256.slice(0, 14)}…</dd></div>
                              </dl>
                            </div>
                          ))}
                        </details>
                      ))}
                    </div>
                  </article>
                  );
                })}
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
            <div><strong>{selectedEvents.length}</strong><span>段经历</span></div>
            <div><strong>{confirmedCount}</strong><span>你亲自确认</span></div>
            <div><strong>{verifiedCount}</strong><span>系统核实</span></div>
            <div><strong>{archive?.evidence_count ?? 0}</strong><span>份原始记录</span></div>
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
    </main>
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
          stroke={i === count - 1 ? accent : ink} strokeWidth={i % 3 === 0 ? 1.4 : 0.7}
          opacity={i === count - 1 ? 0.85 : 0.28 + (i % 3) * 0.14} />,
      );
    }
  } else if (variant === 1) {
    for (let i = 0; i < 40; i++) {
      const b = byte(i);
      if (b % 5 === 4) continue;
      const x = 36 + (i % 8) * 42;
      const y = 30 + Math.floor(i / 8) * 36;
      if (b % 5 === 0) {
        marks.push(<rect key={`cell-${i}`} x={x} y={y} width={26} height={24} fill={accent} opacity={0.16 + (b % 3) * 0.07} />);
      } else if (b % 5 === 1) {
        marks.push(<rect key={`cell-${i}`} x={x} y={y} width={26} height={24} fill="none" stroke={ink} strokeWidth={0.7} opacity={0.4} />);
      } else if (b % 5 === 2) {
        marks.push(<circle key={`cell-${i}`} cx={x + 13} cy={y + 12} r={2.4} fill={ink} opacity={0.5} />);
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
          opacity={i === (byte(3) % 7) ? 0.18 : 0.05 + (byte(i + 5) % 4) * 0.045} />,
      );
    }
    marks.push(<line key="axis" x1={24} y1={252} x2={376} y2={252} stroke={ink} strokeWidth={0.8} opacity={0.5} />);
  } else {
    for (let i = 0; i < 26; i++) {
      const b = byte(i);
      const cx = 24 + (b * 3 + byte(i + 4) * 2) % 352;
      const cy = 20 + (byte(i + 6) + b) % 244;
      const accentDot = i % 9 === (byte(2) % 9);
      marks.push(
        <circle key={`dot-${i}`} cx={cx} cy={cy} r={2 + (b % 6)}
          fill={accentDot ? accent : "none"} stroke={accentDot ? "none" : ink}
          strokeWidth={0.9} opacity={accentDot ? 0.8 : 0.4} />,
      );
    }
    marks.push(<circle key={`ring-${marks.length}`} cx={200} cy={150} r={104} fill="none" stroke={accent} strokeWidth={0.7} opacity={0.35} />);
  }

  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {marks}
      <g stroke="var(--e-ink)" strokeWidth={0.9} opacity={0.55}>
        <line x1={16} y1={16} x2={16} y2={28} /><line x1={16} y1={16} x2={28} y2={16} />
        <line x1={384} y1={16} x2={384} y2={28} /><line x1={384} y1={16} x2={372} y2={16} />
        <line x1={16} y1={284} x2={16} y2={272} /><line x1={16} y1={284} x2={28} y2={284} />
        <line x1={384} y1={284} x2={384} y2={272} /><line x1={384} y1={284} x2={372} y2={284} />
      </g>
    </svg>
  );
}
