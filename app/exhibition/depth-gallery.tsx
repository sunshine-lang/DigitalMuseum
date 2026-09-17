"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CandidateEvent, ExhibitArtwork, ExhibitPreview } from "../phase0-api";
import { dateSpanOf, statusLabel } from "../events-shared";
import { agentLabel, groupProjects, projectPathLabel, projectQuote, projectStatus } from "./project-gallery";
import { DepthScene } from "./depth-scene";
import { SavedStory } from "./saved-story";

const pad = (n: number) => String(n).padStart(2, "0");
const EXPERIENCE_ART: Record<ExhibitArtwork, { image: string; name: string; note: string }> = {
  "gathered-pages": { image: "/gallery/gathered-pages-v2.png", name: "聚成一册", note: "呼应记录归组" },
  "everyday-steps": { image: "/gallery/everyday-steps.png", name: "从日常走近原理", note: "呼应生活故事与分步理解" },
  "continuous-light": { image: "/gallery/continuous-light.png", name: "让原来的光延续", note: "呼应保留原貌与修复衔接" },
};
const experienceArt = (preview?: ExhibitPreview) => preview?.artwork ? EXPERIENCE_ART[preview.artwork] : undefined;
const SOURCE_ROLES = { user: "用户原话", assistant: "助手说明", document: "项目记录" };

export function DepthGallery({ events, previews, onExit, onExport }: {
  events: CandidateEvent[]; previews: ExhibitPreview[]; onExit: () => void; onExport: () => void;
}) {
  const projects = useMemo(() => groupProjects(events), [events]);
  const [active, setActive] = useState(0);
  const [recordIndex, setRecordIndex] = useState(0);
  const [simple, setSimple] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reader, setReader] = useState<number | null>(null);
  const progressRef = useRef(0);
  const runway = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const readerTrigger = useRef<HTMLElement | null>(null);
  const readButton = useRef<HTMLButtonElement>(null);
  const readerScroll = useRef(0);
  const navRef = useRef<HTMLElement>(null);
  const items = useMemo(() => projects.map(project => ({ id: project.id, image: experienceArt(previews.find(item => item.project_key === project.id))?.image ?? project.art.image })), [projects, previews]);
  const current = projects[active] ?? projects[0];
  const exhibit = previews.find(item => item.project_key === current?.id);
  const exhibitArt = experienceArt(exhibit);
  const art = exhibitArt ?? current?.art;
  const span = useMemo(() => dateSpanOf(events), [events]);
  const fallback = simple || reduced || unavailable;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 760px), (max-height: 640px)");
    const update = () => setReduced(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (fallback) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    window.scrollTo({ top: (runway.current?.offsetTop ?? 0) + progressRef.current * window.innerHeight * .9, behavior: "instant" });
    const update = () => {
      const top = runway.current?.offsetTop ?? 0;
      const unit = Math.max(1, window.innerHeight * .9);
      const next = Math.max(0, Math.min(projects.length - 1, (window.scrollY - top) / unit));
      progressRef.current = next; setActive(Math.round(next));
    };
    const resize = () => {
      window.scrollTo({ top: (runway.current?.offsetTop ?? 0) + progressRef.current * window.innerHeight * .9, behavior: "instant" });
      update();
    };
    update(); window.addEventListener("scroll", update, { passive: true }); window.addEventListener("resize", resize);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", resize); };
  }, [projects.length, fallback]);

  const goTo = useCallback((index: number) => {
    const next = Math.max(0, Math.min(projects.length - 1, index));
    setMenu(false);
    if (fallback) { setActive(next); progressRef.current = next; }
    else window.scrollTo({ top: (runway.current?.offsetTop ?? 0) + next * window.innerHeight * .9, behavior: reduced ? "instant" : "smooth" });
  }, [projects.length, fallback, reduced]);

  const openReader = useCallback((index: number, fromScene = false) => {
    readerTrigger.current = fromScene ? readButton.current : document.activeElement instanceof HTMLElement ? document.activeElement : readButton.current;
    readerScroll.current = window.scrollY;
    window.scrollTo({ top: readerScroll.current, behavior: "instant" });
    setReader(index); setRecordIndex(0); setMenu(false);
  }, []);
  const selectFrame = useCallback((index: number) => {
    if (index === active) openReader(index, true); else goTo(index);
  }, [active, goTo, openReader]);
  const handleUnavailable = useCallback(() => setUnavailable(true), []);

  useEffect(() => {
    const el = dialog.current;
    if (reader === null || !el) return;
    if (!el.open) el.showModal();
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = previous; };
  }, [reader]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (reader !== null || document.querySelector("dialog[open]") || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goTo(active + 1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goTo(active - 1); }
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, goTo, reader]);

  useEffect(() => {
    const selected = navRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    if (selected && navRef.current) navRef.current.scrollTop = selected.offsetTop - navRef.current.clientHeight / 2;
  }, [active]);

  function closeReader() {
    dialog.current?.close();
  }

  if (!current || !art) return null;
  const quote = projectQuote(current);
  const readProject = reader === null ? null : projects[reader];
  const readEvent = readProject?.events[recordIndex];
  const readArt = experienceArt(previews.find(item => item.project_key === readProject?.id)) ?? readProject?.art;
  const oneProject = projects.length === 1;
  const atEnd = active === projects.length - 1;
  return <main className={`depth-gallery${fallback ? " depth-simple" : ""}`}>
    <header className="depth-topbar">
      <Link className="depth-brand" href="/"><span className="depth-monogram">DM</span><span>DIGITAL MUSEUM</span></Link>
      <div className="depth-top-actions"><button type="button" onClick={onExit}>重新选展</button><button type="button" className="depth-export" onClick={onExport}>导出展览（HTML）<span aria-hidden="true">↗</span></button></div>
    </header>
    <section ref={runway} className="depth-runway" style={{ height: fallback ? "100svh" : `${100 + Math.max(0, projects.length - 1) * 90}svh` }} aria-label="纵深画廊">
      <div className="depth-viewport">
        <div className="depth-floor" aria-hidden="true"/>
        {!fallback && <DepthScene items={items} progressRef={progressRef} onUnavailable={handleUnavailable} onSelect={selectFrame}/>}
        {fallback && <button type="button" className="depth-flat-art" onClick={() => openReader(active)} aria-label={`打开${current.label}的记录`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art.image} alt={`${art.name}，AI 生成的抽象馆藏插画`}/>
        </button>}
        <div className="depth-exhibition-heading"><span className="depth-eyebrow">A COLLECTION OF MY WORK</span><h1>我的协作时刻</h1><p>{exhibit && <span className="depth-range-label">所选原始记录</span>}{span ? `${span.startsOn} — ${span.endsOn}` : "时间待定"}</p></div>

        <article className={`depth-caption${exhibit ? " depth-outcome-caption" : ""}`} key={current.id} aria-label="当前展项" data-art={art.image}>
          {exhibit ? <>
            <div className="depth-caption-meta"><span>{current.label}</span><span className="depth-exhibit-badge">已保存经历</span></div>
            <h2>{exhibit.title}</h2>
            <p className="depth-exhibit-summary">{exhibit.summary}</p>
            <p className="depth-project-span">{exhibit.starts_on} — {exhibit.ends_on}</p>
            <p className="depth-exhibit-sources">{exhibit.source_roles.map(role => SOURCE_ROLES[role]).join(" · ")}<span>{exhibit.reference_count} 处出处可查</span></p>
            <button ref={readButton} className="depth-read" type="button" onClick={() => openReader(active)}>走近这段经历 <span aria-hidden="true">↗</span></button>
            <p className="depth-status"><i aria-hidden="true"/>经历草稿 · 待本人确认</p>
            <p className="depth-quote-note">已保存经历有独立范围；原始记录按本次选展保留。</p>
          </> : <>
          <div className="depth-caption-meta"><span>PROJECT {pad(active + 1)}</span><span>{current.events.length} 条记录</span></div>
          <h2>{current.label}</h2><p className="depth-agent">{current.agents}</p>
          <p className="depth-project-span">{current.dateLabel}</p>
          {current.path && <p className="depth-project-path" title={current.path}>{projectPathLabel(current.path)}</p>}
          {current.identityNote && <p className="depth-identity-note">{current.identityNote}</p>}
          <div className="depth-caption-rule"/>
          {quote ? <blockquote>{quote.text}</blockquote> : <p className="depth-no-quote">从这些留下的记录，回看这个项目。</p>}
          <span className="depth-quote-note">{quote ? `${quote.date} · 一段首问摘录` : "当前档案没有首问摘录"}</span>
          <button ref={readButton} className="depth-read" type="button" onClick={() => openReader(active)}>回看这个项目 <span aria-hidden="true">↗</span></button>
          <p className="depth-status"><i aria-hidden="true"/>{projectStatus(current)}</p>
          </>}
        </article>
        <div className="depth-art-credit">{art.name}<span>AI 纪念插画 · {exhibitArt?.note ?? "通用装饰"}，非历史现场</span></div>
        <footer className="depth-bottom">
        <aside className="depth-index">
          <button className="depth-index-current" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-controls="depth-contents" aria-label="打开展项目录"><span>{pad(active + 1)}</span><small>/ {pad(projects.length)}</small><i aria-hidden="true">{menu ? "−" : "+"}</i></button>
          <span className="depth-index-caption">个项目 · 点击查看目录</span>

          <nav ref={navRef} id="depth-contents" className={`depth-contents${menu ? " open" : ""}`} aria-label="展项目录" inert={!menu}>
            <p>展项目录</p>{projects.map((project, index) => <button key={project.id} onClick={() => goTo(index)} aria-current={index === active ? "step" : undefined}><b>{pad(index + 1)}</b><span>{project.label}<small>{project.events.length} 条记录 · {project.dateLabel}</small></span></button>)}
          </nav>
        </aside>
          <div className="depth-direction"><span>{oneProject ? "本次只选了一个项目" : atEnd ? "已到最后一个项目" : fallback ? "使用按钮翻阅" : "向下滚动，走近下一个项目"}<small>{oneProject ? "重新选展，可以回看更多记录" : "也可以使用键盘 ← →"}</small></span></div>
          <div className="depth-pagination"><button type="button" aria-label="上一个项目" onClick={() => goTo(active - 1)} disabled={active === 0}>←</button><button type="button" aria-label="下一个项目" onClick={() => goTo(active + 1)} disabled={active === projects.length - 1}>→</button></div>
          <button className="depth-view-mode" type="button" disabled={reduced || unavailable} onClick={() => { progressRef.current = active; setSimple(!simple); }}>{reduced ? "轻量阅读 · 已减少动效" : unavailable ? "轻量阅读 · 3D 暂不可用" : simple ? "切换纵深画廊" : "切换轻量阅读"}</button>
        </footer>
        <div className="depth-bottom-progress" style={{ transform: `scaleX(${(active + 1) / projects.length})` }} aria-hidden="true"/>
      </div>
    </section>
    <dialog ref={dialog} className="depth-dialog depth-reader" aria-label="展品标签详情" onClose={() => { setReader(null); window.scrollTo({ top: readerScroll.current, behavior: "instant" }); readerTrigger.current?.focus({ preventScroll: true }); }} onClick={event => { if (event.target === event.currentTarget) closeReader(); }}>
      {readProject && readEvent && <div className="depth-project-reader">
        <header className="depth-project-reader-head"><div>
          <h2>{readProject.label}</h2><p>{readProject.dateLabel} · {readProject.events.length} 条记录 · {readProject.agents}</p>
          {readProject.identityNote && <p>{readProject.identityNote}</p>}
        </div><button className="depth-close" type="button" aria-label="关闭展品标签" onClick={closeReader} autoFocus>×</button></header>
        <SavedStory key={readProject.id} projectKey={readProject.id} cover={readArt ? { image: readArt.image, alt: `${readArt.name} · 纪念插画，非历史现场` } : undefined} preferredStoryId={previews.find(item => item.project_key === readProject.id)?.id}>
        <nav className="depth-record-nav" aria-label="项目内的记录"><span>按日期回看</span>{readProject.events.map((event, index) => <button key={event.id} type="button" aria-current={recordIndex === index ? "true" : undefined} onClick={() => setRecordIndex(index)}>
          <time>{event.occurred_on ?? "时间待定"}</time><small>{agentLabel(event)} · {statusLabel(event.status)}</small>
        </button>)}</nav>
        <div className="depth-reader-layout" key={readEvent.id}>
          <div className="depth-reader-main"><p className="depth-reader-sub" aria-live="polite">{readEvent.occurred_on ?? "时间待定"} · {statusLabel(readEvent.status)} · {readEvent.source_count} 份来源</p>
            <p className="depth-reader-boundary">以下是这一天留下的会话记录，尚未整理成故事。“系统核实”仅指时间与计数等确定性读数。</p>
            {readEvent.claims.map((claim, index) => <section className="depth-claim" key={claim.id}><span>记录 {pad(index + 1)}</span><p>{claim.text}</p></section>)}
            {!readEvent.claims.length && <p>这段档案暂时没有可读取的记录正文。</p>}
            <div className="depth-reader-actions"><Link href="/">回工作台核对记录 <span aria-hidden="true">↗</span></Link><button type="button" onClick={closeReader}>继续观展 →</button></div>
          </div>
          <aside className="depth-reader-evidence"><span className="depth-eyebrow">BACK TO THE SOURCE</span><h3>这段记录的依据</h3><p>来自现有档案的只读证据文档。首问摘录可能已截短，不代表完整会话。</p>
            {readEvent.claims.flatMap(claim => claim.anchors.map((anchor, index) => <figure className="depth-source" key={`${claim.id}-${index}`}><figcaption>证据摘录 · 行 {anchor.line_start}{anchor.line_end !== anchor.line_start ? `–${anchor.line_end}` : ""}</figcaption><pre>{anchor.quote}</pre><details><summary>查看内容指纹</summary><code>{anchor.blob_sha256}</code></details></figure>))}
            {!readEvent.claims.some(claim => claim.anchors.length) && <p>当前没有可展开的证据位置。</p>}
            <small>证据位置与指纹留在本机，不随静态展览导出。</small>
          </aside>
        </div>
        </SavedStory>
      </div>}

    </dialog>
  </main>;
}
