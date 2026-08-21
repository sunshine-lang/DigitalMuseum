"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CandidateEvent,
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

const STAGE_STORAGE_KEY = "digital-museum-phase0-stage-id";

const decisionLabels: Record<ReviewDecision, string> = {
  confirmed: "确认发生过",
  disputed: "标记存疑",
  unknown: "证据不足",
  rejected: "排除事件",
};

const statusLabels: Record<CandidateEvent["status"], string> = {
  candidate: "候选，尚未确认",
  confirmed: "本人已确认",
  disputed: "存疑",
  unknown: "证据不足",
  rejected: "已排除",
};

const coverageLabels: Record<CoverageItem["step"], string> = {
  stored_locally: "原文已保存",
  parsed_locally: "本地解析完成",
  candidate_generated: "候选事件已形成",
};

export default function Phase0Workspace() {
  const [stage, setStage] = useState<Stage | null>(null);
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [coverage, setCoverage] = useState<CoverageItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSavedStage, setLoadingSavedStage] = useState(true);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string } | null>(
    null,
  );

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? events[0] ?? null,
    [events, selectedEventId],
  );

  const refreshStage = useCallback(async (stageId: string) => {
    const [nextStage, nextEvents, nextCoverage] = await Promise.all([
      getStage(stageId),
      getEvents(stageId),
      getCoverage(stageId),
    ]);
    setStage(nextStage);
    setEvents(nextEvents);
    setCoverage(nextCoverage);
    setSelectedEventId((current) =>
      current && nextEvents.some((event) => event.id === current)
        ? current
        : (nextEvents[0]?.id ?? null),
    );
  }, []);

  useEffect(() => {
    async function restoreSavedStage() {
      const savedStageId = window.localStorage.getItem(STAGE_STORAGE_KEY);
      if (!savedStageId) return;
      try {
        await refreshStage(savedStageId);
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
      setNotice({ kind: "success", message: "阶段已创建。现在可以导入第一篇 Note。" });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stage) return;
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("note") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setNotice({ kind: "error", message: "请先选择一个 Markdown 或 TXT 文件。" });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const importedEvent = await importNote(stage.id, file);
      await refreshStage(stage.id);
      setSelectedEventId(importedEvent.id);
      form.reset();
      setNotice({ kind: "success", message: "Note 已保存在本地，并形成一个待审阅候选事件。" });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(decision: ReviewDecision) {
    if (!selectedEvent) return;
    setBusy(true);
    setNotice(null);
    try {
      const reviewed = await reviewEvent(selectedEvent.id, {
        decision,
        note: reviewNote.trim() || null,
        expected_revision: selectedEvent.revision,
      });
      setEvents((current) =>
        current.map((event) => (event.id === reviewed.id ? reviewed : event)),
      );
      setReviewNote("");
      setNotice({ kind: "success", message: `审阅已保存：${decisionLabels[decision]}。` });
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
      if (stage && error instanceof Phase0ApiError && error.status === 409) {
        await refreshStage(stage.id).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  function forgetStagePointer() {
    window.localStorage.removeItem(STAGE_STORAGE_KEY);
    setStage(null);
    setEvents([]);
    setCoverage([]);
    setSelectedEventId(null);
    setNotice({
      kind: "success",
      message: "已退出当前阶段。后端档案没有被删除；本阶段暂不提供删除操作。",
    });
  }

  return (
    <main className="phase0-shell">
      <header className="phase0-header">
        <Link className="phase0-brand" href="/" aria-label="Digital Museum Phase 0 首页">
          <span>DM</span>
          <div>
            <strong>Digital Museum</strong>
            <small>Phase 0 · Note Event Review</small>
          </div>
        </Link>
        <div className="phase0-header-actions">
          <span className="phase0-local-badge"><i /> 本地优先研究原型</span>
          <Link href="/demo">查看后续展览演示 ↗</Link>
        </div>
      </header>

      <section className="phase0-intro">
        <div>
          <p className="phase0-kicker">HISTORIAN FIRST, CURATOR SECOND</p>
          <h1>先确认发生过什么，<br />再决定如何讲述。</h1>
          <p>
            第一阶段只跑通一条可信链路：导入一篇 Note，查看逐字证据锚点，
            再由你决定它能否成为正式事件。
          </p>
        </div>
        <aside>
          <strong>候选不是事实</strong>
          <p>系统不会因为一段文字“看起来合理”，就自动把它写进你的人生档案。</p>
        </aside>
      </section>

      <ol className="phase0-steps" aria-label="第一阶段处理流程">
        <li className={stage ? "done" : "active"}><span>1</span><div><strong>创建阶段</strong><small>限定 3–12 个月</small></div></li>
        <li className={coverage.length ? "done" : stage ? "active" : ""}><span>2</span><div><strong>导入 Note</strong><small>Markdown / TXT</small></div></li>
        <li className={events.length ? "active" : ""}><span>3</span><div><strong>审阅事件</strong><small>证据、主张、状态</small></div></li>
      </ol>

      {notice && <div className={`phase0-notice ${notice.kind}`} role="status">{notice.message}</div>}

      {loadingSavedStage ? (
        <section className="phase0-loading">正在读取本地阶段…</section>
      ) : !stage ? (
        <StageForm busy={busy} onSubmit={handleCreateStage} />
      ) : (
        <section className="phase0-workspace">
          <div className="phase0-left-column">
            <article className="phase0-stage-card">
              <div>
                <span>当前建馆阶段</span>
                <h2>{stage.name}</h2>
                <p>{stage.starts_on} — {stage.ends_on}</p>
              </div>
              <div className="phase0-stage-counts">
                <span><strong>{stage.evidence_count}</strong> 份 Evidence</span>
                <span><strong>{stage.event_count}</strong> 个 Candidate</span>
              </div>
              <button type="button" onClick={forgetStagePointer}>退出当前阶段</button>
            </article>

            <form className="phase0-import-card" onSubmit={handleImport}>
              <div>
                <span className="phase0-card-index">01</span>
                <div><h2>导入第一篇 Note</h2><p>原文按 SHA-256 内容哈希保存，不会被候选主张覆盖。</p></div>
              </div>
              <label className="phase0-file-input">
                <input name="note" type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" />
                <span>选择 Markdown / TXT 文件</span>
                <small>UTF-8 · 最大 2 MiB · 暂勿使用真实敏感资料</small>
              </label>
              <button className="phase0-primary-button" disabled={busy} type="submit">
                {busy ? "正在处理…" : "保存原文并形成候选事件"}
              </button>
            </form>

            <CoveragePanel coverage={coverage} />

            <section className="phase0-event-list">
              <header><div><span className="phase0-card-index">02</span><h2>候选事件</h2></div><small>{events.length} 个</small></header>
              {events.length === 0 ? (
                <div className="phase0-empty">导入 Note 后，候选事件会出现在这里。</div>
              ) : events.map((event) => (
                <button
                  type="button"
                  key={event.id}
                  className={selectedEvent?.id === event.id ? "selected" : ""}
                  onClick={() => setSelectedEventId(event.id)}
                >
                  <span className={`phase0-status ${event.status}`}>{statusLabels[event.status]}</span>
                  <strong>{event.title}</strong>
                  <small>{event.occurred_on ?? "时间 Unknown"} · revision {event.revision}</small>
                </button>
              ))}
            </section>
          </div>

          <EventReviewPanel
            event={selectedEvent}
            note={reviewNote}
            busy={busy}
            onNoteChange={setReviewNote}
            onReview={handleReview}
          />
        </section>
      )}

      <footer className="phase0-footer">
        <span>当前只验证 Note → Event Review</span>
        <span>Session、照片、Git、展览与分享尚未实现</span>
      </footer>
    </main>
  );
}

function StageForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="phase0-create-card" onSubmit={onSubmit}>
      <div className="phase0-form-heading">
        <span className="phase0-card-index">01</span>
        <div><h2>创建建馆阶段</h2><p>先限定范围，降低隐私成本，也避免把不同人生阶段混在一起。</p></div>
      </div>
      <label><span>阶段名称</span><input name="name" required maxLength={120} placeholder="例如：我的 AI 产品半年" /></label>
      <div className="phase0-date-grid">
        <label><span>开始日期</span><input name="starts_on" required type="date" /></label>
        <label><span>结束日期</span><input name="ends_on" required type="date" /></label>
      </div>
      <p className="phase0-form-help">阶段长度必须在 3–12 个月之间。本阶段不会自动扫描你的电脑。</p>
      <button className="phase0-primary-button" disabled={busy} type="submit">
        {busy ? "正在创建…" : "创建阶段并继续"}
      </button>
    </form>
  );
}

function CoveragePanel({ coverage }: { coverage: CoverageItem[] }) {
  if (!coverage.length) return null;
  const latestOccurrence = coverage.at(-1)?.occurrence_id;
  const latest = coverage.filter((item) => item.occurrence_id === latestOccurrence);
  return (
    <section className="phase0-coverage">
      <header><h3>Processing Coverage</h3><span>{latest[0]?.original_filename}</span></header>
      <div>
        {latest.map((item) => (
          <span key={item.id} className={item.status}><i>✓</i>{coverageLabels[item.step]}</span>
        ))}
      </div>
      <p>“处理完成”只说明流程走过，不代表候选内容已经被确认。</p>
    </section>
  );
}

function EventReviewPanel({
  event,
  note,
  busy,
  onNoteChange,
  onReview,
}: {
  event: CandidateEvent | null;
  note: string;
  busy: boolean;
  onNoteChange: (value: string) => void;
  onReview: (decision: ReviewDecision) => void;
}) {
  if (!event) {
    return <aside className="phase0-review-card empty"><span>03</span><h2>事件审阅</h2><p>选择或导入候选事件后，在这里核对证据。</p></aside>;
  }
  const claim = event.claims[0];
  const anchor = claim?.anchors[0];
  return (
    <aside className="phase0-review-card">
      <header>
        <span className="phase0-card-index">03</span>
        <div><p>EVENT REVIEW</p><h2>{event.title}</h2></div>
        <span className={`phase0-status ${event.status}`}>{statusLabels[event.status]}</span>
      </header>

      <section className="phase0-truth-warning">
        <strong>{event.is_formal ? "这是本人确认事件" : "这仍是候选事件"}</strong>
        <p>{event.is_formal ? "确认记录和证据锚点都已保存。" : "在你确认前，它不能进入正式 Event Archive。"}</p>
      </section>

      {claim && <section className="phase0-claim">
        <div><span>CORE CLAIM</span><span>{claim.evidence_role === "user_statement" ? "本人原文陈述" : claim.evidence_role}</span></div>
        <blockquote>{claim.text}</blockquote>
        <p>认识状态：<strong>{claim.epistemic_status}</strong></p>
      </section>}

      {anchor && <section className="phase0-anchor">
        <header><span>Evidence Anchor</span><small>逐字引用，不是 AI 改写</small></header>
        <blockquote>{anchor.quote}</blockquote>
        <dl>
          <div><dt>原文行号</dt><dd>{anchor.line_start}{anchor.line_end !== anchor.line_start ? `–${anchor.line_end}` : ""}</dd></div>
          <div><dt>字符位置</dt><dd>{anchor.char_start}–{anchor.char_end}</dd></div>
          <div><dt>文件哈希</dt><dd title={anchor.blob_sha256}>{anchor.blob_sha256.slice(0, 16)}…</dd></div>
        </dl>
      </section>}

      <label className="phase0-review-note">
        <span>审阅备注（可选）</span>
        <textarea value={note} maxLength={2000} onChange={(event) => onNoteChange(event.target.value)} placeholder="说明你确认、存疑或保持 Unknown 的原因" />
      </label>

      <div className="phase0-review-actions">
        {(Object.keys(decisionLabels) as ReviewDecision[]).map((decision) => (
          <button key={decision} type="button" disabled={busy} className={decision} onClick={() => onReview(decision)}>
            {decisionLabels[decision]}
          </button>
        ))}
      </div>
      {event.latest_review && <p className="phase0-latest-review">最近一次审阅：{decisionLabels[event.latest_review.decision]} · revision {event.latest_review.revision}{event.latest_review.note ? ` · ${event.latest_review.note}` : ""}</p>}
    </aside>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}
