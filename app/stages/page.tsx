"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  Stage,
  deleteStage,
  listStages,
  renameStage,
} from "../phase0-api";

const STAGE_STORAGE_KEY = "digital-museum-phase0-stage-id";

type PageNotice = { kind: "error" | "success"; message: string } | null;

export default function StageLibraryPage() {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [notice, setNotice] = useState<PageNotice>(null);
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Stage | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const savedStageId = window.localStorage.getItem(STAGE_STORAGE_KEY);
    listStages()
      .then((nextStages) => {
        setStages(nextStages);
        setCurrentStageId(savedStageId);
      })
      .catch((error: unknown) => {
        setStages([]);
        setNotice({ kind: "error", message: errorMessage(error) });
      });
  }, []);

  async function refresh() {
    const savedStageId = window.localStorage.getItem(STAGE_STORAGE_KEY);
    try {
      const nextStages = await listStages();
      setStages(nextStages);
      setCurrentStageId(savedStageId);
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    }
  }

  function enterStage(stageId: string) {
    window.localStorage.setItem(STAGE_STORAGE_KEY, stageId);
    window.location.assign("/");
  }

  function startNewStage() {
    window.localStorage.removeItem(STAGE_STORAGE_KEY);
    window.location.assign("/");
  }

  function startRename(stage: Stage) {
    setNotice(null);
    setDeleteTarget(null);
    setDeleteArmed(false);
    setRenaming({ id: stage.id, value: stage.name });
  }

  async function submitRename(event: FormEvent<HTMLFormElement>, stageId: string) {
    event.preventDefault();
    if (!renaming || renaming.id !== stageId) return;
    const name = renaming.value.trim();
    if (!name) {
      setNotice({ kind: "error", message: "阶段名称不能为空。" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await renameStage(stageId, name);
      setRenaming(null);
      setNotice({ kind: "success", message: "阶段已重命名。" });
      await refresh();
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function requestDelete(stage: Stage) {
    setNotice(null);
    setRenaming(null);
    setDeleteTarget(stage);
    setDeleteArmed(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setNotice(null);
    try {
      await deleteStage(deleteTarget.id);
      if (window.localStorage.getItem(STAGE_STORAGE_KEY) === deleteTarget.id) {
        window.localStorage.removeItem(STAGE_STORAGE_KEY);
        setCurrentStageId(null);
      }
      setDeleteTarget(null);
      setDeleteArmed(false);
      setNotice({
        kind: "success",
        message: `已删除「${deleteTarget.name}」。原始记录文件按内容寻址保留在本地。`,
      });
      await refresh();
    } catch (error) {
      setNotice({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mvp-shell">
      <header className="mvp-header">
        <Link className="mvp-brand" href="/" aria-label="Digital Museum 首页">
          <span>DM</span>
          <div><strong>Digital Museum</strong><small>AI 协作记录体验版</small></div>
        </Link>
        <div className="mvp-header-actions">
          <span className="mvp-local-badge"><i /> 原始记录保存在本地</span>
          <button className="mvp-stage-new" type="button" onClick={startNewStage}>＋ 新建回顾阶段</button>
        </div>
      </header>

      <section className="mvp-stage-hero">
        <div>
          <p className="mvp-kicker">MY ARCHIVES · 我的回顾</p>
          <h1>管理你的回顾阶段</h1>
          <p>每个阶段是一段独立的回顾范围。可以重新进入其中任意一段，也可以改名或删除不再需要的阶段；原始记录文件按内容寻址保留在本地，不会随阶段删除而丢失。</p>
        </div>
      </section>

      {notice && <div className={`mvp-notice ${notice.kind}`} role="status">{notice.message}</div>}

      {stages === null ? (
        <section className="mvp-loading">正在读取回顾列表…</section>
      ) : stages.length === 0 ? (
        <section className="mvp-stage-empty">
          <span>还没有回顾阶段</span>
          <strong>先去首页建一段回顾</strong>
          <p>选择一段时间范围、导入这段时间的 AI 协作记录，它就会出现在这里。</p>
          <Link className="mvp-primary" href="/">去首页建馆 →</Link>
        </section>
      ) : (
        <section className="mvp-stage-list" aria-label="全部回顾阶段">
          {stages.map((stage) => (
            <article key={stage.id} className="mvp-stage-card">
              {renaming?.id === stage.id ? (
                <form className="mvp-stage-rename" onSubmit={(event) => submitRename(event, stage.id)}>
                  <label>
                    <span>新的阶段名称</span>
                    <input
                      value={renaming.value}
                      maxLength={120}
                      autoFocus
                      onChange={(event) => setRenaming({ id: stage.id, value: event.target.value })}
                    />
                  </label>
                  <div className="mvp-stage-rename-actions">
                    <button className="mvp-primary" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存新名称"}</button>
                    <button className="mvp-secondary" type="button" disabled={busy} onClick={() => setRenaming(null)}>取消</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="mvp-stage-card-head">
                    <div>
                      <h2>{stage.name}</h2>
                      <small>{stage.starts_on} — {stage.ends_on}</small>
                      <small>创建于 {stage.created_at.slice(0, 10)}</small>
                    </div>
                    {currentStageId === stage.id && (
                      <span className="mvp-stage-current">当前回顾</span>
                    )}
                  </div>
                  <dl className="mvp-stage-stats">
                    <div><dt>已保存记录</dt><dd>{stage.evidence_count}</dd></div>
                    <div><dt>发现经历</dt><dd>{stage.event_count}</dd></div>
                    <div><dt>已确认</dt><dd>{stage.confirmed_count}</dd></div>
                    <div><dt>系统核实</dt><dd>{stage.verified_count}</dd></div>
                  </dl>
                  <div className="mvp-stage-actions">
                    <button className="mvp-primary" type="button" onClick={() => enterStage(stage.id)}>进入回顾</button>
                    <button className="mvp-secondary" type="button" onClick={() => startRename(stage)}>重命名</button>
                    <button className="mvp-stage-remove" type="button" onClick={() => requestDelete(stage)}>删除</button>
                  </div>
                  {deleteTarget?.id === stage.id && (
                    <div className="mvp-stage-danger" role="alertdialog" aria-label={`删除确认：${stage.name}`}>
                      {deleteArmed ? (
                        <>
                          <strong>请再次确认：删除后无法恢复</strong>
                          <p>「{stage.name}」的 {stage.event_count} 段经历、{stage.evidence_count} 份记录的整理结果将被永久删除。原始记录文件按内容寻址保留在本地。</p>
                          <div className="mvp-stage-danger-actions">
                            <button className="mvp-primary" type="button" disabled={busy} onClick={() => void confirmDelete()}>{busy ? "正在删除…" : "确认永久删除"}</button>
                            <button className="mvp-secondary" type="button" disabled={busy} onClick={() => { setDeleteTarget(null); setDeleteArmed(false); }}>取消</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <strong>确定要删除这个阶段吗？</strong>
                          <p>将永久删除「{stage.name}」整理出的 {stage.event_count} 段经历、{stage.evidence_count} 份记录的整理结果。原始记录文件按内容寻址保留在本地，不会从磁盘删除。</p>
                          <div className="mvp-stage-danger-actions">
                            <button className="mvp-secondary" type="button" disabled={busy} onClick={() => setDeleteArmed(true)}>删除这个阶段</button>
                            <button className="mvp-stage-remove cancel" type="button" disabled={busy} onClick={() => setDeleteTarget(null)}>取消</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </article>
          ))}
        </section>
      )}

      <footer className="mvp-footer">
        <span>当前体验：本地 Markdown/TXT → 经历草稿 → 关键核对 → 私人回顾</span>
        <span>阶段删除只清理整理结果，原始证据文件始终保留</span>
      </footer>
    </main>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}
