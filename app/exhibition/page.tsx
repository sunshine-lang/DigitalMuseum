"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandidateEvent,
  Phase0ApiError,
  Stage,
  getEvents,
  getStage,
} from "../phase0-api";

const STAGE_STORAGE_KEY = "digital-museum-phase0-stage-id";
const THEME_STORAGE_KEY = "digital-museum-expo-theme";

type ThemeId = "renaissance" | "fieldnotes" | "archive" | "midnight" | "glass" | "brutal";
type ExpoPhase = "select" | "style" | "show";
type LoadStatus = "loading" | "ready" | "empty" | "error";

const themes: Array<{
  id: ThemeId;
  name: string;
  tagline: string;
  description: string;
}> = [
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

const statusLabels: Record<string, string> = {
  candidate: "等待核对",
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
        const confirmed = visible.filter((event) => event.status === "confirmed");
        setSelectedIds(
          new Set((confirmed.length ? confirmed : visible).map((event) => event.id)),
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
              return (
                <article className="expo-module" key={key}>
                  <header>
                    <button type="button" onClick={() => toggleGroup(key)} aria-pressed={selectedInGroup === groupEvents.length}>
                      <i className={selectedInGroup === groupEvents.length ? "on" : selectedInGroup > 0 ? "half" : ""} aria-hidden />
                      <strong>{monthLabel(key)}</strong>
                    </button>
                    <small>{groupEvents.length} 段经历 · {confirmedInGroup} 段已确认</small>
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
  const draftCount = selectedEvents.length - confirmedCount;
  const closingLine =
    confirmedCount === 0
      ? "今天展出的仍是草稿。完成核对之后，它们会真正属于你。"
      : confirmedCount === selectedEvents.length
        ? `这 ${spanMonths} 个月里的每一段展出经历，都由你亲自确认。`
        : `这 ${spanMonths} 个月里，你确认了 ${confirmedCount} 段真实经历；其余 ${draftCount} 段仍在等待你的核对。`;

  return (
    <main className="expo-show" data-expo-theme={themeId}>
      <div className="expo-progress" ref={progressRef} aria-hidden="true" />
      <header className="expo-show-topbar">
        <span className="expo-show-brand">DIGITAL MUSEUM</span>
        <span className="expo-show-theme">{theme.name}{themeIsRandom ? " · 随机" : ""}</span>
        <Link href="/">回到工作台</Link>
      </header>

      <section className="expo-cover">
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
        <p className="expo-prologue expo-reveal">
          你把 {stage?.starts_on} 到 {stage?.ends_on} 这 {spanMonths} 个月里的 {stage?.evidence_count ?? 0} 份记录，
          整理成 {selectedEvents.length} 段经历；其中 {confirmedCount} 段由你亲自确认。
          下面，按时间走进它们。
        </p>
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
          return (
            <section className="expo-chapter" id={`chapter-${key}`} key={key}>
              <header className="expo-reveal">
                <span className="expo-chapter-num">{String(chapterIndex + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{monthLabel(key)}</h2>
                  <p>{shown.length} 段经历 · {confirmedHere} 段本人确认</p>
                </div>
              </header>
              <div className="expo-hall">
                {shown.map((event, exhibitIndex) => (
                  <article
                    className={`expo-card expo-reveal${event.status === "confirmed" ? "" : " draft"}`}
                    key={event.id}
                  >
                    <header>
                      <span className="expo-card-no">No. {String(chapterIndex + 1).padStart(2, "0")}{String(exhibitIndex + 1).padStart(2, "0")}</span>
                      {event.status === "confirmed" ? (
                        <span className="expo-seal">已入馆</span>
                      ) : (
                        <span className="expo-card-status">
                          {statusLabels[event.status] ?? "等待核对"}
                        </span>
                      )}
                    </header>
                    <time>{event.occurred_on ?? "时间待定"}</time>
                    <h3>{event.title}</h3>
                    <p className="expo-card-text">{event.claims[0]?.text ?? "原始描述保留在关联记录中。"}</p>
                    <div className="expo-labels">
                      {event.claims.map((claim, claimIndex) => (
                        <details className="expo-label" key={claim.id} open={claimIndex === 0 && event.claims.length === 1}>
                          <summary>
                            <span>展品标签{event.claims.length > 1 ? ` ${claimIndex + 1}` : ""}</span>
                            <small>{claim.anchors.length} 个来源位置</small>
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
                    <footer>{event.source_count ?? 1} 份来源记录 · 内容来自本地档案，未经过模型改写</footer>
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
          <p>展览基于你本地的真实档案生成：数字、日期与核对状态均为确定性记录，没有内容由模型补写。</p>
          <div className="expo-show-actions">
            <button className="expo-button ghost" type="button" onClick={() => setPhase("style")}>
              换一种风格再看一次
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
