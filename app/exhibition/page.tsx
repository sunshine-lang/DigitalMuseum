"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CandidateEvent, listArchiveEvents, listExhibitPreviews, type ExhibitPreview } from "../phase0-api";
import { dateSpanOf, errorTextOf, isVisibleExperience, monthLabelOf, sortEvents, statusLabel } from "../events-shared";
import { EXPORT_RISK_LABELS, buildExhibitionHtml, scanExportRisks, type ExportRisk } from "./export-html";
import { DepthGallery } from "./depth-gallery";
import { agentLabel, groupProjects, projectPathLabel } from "./project-gallery";

const ARCHIVE_TITLE = "我的 Agent 协作档案";
type LoadStatus = "loading" | "ready" | "empty" | "error";

export default function ExhibitionWorkspace() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [events, setEvents] = useState<CandidateEvent[]>([]);
  const [show, setShow] = useState(false);
  const [previews, setPreviews] = useState<ExhibitPreview[]>([]);
  const [entryNotice, setEntryNotice] = useState("");
  const [month, setMonth] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportConfirm, setExportConfirm] = useState<{ html: string; risks: ExportRisk[] } | null>(null);
  const [checkedRisks, setCheckedRisks] = useState<Set<string>>(new Set());
  const exportDialog = useRef<HTMLDialogElement>(null);

  const visibleEvents = useMemo(() => sortEvents(events.filter(isVisibleExperience)), [events]);
  const months = useMemo(() => [...new Set(visibleEvents.map(event => event.occurred_on?.slice(0, 7) ?? "undated"))].sort().reverse(), [visibleEvents]);
  const scopedEvents = useMemo(() => visibleEvents.filter(event => month === "all" || (event.occurred_on?.slice(0, 7) ?? "undated") === month), [visibleEvents, month]);
  const selectedEvents = useMemo(() => scopedEvents.filter(event => selectedIds.has(event.id)), [scopedEvents, selectedIds]);
  const groups = useMemo(() => groupProjects(scopedEvents), [scopedEvents]);
  const selectedProjects = useMemo(() => groupProjects(selectedEvents), [selectedEvents]);

  useEffect(() => {
    let active = true;
    Promise.all([listArchiveEvents(), listExhibitPreviews().catch(() => [])]).then(([next, catalog]) => {
      if (!active) return;
      setEvents(next);
      const visible = next.filter(isVisibleExperience);
      const settled = visible.filter(event => event.status === "verified" || event.status === "confirmed");
      const requestedId = new URLSearchParams(window.location.search).get("exhibit");
      const requested = catalog.find(item => item.id === requestedId);
      setPreviews(requested ? [requested, ...catalog.filter(item => item.id !== requested.id)] : catalog);
      const targetEvents = requested ? visible.filter(event => event.project_key === requested.project_key) : [];
      if (requestedId && targetEvents.length) {
        const targetSettled = targetEvents.filter(event => event.status === "verified" || event.status === "confirmed");
        setSelectedIds(new Set((targetSettled.length ? targetSettled : targetEvents).map(event => event.id)));
        setShow(true);
      } else {
        setSelectedIds(new Set((settled.length ? settled : visible).map(event => event.id)));
        if (!requestedId && new URLSearchParams(window.location.search).get("view") === "gallery") setShow(visible.length > 0);
        if (requestedId) setEntryNotice("这段展品暂时无法定位。你可以从下面的项目继续浏览。");
      }
      setStatus(visible.length ? "ready" : "empty");
    }).catch((error: unknown) => {
      if (!active) return;
      setErrorMessage(errorTextOf(error, "读取回顾档案失败"));
      setStatus("error");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const dialog = exportDialog.current;
    if (exportConfirm && dialog && !dialog.open) dialog.showModal();
    if (!exportConfirm && dialog?.open) dialog.close();
  }, [exportConfirm]);

  function toggleEvent(id: string) {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: CandidateEvent[]) {
    setSelectedIds(previous => {
      const next = new Set(previous);
      const all = group.every(event => next.has(event.id));
      for (const event of group) { if (all) next.delete(event.id); else next.add(event.id); }
      return next;
    });
  }

  function download(html: string) {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "digital-museum-我的-Agent-协作档案.html";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function exportStatic() {
    if (!selectedEvents.length) return;
    const span = dateSpanOf(selectedEvents);
    const html = buildExhibitionHtml({
      stageName: ARCHIVE_TITLE,
      startsOn: span?.startsOn ?? "时间待定", endsOn: span?.endsOn ?? "时间待定",
      events: selectedEvents.map(event => ({
        title: event.title, occurred_on: event.occurred_on, status: event.status,
        origin: event.origin, claims: event.claims.map(claim => ({ text: claim.text })),
      })), exportedAt: new Date().toISOString(),
    });
    const risks = scanExportRisks(html);
    if (risks.length) { setCheckedRisks(new Set()); setExportConfirm({ html, risks }); }
    else download(html);
  }

  if (status === "loading") return <main className="expo-shell expo-neutral"><p className="expo-loading">正在读取本地回顾档案…</p></main>;
  if (status === "empty" || status === "error") return <main className="expo-shell expo-neutral"><section className="expo-empty">
    <span>DIGITAL MUSEUM</span><h1>{status === "empty" ? "展览馆还没有内容" : "暂时打不开展览馆"}</h1>
    <p>{status === "empty" ? "先回到工作台同步本机 Agent 会话，再选择想留下的记录。" : errorMessage}</p>
    <Link className="expo-button" href="/">回到工作台</Link>
  </section></main>;

  return <>
    {!show ? <main className="expo-shell expo-neutral depth-prep-shell">
      <header className="expo-topbar"><div><span>DIGITAL MUSEUM · 展览准备间</span><strong>{ARCHIVE_TITLE}</strong></div><Link href="/">回到工作台</Link></header>
      <section className="expo-prep">
        <header className="expo-prep-head"><span className="expo-kicker">PRIVATE COLLECTION · 现代私人展馆</span>
          <h1>选择这次想回看的项目</h1>
          <p>一个项目，一个入口。走进项目，再按日期回看其中的记录。</p>
          <p className="depth-prep-note">文字来自现有会话档案；纪念插画是通用装饰，不是历史现场。尚未核对的记录会保留状态标识。</p>
        </header>
        {entryNotice && <p className="depth-story-notice" role="status">{entryNotice}</p>}
        <div className="depth-prep-filter"><label>时间范围 <select value={month} onChange={event => setMonth(event.target.value)}>
          <option value="all">全部时间</option>{months.map(value => <option key={value} value={value}>{value === "undated" ? "时间待定" : monthLabelOf(value)}</option>)}
        </select></label><p>当前范围 · {groups.length} 个展项 / {scopedEvents.length} 条记录<span>按最近活动排序 · 只展出和导出当前范围内的勾选记录</span></p></div>
        <div className="expo-modules depth-project-grid">{groups.map(project => {
          const count = project.events.filter(event => selectedIds.has(event.id)).length;
          return <article className="expo-module depth-project-card" key={project.id}>
            <header><button type="button" onClick={() => toggleGroup(project.events)} aria-pressed={count === 0 ? false : count === project.events.length ? true : "mixed"} aria-label={`选择项目 ${project.label}`}>
              <i className={count === project.events.length ? "on" : count ? "half" : ""} aria-hidden="true"/>
              <strong>{project.label}</strong>
            </button><small>{count}/{project.events.length} 条已选</small></header>
            <div className="depth-project-summary"><span>{project.agents}</span><p>{project.dateLabel}</p>
              {previews.some(item => item.project_key === project.id) && <span className="depth-has-exhibit">有经历展品 · 先看做了什么</span>}
              <small>{project.days} 个有记录的日期 · {project.events.length} 条档案</small>
              <p className="depth-project-path" title={project.path ?? undefined}>{project.path ? projectPathLabel(project.path) : project.identityNote}</p>
            </div>
            <details><summary>按日期挑选记录</summary><ul>{project.events.map(event => <li key={event.id}><label className={selectedIds.has(event.id) ? "checked" : ""}>
              <input type="checkbox" aria-label={`${event.title} ${event.occurred_on ?? "时间待定"}`} checked={selectedIds.has(event.id)} onChange={() => toggleEvent(event.id)}/>
              <span><strong>{event.occurred_on ?? "时间待定"}</strong><small>{agentLabel(event)} · {statusLabel(event.status)}</small></span>
            </label></li>)}</ul></details>
          </article>;
        })}</div>
        <div className="expo-prep-actions">
          <button className="expo-button" type="button" disabled={!selectedEvents.length} onClick={() => { window.scrollTo(0, 0); setShow(true); }}>开馆 · 展出已选的 {selectedProjects.length} 个展项</button>
          <button className="expo-text-button" type="button" onClick={() => setSelectedIds(new Set([...selectedIds, ...scopedEvents.map(event => event.id)]))}>全选当前范围</button>
          <button className="expo-text-button" type="button" onClick={() => setSelectedIds(new Set())}>清空选择</button>
        </div>
      </section>
    </main> : <DepthGallery events={selectedEvents} previews={previews} onExit={() => { setShow(false); window.scrollTo(0, 0); }} onExport={exportStatic}/>}
    <dialog ref={exportDialog} className="depth-dialog depth-export-dialog" aria-label="导出内容风险确认" onClose={() => setExportConfirm(null)}>
      {exportConfirm && <div className="depth-dialog-content">
        <span className="depth-eyebrow">EXPORT CHECK · 导出前检查</span><h2>这些内容将随书稿一起导出</h2>
        <p>标题和展签中发现疑似敏感信息。请逐项检查；取消后可以重新选展，排除不想导出的记录。</p>
        <div className="depth-risk-list">{exportConfirm.risks.map(risk => <label key={risk.kind}>
          <input type="checkbox" checked={checkedRisks.has(risk.kind)} onChange={() => setCheckedRisks(previous => {
            const next = new Set(previous); if (next.has(risk.kind)) next.delete(risk.kind); else next.add(risk.kind); return next;
          })}/><span><strong>{EXPORT_RISK_LABELS[risk.kind]}</strong><small>命中 {risk.count} 处，如 <code>{risk.sample}</code></small></span>
        </label>)}</div>
        <p className="depth-small">导出为无脚本的静态 HTML 阅读版。画廊动效与证据指纹留在本机。</p>
        <div className="depth-dialog-actions"><button type="button" onClick={() => setExportConfirm(null)}>取消，回去修改</button>
          <button className="depth-primary" type="button" disabled={checkedRisks.size !== exportConfirm.risks.length} onClick={() => { download(exportConfirm.html); setExportConfirm(null); }}>我已逐项核对，仍然导出</button></div>
      </div>}
    </dialog>
  </>;
}
