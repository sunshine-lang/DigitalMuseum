"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  CandidateEvent,
  Phase0ApiError,
  Stage,
  blobUrl,
  getEvents,
  getStage,
  updateExhibitCaption,
} from "../phase0-api";
import { buildExhibitionHtml } from "./export-html";

const STAGE_STORAGE_KEY = "digital-museum-phase0-stage-id";
const THEME_STORAGE_KEY = "digital-museum-expo-theme";

type ThemeId = "renaissance" | "fieldnotes" | "archive" | "midnight" | "glass" | "brutal" | "museum-night";
type ExpoPhase = "select" | "style" | "show";
type LoadStatus = "loading" | "ready" | "empty" | "error";

const themes: Array<{
  id: ThemeId;
  name: string;
  tagline: string;
  description: string;
}> = [
  {
    id: "museum-night",
    name: "午夜档案馆",
    tagline: "MIDNIGHT ARCHIVE",
    description: "暗色画布上，轻衬线大字讲你的故事；证据压成档案编号般的等宽小签，色彩只从你的照片与版画里来。",
  },
  {
    id: "renaissance",
    name: "文艺复兴画廊",
    tagline: "RENAISSANCE GALLERY",
    description: "暖灰纸面、墨线与纪念碑式衬线标题，一座黑与米色交替的古典美术馆。",
  },
  {
    id: "fieldnotes",
    name: "研究手记",
    tagline: "RESEARCH FIELD NOTES",
    description: "暖白纸面上的薄荷与腮红色块，深青主色与手绘笔记的人情味。",
  },
  {
    id: "archive",
    name: "暖纸档案馆",
    tagline: "WARM PAPER ARCHIVE",
    description: "米色纸面与衬线标题，像翻开一本只属于你的档案。",
  },
  {
    id: "midnight",
    name: "午夜画廊",
    tagline: "MIDNIGHT GALLERY",
    description: "深色展厅与一束射灯，安静地照亮每一段经历。",
  },
  {
    id: "glass",
    name: "玻璃晨雾",
    tagline: "FROSTED MORNING",
    description: "半透明玻璃卡片与冷色晨光，轻盈而现代。",
  },
  {
    id: "brutal",
    name: "粗野宣言",
    tagline: "BOLD STATEMENT",
    description: "粗边框与高对比色块，把成就大声地贴在墙上。",
  },
];

const HALL_ACCENTS = ["#847dff", "#dd90d8", "#90b8f0", "#d1c9ff"];

/**
 * 展品叙事底稿：把确定性 claim 压成一句适合展览的人话。
 * 确定性天花板明确——真正满意的展签交给用户改写（exhibit_caption），
 * 这里只负责"不丢人"的默认值。原文与锚点仍在"展品标签"里供查证。
 */
function cleanFragment(text: string): string {
  return text
    .replace(/\[@[^\]]*\]\(plugin\/\/[^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\(https?:[^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/https?:\/\/\S+/g, (url) => {
      const host = url.replace(/^https?:\/\//, "").split("/")[0];
      return host || "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function exhibitNarrative(event: CandidateEvent): string {
  const claim = event.claims[0]?.text ?? "";
  const topicMatch = claim.match(/「([^」]{2,40})」/);
  const topic = topicMatch ? cleanFragment(topicMatch[1]) : "";

  if (event.origin === "claude" || event.origin === "codex") {
    const agent = event.origin === "claude" ? "Claude Code" : "Codex";
    const sessionCount = Number(claim.match(/进行了 (\d+) 个/)?.[1] ?? 0);
    const messageCount = Number(claim.match(/共 (\d+) 条/)?.[1] ?? 0);
    const stats = [
      sessionCount > 1 ? `${sessionCount} 个会话` : "",
      messageCount > 0 ? `${messageCount} 条你来我往的消息` : "",
    ].filter(Boolean).join("、");
    if (topic) return stats ? `${stats}，从「${topic}」开始` : `与 ${agent} 的对话，从「${topic}」开始`;
    return stats ? `这一天你与 ${agent} 有${stats}` : cleanFragment(claim).slice(0, 72);
  }

  if (event.origin === "git") {
    const commitCount = Number(claim.match(/提交了 (\d+) 个变更/)?.[1] ?? 0);
    const repo = claim.match(/仓库 ([^（]+?)（/)?.[1] ?? "";
    const first = claim.match(/变更：([^；。]{4,40})/)?.[1] ?? "";
    const parts = [
      repo ? `在 ${repo.trim()}` : "",
      commitCount > 0 ? `提交了 ${commitCount} 次` : "",
    ].filter(Boolean).join("");
    const tail = first ? `：${first.trim()}…` : "";
    return `${parts}${tail}` || cleanFragment(claim).slice(0, 72);
  }

  // 笔记：取第一个完整句
  const cleaned = cleanFragment(claim).replace(/^[-*>\s]+/, "");
  const sentence = cleaned.split(/[。！？]/)[0];
  return (sentence.length >= 6 ? sentence : cleaned).slice(0, 72);
}

const statusLabels: Record<string, string> = {
  candidate: "等待核对",
  verified: "系统核实",
  confirmed: "本人确认",
  disputed: "描述待修正",
  unknown: "暂不确定",
};

function isVisibleExperience(event: CandidateEvent): boolean {
  return event.status !== "merged" && event.status !== "split" && event.status !== "rejected";
}

function sortEvents(events: CandidateEvent[]): CandidateEvent[] {
  return [...events].sort((a, b) => {
    if (!a.occurred_on) return 1;
    if (!b.occurred_on) return -1;
    return a.occurred_on.localeCompare(b.occurred_on);
  });
}

function monthKey(event: CandidateEvent): string {
  return event.occurred_on?.slice(0, 7) ?? "undated";
}

function monthLabel(key: string): string {
  if (key === "undated") return "时间待定";
  const [year, month] = key.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function monthsBetween(startsOn: string, endsOn: string): number {
  const [startYear, startMonth] = startsOn.split("-").map(Number);
  const [endYear, endMonth] = endsOn.split("-").map(Number);
  return endYear * 12 + endMonth - (startYear * 12 + startMonth) + 1;
}

export default function ExhibitionWorkspace() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [stage, setStage] = useState<Stage | null>(null);
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [phase, setPhase] = useState<ExpoPhase>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [themeId, setThemeId] = useState<ThemeId>("archive");
  const [themeIsRandom, setThemeIsRandom] = useState(false);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const visibleEvents = useMemo(() => sortEvents(events.filter(isVisibleExperience)), [events]);

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
  const verifiedCount = useMemo(
    () => selectedEvents.filter((event) => event.status === "verified").length,
    [selectedEvents],
  );

  useEffect(() => {
    const savedStageId = window.localStorage.getItem(STAGE_STORAGE_KEY);
    if (!savedStageId) {
      void Promise.resolve().then(() => setStatus("empty"));
      return;
    }
    Promise.all([getStage(savedStageId), getEvents(savedStageId)])
      .then(([nextStage, nextEvents]) => {
        setStage(nextStage);
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
        if (error instanceof Phase0ApiError && error.status === 404) {
          window.localStorage.removeItem(STAGE_STORAGE_KEY);
          setStatus("empty");
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "读取回顾档案失败");
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
  }, [phase, themeId, selectedIds]);

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
  }, [phase, themeId, selectedIds]);

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

  function beginExhibition(nextTheme: ThemeId, isRandom: boolean) {
    setThemeId(nextTheme);
    setThemeIsRandom(isRandom);
    window.localStorage.setItem(THEME_STORAGE_KEY, isRandom ? "" : nextTheme);
    setPhase("show");
    window.scrollTo({ top: 0 });
  }

  function pickRandomTheme() {
    const pool = themes.filter((theme) => theme.id !== themeId);
    const picked = pool[Math.floor(Math.random() * pool.length)];
    beginExhibition(picked.id, true);
  }

  // 展签改写：机器给底稿，人是策展人。只改展示层，不触碰证据与状态机。
  const [captionEdit, setCaptionEdit] = useState<{ id: string; value: string } | null>(null);
  const [captionBusy, setCaptionBusy] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);

  async function saveCaption(eventId: string) {
    if (!captionEdit || captionBusy) return;
    setCaptionBusy(true);
    setCaptionError(null);
    try {
      const updated = await updateExhibitCaption(eventId, captionEdit.value.trim() || null);
      setEvents((current) =>
        current.map((event) => (event.id === updated.id ? updated : event)),
      );
      setCaptionEdit(null);
    } catch (error) {
      setCaptionError(error instanceof Error ? error.message : "展签保存失败，请重试");
    } finally {
      setCaptionBusy(false);
    }
  }

  function exportStaticExhibition() {
    if (!stage || selectedEvents.length === 0) return;
    const html = buildExhibitionHtml({
      stageName: stage.name,
      startsOn: stage.starts_on,
      endsOn: stage.ends_on,
      events: selectedEvents.map((event) => ({
        title: event.title,
        occurred_on: event.occurred_on,
        status: event.status,
        claims: event.claims.map((claim) => ({ text: claim.text })),
      })),
      exportedAt: new Date().toISOString(),
    });
    // 只含展出内容、不含证据链细节；文件名取阶段名，去除文件系统危险字符。
    const safeName = stage.name.replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 60) || "exhibition";
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
          <p>先回到工作台创建回顾范围、导入记录并核对关键内容，展览馆会用真实的经历为你开馆。</p>
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
        <ExpoTopbar stageName={stage?.name ?? ""} />
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
                            <small>{event.occurred_on ?? "时间待定"} · {statusLabels[event.status] ?? "等待核对"}</small>
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
            <button className="expo-button" type="button" disabled={!selectedIds.size} onClick={() => setPhase("style")}>
              下一步 · 选择展览风格（已选 {selectedIds.size} 段）
            </button>
            <button className="expo-text-button" type="button" onClick={() => setSelectedIds(new Set(visibleEvents.map((event) => event.id)))}>
              全部展出
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (phase === "style") {
    const lastTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return (
      <main className="expo-shell expo-neutral">
        <ExpoTopbar stageName={stage?.name ?? ""} />
        <section className="expo-prep">
          <header className="expo-prep-head">
            <span className="expo-kicker">EXHIBITION SETUP · 布展</span>
            <h1>第二步 · 为这次开馆选一种风格</h1>
            <p>同一批经历，不同的策展气质。也可以交给随机——每次开馆都换一个展厅。</p>
          </header>
          <div className="expo-themes">
            {themes.map((theme) => (
              <button type="button" className="expo-theme-card" data-expo-theme={theme.id} key={theme.id} onClick={() => beginExhibition(theme.id, false)}>
                <span className="expo-mini-cover">
                  <i />
                  <b />
                  <em /><em /><em />
                </span>
                <strong>{theme.name}</strong>
                <small>{theme.tagline}</small>
                <p>{theme.description}</p>
                {lastTheme === theme.id && <span className="expo-last-badge">上次风格</span>}
              </button>
            ))}
          </div>
          <div className="expo-prep-actions">
            <button className="expo-button ghost" type="button" onClick={pickRandomTheme}>
              随机开馆 · 让展厅决定气质
            </button>
            <button className="expo-text-button" type="button" onClick={() => setPhase("select")}>
              返回上一步
            </button>
          </div>
        </section>
      </main>
    );
  }

  const theme = themes.find((item) => item.id === themeId) ?? themes[0];
  const spanMonths = stage ? monthsBetween(stage.starts_on, stage.ends_on) : groups.length;
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
    <main className="expo-show" data-expo-theme={themeId}>
      {captionError && (
        <div className="expo-caption-toast" role="alert">
          <span>{captionError}</span>
          <button type="button" onClick={() => setCaptionError(null)}>知道了</button>
        </div>
      )}
      <div className="expo-progress" ref={progressRef} aria-hidden="true" />
      <header className="expo-show-topbar">
        <span className="expo-show-brand">DIGITAL MUSEUM</span>
        <span className="expo-show-theme">{theme.name}{themeIsRandom ? " · 随机" : ""}</span>
        <Link href="/">回到工作台</Link>
      </header>

      <section className="expo-cover">
        <span className="expo-cover-ghost" aria-hidden="true">
          {(stage?.ends_on ?? "").slice(0, 4) || "EXPO"}
        </span>
        <div className="expo-cover-inner">
          <p className="expo-cover-kicker">PRIVATE EXHIBITION · 未公开</p>
          <h1>{stage?.name ?? "我的回顾"}</h1>
          <p className="expo-cover-dates">{stage?.starts_on} — {stage?.ends_on}</p>
          <dl className="expo-cover-stats">
            <div><dt>展出经历</dt><dd><CountUp value={selectedEvents.length} /></dd></div>
            <div><dt>本人确认</dt><dd><CountUp value={confirmedCount} /></dd></div>
            <div><dt>原始记录</dt><dd><CountUp value={stage?.evidence_count ?? 0} /></dd></div>
            <div><dt>时间跨度</dt><dd><CountUp value={spanMonths} /><small> 个月</small></dd></div>
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
                {shown.map((event, exhibitIndex) => (
                  <article
                    className={`expo-card expo-reveal${event.status === "confirmed" || event.status === "verified" ? "" : " draft"}`}
                    key={event.id}
                  >
                    <figure className="expo-art">
                      <ExhibitArt event={event} />
                      <span className="expo-card-no">No. {String(chapterIndex + 1).padStart(2, "0")}{String(exhibitIndex + 1).padStart(2, "0")}</span>
                      {event.status === "confirmed" ? (
                        <span className="expo-seal">已入馆</span>
                      ) : event.status === "verified" ? (
                        <span className="expo-seal sys">系统核实</span>
                      ) : (
                        <span className="expo-card-status">
                          {statusLabels[event.status] ?? "等待核对"}
                        </span>
                      )}
                    </figure>
                    <div className="expo-card-caption">
                      <time>{event.occurred_on ?? "时间待定"}</time>
                      <h3>{event.title}</h3>
                      {captionEdit?.id === event.id ? (
                        <div className="expo-caption-editor">
                          <textarea
                            value={captionEdit.value}
                            maxLength={200}
                            rows={3}
                            autoFocus
                            onChange={(changeEvent) =>
                              setCaptionEdit({ id: event.id, value: changeEvent.target.value })
                            }
                          />
                          <div>
                            <button type="button" disabled={captionBusy} onClick={() => void saveCaption(event.id)}>{captionBusy ? "正在保存…" : "保存展签"}</button>
                            <button type="button" disabled={captionBusy} onClick={() => setCaptionEdit(null)}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <p
                          className={`expo-card-narrative${event.exhibit_caption ? " curated" : ""}`}
                          title="点按可改写这段展签"
                          onClick={() =>
                            setCaptionEdit({
                              id: event.id,
                              value: event.exhibit_caption ?? exhibitNarrative(event),
                            })
                          }
                        >
                          {event.exhibit_caption ?? exhibitNarrative(event)}
                          <span className="expo-caption-edit-hint" aria-hidden="true">改写</span>
                        </p>
                      )}
                    </div>
                    <div className="expo-labels">
                      {event.claims.map((claim, claimIndex) => (
                        <details className="expo-label" key={claim.id}>
                          <summary>
                            <span>展品标签{event.claims.length > 1 ? ` ${claimIndex + 1}` : ""}</span>
                            <small>{event.source_count ?? 1} 份来源 · {claim.anchors.length} 个证据位置</small>
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
                ))}
              </div>
            </section>
          );
        })}

      <section className="expo-epilogue">
        <div className="expo-reveal">
          <span className="expo-kicker">EPILOGUE · 尾声</span>
          <h2>{closingLine}</h2>
          <p>所有展品由本地真实档案确定性生成，未经模型补写。</p>
          <div className="expo-show-actions">
            <button className="expo-button ghost" type="button" onClick={() => setPhase("style")}>
              换一种风格再看一次
            </button>
            <button
              className="expo-button ghost"
              type="button"
              title="把当前勾选展出的经历导出为一个自包含 HTML 文件：断网可双击打开、可发给朋友；不含证据链细节（原文锚点与文件指纹留在本机）。"
              onClick={exportStaticExhibition}
            >
              导出静态展览（HTML）
            </button>
            <Link className="expo-button" href="/">回到工作台</Link>
          </div>
        </div>
      </section>
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

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{display}</>;
}

/**
 * 展品画面：事件首个 claim 带可展示原图（source_media）时直接上墙，照片满框
 * 并叠一层装裱内衬刻线（照片 + 版式刻线 = 装裱感）；图片加载失败（例如文件
 * 被手动删除）静默回落确定性 SpecimenArt，无媒体事件维持标本版画。
 * 编号 / 钢印 / 草稿标层在 figure 内保持不变。
 */
function ExhibitArt({ event }: { event: CandidateEvent }) {
  const sourceMedia = event.claims[0]?.source_media ?? null;
  const [photoFailed, setPhotoFailed] = useState(false);

  if (sourceMedia && !photoFailed) {
    return (
      <>
        {/* 内容寻址的本地 blob 无法走 next/image 加载器，直接用 img 满框展示 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="expo-art-photo"
          src={blobUrl(sourceMedia.sha256)}
          alt=""
          loading="lazy"
          onError={() => setPhotoFailed(true)}
        />
        <span className="expo-art-mat" aria-hidden="true" />
      </>
    );
  }
  return <SpecimenArt seed={event.claims[0]?.anchors[0]?.blob_sha256 ?? event.id} />;
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
