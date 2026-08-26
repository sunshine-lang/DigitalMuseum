"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import {
  AgentSessionProject,
  ArchiveSyncSummary,
  CandidateEvent,
  ReviewDecision,
  listArchiveEvents,
  listClaudeSessionProjects,
  listCodexSessionProjects,
  listDshSessionProjects,
  listPiSessionProjects,
  reviewEvent,
  syncArchive,
  wipeArchive,
} from "./phase0-api";
import {
  isVisibleExperience as isVisibleExperienceBase,
  statusLabels,
} from "./events-shared";

type WorkspaceView = "sync" | "browse" | "review";

type ActiveAnchor = {
  key: string;
  claimId: string;
  quote: string;
};

const viewItems: Array<{ id: WorkspaceView; label: string; helper: string }> = [
  { id: "sync", label: "同步会话", helper: "一键全量 + 自动增量" },
  { id: "browse", label: "浏览经历", helper: "档案时间线" },
  { id: "review", label: "查看回顾", helper: "静态展览导出" },
];

// 状态文案基于共享表（含 merged/split/rejected 全 8 态）；工作台语境里
// candidate/confirmed/unknown 用“你”视角措辞，作为差异键本地覆写。
const friendlyStatus: Record<CandidateEvent["status"], string> = {
  ...statusLabels,
  candidate: "等待你核对",
  confirmed: "你已确认",
  unknown: "暂时不确定",
};

function isVisibleExperience(event: CandidateEvent): boolean {
  return isVisibleExperienceBase(event);
}

function originChipLabel(event: CandidateEvent): string {
  if (event.origin === "claude") return "来自 Claude Code 会话";
  if (event.origin === "codex") return "来自 Codex 会话";
  return `聚合自 ${event.source_count} 份`;
}

function evidenceSummary(event: CandidateEvent): string {
  if (event.origin === "claude") {
    return "这段经历由系统从 Claude Code 会话的机器读数（会话时间戳与消息计数）自动核实：系统只读取时间戳、计数与你的消息原文，没有解读对话内容，也无需你确认。如果与事实不符，点下方「对这段记录提出异议」随时纠正。";
  }
  if (event.origin === "codex") {
    return "这段经历由系统从 Codex 会话的机器读数（会话时间戳与消息计数）自动核实：系统只读取时间戳、计数与你的消息原文，没有解读对话内容，也无需你确认。如果与事实不符，点下方「对这段记录提出异议」随时纠正。";
  }
  if (event.origin === "aggregated") {
    return `系统发现 ${event.source_count} 份标题和日期都相同的确定性记录，把它们整理在同一段经历里并自动核实。如果与事实不符，点下方「对这段记录提出异议」随时纠正。`;
  }
  return "系统只读取记录里的确定性信息（日期、计数与原文摘录），没有判断事情是否完成或对你意味着什么。";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function reviewSuccessMessage(decision: ReviewDecision): string {
  if (decision === "confirmed") return "已加入你的正式经历。";
  if (decision === "disputed") return "已保存你的修正说明，这段经历暂不作为正式事实。";
  if (decision === "unknown") return "已保留为暂时不确定，系统不会替你补写。";
  return "已从回顾中排除，原始记录仍然保留。";
}

export default function MuseumMvpWorkspace() {
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  // 打开应用即自动增量同步一次（PRD v0.3 §3.2/同步交互决议）。
  const [syncing, setSyncing] = useState(true);
  const [syncSummary, setSyncSummary] = useState<ArchiveSyncSummary | null>(null);
  const [view, setView] = useState<WorkspaceView>("sync");
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [reviewOverrideId, setReviewOverrideId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState<ActiveAnchor | null>(null);
  const [wipeArmed, setWipeArmed] = useState(false);
  const reviewNoteRef = useRef<HTMLTextAreaElement | null>(null);
  const reviewEvidenceRef = useRef<HTMLElement | null>(null);

  const visibleEvents = useMemo(
    () => events.filter(isVisibleExperience),
    [events],
  );
  // 馆藏概览：全部由档案数据确定性推导（项目数按标题、跨度按首末日期）。
  const archiveDigest = useMemo(() => {
    const dated = visibleEvents
      .map((event) => event.occurred_on)
      .filter((value): value is string => Boolean(value))
      .sort();
    if (!dated.length) return null;
    const products = new Set(
      visibleEvents.map((event) => event.origin).filter((origin) => origin !== "aggregated"),
    );
    return {
      count: visibleEvents.length,
      projects: new Set(visibleEvents.map((event) => event.title)).size,
      span: `${dated[0]} — ${dated[dated.length - 1]}`,
      products: products.size,
      volume: `VOL.${dated[0].slice(0, 7).replace("-", ".")} · No.${String(visibleEvents.length).padStart(3, "0")}`,
    };
  }, [visibleEvents]);
  const candidateEvents = useMemo(
    () => visibleEvents.filter((event) => event.status === "candidate"),
    [visibleEvents],
  );
  const selectedEvent = useMemo(
    () =>
      visibleEvents.find((event) => event.id === selectedEventId) ??
      visibleEvents[0] ??
      null,
    [visibleEvents, selectedEventId],
  );
  const reviewEventCandidate = useMemo(() => {
    // 异议通道：verified 事件通过「对这段记录提出异议」进入核对视图；
    // 候选事件（历史遗留）走同一视图逐个核对。
    const override = visibleEvents.find((event) => event.id === reviewOverrideId);
    if (override) return override;
    return candidateEvents[0] ?? null;
  }, [candidateEvents, visibleEvents, reviewOverrideId]);

  const refreshEvents = useCallback(async (): Promise<number> => {
    const next = await listArchiveEvents();
    setEvents(next);
    return next.filter(isVisibleExperience).length;
  }, []);

  const runSync = useCallback(
    async (options?: { silent?: boolean }) => {
      setSyncing(true);
      try {
        const summary = await syncArchive();
        setSyncSummary(summary);
        const visibleCount = await refreshEvents();
        if (options?.silent) {
          // 打开应用的自动增量：有新增才提示；档案已有内容则直接落到时间线。
          if (summary.events_created > 0) {
            setNotice({
              kind: "success",
              message: `自动同步完成：新增 ${summary.events_created} 段经历。`,
            });
          }
          if (visibleCount > 0) setView("browse");
          return summary;
        }
        if (summary.events_created > 0) {
          setNotice({
            kind: "success",
            message: `同步完成：新增 ${summary.events_created} 段经历。`,
          });
          setView("browse");
        } else if (summary.projects_failed > 0) {
          setNotice({
            kind: "error",
            message: `同步完成，但 ${summary.projects_failed} 个项目失败，可在下方查看原因。`,
          });
        } else {
          setNotice({ kind: "success", message: "档案已是最新：所有项目都没有新会话。" });
        }
        return summary;
      } catch (error) {
        if (!options?.silent) {
          setNotice({ kind: "error", message: errorMessage(error) });
        }
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [refreshEvents],
  );

  useEffect(() => {
    // 微任务里启动（与发现面板同习），避免 effect 内同步 setState。
    void Promise.resolve()
      .then(() => runSync({ silent: true }))
      .finally(() => setLoading(false));
  }, [runSync]);

  async function handleReview(decision: ReviewDecision) {
    const event = reviewEventCandidate;
    if (!event || busy) return;
    if (decision === "disputed" && !reviewNote.trim()) {
      setNotice({
        kind: "error",
        message: "选择「描述要改」时，请先写一句补充说明。",
      });
      reviewNoteRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await reviewEvent(event.id, {
        decision,
        note: reviewNote.trim() || null,
        expected_revision: event.revision,
      });
      setNotice({ kind: "success", message: reviewSuccessMessage(decision) });
      await refreshEvents();
      setReviewOverrideId(null);
      setReviewNote("");
      setActiveAnchor(null);
      setView("browse");
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  // 核对视图的键盘快捷作答（1–4），与按钮一一对应。
  useEffect(() => {
    if (view !== "review" || !reviewEventCandidate) return;
    const decisions: ReviewDecision[] = ["confirmed", "disputed", "unknown", "rejected"];
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < decisions.length) {
        event.preventDefault();
        void handleReview(decisions[index]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function startDispute(eventId: string) {
    setSelectedEventId(eventId);
    setReviewOverrideId(eventId);
    setReviewNote("");
    setActiveAnchor(null);
    setView("review");
  }

  function activateEvidenceAnchor(claimId: string, anchorKey: string, quote: string) {
    setActiveAnchor({ key: anchorKey, claimId, quote });
    requestAnimationFrame(() => {
      reviewEvidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleWipe() {
    setBusy(true);
    try {
      await wipeArchive();
      await refreshEvents();
      setSyncSummary(null);
      setWipeArmed(false);
      setSelectedEventId(null);
      setView("sync");
      setNotice({
        kind: "success",
        message: "档案库已清空，原始文件已回收。点「同步本机全部会话」重新开始。",
      });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mvp-shell">
      <MvpHeader archiveNo={archiveDigest?.volume ?? null} />
      <MvpHero />
      {archiveDigest && (
        <section className="mvp-archive-digest" aria-label="馆藏概览">
          <dl>
            <div><dt>馆藏经历</dt><dd>{archiveDigest.count}<small> 段</small></dd></div>
            <div><dt>协作项目</dt><dd>{archiveDigest.projects}<small> 个</small></dd></div>
            <div><dt>时间跨度</dt><dd>{archiveDigest.span}</dd></div>
            <div><dt>来源产品</dt><dd>{archiveDigest.products}<small> 种</small></dd></div>
          </dl>
        </section>
      )}
      <FlowNavigation
        current={view}
        hasEvents={visibleEvents.length > 0}
        syncing={syncing}
        onChange={setView}
      />

      {notice && <div className={`mvp-notice ${notice.kind}`} role="status">{notice.message}</div>}

      {loading ? (
        <section className="mvp-loading">正在读取本地档案…</section>
      ) : (
        <>
          {view === "sync" && (
            <SyncView
              syncing={syncing}
              summary={syncSummary}
              busy={busy}
              wipeArmed={wipeArmed}
              onSync={() => void runSync()}
              onWipeArm={setWipeArmed}
              onWipe={() => void handleWipe()}
            />
          )}
          {view === "browse" && (
            <BrowseView
              events={visibleEvents}
              selectedEvent={selectedEvent}
              activeAnchor={activeAnchor}
              onSelect={setSelectedEventId}
              onAnchorActivate={activateEvidenceAnchor}
              onDispute={startDispute}
              onReview={(eventId) => {
                setSelectedEventId(eventId);
                setReviewOverrideId(null);
                setView("review");
              }}
            />
          )}
          {view === "review" && (
            <ReviewView
              key={reviewEventCandidate?.id ?? "none"}
              event={reviewEventCandidate}
              remaining={candidateEvents.length}
              note={reviewNote}
              busy={busy}
              noteRef={reviewNoteRef}
              evidenceRef={reviewEvidenceRef}
              activeAnchor={activeAnchor}
              onNoteChange={setReviewNote}
              onReview={(decision) => void handleReview(decision)}
              onSkip={() => {
                setNotice(null);
                setReviewOverrideId(null);
                setView("browse");
              }}
              onAnchorActivate={activateEvidenceAnchor}
            />
          )}
        </>
      )}

      <footer className="mvp-footer">
        <span>当前体验：Claude Code / Codex 会话同步 → 经历档案 → 关键核对（仅异议）→ 私人回顾</span>
        <span>静态展览导出已就绪（导出前有敏感信息检查）；ChatGPT / WorkBuddy 导入尚未实现</span>
      </footer>
    </main>
  );
}

function MvpHeader({ archiveNo }: { archiveNo: string | null }) {
  return (
    <header className="mvp-header">
      <Link className="mvp-brand" href="/" aria-label="Digital Museum 首页">
        <span className="mvp-brand-seal" aria-hidden="true"><i>DM</i><small>EST.<br />2026</small></span>
        <div><strong>Digital Museum</strong><small>Personal AI Archive · 数字档案馆</small></div>
      </Link>
      <div className="mvp-header-actions">
        {archiveNo && <span className="mvp-archive-no">{archiveNo}</span>}
        <span className="mvp-local-badge"><i /> 原始记录保存在本地</span>
      </div>
    </header>
  );
}

function MvpHero() {
  return (
    <section className="mvp-hero">
      <div>
        <p className="mvp-kicker">YOUR AI WORK, REMEMBERED</p>
        <h1>把散落的 Agent 会话，<br />变成一份看得懂的成长回顾。</h1>
        <p>一键同步本机的 Claude Code 与 Codex 会话，先看看系统核实出哪些经历；全部真实可溯，你只需要在存疑时提出异议。</p>
      </div>
      <aside><span>首次体验方式</span><strong>先看草稿</strong><p>看到整理结果后，再决定哪些内容值得展出和分享。</p></aside>
    </section>
  );
}

function FlowNavigation({ current, hasEvents, syncing, onChange }: {
  current: WorkspaceView;
  hasEvents: boolean;
  syncing: boolean;
  onChange: (view: WorkspaceView) => void;
}) {
  return (
    <nav className="mvp-flow" aria-label="AI 记录整理流程">
      {viewItems.map((item, index) => {
        const isExhibition = item.id === "review";
        const active = !isExhibition && current === item.id;
        const disabled = !isExhibition && item.id !== "sync" && !hasEvents;
        const inner = (
          <>
            <span>{index + 1}</span>
            <div><strong>{item.label}</strong><small>{syncing && item.id === "sync" ? "正在同步…" : item.helper}</small></div>
          </>
        );
        return isExhibition ? (
          <Link
            key={item.id}
            className={`mvp-flow-link${!hasEvents ? " disabled" : ""}`}
            href="/exhibition"
            aria-disabled={!hasEvents}
            onClick={(event) => {
              if (!hasEvents) event.preventDefault();
            }}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={item.id}
            type="button"
            className={active ? "active" : ""}
            disabled={disabled}
            aria-current={active ? "step" : undefined}
            onClick={() => onChange(item.id)}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

// 01 · 同步：发现面板 + 一键全量 + 清空档案库（唯一破坏性操作）。
function SyncView({ syncing, summary, busy, wipeArmed, onSync, onWipeArm, onWipe }: {
  syncing: boolean;
  summary: ArchiveSyncSummary | null;
  busy: boolean;
  wipeArmed: boolean;
  onSync: () => void;
  onWipeArm: (armed: boolean) => void;
  onWipe: () => void;
}) {
  return (
    <section className="mvp-view mvp-sync-view">
      <article className="mvp-panel mvp-import-panel">
        <header className="mvp-section-heading"><span>01 · 同步</span><div><h2>一键同步本机 Agent 会话</h2><p>只读扫描 ~/.claude/projects 与 ~/.codex/sessions 的全部会话转录，自动建立档案并解析为「系统核实」的经历；每次打开应用也会自动增量同步一次。</p></div></header>
        <button className="mvp-primary mvp-sync-hero" disabled={syncing} type="button" onClick={onSync}>
          {syncing ? "正在同步本机会话…" : "同步本机全部会话"}
        </button>
        {summary && <SyncSummaryPanel summary={summary} />}
        <SessionDiscoveryPanel />
        <div className="mvp-privacy-note"><strong>本地优先</strong><p>当前版本不调用模型，也不会把文件发送到云端；档案只保存在这台机器上，同步只读取、绝不修改 ~/.claude 与 ~/.codex。导出分享前系统会做敏感信息检查，最终可见内容由你确认。</p></div>
      </article>
      <aside className="mvp-panel mvp-wipe-panel" aria-label="档案库危险操作">
        <span>档案库管理</span>
        <h3>清空档案库</h3>
        <p>删除全部经历、证据与原始文件——这是本产品唯一的破坏性操作，清空后需要重新同步。删除「回顾视图」不会动档案，只有这里会。</p>
        {wipeArmed ? (
          <div className="mvp-stage-danger" role="alertdialog" aria-label="清空档案库确认">
            <strong>请再次确认：清空后无法恢复</strong>
            <p>全部经历、证据文档与原始文件都会被删除，阶段视图一并清除；清空后需要重新同步本机会话。</p>
            <div className="mvp-stage-danger-actions">
              <button className="mvp-primary" type="button" disabled={busy} onClick={onWipe}>{busy ? "正在清空…" : "确认清空档案库"}</button>
              <button className="mvp-secondary" type="button" disabled={busy} onClick={() => onWipeArm(false)}>取消</button>
            </div>
          </div>
        ) : (
          <button className="mvp-stage-remove" type="button" disabled={busy} onClick={() => onWipeArm(true)}>清空档案库…</button>
        )}
      </aside>
    </section>
  );
}

function SyncSummaryPanel({ summary }: { summary: ArchiveSyncSummary }) {
  const failed = summary.products.filter((item) => item.status === "failed");
  return (
    <div className="mvp-sync-summary" aria-label="上次同步结果">
      <dl>
        <div><dt>新导入项目</dt><dd>{summary.projects_imported}</dd></div>
        <div><dt>无变化跳过</dt><dd>{summary.projects_skipped}</dd></div>
        <div><dt>新增经历</dt><dd>{summary.events_created}</dd></div>
        <div><dt>失败项目</dt><dd>{summary.projects_failed}</dd></div>
      </dl>
      {failed.length > 0 && (
        <ul className="mvp-sync-failures">
          {failed.map((item) => (
            <li key={`${item.product}-${item.project}`}>
              {item.project}（{item.product}）：{item.error_code ?? "未知错误"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 会话发现面板：只读展示本机各产品有会话的项目，供同步前了解范围；
// 导入动作统一走「同步本机全部会话」，不再逐项目导入。
function SessionDiscoveryPanel() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Array<{ title: string; projects: AgentSessionProject[] }>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      listClaudeSessionProjects(),
      listCodexSessionProjects(),
      listPiSessionProjects(),
      listDshSessionProjects(),
    ])
      .then(([claude, codex, pi, dsh]) => {
        setProducts([
          { title: "Claude Code", projects: claude },
          { title: "Codex", projects: codex },
          { title: "pi", projects: pi },
          { title: "dsh", projects: dsh },
        ]);
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : "扫描本机会话失败"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // 与自动同步同习：微任务里启动，避免 effect 内同步 setState。
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <section className="mvp-session-discovery" aria-label="本机 Agent 会话发现">
      <header>
        <div>
          <strong>本机 Agent 会话</strong>
          <small>同步会读取下列项目目录的全部会话转录；只读，不会修改 ~/.claude、~/.codex、~/.pi 与 ~/.dsh</small>
        </div>
        <button type="button" disabled={loading} onClick={load}>{loading ? "扫描中…" : "刷新"}</button>
      </header>
      {error && (
        <p className="mvp-session-discovery-hint">暂时扫不到会话：{error}。</p>
      )}
      {!error && !loading && products.every((group) => group.projects.length === 0) && (
        <p className="mvp-session-discovery-hint">没有发现任何 Agent 会话；请确认本机已使用过它们，或点「刷新」重试。</p>
      )}
      {products.map(({ title, projects }) =>
        projects.length > 0 ? (
          <div key={title}>
            <span>{title} · {projects.length} 个项目</span>
            <ul>
              {projects.map((project) => (
                <li key={project.import_path}>
                  <span className="mvp-session-project">
                    <strong>{project.project}</strong>
                    <small>{project.session_count} 个会话</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  );
}

// 02 · 浏览：档案时间线（按发生日分组）+ 右侧证据面板。
function BrowseView({ events, selectedEvent, activeAnchor, onSelect, onAnchorActivate, onDispute, onReview }: {
  events: CandidateEvent[];
  selectedEvent: CandidateEvent | null;
  activeAnchor: ActiveAnchor | null;
  onSelect: (eventId: string) => void;
  onAnchorActivate: (claimId: string, anchorKey: string, quote: string) => void;
  onDispute: (eventId: string) => void;
  onReview: (eventId: string) => void;
}) {
  const volumes = useMemo(() => {
    const byDate = new Map<string, CandidateEvent[]>();
    for (const event of events) {
      const key = event.occurred_on ?? "时间待定";
      byDate.set(key, [...(byDate.get(key) ?? []), event]);
    }
    const byMonth = new Map<string, Array<[string, CandidateEvent[]]>>();
    for (const [day, dayEvents] of byDate) {
      const month = day === "时间待定" ? "时间待定" : `${day.slice(0, 4)} 年 ${Number(day.slice(5, 7))} 月`;
      byMonth.set(month, [...(byMonth.get(month) ?? []), [day, dayEvents]]);
    }
    return Array.from(byMonth.entries());
  }, [events]);

  return (
    <section className="mvp-view mvp-browse-view">
      <div className="mvp-panel mvp-browse-main">
        <header className="mvp-section-heading"><span>02 · 浏览</span><div><h2>档案时间线 · {events.length} 段经历</h2><p>带「系统核实」的内容来自确定性机器读数（会话时间戳与计数），无需你确认；对任何一段存疑都可以提出异议，你的判定优先于机器读数。</p></div></header>
        <div className="mvp-legend" aria-label="卡片状态图例">
          <span><i className="sys" aria-hidden="true" />实线纹理 · 系统核实的确定性记录</span>
          <span><i className="user" aria-hidden="true" />暖金实心 + 印章 · 你确认的经历</span>
          <span><i className="unsure" aria-hidden="true" />虚线留白 · 暂不确定 / 有异议</span>
          <span><i className="ai" aria-hidden="true" />虚线半透明 · 等待核对的草稿</span>
        </div>
        {events.length === 0 ? (
          <div className="mvp-empty-state"><strong>档案还是空的</strong><p>回到「同步会话」点一下同步，系统会自动整理出经历。</p></div>
        ) : (
          <div className="mvp-timeline-groups">
            {volumes.map(([month, dayGroups], volumeIndex) => (
            <section className="mvp-volume" key={month}>
              <div className="mvp-volume-divider" aria-label={month}>
                <span className="mvp-volume-no">VOL.{String(volumeIndex + 1).padStart(2, "0")}</span>
                <strong className="mvp-volume-title">{month}</strong>
                <i aria-hidden="true" />
              </div>
            {dayGroups.map(([day, dayEvents]) => (
              <div className="mvp-timeline-group" key={day}>
                <time className="mvp-timeline-date">
                  {/^\d{4}-\d{2}-\d{2}$/.test(day) ? (
                    <>
                      <b>{Number(day.slice(8))}</b>
                      <span>{day.slice(0, 7)} · 周{["日", "一", "二", "三", "四", "五", "六"][new Date(`${day}T00:00:00`).getDay()]}</span>
                    </>
                  ) : day}
                </time>
                <div className="mvp-timeline">
                  {dayEvents.map((event, index) => (
                    <article
                      key={event.id}
                      className={event.status === "confirmed" ? "confirmed" : event.status === "verified" ? "verified" : "draft"}
                      style={{ "--i": index } as CSSProperties}
                    >
                      <div className="mvp-timeline-marker"><span>{String(index + 1).padStart(2, "0")}</span><i /></div>
                      <button
                        type="button"
                        className={selectedEvent?.id === event.id ? "selected" : ""}
                        onClick={() => onSelect(event.id)}
                      >
                        {event.status === "confirmed" && <span className="mvp-seal" aria-hidden="true">已入馆</span>}
                        <span className="mvp-card-tags">
                          <span className={`mvp-status ${event.status}`}>{friendlyStatus[event.status]}</span>
                          <span className="mvp-origin-chip">{originChipLabel(event)}</span>
                        </span>
                        <h3>{event.title}</h3>
                        <p>{event.claims[0]?.text}</p>
                        <small>{event.source_count} 份来源记录 · {event.claims.length} 条原文摘录</small>
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ))}
            </section>
            ))}
          </div>
        )}
      </div>
      <aside className="mvp-panel mvp-evidence-panel">
        {selectedEvent ? (
          <>
            <span>为什么系统认为这是一段经历</span>
            <h3>{selectedEvent.title}</h3>
            <p className="mvp-evidence-summary">{evidenceSummary(selectedEvent)}</p>
            <EvidenceDetails event={selectedEvent} activeAnchor={activeAnchor} onAnchorActivate={onAnchorActivate} />
            {selectedEvent.status === "candidate" && (
              <button className="mvp-secondary full" type="button" onClick={() => onReview(selectedEvent.id)}>核对这段经历</button>
            )}
            {(selectedEvent.status === "verified" || selectedEvent.status === "disputed" || selectedEvent.status === "confirmed" || selectedEvent.status === "unknown") && (
              <button className="mvp-secondary full" type="button" onClick={() => onDispute(selectedEvent.id)}>
                {selectedEvent.status === "disputed" ? "继续修改我的异议" : "对这段记录提出异议"}
              </button>
            )}
          </>
        ) : <div className="mvp-empty-state"><strong>选择一段经历</strong><p>这里会显示它来自哪份记录。</p></div>}
      </aside>
    </section>
  );
}

// 03 · 核对（仅异议通道/历史候选）：保留四键作答与逐字锚定证据面板。

function ReviewView({ event, remaining, note, busy, noteRef, evidenceRef, activeAnchor, onNoteChange, onReview, onSkip, onAnchorActivate }: {
  event: CandidateEvent | null;
  remaining: number;
  note: string;
  busy: boolean;
  noteRef: RefObject<HTMLTextAreaElement | null>;
  evidenceRef: RefObject<HTMLElement | null>;
  activeAnchor: ActiveAnchor | null;
  onNoteChange: (value: string) => void;
  onReview: (decision: ReviewDecision) => void;
  onSkip: () => void;
  onAnchorActivate: (claimId: string, anchorKey: string, quote: string) => void;
}) {
  if (!event) {
    return (
      <section className="mvp-view mvp-review-complete">
        <span>核对 · 无待办</span>
        <h2>这段回顾目前无需逐条核对</h2>
        <p>展示的经历全部来自系统核实（确定性机器读数）；如果哪一段与事实不符，随时可在「浏览经历」里点「对这段记录提出异议」。</p>
        <button className="mvp-primary" type="button" onClick={onSkip}>回到浏览</button>
      </section>
    );
  }
  const frozen = busy;
  const reviseLabel = "发生过，但描述要改";
  return (
    <section className="mvp-view mvp-review-view">
      <article key={event.id} className="mvp-panel mvp-question-card">
        <header><span>核对 · 异议通道</span><small>还剩 {remaining} 个问题</small></header>
        <p className="mvp-question-context">
          {event.status === "disputed" && event.latest_review?.note
            ? `你之前写过：「${event.latest_review.note}」，可以修改后重新提交。`
            : "这段经历当前由系统核实。如果与事实不符，选择下方的处理方式；你的判定优先于机器读数。"}
        </p>
        <h2>这段记录符合你的实际经历吗？</h2>
        <div className="mvp-question-experience">
          <time>{event.occurred_on ?? "时间还不明确"}</time>
          <strong>{event.title}</strong>
          <blockquote>{event.claims[0]?.text}</blockquote>
        </div>
        <label className="mvp-review-note"><span>补充说明（选择「{reviseLabel}」时必填）</span><textarea ref={noteRef} value={note} maxLength={2000} placeholder="例如：这天其实在休假，会话是误触。" onChange={(changeEvent) => onNoteChange(changeEvent.target.value)} /></label>
        <div className="mvp-answer-grid">
          <button className="yes" disabled={frozen} type="button" onClick={() => onReview("confirmed")}>
            <kbd aria-hidden="true">1</kbd>
            <span><strong>是，已经发生</strong><small>确认后盖上「已入馆」印章</small></span>
          </button>
          <button className="revise" disabled={frozen} type="button" onClick={() => onReview("disputed")}>
            <kbd aria-hidden="true">2</kbd>
            <span><strong>{reviseLabel}</strong><small>需要先写一句补充说明</small></span>
          </button>
          <button className="unsure" disabled={frozen} type="button" onClick={() => onReview("unknown")}>
            <kbd aria-hidden="true">3</kbd>
            <span><strong>我现在不确定</strong><small>保留原样，系统不会补写</small></span>
          </button>
          <button className="drop" disabled={frozen} type="button" onClick={() => onReview("rejected")}>
            <kbd aria-hidden="true">4</kbd>
            <span><strong>不属于我</strong><small>不进入回顾，原文仍保留</small></span>
          </button>
        </div>
        <p className="mvp-kbd-hint">键盘 1–4 可快速作答；「描述要改」需先填写说明。</p>
        <button className="mvp-text-button" disabled={frozen} type="button" onClick={onSkip}>先跳过，稍后再说</button>
      </article>
      <aside className="mvp-panel mvp-review-evidence" ref={evidenceRef}>
        <span>你可以检查原始记录</span><h3>系统知道什么，不知道什么</h3>
        <div className="mvp-known-unknown"><div><strong>已经知道</strong><p>原文内容、文件哈希、行号和记录中的日期。</p></div><div><strong>仍不知道</strong><p>事情是否完成、你是否认同，以及它对你的意义。</p></div></div>
        <EvidenceDetails event={event} activeAnchor={activeAnchor} onAnchorActivate={onAnchorActivate} />
      </aside>
    </section>
  );
}

function EvidenceDetails({ event, activeAnchor, onAnchorActivate }: {
  event: CandidateEvent;
  activeAnchor?: ActiveAnchor | null;
  onAnchorActivate?: (claimId: string, anchorKey: string, quote: string) => void;
}) {
  return (
    <div className="mvp-evidence-list">
      {event.claims.map((claim, index) => {
        const highlightQuote = activeAnchor && activeAnchor.claimId === claim.id ? activeAnchor.quote : null;
        return (
          <details key={claim.id} open={index === 0}>
            <summary><span>原文摘录 {event.claims.length > 1 ? index + 1 : ""}</span><small>{claim.anchors.length} 个来源位置</small></summary>
            <blockquote>{highlightQuote ? <HighlightedExcerpt text={claim.text} quote={highlightQuote} pulseKey={activeAnchor?.key} /> : claim.text}</blockquote>
            {claim.anchors.map((anchor) => {
              const anchorKey = `${anchor.blob_sha256}-${anchor.char_start}`;
              const body = (<><p>{anchor.quote}</p><dl><div><dt>行号</dt><dd>{anchor.line_start}{anchor.line_end !== anchor.line_start ? `–${anchor.line_end}` : ""}</dd></div><div><dt>文件指纹</dt><dd title={anchor.blob_sha256}>{anchor.blob_sha256.slice(0, 14)}…</dd></div></dl></>);
              if (!onAnchorActivate) {
                return <div className="mvp-anchor" key={anchorKey}>{body}</div>;
              }
              return (
                <div
                  className={`mvp-anchor interactive${activeAnchor?.key === anchorKey ? " active" : ""}`}
                  key={anchorKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => onAnchorActivate(claim.id, anchorKey, anchor.quote)}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                      keyEvent.preventDefault();
                      onAnchorActivate(claim.id, anchorKey, anchor.quote);
                    }
                  }}
                >
                  {body}
                  <small className="mvp-anchor-hint">点击在上方原文中定位</small>
                </div>
              );
            })}
          </details>
        );
      })}
      {event.latest_review?.note && <div className="mvp-user-note"><strong>你的补充</strong><p>{event.latest_review.note}</p></div>}
    </div>
  );
}

function HighlightedExcerpt({ text, quote, pulseKey }: { text: string; quote: string; pulseKey?: string }) {
  const index = text.indexOf(quote);
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="mvp-evidence-hit" key={pulseKey}>{quote}</mark>
      {text.slice(index + quote.length)}
    </>
  );
}
