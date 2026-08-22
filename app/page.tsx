"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import {
  CoverageItem,
  Phase0ApiError,
  ReviewDecision,
  Stage,
  createStage,
  getCoverage,
  getEvents,
  getStage,
  importGitRepo,
  importNote,
  importPhoto,
  mergeEvents,
  reviewEvent,
  splitEvent,
} from "./phase0-api";
import type { CandidateEvent } from "./phase0-api";

const STAGE_STORAGE_KEY = "digital-museum-phase0-stage-id";
const MAX_BATCH_FILES = 20;
const MAX_BATCH_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_BYTES_LABEL = "20 MiB";
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_PHOTO_BYTES_LABEL = "25 MiB";

type WorkspaceView = "import" | "discover" | "review" | "summary" | "exhibition";

type StructureConfirm = "merge" | "split" | null;

type ActiveAnchor = {
  key: string;
  claimId: string;
  quote: string;
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

function originChipLabel(event: CandidateEvent): string {
  if (event.origin === "git") return "来自 Git 仓库";
  if (event.origin === "photo") return "来自照片";
  if (event.origin === "aggregated") return `聚合自 ${event.source_count} 份`;
  if (event.origin === "merged") return "合并产生";
  return "拆分产生";
}

function evidenceSummary(event: CandidateEvent): string {
  if (event.origin === "git") {
    return "这段经历来自 Git 仓库的提交记录：系统只读取提交日期与提交说明并保留原文位置，没有判断工作的影响力或完成质量。它仍然是候选，需要你核对。";
  }
  if (event.origin === "photo") {
    return "这段经历来自导入的照片：系统只读取 EXIF 拍摄时间、相机与坐标并保留元数据原文，没有识别照片里拍了什么。它仍然是候选，需要你核对。";
  }
  if (event.origin === "aggregated") {
    return `系统发现 ${event.source_count} 份标题和日期都相同的记录，把它们整理在同一段经历里。它只读取标题、日期和首段正文并保留原文位置，没有判断事情是否完成或对你意味着什么。`;
  }
  if (event.origin === "merged") {
    return "这段经历由你合并多段经历产生，保留了全部原始摘录和出处。合并结果还没有核对过，不会自动成为正式事实。";
  }
  if (event.origin === "split") {
    return "这段经历由你拆分一段经历产生，标题和日期恢复自来源记录。它需要重新核对。";
  }
  return "系统只读取标题、日期和首段正文，并保留原文位置；它没有判断事情是否完成或对你意味着什么。";
}

export default function MuseumMvpWorkspace() {
  const [stage, setStage] = useState<Stage | null>(null);
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [coverage, setCoverage] = useState<CoverageItem[]>([]);
  const [view, setView] = useState<WorkspaceView>("import");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [leavingDecision, setLeavingDecision] = useState<ReviewDecision | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<ActiveAnchor | null>(null);
  const reviewNoteRef = useRef<HTMLTextAreaElement | null>(null);
  const reviewEvidenceRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const [structureBusy, setStructureBusy] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState<StructureConfirm>(null);
  const [loadingSavedStage, setLoadingSavedStage] = useState(true);
  const [curtainActive, setCurtainActive] = useState(false);
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
    setMergeIds((current) =>
      current.filter((id) => nextVisible.some((event) => event.id === id)),
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

  useEffect(() => {
    if (view !== "review") return;
    function onKeyDown(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.metaKey || keyboardEvent.ctrlKey || keyboardEvent.altKey) return;
      const target = keyboardEvent.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) return;
      const decisionMap: Record<string, ReviewDecision> = {
        "1": "confirmed",
        "2": "disputed",
        "3": "unknown",
        "4": "rejected",
      };
      const decision = decisionMap[keyboardEvent.key];
      if (!decision) return;
      keyboardEvent.preventDefault();
      handleReview(decision);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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

  async function handleImportGit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stage) return;
    const form = new FormData(event.currentTarget);
    const repoPath = String(form.get("gitPath") ?? "").trim();
    if (!repoPath) {
      setNotice({ kind: "error", message: "请先填写本地 Git 仓库的路径。" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await importGitRepo(stage.id, repoPath);
      await refreshStage(stage.id);
      setNotice({
        kind: "success",
        message: result.events.length
          ? `已从 Git 仓库整理出 ${result.events.length} 段经历，等待你核对。`
          : "这个仓库的活动已并入既有经历草稿，没有产生重复事件。",
      });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function handlePhotoSelection(files: FileList | null) {
    setSelectedPhotos(files ? Array.from(files) : []);
    setImportResults([]);
    setNotice(null);
  }

  async function handleImportPhotos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stage) return;
    if (!selectedPhotos.length) {
      setNotice({ kind: "error", message: "请先选择 JPEG 或 PNG 照片。" });
      return;
    }
    if (selectedPhotos.length > MAX_BATCH_FILES) {
      setNotice({
        kind: "error",
        message: `一次最多选择 ${MAX_BATCH_FILES} 张照片。`,
      });
      return;
    }
    const oversized = selectedPhotos.find((file) => file.size > MAX_PHOTO_BYTES);
    if (oversized) {
      setNotice({
        kind: "error",
        message: `单张照片不能超过 ${MAX_PHOTO_BYTES_LABEL}（${oversized.name} 超限）。`,
      });
      return;
    }

    setBusy(true);
    setNotice(null);
    setImportResults(
      selectedPhotos.map((file) => ({
        name: file.name,
        status: "pending",
        message: "等待处理",
      })),
    );

    let succeeded = 0;
    let failed = 0;
    for (const file of selectedPhotos) {
      setImportResults((current) =>
        current.map((item) =>
          item.name === file.name && item.status === "pending"
            ? { ...item, message: "正在保存和读取拍摄时间" }
            : item,
        ),
      );
      try {
        await importPhoto(stage.id, file);
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
      setSelectedPhotos([]);
      if (succeeded > 0) setView("discover");
      setNotice({
        kind: failed ? "error" : "success",
        message: failed
          ? `已导入 ${succeeded} 张，${failed} 张需要处理。成功照片没有受到影响。`
          : `已导入 ${succeeded} 张照片。拍摄时间相同的照片会整理在同一段经历里。`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function toggleMergeId(eventId: string) {
    setMergeIds((current) =>
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId],
    );
  }

  function handleMergeAction(action: "request" | "confirm" | "cancel" | "clear") {
    if (action === "request") setConfirmingAction("merge");
    if (action === "cancel" || action === "clear") setConfirmingAction(null);
    if (action === "clear") setMergeIds([]);
    if (action === "confirm") void handleMerge();
  }

  function handleSplitAction(action: "request" | "confirm" | "cancel") {
    if (action === "request") setConfirmingAction("split");
    if (action === "cancel") setConfirmingAction(null);
    if (action === "confirm") void handleSplit();
  }

  async function handleMerge() {
    if (!stage || mergeIds.length < 2) return;
    setStructureBusy(true);
    setNotice(null);
    try {
      const merged = await mergeEvents(stage.id, { event_ids: mergeIds });
      await refreshStage(stage.id);
      setConfirmingAction(null);
      setMergeIds([]);
      setSelectedEventId(merged.event.id);
      setNotice({
        kind: "success",
        message: "已合并为一段新的候选经历。合并结果还没有核对过，需要重新确认。",
      });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
      if (stage && error instanceof Phase0ApiError && error.status === 409) {
        setConfirmingAction(null);
        setMergeIds([]);
        await refreshStage(stage.id).catch(() => undefined);
      }
    } finally {
      setStructureBusy(false);
    }
  }

  async function handleSplit() {
    if (!stage || !selectedEvent || selectedEvent.source_count < 2) return;
    setStructureBusy(true);
    setNotice(null);
    try {
      const split = await splitEvent(selectedEvent.id);
      await refreshStage(stage.id);
      setConfirmingAction(null);
      setSelectedEventId(split.events[0]?.id ?? null);
      setNotice({
        kind: "success",
        message: `已按来源拆回 ${split.events.length} 段候选经历，每段都需要重新核对。`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
      if (stage && error instanceof Phase0ApiError && error.status === 409) {
        setConfirmingAction(null);
        await refreshStage(stage.id).catch(() => undefined);
      }
    } finally {
      setStructureBusy(false);
    }
  }

  function handleReview(decision: ReviewDecision) {
    if (!reviewEventCandidate || busy || leavingDecision) return;
    const note = reviewNote.trim();
    if (decision === "disputed" && !note) {
      setNotice({
        kind: "error",
        message: "选择“描述要改”前，请先用一句话写下哪里不准确。",
      });
      reviewNoteRef.current?.focus();
      return;
    }

    const target = reviewEventCandidate;
    setLeavingDecision(decision);
    const exitDelay = decision === "confirmed" ? 520 : 240;
    window.setTimeout(() => {
      void submitReview(decision, note, target);
    }, exitDelay);
  }

  async function submitReview(decision: ReviewDecision, note: string, target: CandidateEvent) {
    setBusy(true);
    setNotice(null);
    try {
      const reviewed = await reviewEvent(target.id, {
        decision,
        note: note || null,
        expected_revision: target.revision,
      });
      const remaining = candidateEvents.filter(
        (event) => event.id !== target.id,
      );
      setEvents((current) =>
        current.map((event) => (event.id === reviewed.id ? reviewed : event)),
      );
      setReviewNote("");
      setActiveAnchor(null);
      setSelectedEventId(remaining[0]?.id ?? reviewed.id);
      setNotice({ kind: "success", message: reviewSuccessMessage(decision) });
      if (!remaining.length) setView("summary");
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
      if (stage && error instanceof Phase0ApiError && error.status === 409) {
        await refreshStage(stage.id).catch(() => undefined);
      }
    } finally {
      setBusy(false);
      setLeavingDecision(null);
    }
  }

  function activateEvidenceAnchor(claimId: string, anchorKey: string, quote: string) {
    setActiveAnchor({ key: anchorKey, claimId, quote });
    reviewEvidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function openExperience(eventId: string) {
    setSelectedEventId(eventId);
    setView("discover");
  }

  function startReview(eventId?: string) {
    if (eventId) setSelectedEventId(eventId);
    setReviewNote("");
    setActiveAnchor(null);
    setView("review");
  }

  function openExhibitionWithCurtain(clickEvent: MouseEvent<HTMLAnchorElement>) {
    clickEvent.preventDefault();
    if (curtainActive) return;
    setCurtainActive(true);
    window.setTimeout(() => {
      window.location.href = "/exhibition";
    }, 220);
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
            <ImportView busy={busy} coverage={coverage} files={selectedFiles} photoFiles={selectedPhotos} results={importResults} onFileSelection={handleFileSelection} onPhotoSelection={handlePhotoSelection} onSubmit={handleImport} onPhotoSubmit={handleImportPhotos} onGitSubmit={handleImportGit} />
          )}
          {view === "discover" && (
            <DiscoverView
              events={visibleEvents}
              selectedEvent={selectedEvent}
              pendingCount={candidateEvents.length}
              mergeIds={mergeIds}
              structureBusy={structureBusy}
              confirmingAction={confirmingAction}
              onSelect={setSelectedEventId}
              onToggleMerge={toggleMergeId}
              onMergeAction={handleMergeAction}
              onSplitAction={handleSplitAction}
              onReview={startReview}
              onPreview={() => setView("exhibition")}
            />
          )}
          {view === "review" && (
            <ReviewView
              key={reviewEventCandidate?.id ?? "none"}
              event={reviewEventCandidate}
              remaining={candidateEvents.length}
              note={reviewNote}
              busy={busy}
              leaving={leavingDecision}
              noteRef={reviewNoteRef}
              evidenceRef={reviewEvidenceRef}
              activeAnchor={activeAnchor}
              onNoteChange={setReviewNote}
              onReview={handleReview}
              onSkip={() => {
                setNotice(null);
                setView("discover");
              }}
              onPreview={() => setView("exhibition")}
              onAnchorActivate={activateEvidenceAnchor}
            />
          )}
          {view === "summary" && (
            <ReviewSummaryView
              stage={stage}
              confirmedCount={confirmedEvents.length}
              disputedCount={visibleEvents.filter((item) => item.status === "disputed").length}
              unknownCount={visibleEvents.filter((item) => item.status === "unknown").length}
              excludedCount={events.filter((item) => item.status === "rejected").length}
              experienceCount={visibleEvents.length}
              onOpenExhibition={() => setView("exhibition")}
              onBackToDiscover={() => setView("discover")}
              onOpenExhibitionHall={openExhibitionWithCurtain}
            />
          )}
          {view === "exhibition" && (
            <ExhibitionView stage={stage} events={visibleEvents} confirmedCount={confirmedEvents.length} pendingCount={candidateEvents.length} onOpenExperience={openExperience} onReview={() => startReview()} onImport={() => setView("import")} onOpenExhibitionHall={openExhibitionWithCurtain} />
          )}
        </>
      )}

      <div className={`mvp-curtain${curtainActive ? " active" : ""}`} aria-hidden="true">
        <span>DIGITAL MUSEUM · 开馆</span>
      </div>

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

function ImportView({ busy, coverage, files, photoFiles, results, onFileSelection, onPhotoSelection, onSubmit, onPhotoSubmit, onGitSubmit }: {
  busy: boolean;
  coverage: CoverageItem[];
  files: File[];
  photoFiles: File[];
  results: ImportResult[];
  onFileSelection: (files: FileList | null) => void;
  onPhotoSelection: (files: FileList | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPhotoSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGitSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const totalPhotoBytes = photoFiles.reduce((sum, file) => sum + file.size, 0);
  return (
    <section className="mvp-view mvp-import-view">
      <article className="mvp-panel mvp-import-panel">
        <header className="mvp-section-heading"><span>01 · 导入</span><div><h2>一次导入这段时间的记录</h2><p>现在支持整理过的 Markdown/TXT、JPEG/PNG 照片与本地 Git 仓库。ChatGPT、Codex、WorkBuddy 原生导出文件将在后续适配。</p></div></header>
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
        <form className="mvp-photo-import" onSubmit={onPhotoSubmit}>
          <span className="mvp-git-divider">或</span>
          <label className="mvp-dropzone">
            <input name="photos" type="file" multiple accept=".jpg,.jpeg,.png" onChange={(event) => onPhotoSelection(event.target.files)} />
            <span>选择 JPEG / PNG 照片</span>
            <small>单次最多 {MAX_BATCH_FILES} 张、每张不超过 {MAX_PHOTO_BYTES_LABEL}；按照片自带的拍摄时间（EXIF）归入时间线</small>
          </label>
          {photoFiles.length > 0 && (
            <div className="mvp-file-selection">
              <div><strong>已选择 {photoFiles.length} 张</strong><span>{formatBytes(totalPhotoBytes)}</span></div>
              <ul>{photoFiles.slice(0, 8).map((file) => <li key={`${file.name}-${file.size}`}><span>{file.name}</span><small>{formatBytes(file.size)}</small></li>)}</ul>
              {photoFiles.length > 8 && <p>还有 {photoFiles.length - 8} 张照片将在本次一起处理。</p>}
            </div>
          )}
          <button className="mvp-secondary" disabled={busy || photoFiles.length === 0} type="submit">{busy ? "正在逐张保存和整理…" : "开始整理这些照片"}</button>
        </form>
        <form className="mvp-git-import" onSubmit={onGitSubmit}>
          <span className="mvp-git-divider">或</span>
          <label>
            <span>导入一个本地 Git 仓库（只读提交记录）</span>
            <input name="gitPath" placeholder="/Users/you/Projects/your-repo" autoComplete="off" />
          </label>
          <button className="mvp-secondary" disabled={busy} type="submit">{busy ? "正在读取仓库…" : "读取仓库提交记录"}</button>
          <small>系统只读取建馆阶段内的提交日期与提交说明，不会修改仓库内容。</small>
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
          <div key={`${item.name}-${index}`} className={item.status} style={{ "--i": index } as CSSProperties}>
            <i aria-hidden="true">
              {item.status === "success" ? <StatusCheckGlyph /> : item.status === "error" ? <StatusAlertGlyph /> : <StatusPendingGlyph />}
            </i>
            <div><strong>{item.name}</strong><small>{item.message}</small></div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function DiscoverView({ events, selectedEvent, pendingCount, mergeIds, structureBusy, confirmingAction, onSelect, onToggleMerge, onMergeAction, onSplitAction, onReview, onPreview }: {
  events: CandidateEvent[];
  selectedEvent: CandidateEvent | null;
  pendingCount: number;
  mergeIds: string[];
  structureBusy: boolean;
  confirmingAction: StructureConfirm;
  onSelect: (eventId: string) => void;
  onToggleMerge: (eventId: string) => void;
  onMergeAction: (action: "request" | "confirm" | "cancel" | "clear") => void;
  onSplitAction: (action: "request" | "confirm" | "cancel") => void;
  onReview: (eventId?: string) => void;
  onPreview: () => void;
}) {
  return (
    <section className="mvp-view mvp-discover-view">
      <div className="mvp-discover-main">
        <header className="mvp-section-heading"><span>02 · 发现</span><div><h2>系统整理出 {events.length} 段可能的经历</h2><p>先浏览结果。带“等待你核对”的内容仍是草稿，不会自动成为正式人生事实。</p></div></header>
        <div className="mvp-legend" aria-label="卡片状态图例">
          <span><i className="ai" aria-hidden="true" />虚线半透明 · AI 整理的草稿</span>
          <span><i className="user" aria-hidden="true" />暖金实心 + 印章 · 你确认的经历</span>
          <span><i className="unsure" aria-hidden="true" />虚线留白 · 暂不确定</span>
        </div>
        {mergeIds.length >= 2 && (
          <div className="mvp-merge-bar" role="region">
            <strong>已选择 {mergeIds.length} 段经历</strong>
            {confirmingAction === "merge" ? (
              <>
                <small>合并后会重置为候选经历；之前做过的确认不会自动带过去，需要重新核对。</small>
                <button className="mvp-primary" type="button" disabled={structureBusy} onClick={() => onMergeAction("confirm")}>{structureBusy ? "正在合并…" : "确认合并"}</button>
                <button className="mvp-text-button" type="button" disabled={structureBusy} onClick={() => onMergeAction("cancel")}>取消</button>
              </>
            ) : (
              <>
                <small>如果它们其实是同一件事，可以合并成一段经历。</small>
                <button className="mvp-secondary" type="button" onClick={() => onMergeAction("request")}>合并为一段经历</button>
                <button className="mvp-text-button" type="button" onClick={() => onMergeAction("clear")}>清除选择</button>
              </>
            )}
          </div>
        )}
        {events.length === 0 ? <div className="mvp-empty-state"><strong>还没有经历草稿</strong><p>先回到导入页添加记录。</p></div> : (
          <div className="mvp-experience-grid">
            {sortEvents(events).map((event, index) => (
              <div key={event.id} className={`mvp-experience-cell${mergeIds.includes(event.id) ? " picked" : ""}`} style={{ "--i": index } as CSSProperties}>
                <label className="mvp-pick">
                  <input
                    type="checkbox"
                    checked={mergeIds.includes(event.id)}
                    onChange={() => onToggleMerge(event.id)}
                  />
                  <span>同一件事</span>
                </label>
                <button type="button" className={`mvp-experience-card st-${event.status}${selectedEvent?.id === event.id ? " selected" : ""}`} onClick={() => onSelect(event.id)}>
                  {event.status === "confirmed" && <span className="mvp-seal" aria-hidden="true">已入馆</span>}
                  <span className="mvp-card-tags">
                    <span className="mvp-card-no">NO.{String(index + 1).padStart(2, "0")}</span>
                    <span className={`mvp-status ${event.status}`}>{friendlyStatus[event.status]}</span>
                    {event.origin !== "note" && <span className="mvp-origin-chip">{originChipLabel(event)}</span>}
                  </span>
                  <time>{event.occurred_on ?? "时间还不明确"}</time>
                  <strong>{event.title}</strong>
                  <p>{event.claims[0]?.text ?? "原始描述保留在关联记录中。"}</p>
                  <small>{event.source_count} 份来源记录 · {event.claims.length} 条原文摘录</small>
                </button>
              </div>
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
          <>
            <span>为什么系统认为这是一段经历</span>
            <h3>{selectedEvent.title}</h3>
            <p className="mvp-evidence-summary">{evidenceSummary(selectedEvent)}</p>
            <EvidenceDetails event={selectedEvent} />
            {selectedEvent.source_count >= 2 && (
              <div className="mvp-split-bar">
                <small>这段经历汇集了多份来源记录，可以拆回各自独立的候选经历；拆分后每段都需要重新核对。</small>
                {confirmingAction === "split" ? (
                  <div>
                    <button type="button" disabled={structureBusy} onClick={() => onSplitAction("confirm")}>{structureBusy ? "正在拆分…" : "确认拆分"}</button>
                    <button className="cancel" type="button" disabled={structureBusy} onClick={() => onSplitAction("cancel")}>取消</button>
                  </div>
                ) : (
                  <div>
                    <button type="button" onClick={() => onSplitAction("request")}>拆回独立经历</button>
                  </div>
                )}
              </div>
            )}
            {selectedEvent.status === "candidate" && <button className="mvp-secondary full" type="button" onClick={() => onReview(selectedEvent.id)}>核对这段经历</button>}
          </>
        ) : <div className="mvp-empty-state"><strong>选择一段经历</strong><p>这里会显示它来自哪份记录。</p></div>}
      </aside>
    </section>
  );
}

function ReviewView({ event, remaining, note, busy, leaving, noteRef, evidenceRef, activeAnchor, onNoteChange, onReview, onSkip, onPreview, onAnchorActivate }: {
  event: CandidateEvent | null;
  remaining: number;
  note: string;
  busy: boolean;
  leaving: ReviewDecision | null;
  noteRef: React.RefObject<HTMLTextAreaElement | null>;
  evidenceRef: React.RefObject<HTMLElement | null>;
  activeAnchor: ActiveAnchor | null;
  onNoteChange: (value: string) => void;
  onReview: (decision: ReviewDecision) => void;
  onSkip: () => void;
  onPreview: () => void;
  onAnchorActivate: (claimId: string, anchorKey: string, quote: string) => void;
}) {
  if (!event) {
    return <section className="mvp-view mvp-review-complete"><span>关键核对已完成</span><h2>现在可以看看整理后的回顾</h2><p>暂时不确定的内容会保留原样，不会被系统补写。</p><button className="mvp-primary" type="button" onClick={onPreview}>查看回顾草稿</button></section>;
  }
  const frozen = busy || leaving !== null;
  const aggregated = event.source_count > 1;
  const contextLine = event.source_count > 1
    ? event.origin === "aggregated"
      ? `系统发现 ${event.source_count} 份标题和日期都相同的记录，把它们整理在同一段经历里。`
      : `这段经历汇集了 ${event.source_count} 份来源记录的内容。`
    : "系统从一份记录中整理出下面这段经历。";
  return (
    <section className="mvp-view mvp-review-view">
      <article key={event.id} className={`mvp-panel mvp-question-card${leaving ? " leaving" : ""}${leaving === "confirmed" ? " stamped" : ""}`}>
        {leaving === "confirmed" && <span className="mvp-stamp" aria-hidden="true">已入馆</span>}
        <header><span>03 · 关键核对</span><small>还剩 {remaining} 个问题</small></header>
        <div className="mvp-question-progress"><i style={{ width: `${Math.max(12, 100 / Math.max(remaining, 1))}%` }} /></div>
        <p className="mvp-question-context">{contextLine}</p>
        <h2>{aggregated ? "这些记录属于同一段真实经历吗？" : "这件事情符合你的实际经历吗？"}</h2>
        <div className="mvp-question-experience"><time>{event.occurred_on ?? "时间还不明确"}</time><strong>{event.title}</strong><blockquote>{event.claims[0]?.text}</blockquote></div>
        <label className="mvp-review-note"><span>补充说明（选择“描述要改”时必填）</span><textarea ref={noteRef} value={note} maxLength={2000} placeholder="例如：事情发生过，但还没有正式上线。" onChange={(changeEvent) => onNoteChange(changeEvent.target.value)} /></label>
        <div className="mvp-answer-grid">
          <button className="yes" disabled={frozen} type="button" onClick={() => onReview("confirmed")}>
            <kbd aria-hidden="true">1</kbd>
            <span><strong>是，已经发生</strong><small>确认后盖上“已入馆”印章</small></span>
          </button>
          <button className="revise" disabled={frozen} type="button" onClick={() => onReview("disputed")}>
            <kbd aria-hidden="true">2</kbd>
            <span><strong>发生过，但描述要改</strong><small>需要先写一句补充说明</small></span>
          </button>
          <button className="unsure" disabled={frozen} type="button" onClick={() => onReview("unknown")}>
            <kbd aria-hidden="true">3</kbd>
            <span><strong>我现在不确定</strong><small>保留原样，系统不会补写</small></span>
          </button>
          <button className="drop" disabled={frozen} type="button" onClick={() => onReview("rejected")}>
            <kbd aria-hidden="true">4</kbd>
            <span><strong>只是讨论 / 不属于我</strong><small>不进入回顾，原文仍保留</small></span>
          </button>
        </div>
        <p className="mvp-kbd-hint">键盘 1–4 可快速作答；描述要改需先填写说明。</p>
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

function ReviewSummaryView({ stage, confirmedCount, disputedCount, unknownCount, excludedCount, experienceCount, onOpenExhibition, onBackToDiscover, onOpenExhibitionHall }: {
  stage: Stage;
  confirmedCount: number;
  disputedCount: number;
  unknownCount: number;
  excludedCount: number;
  experienceCount: number;
  onOpenExhibition: () => void;
  onBackToDiscover: () => void;
  onOpenExhibitionHall: (clickEvent: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <section className="mvp-view mvp-review-summary">
      <span className="mvp-summary-kicker">03 · 核对完成</span>
      <h2>
        {confirmedCount > 0
          ? <>这段时间被确认为 <strong>{confirmedCount}</strong> 段真实经历</>
          : <>这段时间的经历暂时都还是草稿</>}
      </h2>
      <p className="mvp-summary-sub">「{stage.name}」 · {stage.starts_on} — {stage.ends_on} · 共整理 {experienceCount} 段经历</p>
      <dl className="mvp-summary-stats">
        <div className="ok"><dt>本人确认</dt><dd>{confirmedCount}</dd></div>
        <div><dt>描述要改</dt><dd>{disputedCount}</dd></div>
        <div><dt>暂不确定</dt><dd>{unknownCount}</dd></div>
        <div><dt>不进入回顾</dt><dd>{excludedCount}</dd></div>
      </dl>
      <p className="mvp-summary-note">不确定的内容不会被补写；它们会带着草稿标识进入展览，等你以后再核对。</p>
      <div className="mvp-next-actions centered">
        <Link className="mvp-primary" href="/exhibition" onClick={onOpenExhibitionHall}>进入展览馆，选一种风格开馆 →</Link>
        <button className="mvp-secondary" type="button" onClick={onBackToDiscover}>回到发现经历</button>
      </div>
      <button className="mvp-text-button" type="button" onClick={onOpenExhibition}>先看首页里的展览草稿</button>
    </section>
  );
}

function ExhibitionView({ stage, events, confirmedCount, pendingCount, onOpenExperience, onReview, onImport, onOpenExhibitionHall }: {
  stage: Stage;
  events: CandidateEvent[];
  confirmedCount: number;
  pendingCount: number;
  onOpenExperience: (eventId: string) => void;
  onReview: () => void;
  onImport: () => void;
  onOpenExhibitionHall: (clickEvent: MouseEvent<HTMLAnchorElement>) => void;
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
            <article key={event.id} className={event.status === "confirmed" ? "confirmed" : "draft"} style={{ "--i": index } as CSSProperties}>
              <div className="mvp-timeline-marker"><span>{String(index + 1).padStart(2, "0")}</span><i /></div>
              <button type="button" onClick={() => onOpenExperience(event.id)}>
                {event.status === "confirmed" && <span className="mvp-seal" aria-hidden="true">已入馆</span>}
                <time>{event.occurred_on ?? "时间待确认"}</time><span className={`mvp-status ${event.status}`}>{friendlyStatus[event.status]}</span><h3>{event.title}</h3><p>{event.claims[0]?.text}</p><small>{event.source_count} 份来源记录 · 点击查看证据</small>
              </button>
            </article>
          ))}
        </div>
      ) : <div className="mvp-empty-state"><strong>回顾还是空的</strong><p>先导入几份记录，系统才有内容可以整理。</p></div>}
      <section className="mvp-privacy-check">
        <div><span>保存之前</span><h3>档案和公开展示是两件事</h3><p>当前结果只保存在本地。以后开放分享时，系统仍需单独检查人名、邮箱、路径、密钥和原始对话。</p></div>
        <ul><li><i>✓</i> 当前没有公开或分享功能</li><li><i>✓</i> 暂时不确定的内容不会被自动补写</li><li><i>✓</i> 候选内容保持草稿标识</li></ul>
      </section>
      <div className="mvp-next-actions centered"><Link className="mvp-primary" href="/exhibition" onClick={onOpenExhibitionHall}>进入展览馆 · 选一种风格开馆 →</Link>{pendingCount > 0 && <button className="mvp-secondary" type="button" onClick={onReview}>继续核对 {pendingCount} 段经历</button>}<button className="mvp-secondary" type="button" onClick={onImport}>继续导入记录</button></div>
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

function StatusCheckGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 8.6l3 3L12.8 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusAlertGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 4v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function StatusPendingGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.4" strokeLinecap="round" />
    </svg>
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
