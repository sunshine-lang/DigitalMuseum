"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import {
  AgentSessionProject,
  CoverageItem,
  GitRepoPreview,
  Phase0ApiError,
  ReviewDecision,
  Stage,
  claudeProjectLabel,
  codexProjectLabel,
  createStage,
  getCoverage,
  getEvents,
  getStage,
  importClaudeSessions,
  importCodexSessions,
  importGitRepo,
  importNote,
  listClaudeSessionProjects,
  listCodexSessionProjects,
  listStages,
  mergeEvents,
  previewGitRepo,
  reviewEvent,
  splitEvent,
} from "./phase0-api";
import type { CandidateEvent } from "./phase0-api";
import {
  isVisibleExperience as isVisibleExperienceBase,
  sortEvents,
  statusLabels,
} from "./events-shared";

const STAGE_STORAGE_KEY = "digital-museum-phase0-stage-id";
const RECENT_GIT_PATHS_KEY = "digital-museum-recent-git-paths";
const RECENT_GIT_PATHS_LIMIT = 3;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH_FILES = 20;
const MAX_BATCH_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_BYTES_LABEL = "20 MiB";

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

// 状态文案基于共享表（含 merged/split/rejected 全 8 态）；工作台语境里
// candidate/confirmed/unknown 用“你”视角措辞，作为差异键本地覆写。
const friendlyStatus: Record<CandidateEvent["status"], string> = {
  ...statusLabels,
  candidate: "等待你核对",
  confirmed: "你已确认",
  unknown: "暂时不确定",
};

function isStructuralEvent(event: CandidateEvent): boolean {
  return event.status === "merged" || event.status === "split";
}

function isVisibleExperience(event: CandidateEvent): boolean {
  return !isStructuralEvent(event) && isVisibleExperienceBase(event);
}

function originChipLabel(event: CandidateEvent): string {
  if (event.origin === "git") return "来自 Git 仓库";
  if (event.origin === "photo") return "来自照片";
  if (event.origin === "claude") return "来自 Claude Code 会话";
  if (event.origin === "codex") return "来自 Codex 会话";
  if (event.origin === "aggregated") return `聚合自 ${event.source_count} 份`;
  if (event.origin === "merged") return "合并产生";
  return "拆分产生";
}

function evidenceSummary(event: CandidateEvent): string {
  if (event.status === "verified") {
    if (event.origin === "photo") {
      return "这段经历由系统从照片元数据（EXIF 拍摄时间、相机与坐标）自动核实：这些是机器确定性读出的事实，没有请模型推断，也无需你确认。如果与事实不符，点下方「对这段记录提出异议」随时纠正。";
    }
    if (event.origin === "git") {
      return "这段经历由系统从确定性记录（Git 提交日期与提交说明）自动核实：没有请模型推断，也无需你确认。如果与事实不符，点下方「对这段记录提出异议」随时纠正。";
    }
    if (event.origin === "claude") {
      return "这段经历由系统从 Claude Code 会话的机器读数（会话时间戳与消息计数）自动核实：系统只读取时间戳、计数与你的消息原文，没有解读对话内容，也无需你确认。如果与事实不符，点下方「对这段记录提出异议」随时纠正。";
    }
    if (event.origin === "codex") {
      return "这段经历由系统从 Codex 会话的机器读数（会话时间戳与消息计数）自动核实：系统只读取时间戳、计数与你的消息原文，没有解读对话内容，也无需你确认。如果与事实不符，点下方「对这段记录提出异议」随时纠正。";
    }
    return `系统发现 ${event.source_count} 份标题和日期都相同的确定性记录，把它们整理在同一段经历里并自动核实：没有请模型推断，也无需你确认；如果与事实不符，点下方「对这段记录提出异议」随时纠正。`;
  }
  if (event.origin === "git") {
    return "这段经历来自 Git 仓库的提交记录：系统只读取提交日期与提交说明并保留原文位置，没有判断工作的影响力或完成质量。如果与事实不符，点下方「对这段记录提出异议」随时纠正。";
  }
  if (event.origin === "photo") {
    return "这段经历来自导入的照片：系统只读取 EXIF 拍摄时间、相机与坐标并保留元数据原文，没有识别照片里拍了什么。如果与事实不符，点下方「对这段记录提出异议」随时纠正。";
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
  const [reviewOverrideId, setReviewOverrideId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [leavingDecision, setLeavingDecision] = useState<ReviewDecision | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<ActiveAnchor | null>(null);
  const reviewNoteRef = useRef<HTMLTextAreaElement | null>(null);
  const reviewEvidenceRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const [structureBusy, setStructureBusy] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState<StructureConfirm>(null);
  const [loadingSavedStage, setLoadingSavedStage] = useState(true);
  const [recentStages, setRecentStages] = useState<Stage[]>([]);
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  // Git 导入输入框受控值：建馆成功后由主路径预填，chips 点击时回填。
  const [gitPath, setGitPath] = useState("");
  const [recentGitPaths, setRecentGitPaths] = useState<string[]>([]);
  // Claude Code 会话导入输入框受控值：用户直接填项目路径或 ~/.claude/projects 下的会话目录。
  const [claudePath, setClaudePath] = useState("");
  // Codex 会话导入输入框受控值：用户填项目路径，后端按 session_meta.cwd 归属过滤。
  const [codexPath, setCodexPath] = useState("");

  const visibleEvents = useMemo(
    () => events.filter(isVisibleExperience),
    [events],
  );
  const candidateEvents = useMemo(
    () => visibleEvents.filter((event) => event.status === "candidate"),
    [visibleEvents],
  );
  // 笔记快速通道：亲笔笔记内容默认可信，只提示检查标题/日期提取。
  // 混入机器产物（artifact claims）的事件不进快速通道，避免把系统读数
  // 一键盖成"本人确认"（对抗性审查 #6）。
  const noteCandidates = useMemo(
    () =>
      candidateEvents.filter(
        (event) =>
          (event.origin === "note" || event.origin === "aggregated") &&
          event.claims.every((claim) => claim.evidence_role === "user_statement"),
      ),
    [candidateEvents],
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
  const reviewEventCandidate = useMemo(() => {
    // 异议通道：verified 事件通过「对这段记录提出异议」进入核对视图，
    // 不再静默替换成别的候选（对抗性审查 #1）。
    const override = visibleEvents.find((event) => event.id === reviewOverrideId);
    if (override) return override;
    return (
      candidateEvents.find((event) => event.id === selectedEventId) ??
      candidateEvents[0] ??
      null
    );
  }, [candidateEvents, visibleEvents, reviewOverrideId, selectedEventId]);

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
        if (error instanceof Phase0ApiError && error.status === 404) {
          window.localStorage.removeItem(STAGE_STORAGE_KEY);
          setNotice({
            kind: "error",
            message: "之前保存的回顾阶段已不存在，本地指针已清除。可以从下方继续已有回顾，或到「我的回顾」页管理全部阶段。",
          });
        } else {
          setNotice({ kind: "error", message: errorMessage(error) });
        }
      }
    }

    restoreSavedStage().finally(() => setLoadingSavedStage(false));
  }, [refreshStage]);

  useEffect(() => {
    if (loadingSavedStage || stage) return;
    let cancelled = false;
    listStages()
      .then((allStages) => {
        if (!cancelled) setRecentStages(allStages.slice(0, 3));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loadingSavedStage, stage]);

  useEffect(() => {
    // 十秒开馆：最近 3 个预览/导入成功的仓库路径，纯本地便利功能，
    // 读取失败或记录损坏时静默忽略。
    try {
      const raw = window.localStorage.getItem(RECENT_GIT_PATHS_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setRecentGitPaths(
          parsed
            .filter((item): item is string => typeof item === "string" && item.trim() !== "")
            .slice(0, RECENT_GIT_PATHS_LIMIT),
        );
      }
    } catch {
      // 本地记录不可读时按空处理。
    }
  }, []);

  function recordRecentGitPath(path: string) {
    const cleaned = path.trim();
    if (!cleaned) return;
    setRecentGitPaths((current) => {
      const next = [cleaned, ...current.filter((item) => item !== cleaned)].slice(
        0,
        RECENT_GIT_PATHS_LIMIT,
      );
      try {
        window.localStorage.setItem(RECENT_GIT_PATHS_KEY, JSON.stringify(next));
      } catch {
        // localStorage 不可写只影响 chips，不影响导入本身。
      }
      return next;
    });
  }

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

  async function handleCreateStage(payload: {
    name: string;
    starts_on: string;
    ends_on: string;
    import_git_path: string | null;
  }) {
    setBusy(true);
    setNotice(null);
    try {
      const nextStage = await createStage({
        name: payload.name,
        starts_on: payload.starts_on,
        ends_on: payload.ends_on,
      });
      window.localStorage.setItem(STAGE_STORAGE_KEY, nextStage.id);
      setStage(nextStage);
      setEvents([]);
      setCoverage([]);
      setView("import");
      if (payload.import_git_path) {
        // 十秒开馆：把主路径预览过的仓库直接预填进 Git 导入框，
        // 用户点一下「读取仓库提交记录」即完成首次导入。
        setGitPath(payload.import_git_path);
        recordRecentGitPath(payload.import_git_path);
        setNotice({
          kind: "success",
          message:
            "回顾范围已保存。下方 Git 导入框已填好这个仓库的路径，点一下「读取仓库提交记录」即可完成首次导入。",
        });
      } else {
        setNotice({
          kind: "success",
          message: "回顾范围已保存。现在可以一次导入多份 AI 协作记录。",
        });
      }
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  // 换选笔记（#10）：覆盖旧选择并清空逐文件结果与全局提示。
  function fileSelectionHandler(setter: (files: File[]) => void) {
    return (files: FileList | null) => {
      setter(files ? Array.from(files) : []);
      setImportResults([]);
      setNotice(null);
    };
  }

  // 笔记批量导入（#7）：与照片共用 runBatchImport，只注入校验规则与文案差异。
  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stage) return;
    await runBatchImport(stage, selectedFiles, {
      validationError: noteValidationError(selectedFiles),
      pendingMessage: "正在保存和整理",
      importFile: importNote,
      clearSelection: () => setSelectedFiles([]),
      summary: (succeeded, failed) =>
        failed ? `已导入 ${succeeded} 份，${failed} 份需要处理。成功文件没有受到影响。` : `已导入 ${succeeded} 份记录。先看看系统整理出了哪些经历。`,
    });
  }

  async function handleImportGit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stage) return;
    const repoPath = gitPath.trim();
    if (!repoPath) {
      setNotice({ kind: "error", message: "请先填写本地 Git 仓库的路径。" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await importGitRepo(stage.id, repoPath);
      recordRecentGitPath(repoPath);
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

  // Claude/Codex 会话导入共用骨架（#8）：路径必填 → 单次导入 → refreshStage →
  // 项目级提示；发现面板与手动表单共用这一条导入链路。
  async function importAgentSessions(
    kind: "claude" | "codex",
    projectPath: string,
    emptyHint: string,
  ) {
    if (!stage) return;
    const trimmedPath = projectPath.trim();
    if (!trimmedPath) {
      setNotice({ kind: "error", message: emptyHint });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result =
        kind === "claude"
          ? await importClaudeSessions(stage.id, trimmedPath)
          : await importCodexSessions(stage.id, trimmedPath);
      await refreshStage(stage.id);
      const label =
        kind === "claude"
          ? claudeProjectLabel(result.occurrence.original_filename)
          : codexProjectLabel(result.occurrence.original_filename);
      setNotice({
        kind: "success",
        message: result.events.length
          ? `已从项目 ${label} 整理出 ${result.events.length} 段经历。`
          : "这个项目的会话已并入既有经历，没有产生重复事件。",
      });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleImportClaude(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await importAgentSessions(
      "claude",
      claudePath,
      "请先填写项目路径或 Claude Code 会话目录。",
    );
  }

  async function handleImportCodex(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await importAgentSessions(
      "codex",
      codexPath,
      "请填写要导入 Codex 会话的项目路径。",
    );
  }

  // 批量导入共用骨架（#7）：仍是前端顺序调用单文件 API，不是服务端 Import
  // Batch。流程为校验提示 → 置 pending → 逐文件导入 → refreshStage → 清空
  // 选择并汇总通知；逐条失败不中断批次，成功文件的结果保持可见。
  async function runBatchImport(
    stage: Stage,
    files: File[],
    config: {
      validationError: string | null;
      pendingMessage: string;
      importFile: (stageId: string, file: File) => Promise<unknown>;
      clearSelection: () => void;
      summary: (succeeded: number, failed: number) => string;
    },
  ) {
    if (config.validationError) {
      setNotice({ kind: "error", message: config.validationError });
      return;
    }
    setBusy(true);
    setNotice(null);
    setImportResults(
      files.map((file): ImportResult => ({ name: file.name, status: "pending", message: "等待处理" })),
    );

    let succeeded = 0;
    let failed = 0;
    for (const file of files) {
      setImportResults((current) =>
        current.map((item) =>
          item.name === file.name && item.status === "pending" ? { ...item, message: config.pendingMessage } : item,
        ),
      );
      try {
        await config.importFile(stage.id, file);
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
      setSelectedEventId(nextEvents.find(isVisibleExperience)?.id ?? null);
      config.clearSelection();
      if (succeeded > 0) setView("discover");
      setNotice({ kind: failed ? "error" : "success", message: config.summary(succeeded, failed) });
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
        message: "提出修正前，请先用一句话写下哪里提错了或不准确。",
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

  async function handleBatchConfirm() {
    if (!stage || !noteCandidates.length || batchBusy) return;
    setBatchBusy(true);
    setNotice(null);
    const targets = [...noteCandidates];
    let confirmedCount = 0;
    try {
      for (const target of targets) {
        await reviewEvent(target.id, {
          decision: "confirmed",
          note: null,
          expected_revision: 0,
        });
        confirmedCount += 1;
      }
      await refreshStage(stage.id);
      setNotice({
        kind: "success",
        message: `已一次确认 ${confirmedCount} 段笔记经历。`,
      });
    } catch (error) {
      const failedTitle = targets[confirmedCount]?.title ?? "";
      setNotice({
        kind: "error",
        message: `批量确认在「${failedTitle}」处停止：${errorMessage(error)} 已确认的 ${confirmedCount} 段不受影响。`,
      });
      await refreshStage(stage.id).catch(() => undefined);
    } finally {
      setBatchBusy(false);
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
    setReviewOverrideId(null);
    setReviewNote("");
    setActiveAnchor(null);
    setView("review");
  }

  function startDispute(eventId: string) {
    setSelectedEventId(eventId);
    setReviewOverrideId(eventId);
    setReviewNote("");
    setActiveAnchor(null);
    setView("review");
  }

  function openStageLibrary() {
    window.location.assign("/stages");
  }

  function enterRecentStage(stageId: string) {
    window.localStorage.setItem(STAGE_STORAGE_KEY, stageId);
    window.location.assign("/");
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
        <>
          {recentStages.length > 0 && (
            <ResumeStages stages={recentStages} onEnter={enterRecentStage} />
          )}
          <StageGate
            busy={busy}
            onSubmit={handleCreateStage}
            onNotice={setNotice}
            onRecentGitPath={recordRecentGitPath}
          />
        </>
      ) : (
        <>
          <StageSummary stage={stage} experienceCount={visibleEvents.length} pendingCount={candidateEvents.length} onSwitch={openStageLibrary} />
          {view === "import" && (
            <ImportView busy={busy} coverage={coverage} files={selectedFiles} results={importResults} gitPath={gitPath} recentGitPaths={recentGitPaths} claudePath={claudePath} codexPath={codexPath} onGitPathChange={setGitPath} onPickRecentGitPath={setGitPath} onClaudePathChange={setClaudePath} onCodexPathChange={setCodexPath} onFileSelection={fileSelectionHandler(setSelectedFiles)} onSubmit={handleImport} onGitSubmit={handleImportGit} onClaudeSubmit={handleImportClaude} onCodexSubmit={handleImportCodex} onImportSessions={(kind, path) => void importAgentSessions(kind, path, "请先选择要导入的项目。")} />
          )}
          {view === "discover" && (
            <DiscoverView
              events={visibleEvents}
              selectedEvent={selectedEvent}
              pendingCount={candidateEvents.length}
              noteCandidateCount={noteCandidates.length}
              batchBusy={batchBusy}
              mergeIds={mergeIds}
              structureBusy={structureBusy}
              confirmingAction={confirmingAction}
              onSelect={setSelectedEventId}
              onToggleMerge={toggleMergeId}
              onMergeAction={handleMergeAction}
              onSplitAction={handleSplitAction}
              onReview={startReview}
              onDispute={startDispute}
              onBatchConfirm={handleBatchConfirm}
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
            />
          )}
          {view === "exhibition" && (
            <ExhibitionView stage={stage} events={visibleEvents} confirmedCount={confirmedEvents.length} pendingCount={candidateEvents.length} onOpenExperience={openExperience} onReview={() => startReview()} onImport={() => setView("import")} />
          )}
        </>
      )}

      <footer className="mvp-footer">
        <span>当前体验：Claude Code / Codex 会话同步 → 经历草稿 → 关键核对 → 私人回顾</span>
        <span>静态展览导出已就绪（导出前有敏感信息检查）；ChatGPT / WorkBuddy 导入尚未实现</span>
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

function ResumeStages({ stages, onEnter }: {
  stages: Stage[];
  onEnter: (stageId: string) => void;
}) {
  return (
    <section className="mvp-stage-resume">
      <header>
        <span>继续已有的回顾</span>
        <Link href="/stages">查看全部 →</Link>
      </header>
      <ul>
        {stages.map((stage) => (
          <li key={stage.id}>
            <div>
              <strong>{stage.name}</strong>
              <small>{stage.starts_on} — {stage.ends_on} · {stage.evidence_count} 份记录 · {stage.event_count} 段经历</small>
            </div>
            <button type="button" onClick={() => onEnter(stage.id)}>进入</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 临时收敛导入入口（2026-08-25）：默认只保留 Agent 会话同步；URL 带 ?all-sources
// 时恢复笔记上传与 Git 仓库通道（E2E 覆盖与恢复验证用）。URL 在页面存续期内
// 不变，订阅为空操作；服务端快照固定 false，保证 SSR 与客户端首帧一致。
const subscribeUrlNoop = () => () => {};

function useAllSources(): boolean {
  return useSyncExternalStore(
    subscribeUrlNoop,
    () => new URLSearchParams(window.location.search).has("all-sources"),
    () => false,
  );
}

// 十秒开馆 · 冷启动：主路径「从一个 Git 仓库开始」只读预览帮填表，次路径
// 「手动选择时间范围」与主路径共用同一张建馆表单（一套受控 state），确认权
// 始终留给用户——预览只做预填，不自动保存。
function StageGate({ busy, onSubmit, onNotice, onRecentGitPath }: {
  busy: boolean;
  onSubmit: (payload: {
    name: string;
    starts_on: string;
    ends_on: string;
    import_git_path: string | null;
  }) => Promise<void> | void;
  onNotice: (notice: { kind: "error" | "success"; message: string } | null) => void;
  onRecentGitPath: (path: string) => void;
}) {
  const [repoPath, setRepoPath] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [preview, setPreview] = useState<GitRepoPreview | null>(null);
  const [previewedPath, setPreviewedPath] = useState<string | null>(null);
  const [adjustNote, setAdjustNote] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const allSources = useAllSources();

  // 与服务端 invalid_stage_range 同口径的 3–12 个月即时校验。
  const rangeError = stageRangeError(startsOn, endsOn);
  const saveDisabled = busy || Boolean(rangeError) || !name.trim() || !startsOn || !endsOn;

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = repoPath.trim();
    if (!path) {
      onNotice({ kind: "error", message: "请先填写本地 Git 仓库的路径。" });
      return;
    }
    setPreviewBusy(true);
    setPreview(null);
    setAdjustNote(null);
    setPreviewedPath(null);
    onNotice(null);
    try {
      const result = await previewGitRepo(path);
      const fitted = fitStageRangeToPolicy(result.first_commit_on, result.last_commit_on);
      setPreview(result);
      setPreviewedPath(path);
      setStartsOn(fitted.starts_on);
      setEndsOn(fitted.ends_on);
      setName((current) => (current.trim() ? current : result.repo_name));
      setAdjustNote(fitted.adjusted);
      onRecentGitPath(path);
    } catch (error) {
      onNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveDisabled) return;
    await onSubmit({
      name: name.trim(),
      starts_on: startsOn,
      ends_on: endsOn,
      import_git_path: previewedPath,
    });
  }

  return (
    <section className="mvp-stage-form">
      <header><span>第一步</span><div><h2>选择回顾时间</h2><p>{allSources ? "从一个本地 Git 仓库开始最快：贴上路径，系统只读提交记录帮你预填；也可以手动选择时间范围。" : "手动框定一段 3–12 个月的时间；进入后在导入页一键同步本机 Claude Code / Codex 会话。"}</p></div></header>
      {allSources && (
        <form className="mvp-gate-git" onSubmit={handlePreview}>
          <label>
            <span>从一个 Git 仓库开始（推荐）</span>
            <input name="gateRepoPath" value={repoPath} placeholder="/Users/you/Projects/your-repo" autoComplete="off" onChange={(changeEvent) => setRepoPath(changeEvent.target.value)} />
          </label>
          <div className="mvp-gate-git-actions">
            <button className="mvp-secondary" type="submit" disabled={previewBusy || !repoPath.trim()}>{previewBusy ? "正在读取仓库…" : "预览这个仓库"}</button>
            <small>只读取提交日期与提交说明来帮填下方表单，确认权在你；不会修改仓库内容。</small>
          </div>
          {preview && (
            <div className="mvp-gate-preview">
              <div><strong>{preview.repo_name}</strong><small>{preview.commit_count} 个提交 · {preview.first_commit_on} — {preview.last_commit_on}</small></div>
              <p>已按最早与最近提交预填下方表单{adjustNote ? `（${adjustNote}）` : ""}，可再手动调整后保存。</p>
            </div>
          )}
        </form>
      )}
      <form onSubmit={handleSubmit}>
        {allSources && <p className="mvp-gate-divider"><span>或手动选择时间范围</span></p>}
        <label><span>给这段时间取个名字</span><input name="name" required maxLength={120} value={name} placeholder="例如：我的 AI 产品半年" onChange={(changeEvent) => setName(changeEvent.target.value)} /></label>
        <div className="mvp-date-grid">
          <label><span>从哪一天开始</span><input name="starts_on" required type="date" value={startsOn} onChange={(changeEvent) => setStartsOn(changeEvent.target.value)} /></label>
          <label><span>到哪一天结束</span><input name="ends_on" required type="date" value={endsOn} onChange={(changeEvent) => setEndsOn(changeEvent.target.value)} /></label>
        </div>
        {rangeError ? (
          <p className="mvp-gate-error" role="alert">{rangeError}</p>
        ) : (
          <p className="mvp-form-help">当前研究原型支持 3–12 个月范围，不会自动扫描你的电脑。</p>
        )}
        <button className="mvp-primary" disabled={saveDisabled} type="submit">{busy ? "正在保存…" : "保存范围，开始导入"}</button>
      </form>
    </section>
  );
}

function StageSummary({ stage, experienceCount, pendingCount, onSwitch }: {
  stage: Stage;
  experienceCount: number;
  pendingCount: number;
  onSwitch: () => void;
}) {
  return (
    <section className="mvp-stage-summary">
      <div><span>正在回顾</span><strong>{stage.name}</strong><small>{stage.starts_on} — {stage.ends_on}</small></div>
      <dl>
        <div><dt>已保存记录</dt><dd>{stage.evidence_count}</dd></div>
        <div><dt>发现经历</dt><dd>{experienceCount}</dd></div>
        <div><dt>需要核对</dt><dd>{pendingCount}</dd></div>
      </dl>
      <button type="button" onClick={onSwitch}>切换回顾范围</button>
    </section>
  );
}

function ImportView({ busy, coverage, files, results, gitPath, recentGitPaths, claudePath, codexPath, onGitPathChange, onPickRecentGitPath, onClaudePathChange, onCodexPathChange, onFileSelection, onSubmit, onGitSubmit, onClaudeSubmit, onCodexSubmit, onImportSessions }: {
  busy: boolean;
  coverage: CoverageItem[];
  files: File[];
  results: ImportResult[];
  gitPath: string;
  recentGitPaths: string[];
  claudePath: string;
  codexPath: string;
  onGitPathChange: (value: string) => void;
  onPickRecentGitPath: (path: string) => void;
  onClaudePathChange: (value: string) => void;
  onCodexPathChange: (value: string) => void;
  onFileSelection: (files: FileList | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGitSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClaudeSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCodexSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onImportSessions: (kind: "claude" | "codex", path: string) => void;
}) {
  const allSources = useAllSources();
  return (
    <section className="mvp-view mvp-import-view">
      <article className="mvp-panel mvp-import-panel">
        <header className="mvp-section-heading"><span>01 · 导入</span><div><h2>一次导入这段时间的记录</h2><p>{allSources ? "现在支持整理过的 Markdown/TXT、本地 Git 仓库、Claude Code 与 Codex 会话。ChatGPT、WorkBuddy 原生导出文件将在后续适配。" : "自动发现本机 Claude Code 与 Codex 的会话记录，点一下即可导入。ChatGPT、WorkBuddy 原生导出文件将在后续适配。"}</p></div></header>
        <SessionDiscoveryPanel busy={busy} onImportSessions={onImportSessions} />
        {allSources && (
          <>
            <form onSubmit={onSubmit}>
              <label className="mvp-dropzone">
                <input name="notes" type="file" multiple onChange={(event) => onFileSelection(event.target.files)} />
                <span>选择多份 Markdown / TXT 记录</span>
                <small>单次最多 {MAX_BATCH_FILES} 份，总计不超过 {MAX_BATCH_BYTES_LABEL}；不支持的文件会单独提示</small>
              </label>
              {files.length > 0 && <FileSelectionList files={files} unit="份" moreNoun="份文件" />}
              <button className="mvp-primary" disabled={busy || files.length === 0} type="submit">{busy ? "正在逐份保存和整理…" : "开始整理这些记录"}</button>
            </form>
            <form className="mvp-git-import" onSubmit={onGitSubmit}>
              <span className="mvp-git-divider">或</span>
              <label>
                <span>导入一个本地 Git 仓库（只读提交记录）</span>
                <input name="gitPath" value={gitPath} placeholder="/Users/you/Projects/your-repo" autoComplete="off" onChange={(changeEvent) => onGitPathChange(changeEvent.target.value)} />
              </label>
              {recentGitPaths.length > 0 && (
                <div className="mvp-git-recent">
                  <span>最近仓库</span>
                  <ul>
                    {recentGitPaths.map((recentPath) => (
                      <li key={recentPath}>
                        <button type="button" title={recentPath} onClick={() => onPickRecentGitPath(recentPath)}>{displayRepoPath(recentPath)}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button className="mvp-secondary" disabled={busy} type="submit">{busy ? "正在读取仓库…" : "读取仓库提交记录"}</button>
              <small>系统只读取建馆阶段内的提交日期与提交说明，不会修改仓库内容。</small>
            </form>
          </>
        )}
        <form className="mvp-git-import" onSubmit={onClaudeSubmit}>
          {allSources && <span className="mvp-git-divider">或</span>}
          <label>
            <span>导入 Claude Code 会话（只读本地会话记录）</span>
            <input name="claudePath" value={claudePath} placeholder="/Users/you/Projects/your-project 或 ~/.claude/projects 下的会话目录" autoComplete="off" onChange={(changeEvent) => onClaudePathChange(changeEvent.target.value)} />
          </label>
          <button className="mvp-secondary" disabled={busy} type="submit">{busy ? "正在读取会话…" : "读取 Claude Code 会话"}</button>
          <small>系统只读取建馆阶段内的会话时间戳、消息计数与你的消息原文；不会修改 ~/.claude 下的任何内容，也不会解读对话。</small>
        </form>
        <form className="mvp-git-import" onSubmit={onCodexSubmit}>
          <span className="mvp-git-divider">或</span>
          <label>
            <span>导入 Codex 会话（只读本地会话记录）</span>
            <input name="codexPath" value={codexPath} placeholder="/Users/you/Projects/your-project" autoComplete="off" onChange={(changeEvent) => onCodexPathChange(changeEvent.target.value)} />
          </label>
          <button className="mvp-secondary" disabled={busy} type="submit">{busy ? "正在读取会话…" : "读取 Codex 会话"}</button>
          <small>系统按会话记录里的项目路径归属过滤，只统计你亲自发起的会话（内部子代理线程不计入）；只读取时间戳、消息计数与你的消息原文，不会修改 ~/.codex 下的任何内容。</small>
        </form>
        <div className="mvp-privacy-note"><strong>本地优先</strong><p>当前版本不调用模型，也不会把文件发送到云端；档案只保存在这台机器上。导出分享前系统会做敏感信息检查，最终可见内容由你确认。</p></div>
      </article>
      <ImportReport coverage={coverage} results={results} />
    </section>
  );
}

// 会话发现面板：自动列举本机有 Claude Code / Codex 会话的项目，点一下即导入。
// 只读扫描（Claude 数会话文件、Codex 只读首行）；失败时回落到下方手动填路径。
function SessionDiscoveryPanel({ busy, onImportSessions }: {
  busy: boolean;
  onImportSessions: (kind: "claude" | "codex", path: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [claudeProjects, setClaudeProjects] = useState<AgentSessionProject[]>([]);
  const [codexProjects, setCodexProjects] = useState<AgentSessionProject[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listClaudeSessionProjects(), listCodexSessionProjects()])
      .then(([nextClaude, nextCodex]) => {
        setClaudeProjects(nextClaude);
        setCodexProjects(nextCodex);
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : "扫描本机会话失败"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // 与首页 restoreSavedStage 同习：微任务里启动，避免 effect 内同步 setState。
    void Promise.resolve().then(load);
  }, [load]);

  const total = claudeProjects.length + codexProjects.length;

  return (
    <section className="mvp-session-discovery" aria-label="本机 Agent 会话发现">
      <header>
        <div>
          <strong>本机 Agent 会话</strong>
          <small>自动发现 Claude Code 与 Codex 的会话记录，点「导入」即可；只读，不会修改 ~/.claude 与 ~/.codex</small>
        </div>
        <button type="button" disabled={loading || busy} onClick={load}>{loading ? "扫描中…" : "刷新"}</button>
      </header>
      {error && (
        <p className="mvp-session-discovery-hint">暂时扫不到会话：{error}。可在下方手动填写项目路径。</p>
      )}
      {!error && !loading && total === 0 && (
        <p className="mvp-session-discovery-hint">没有发现 Claude Code / Codex 会话；可点「刷新」重试，或在下方手动填写项目路径。</p>
      )}
      {[
        { kind: "claude" as const, title: "Claude Code", projects: claudeProjects },
        { kind: "codex" as const, title: "Codex", projects: codexProjects },
      ].map(({ kind, title, projects }) =>
        projects.length > 0 ? (
          <div key={kind}>
            <span>{title} · {projects.length} 个项目</span>
            <ul>
              {projects.map((project) => (
                <li key={project.import_path}>
                  <button
                    type="button"
                    className="mvp-session-project"
                    disabled={busy}
                    title={project.import_path}
                    onClick={() => onImportSessions(kind, project.import_path)}
                  >
                    <strong>{project.project}</strong>
                    <small>{project.session_count} 个会话 · 导入</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  );
}

// 已选文件清单（#9）：笔记导入前的选择概览。
function FileSelectionList({ files, unit, moreNoun }: { files: File[]; unit: string; moreNoun: string }) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return (
    <div className="mvp-file-selection">
      <div><strong>已选择 {files.length} {unit}</strong><span>{formatBytes(totalBytes)}</span></div>
      <ul>{files.slice(0, 8).map((file) => <li key={`${file.name}-${file.size}`}><span>{file.name}</span><small>{formatBytes(file.size)}</small></li>)}</ul>
      {files.length > 8 && <p>还有 {files.length - 8} {moreNoun}将在本次一起处理。</p>}
    </div>
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

function DiscoverView({ events, selectedEvent, pendingCount, noteCandidateCount, batchBusy, mergeIds, structureBusy, confirmingAction, onSelect, onToggleMerge, onMergeAction, onSplitAction, onReview, onDispute, onBatchConfirm, onPreview }: {
  events: CandidateEvent[];
  selectedEvent: CandidateEvent | null;
  pendingCount: number;
  noteCandidateCount: number;
  batchBusy: boolean;
  mergeIds: string[];
  structureBusy: boolean;
  confirmingAction: StructureConfirm;
  onSelect: (eventId: string) => void;
  onToggleMerge: (eventId: string) => void;
  onMergeAction: (action: "request" | "confirm" | "cancel" | "clear") => void;
  onSplitAction: (action: "request" | "confirm" | "cancel") => void;
  onReview: (eventId?: string) => void;
  onDispute: (eventId: string) => void;
  onBatchConfirm: () => void;
  onPreview: () => void;
}) {
  return (
    <section className="mvp-view mvp-discover-view">
      <div className="mvp-discover-main">
        <header className="mvp-section-heading"><span>02 · 发现</span><div><h2>系统整理出 {events.length} 段可能的经历</h2><p>先浏览结果。带“等待你核对”的内容仍是草稿；带“系统核实”的内容来自确定性记录（Git 提交、Agent 会话时间戳），无需你逐条确认。</p></div></header>
        <div className="mvp-legend" aria-label="卡片状态图例">
          <span><i className="ai" aria-hidden="true" />虚线半透明 · AI 整理的草稿</span>
          <span><i className="sys" aria-hidden="true" />实线纹理 · 系统核实的确定性记录</span>
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
                <button className="mvp-secondary" type="button" disabled={batchBusy} onClick={() => onMergeAction("request")}>合并为一段经历</button>
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
            {noteCandidateCount > 0 && (
              <button className="mvp-secondary" type="button" disabled={batchBusy} onClick={onBatchConfirm}>
                {batchBusy ? "正在逐段确认…" : `这些都是我的笔记，一次确认（${noteCandidateCount}）`}
              </button>
            )}
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
            {selectedEvent.status === "verified" && <button className="mvp-secondary full" type="button" onClick={() => onDispute(selectedEvent.id)}>对这段记录提出异议</button>}
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
    return <section className="mvp-view mvp-review-complete"><span>核对 · 无待办</span><h2>这段回顾目前无需逐条核对</h2><p>展示的经历全部来自系统核实（确定性机器读数）；如果哪一段与事实不符，随时可在“发现经历”里点「对这段记录提出异议」。</p><button className="mvp-primary" type="button" onClick={onPreview}>查看回顾草稿</button></section>;
  }
  const frozen = busy || leaving !== null;
  const aggregated = event.source_count > 1;
  // 笔记（user_statement）默认可信：只核对标题/日期这类确定性提取；
  // 其余来源仍问“是否符合实际经历”。
  const extractionCheck = event.claims[0]?.evidence_role === "user_statement";
  const reviseLabel = extractionCheck ? "提取错了" : "发生过，但描述要改";
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
        <h2>
          {extractionCheck
            ? aggregated ? "这些笔记的标题和日期，提取得对吗？" : "这个标题和日期，提取得对吗？"
            : aggregated ? "这些记录属于同一段真实经历吗？" : "这件事情符合你的实际经历吗？"}
        </h2>
        <div className="mvp-question-experience"><time>{event.occurred_on ?? "时间还不明确"}</time><strong>{event.title}</strong><blockquote>{event.claims[0]?.text}</blockquote></div>
        <label className="mvp-review-note"><span>补充说明（选择“{reviseLabel}”时必填）</span><textarea ref={noteRef} value={note} maxLength={2000} placeholder={extractionCheck ? "例如：日期提错了，实际是上个月。" : "例如：事情发生过，但还没有正式上线。"} onChange={(changeEvent) => onNoteChange(changeEvent.target.value)} /></label>
        <div className="mvp-answer-grid">
          <button className="yes" disabled={frozen} type="button" onClick={() => onReview("confirmed")}>
            <kbd aria-hidden="true">1</kbd>
            <span>{extractionCheck ? <><strong>对，没问题</strong><small>标题与日期和你的笔记一致</small></> : <><strong>是，已经发生</strong><small>确认后盖上“已入馆”印章</small></>}</span>
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
            <span><strong>{extractionCheck ? "不属于我" : "只是讨论 / 不属于我"}</strong><small>不进入回顾，原文仍保留</small></span>
          </button>
        </div>
        <p className="mvp-kbd-hint">键盘 1–4 可快速作答；{extractionCheck ? "提取错了" : "描述要改"}需先填写说明。</p>
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

function ReviewSummaryView({ stage, confirmedCount, disputedCount, unknownCount, excludedCount, experienceCount, onOpenExhibition, onBackToDiscover }: {
  stage: Stage;
  confirmedCount: number;
  disputedCount: number;
  unknownCount: number;
  excludedCount: number;
  experienceCount: number;
  onOpenExhibition: () => void;
  onBackToDiscover: () => void;
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
        <Link className="mvp-primary" href="/exhibition">进入展览馆开馆 →</Link>
        <button className="mvp-secondary" type="button" onClick={onBackToDiscover}>回到发现经历</button>
      </div>
      <button className="mvp-text-button" type="button" onClick={onOpenExhibition}>先看首页里的展览草稿</button>
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
            <article key={event.id} className={event.status === "confirmed" ? "confirmed" : event.status === "verified" ? "verified" : "draft"} style={{ "--i": index } as CSSProperties}>
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
      <div className="mvp-next-actions centered"><Link className="mvp-primary" href="/exhibition">进入展览馆开馆 →</Link>{pendingCount > 0 && <button className="mvp-secondary" type="button" onClick={onReview}>继续核对 {pendingCount} 段经历</button>}<button className="mvp-secondary" type="button" onClick={onImport}>继续导入记录</button></div>
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

// 笔记批量校验（#7）：按总字节数限重（MAX_BATCH_BYTES）。
function noteValidationError(files: File[]): string | null {
  if (!files.length) return "请先选择 Markdown 或 TXT 文件。";
  if (files.length > MAX_BATCH_FILES) return `一次最多选择 ${MAX_BATCH_FILES} 份记录。`;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_BATCH_BYTES) return `本次文件总大小不能超过 ${MAX_BATCH_BYTES_LABEL}。`;
  return null;
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

// ---- 十秒开馆 · 日期工具（与后端 _add_months/_validate_stage_range 同口径） ----

function addMonthsISO(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const zeroBased = month - 1 + months;
  const nextYear = year + Math.floor(zeroBased / 12);
  const nextMonth = (((zeroBased % 12) + 12) % 12) + 1;
  // 与 calendar.monthrange 一致：本月天数按公历取，day 超长时截断到月末。
  const daysInMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const nextDay = Math.min(day, daysInMonth);
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

function shiftDaysISO(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// 3–12 个月即时校验：不合法时给出可操作的原因；空值交给 required 与服务端。
function stageRangeError(startsOn: string, endsOn: string): string | null {
  if (!ISO_DATE_RE.test(startsOn) || !ISO_DATE_RE.test(endsOn)) return null;
  if (endsOn < startsOn) return "结束日期不能早于开始日期。";
  const earliestEnd = shiftDaysISO(addMonthsISO(startsOn, 3), -1);
  const latestEnd = shiftDaysISO(addMonthsISO(startsOn, 12), -1);
  if (endsOn < earliestEnd) {
    return `回顾范围不足 3 个月：请把结束日期改到 ${earliestEnd} 或之后。`;
  }
  if (endsOn > latestEnd) {
    const earliestStart = shiftDaysISO(addMonthsISO(endsOn, -12), 1);
    return `回顾范围不能超过 12 个月：请把开始日期改到 ${earliestStart} 或之后。`;
  }
  return null;
}

// 预览自动填充的日期修正：不足 3 个月把 ends_on 延长到合法下限（保留最早
// 提交日）；超过 12 个月把 starts_on 后移到合法上限（保留最近提交日）。
// 修正后允许用户再手动调整，不自动保存。
function fitStageRangeToPolicy(firstCommitOn: string, lastCommitOn: string): {
  starts_on: string;
  ends_on: string;
  adjusted: string | null;
} {
  const minimumEnd = shiftDaysISO(addMonthsISO(firstCommitOn, 3), -1);
  if (lastCommitOn < minimumEnd) {
    return {
      starts_on: firstCommitOn,
      ends_on: minimumEnd,
      adjusted: `仓库跨度不足 3 个月，结束日期已延长到 ${minimumEnd}`,
    };
  }
  const latestEnd = shiftDaysISO(addMonthsISO(firstCommitOn, 12), -1);
  if (lastCommitOn > latestEnd) {
    const maximumStart = shiftDaysISO(addMonthsISO(lastCommitOn, -12), 1);
    return {
      starts_on: maximumStart,
      ends_on: lastCommitOn,
      adjusted: `仓库跨度超过 12 个月，开始日期已后移到 ${maximumStart}`,
    };
  }
  return { starts_on: firstCommitOn, ends_on: lastCommitOn, adjusted: null };
}

// chips 上只显示路径尾部两级，完整路径放在 title 里。
function displayRepoPath(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}
