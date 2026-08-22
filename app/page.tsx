"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CoverageItem,
  Phase0ApiError,
  ReviewDecision,
  Stage,
  createStage,
  getCoverage,
  getEvents,
  getStage,
  importNote,
  reviewEvent,
} from "./phase0-api";
import type { CandidateEvent as ApiCandidateEvent } from "./phase0-api";

const STAGE_STORAGE_KEY = "digital-museum-phase0-stage-id";
const MAX_BATCH_FILES = 20;
const MAX_BATCH_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_BYTES_LABEL = "20 MiB";

type WorkspaceView = "import" | "discover" | "review" | "exhibition";

type CandidateEvent = Omit<ApiCandidateEvent, "status"> & {
  status: ApiCandidateEvent["status"] | "merged" | "split";
  source_count?: number;
};

type ImportResult = {
  name: string;
  status: "pending" | "success" | "error";
  message: string;
};

const viewItems: Array<{ id: WorkspaceView; label: string; helper: string }> = [
  { id: "import", label: "导入记录", helper: "一次选择多份" },
  { id: "discover", label: "发现经历", helper: "先看到整理结果" },
  { id: "review", label: "核对关键内容", helper: "只回答必要问题" },
  { id: "exhibition", label: "查看回顾", helper: "私人展览草稿" },
];

const friendlyStatus: Record<CandidateEvent["status"], string> = {
  candidate: "等待你核对",
  confirmed: "你已确认",
  disputed: "描述需要修改",
  unknown: "暂时不确定",
  rejected: "不进入档案",
  merged: "已整理到其他经历",
  split: "已拆成其他经历",
};

function isStructuralEvent(event: CandidateEvent): boolean {
  return event.status === "merged" || event.status === "split";
}

function isVisibleExperience(event: CandidateEvent): boolean {
  return !isStructuralEvent(event) && event.status !== "rejected";
}

function sourceCount(event: CandidateEvent): number {
  return event.source_count ?? 1;
}

export default function MuseumMvpWorkspace() {
  const [stage, setStage] = useState<Stage | null>(null);
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [coverage, setCoverage] = useState<CoverageItem[]>([]);
  const [view, setView] = useState<WorkspaceView>("import");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSavedStage, setLoadingSavedStage] = useState(true);
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);

  const visibleEvents = useMemo(
    () => events.filter(isVisibleExperience),
    [events],
  );
  const candidateEvents = useMemo(
    () => visibleEvents.filter((event) => event.status === "candidate"),
    [visibleEvents],
  );
  const confirmedEvents = useMemo(
    () => visibleEvents.filter((event) => event.status === "confirmed"),
    [visibleEvents],
  );
  const selectedEvent = useMemo(
    () =>
      visibleEvents.find((event) => event.id === selectedEventId) ??
      visibleEvents[0] ??
      null,
    [selectedEventId, visibleEvents],
  );
  const reviewEventCandidate = useMemo(
    () =>
      candidateEvents.find((event) => event.id === selectedEventId) ??
      candidateEvents[0] ??
      null,
    [candidateEvents, selectedEventId],
  );

  const refreshStage = useCallback(async (stageId: string) => {
    const [nextStage, apiEvents, nextCoverage] = await Promise.all([
      getStage(stageId),
      getEvents(stageId),
      getCoverage(stageId),
    ]);
    const nextEvents = apiEvents as CandidateEvent[];
    const nextVisible = nextEvents.filter(isVisibleExperience);
    setStage(nextStage);
    setEvents(nextEvents);
    setCoverage(nextCoverage);
    setSelectedEventId((current) =>
      current && nextVisible.some((event) => event.id === current)
        ? current
        : (nextVisible[0]?.id ?? null),
    );
    return nextEvents;
  }, []);

  useEffect(() => {
    async function restoreSavedStage() {
      const savedStageId = window.localStorage.getItem(STAGE_STORAGE_KEY);
      if (!savedStageId) return;
      try {
        const restoredEvents = await refreshStage(savedStageId);
        if (restoredEvents.some(isVisibleExperience)) setView("discover");
      } catch (error) {
        setNotice({ kind: "error", message: errorMessage(error) });
        if (error instanceof Phase0ApiError && error.status === 404) {
          window.localStorage.removeItem(STAGE_STORAGE_KEY);
        }
      }
    }

    restoreSavedStage().finally(() => setLoadingSavedStage(false));
  }, [refreshStage]);

  async function handleCreateStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      const nextStage = await createStage({
        name: String(form.get("name") ?? ""),
        starts_on: String(form.get("starts_on") ?? ""),
        ends_on: String(form.get("ends_on") ?? ""),
      });
      window.localStorage.setItem(STAGE_STORAGE_KEY, nextStage.id);
      setStage(nextStage);
      setEvents([]);
      setCoverage([]);
      setView("import");
      setNotice({
        kind: "success",
        message: "回顾范围已保存。现在可以一次导入多份 AI 协作记录。",
      });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function handleFileSelection(files: FileList | null) {
    const nextFiles = files ? Array.from(files) : [];
    setSelectedFiles(nextFiles);
    setImportResults([]);
    setNotice(null);
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stage) return;
    if (!selectedFiles.length) {
      setNotice({ kind: "error", message: "请先选择 Markdown 或 TXT 文件。" });
      return;
    }
    if (selectedFiles.length > MAX_BATCH_FILES) {
      setNotice({
        kind: "error",
        message: `一次最多选择 ${MAX_BATCH_FILES} 份记录。`,
      });
      return;
    }
    const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_BATCH_BYTES) {
      setNotice({ kind: "error", message: `本次文件总大小不能超过 ${MAX_BATCH_BYTES_LABEL}。` });
      return;
    }

    setBusy(true);
    setNotice(null);
    setImportResults(
      selectedFiles.map((file) => ({
        name: file.name,
        status: "pending",
        message: "等待处理",
      })),
    );

    let succeeded = 0;
    let failed = 0;
    for (const file of selectedFiles) {
      setImportResults((current) =>
        current.map((item) =>
          item.name === file.name && item.status === "pending"
            ? { ...item, message: "正在保存和整理" }
            : item,
        ),
      );
      try {
        await importNote(stage.id, file);
        succeeded += 1;
        setImportResults((current) =>
          updateImportResult(current, file.name, "success", "已导入并形成经历草稿"),
        );
      } catch (error) {
        failed += 1;
        setImportResults((current) =>
          updateImportResult(current, file.name, "error", errorMessage(error)),
        );
      }
    }

    try {
      const nextEvents = await refreshStage(stage.id);
      const firstVisible = nextEvents.find(isVisibleExperience);
      setSelectedEventId(firstVisible?.id ?? null);
      setSelectedFiles([]);
      if (succeeded > 0) setView("discover");
      setNotice({
        kind: failed ? "error" : "success",
        message: failed
          ? `已导入 ${succeeded} 份，${failed} 份需要处理。成功文件没有受到影响。`
          : `已导入 ${succeeded} 份记录。先看看系统整理出了哪些经历。`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(decision: ReviewDecision) {
    if (!reviewEventCandidate) return;
    const note = reviewNote.trim();
    if (decision === "disputed" && !note) {
      setNotice({
        kind: "error",
        message: "请用一句话写下哪里不准确，系统会把它和这次判断一起保存。",
      });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const reviewed = await reviewEvent(reviewEventCandidate.id, {
        decision,
        note: note || null,
        expected_revision: reviewEventCandidate.revision,
      });
      const remaining = candidateEvents.filter(
        (event) => event.id !== reviewEventCandidate.id,
      );
      setEvents((current) =>
        current.map((event) => (event.id === reviewed.id ? reviewed : event)),
      );
      setReviewNote("");
      setSelectedEventId(remaining[0]?.id ?? reviewed.id);
      setNotice({ kind: "success", message: reviewSuccessMessage(decision) });
      if (!remaining.length) setView("exhibition");
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
      if (stage && error instanceof Phase0ApiError && error.status === 409) {
        await refreshStage(stage.id).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  function openExperience(eventId: string) {
    setSelectedEventId(eventId);
    setView("discover");
  }

  function startReview(eventId?: string) {
    if (eventId) setSelectedEventId(eventId);
    setReviewNote("");
    setView("review");
  }

  function forgetStagePointer() {
    window.localStorage.removeItem(STAGE_STORAGE_KEY);
    setStage(null);
    setEvents([]);
    setCoverage([]);
    setSelectedEventId(null);
    setSelectedFiles([]);
    setImportResults([]);
    setView("import");
    setNotice({
      kind: "success",
      message: "已退出当前回顾。后端档案仍保留，本次操作没有删除原始资料。",
    });
  }

  return (
    <main className="mvp-shell">
      <MvpHeader />
      <MvpHero />
      <FlowNavigation current={view} hasStage={Boolean(stage)} hasEvents={visibleEvents.length > 0} onChange={setView} />

      {notice && <div className={`mvp-notice ${notice.kind}`} role="status">{notice.message}</div>}

      {loadingSavedStage ? (
        <section className="mvp-loading">正在读取本地回顾…</section>
      ) : !stage ? (
        <StageForm busy={busy} onSubmit={handleCreateStage} />
      ) : (
        <>
          <StageSummary stage={stage} experienceCount={visibleEvents.length} pendingCount={candidateEvents.length} onExit={forgetStagePointer} />
          {view === "import" && (
            <ImportView busy={busy} coverage={coverage} files={selectedFiles} results={importResults} onFileSelection={handleFileSelection} onSubmit={handleImport} />
          )}
          {view === "discover" && (
            <DiscoverView events={visibleEvents} selectedEvent={selectedEvent} pendingCount={candidateEvents.length} onSelect={setSelectedEventId} onReview={startReview} onPreview={() => setView("exhibition")} />
          )}
          {view === "review" && (
            <ReviewView event={reviewEventCandidate} remaining={candidateEvents.length} note={reviewNote} busy={busy} onNoteChange={setReviewNote} onReview={handleReview} onSkip={() => setView("discover")} onPreview={() => setView("exhibition")} />
          )}
          {view === "exhibition" && (
            <ExhibitionView stage={stage} events={visibleEvents} confirmedCount={confirmedEvents.length} pendingCount={candidateEvents.length} onOpenExperience={openExperience} onReview={() => startReview()} onImport={() => setView("import")} />
          )}
        </>
      )}

      <footer className="mvp-footer">
        <span>当前体验：本地 Markdown/TXT → 经历草稿 → 关键核对 → 私人回顾</span>
        <span>平台原生导出解析、自动策展网页和公开分享尚未实现</span>
      </footer>
    </main>
  );
}

function MvpHeader() {
  return (
    <header className="mvp-header">
      <Link className="mvp-brand" href="/" aria-label="Digital Museum 首页">
        <span>DM</span>
        <div><strong>Digital Museum</strong><small>AI 协作记录体验版</small></div>
      </Link>
      <div className="mvp-header-actions">
        <span className="mvp-local-badge"><i /> 原始记录保存在本地</span>
        <Link href="/demo">查看视觉方向 ↗</Link>
      </div>
    </header>
  );
}

function MvpHero() {
  return (
    <section className="mvp-hero">
      <div>
        <p className="mvp-kicker">YOUR AI WORK, REMEMBERED</p>
        <h1>把散落的 AI 协作记录，<br />变成一份看得懂的成长回顾。</h1>
        <p>一次导入这段时间的记录，先看看系统发现了什么；你只需要核对少量关键内容，不必从头整理自己的过去。</p>
      </div>
      <aside><span>首次体验方式</span><strong>先看草稿</strong><p>看到整理结果后，再决定哪些内容是真的、重要和值得保存。</p></aside>
    </section>
  );
}

function FlowNavigation({ current, hasStage, hasEvents, onChange }: {
  current: WorkspaceView;
  hasStage: boolean;
  hasEvents: boolean;
  onChange: (view: WorkspaceView) => void;
}) {
  return (
    <nav className="mvp-flow" aria-label="AI 记录整理流程">
      {viewItems.map((item, index) => {
        const disabled = !hasStage || (item.id !== "import" && !hasEvents);
        return (
          <button key={item.id} type="button" className={current === item.id ? "active" : ""} disabled={disabled} aria-current={current === item.id ? "step" : undefined} onClick={() => onChange(item.id)}>
            <span>{index + 1}</span><div><strong>{item.label}</strong><small>{item.helper}</small></div>
          </button>
        );
      })}
    </nav>
  );
}

function StageForm({ busy, onSubmit }: { busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="mvp-stage-form" onSubmit={onSubmit}>
      <header><span>第一步</span><div><h2>选择回顾时间</h2><p>只整理这段时间的记录，减少无关内容和隐私负担。</p></div></header>
      <label><span>给这段时间取个名字</span><input name="name" required maxLength={120} placeholder="例如：我的 AI 产品半年" /></label>
      <div className="mvp-date-grid">
        <label><span>从哪一天开始</span><input name="starts_on" required type="date" /></label>
        <label><span>到哪一天结束</span><input name="ends_on" required type="date" /></label>
      </div>
      <p className="mvp-form-help">当前研究原型支持 3–12 个月范围，不会自动扫描你的电脑。</p>
      <button className="mvp-primary" disabled={busy} type="submit">{busy ? "正在保存…" : "保存范围，开始导入"}</button>
    </form>
  );
}

function StageSummary({ stage, experienceCount, pendingCount, onExit }: {
  stage: Stage;
  experienceCount: number;
  pendingCount: number;
  onExit: () => void;
}) {
  return (
    <section className="mvp-stage-summary">
      <div><span>正在回顾</span><strong>{stage.name}</strong><small>{stage.starts_on} — {stage.ends_on}</small></div>
      <dl>
        <div><dt>已保存记录</dt><dd>{stage.evidence_count}</dd></div>
        <div><dt>发现经历</dt><dd>{experienceCount}</dd></div>
        <div><dt>需要核对</dt><dd>{pendingCount}</dd></div>
      </dl>
      <button type="button" onClick={onExit}>切换回顾范围</button>
    </section>
  );
}

function ImportView({ busy, coverage, files, results, onFileSelection, onSubmit }: {
  busy: boolean;
  coverage: CoverageItem[];
  files: File[];
  results: ImportResult[];
  onFileSelection: (files: FileList | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return (
    <section className="mvp-view mvp-import-view">
      <article className="mvp-panel mvp-import-panel">
        <header className="mvp-section-heading"><span>01 · 导入</span><div><h2>一次导入这段时间的记录</h2><p>现在支持整理过的 Markdown/TXT。ChatGPT、Codex、WorkBuddy 原生导出文件将在后续适配。</p></div></header>
        <form onSubmit={onSubmit}>
          <label className="mvp-dropzone">
            <input name="notes" type="file" multiple onChange={(event) => onFileSelection(event.target.files)} />
            <span>选择多份 Markdown / TXT 记录</span>
            <small>单次最多 {MAX_BATCH_FILES} 份，总计不超过 {MAX_BATCH_BYTES_LABEL}；不支持的文件会单独提示</small>
          </label>
          {files.length > 0 && (
            <div className="mvp-file-selection">
              <div><strong>已选择 {files.length} 份</strong><span>{formatBytes(totalBytes)}</span></div>
              <ul>{files.slice(0, 8).map((file) => <li key={`${file.name}-${file.size}`}><span>{file.name}</span><small>{formatBytes(file.size)}</small></li>)}</ul>
              {files.length > 8 && <p>还有 {files.length - 8} 份文件将在本次一起处理。</p>}
            </div>
          )}
          <button className="mvp-primary" disabled={busy || files.length === 0} type="submit">{busy ? "正在逐份保存和整理…" : "开始整理这些记录"}</button>
        </form>
        <div className="mvp-privacy-note"><strong>本地优先</strong><p>当前版本不调用模型，也不会把文件发送到云端。请仍只使用非敏感测试资料。</p></div>
      </article>
      <ImportReport coverage={coverage} results={results} />
    </section>
  );
}

function ImportReport({ coverage, results }: { coverage: CoverageItem[]; results: ImportResult[] }) {
  const histories = summarizeCoverage(coverage);
  if (!results.length && !histories.length) {
    return <aside className="mvp-panel mvp-import-report empty"><span>导入结果</span><h3>这里会逐份显示处理结果</h3><p>某一份失败，不会抹掉其他文件已经完成的结果。</p></aside>;
  }
  const rows = results.length ? results : histories.map((item) => ({
    name: item.name,
    status: item.failed ? "error" as const : "success" as const,
    message: item.failed ? `处理失败：${item.errorCode ?? "格式不支持"}` : "原文已保存并形成经历草稿",
  }));
  return (
    <aside className="mvp-panel mvp-import-report">
      <header><span>导入结果</span><small>{rows.length} 份记录</small></header>
      <div className="mvp-import-rows">
        {rows.map((item, index) => (
          <div key={`${item.name}-${index}`} className={item.status}>
            <i>{item.status === "success" ? "✓" : item.status === "error" ? "!" : "…"}</i>
            <div><strong>{item.name}</strong><small>{item.message}</small></div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function DiscoverView({ events, selectedEvent, pendingCount, onSelect, onReview, onPreview }: {
  events: CandidateEvent[];
  selectedEvent: CandidateEvent | null;
  pendingCount: number;
  onSelect: (eventId: string) => void;
  onReview: (eventId?: string) => void;
  onPreview: () => void;
}) {
  return (
    <section className="mvp-view mvp-discover-view">
      <div className="mvp-discover-main">
        <header className="mvp-section-heading"><span>02 · 发现</span><div><h2>系统整理出 {events.length} 段可能的经历</h2><p>先浏览结果。带“等待你核对”的内容仍是草稿，不会自动成为正式人生事实。</p></div></header>
        {events.length === 0 ? <div className="mvp-empty-state"><strong>还没有经历草稿</strong><p>先回到导入页添加记录。</p></div> : (
          <div className="mvp-experience-grid">
            {sortEvents(events).map((event) => (
              <button type="button" key={event.id} className={`mvp-experience-card${selectedEvent?.id === event.id ? " selected" : ""}`} onClick={() => onSelect(event.id)}>
                <span className={`mvp-status ${event.status}`}>{friendlyStatus[event.status]}</span>
                <time>{event.occurred_on ?? "时间还不明确"}</time>
                <strong>{event.title}</strong>
                <p>{event.claims[0]?.text ?? "原始描述保留在关联记录中。"}</p>
                <small>{sourceCount(event)} 份来源记录 · {event.claims.length} 条原文摘录</small>
              </button>
            ))}
          </div>
        )}
        {events.length > 0 && (
          <div className="mvp-next-actions">
            {pendingCount > 0 ? <button className="mvp-primary" type="button" onClick={() => onReview(selectedEvent?.id)}>用几分钟核对 {pendingCount} 个关键内容</button> : <button className="mvp-primary" type="button" onClick={onPreview}>查看整理后的回顾</button>}
            <button className="mvp-secondary" type="button" onClick={onPreview}>先看看展览草稿</button>
          </div>
        )}
      </div>
      <aside className="mvp-panel mvp-evidence-panel">
        {selectedEvent ? (
          <><span>为什么系统认为这是一段经历</span><h3>{selectedEvent.title}</h3><p className="mvp-evidence-summary">系统只读取标题、日期和首段正文，并保留原文位置；它没有判断事情是否完成或对你意味着什么。</p><EvidenceDetails event={selectedEvent} />{selectedEvent.status === "candidate" && <button className="mvp-secondary full" type="button" onClick={() => onReview(selectedEvent.id)}>核对这段经历</button>}</>
        ) : <div className="mvp-empty-state"><strong>选择一段经历</strong><p>这里会显示它来自哪份记录。</p></div>}
      </aside>
    </section>
  );
}

function ReviewView({ event, remaining, note, busy, onNoteChange, onReview, onSkip, onPreview }: {
  event: CandidateEvent | null;
  remaining: number;
  note: string;
  busy: boolean;
  onNoteChange: (value: string) => void;
  onReview: (decision: ReviewDecision) => void;
  onSkip: () => void;
  onPreview: () => void;
}) {
  if (!event) {
    return <section className="mvp-view mvp-review-complete"><span>关键核对已完成</span><h2>现在可以看看整理后的回顾</h2><p>暂时不确定的内容会保留原样，不会被系统补写。</p><button className="mvp-primary" type="button" onClick={onPreview}>查看回顾草稿</button></section>;
  }
  const aggregated = sourceCount(event) > 1;
  return (
    <section className="mvp-view mvp-review-view">
      <article className="mvp-panel mvp-question-card">
        <header><span>03 · 关键核对</span><small>还剩 {remaining} 个问题</small></header>
        <div className="mvp-question-progress"><i style={{ width: `${Math.max(12, 100 / Math.max(remaining, 1))}%` }} /></div>
        <p className="mvp-question-context">{aggregated ? `系统把 ${sourceCount(event)} 份同标题、同日期的记录整理在一起。` : "系统从一份记录中整理出下面这段经历。"}</p>
        <h2>{aggregated ? "这些记录属于同一段真实经历吗？" : "这件事情符合你的实际经历吗？"}</h2>
        <div className="mvp-question-experience"><time>{event.occurred_on ?? "时间还不明确"}</time><strong>{event.title}</strong><blockquote>{event.claims[0]?.text}</blockquote></div>
        <label className="mvp-review-note"><span>补充说明（选择“描述要改”时必填）</span><textarea value={note} maxLength={2000} placeholder="例如：事情发生过，但还没有正式上线。" onChange={(changeEvent) => onNoteChange(changeEvent.target.value)} /></label>
        <div className="mvp-answer-grid">
          <button className="yes" disabled={busy} type="button" onClick={() => onReview("confirmed")}>是，已经发生</button>
          <button disabled={busy} type="button" onClick={() => onReview("disputed")}>发生过，但描述要改</button>
          <button disabled={busy} type="button" onClick={() => onReview("unknown")}>我现在不确定</button>
          <button disabled={busy} type="button" onClick={() => onReview("rejected")}>只是讨论 / 不属于我</button>
        </div>
        <button className="mvp-text-button" disabled={busy} type="button" onClick={onSkip}>先跳过，稍后再说</button>
      </article>
      <aside className="mvp-panel mvp-review-evidence">
        <span>你可以检查原始记录</span><h3>系统知道什么，不知道什么</h3>
        <div className="mvp-known-unknown"><div><strong>已经知道</strong><p>原文内容、文件哈希、行号和记录中的日期。</p></div><div><strong>仍不知道</strong><p>事情是否完成、你是否认同，以及它对你的意义。</p></div></div>
        <EvidenceDetails event={event} />
      </aside>
    </section>
  );
}

function ExhibitionView({ stage, events, confirmedCount, pendingCount, onOpenExperience, onReview, onImport }: {
  stage: Stage;
  events: CandidateEvent[];
  confirmedCount: number;
  pendingCount: number;
  onOpenExperience: (eventId: string) => void;
  onReview: () => void;
  onImport: () => void;
}) {
  return (
    <section className="mvp-view mvp-exhibition-view">
      <header className="mvp-exhibition-cover">
        <div><span>PRIVATE DRAFT · 未公开</span><p>DIGITAL MUSEUM / PERSONAL AI ARCHIVE</p><h2>{stage.name}</h2><small>{stage.starts_on} — {stage.ends_on}</small></div>
        <dl><div><dt>回顾经历</dt><dd>{events.length}</dd></div><div><dt>本人确认</dt><dd>{confirmedCount}</dd></div><div><dt>等待核对</dt><dd>{pendingCount}</dd></div></dl>
      </header>
      <div className="mvp-draft-warning"><strong>这是一份实时草稿</strong><p>等待核对的内容会显示，但不会被标成正式事实；分享与公开功能尚未开启。</p></div>
      {events.length ? (
        <div className="mvp-timeline">
          {sortEvents(events).map((event, index) => (
            <article key={event.id} className={event.status === "confirmed" ? "confirmed" : "draft"}>
              <div className="mvp-timeline-marker"><span>{String(index + 1).padStart(2, "0")}</span><i /></div>
              <button type="button" onClick={() => onOpenExperience(event.id)}><time>{event.occurred_on ?? "时间待确认"}</time><span className={`mvp-status ${event.status}`}>{friendlyStatus[event.status]}</span><h3>{event.title}</h3><p>{event.claims[0]?.text}</p><small>{sourceCount(event)} 份来源记录 · 点击查看证据</small></button>
            </article>
          ))}
        </div>
      ) : <div className="mvp-empty-state"><strong>回顾还是空的</strong><p>先导入几份记录，系统才有内容可以整理。</p></div>}
      <section className="mvp-privacy-check">
        <div><span>保存之前</span><h3>档案和公开展示是两件事</h3><p>当前结果只保存在本地。以后开放分享时，系统仍需单独检查人名、邮箱、路径、密钥和原始对话。</p></div>
        <ul><li><i>✓</i> 当前没有公开或分享功能</li><li><i>✓</i> 暂时不确定的内容不会被自动补写</li><li><i>✓</i> 候选内容保持草稿标识</li></ul>
      </section>
      <div className="mvp-next-actions centered">{pendingCount > 0 && <button className="mvp-primary" type="button" onClick={onReview}>继续核对 {pendingCount} 段经历</button>}<button className="mvp-secondary" type="button" onClick={onImport}>继续导入记录</button></div>
    </section>
  );
}

function EvidenceDetails({ event }: { event: CandidateEvent }) {
  return (
    <div className="mvp-evidence-list">
      {event.claims.map((claim, index) => (
        <details key={claim.id} open={index === 0}>
          <summary><span>原文摘录 {event.claims.length > 1 ? index + 1 : ""}</span><small>{claim.anchors.length} 个来源位置</small></summary>
          <blockquote>{claim.text}</blockquote>
          {claim.anchors.map((anchor) => (
            <div className="mvp-anchor" key={`${anchor.blob_sha256}-${anchor.char_start}`}><p>{anchor.quote}</p><dl><div><dt>行号</dt><dd>{anchor.line_start}{anchor.line_end !== anchor.line_start ? `–${anchor.line_end}` : ""}</dd></div><div><dt>文件指纹</dt><dd title={anchor.blob_sha256}>{anchor.blob_sha256.slice(0, 14)}…</dd></div></dl></div>
          ))}
        </details>
      ))}
      {event.latest_review?.note && <div className="mvp-user-note"><strong>你的补充</strong><p>{event.latest_review.note}</p></div>}
    </div>
  );
}

function updateImportResult(results: ImportResult[], name: string, status: ImportResult["status"], message: string): ImportResult[] {
  const index = results.findIndex((item) => item.name === name && item.status === "pending");
  if (index === -1) return results;
  return results.map((item, itemIndex) => itemIndex === index ? { ...item, status, message } : item);
}

function summarizeCoverage(coverage: CoverageItem[]) {
  const grouped = new Map<string, { name: string; failed: boolean; errorCode: string | null }>();
  for (const item of coverage) {
    const current = grouped.get(item.occurrence_id) ?? { name: item.original_filename, failed: false, errorCode: null };
    if (item.status === "failed") { current.failed = true; current.errorCode = item.error_code; }
    grouped.set(item.occurrence_id, current);
  }
  return Array.from(grouped.values()).reverse().slice(0, 20);
}

function sortEvents(events: CandidateEvent[]): CandidateEvent[] {
  return [...events].sort((a, b) => {
    if (!a.occurred_on) return 1;
    if (!b.occurred_on) return -1;
    return a.occurred_on.localeCompare(b.occurred_on);
  });
}

function reviewSuccessMessage(decision: ReviewDecision): string {
  if (decision === "confirmed") return "已加入你的正式经历。";
  if (decision === "disputed") return "已保存你的修正说明，这段经历暂不作为正式事实。";
  if (decision === "unknown") return "已保留为暂时不确定，系统不会替你补写。";
  return "已从回顾中排除，原始记录仍然保留。";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}
