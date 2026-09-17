"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { listStoryDrafts, type StoryDraft } from "../phase0-api";

const sourceLabels = { user: "你的原话", assistant: "助手当时的说明", document: "项目记录" };
const pad = (value: number) => String(value).padStart(2, "0");
function sourceDate(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf()) ? timestamp : date.toLocaleDateString("zh-CN");
}

/** 读取本地已经保存的草稿，不在浏览时生成、确认或修改档案。 */
type StoryCover = { image: string; alt: string };

export function SavedStory({ projectKey, preferredStoryId, cover, children }: { projectKey: string; preferredStoryId?: string; cover?: StoryCover; children: ReactNode }) {
  const [drafts, setDrafts] = useState<StoryDraft[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"experience" | "story" | "records">("experience");
  const [storyId, setStoryId] = useState("");

  useEffect(() => {
    let active = true;
    listStoryDrafts(projectKey).then(stories => {
      if (active) { setDrafts(stories); setLoading(false); }
    }).catch(() => {
      if (active) { setError("故事草稿暂时无法读取，你仍可以查看原始记录。"); setLoading(false); }
    });
    return () => { active = false; };
  }, [projectKey]);

  const story = drafts.find(draft => draft.id === (storyId || preferredStoryId)) ?? drafts[0];
  const readingMode = mode === "experience" && !story?.exhibit ? "story" : mode;
  return <>
    {loading && <p className="depth-story-notice" role="status">正在读取已保存的故事…</p>}
    {error && <p className="depth-story-notice" role="alert">{error}</p>}
    {story && <nav className="depth-reading-mode" aria-label="项目阅读方式">
      {story.exhibit && <button type="button" aria-pressed={readingMode === "experience"} onClick={() => setMode("experience")}>这段经历</button>}
      <button type="button" aria-pressed={readingMode === "story"} onClick={() => setMode("story")}>阶段故事</button>
      <button type="button" aria-pressed={readingMode === "records"} onClick={() => setMode("records")}>原始记录</button>
      <span>已保存草稿 · 待本人确认</span>
    </nav>}
    {story && readingMode !== "records" ? <>
      {drafts.length > 1 && <label className="depth-story-picker">已保存的故事 <select value={story.id} onChange={event => setStoryId(event.target.value)}>
        {drafts.map(draft => <option key={draft.id} value={draft.id}>{draft.title}</option>)}
      </select></label>}
      {readingMode === "experience" ? <ExperienceContent story={story} cover={cover}/> : <StoryContent key={story.id} story={story} cover={cover}/>}
    </> : children}
  </>;
}

function ExperienceContent({ story, cover }: { story: StoryDraft; cover?: StoryCover }) {
  const exhibit = story.exhibit!;
  const actors = { user: "我的目标与选择", agent: "Agent 的执行", record: "记录中的结果" };
  const ids = new Set([exhibit.source_ids, exhibit.goal.source_ids, ...exhibit.process.map(part => part.source_ids), exhibit.result.source_ids].flat());
  const sources = story.sources.filter(source => ids.has(source.id));
  const renderPart = (part: typeof exhibit.goal) => <>
    <span className="depth-experience-actor">{actors[part.actor]}</span><p>{part.text}</p>
    <small>出处 {part.source_ids.join(" · ")}</small>
  </>;
  return <section className="depth-experience" aria-label="经历的目标、过程与结果">
    <header className="depth-experience-head"><div><span className="depth-eyebrow">THE WORK BEHIND IT · 待本人确认</span><h3>{exhibit.title}</h3>
      <p>{exhibit.starts_on} — {exhibit.ends_on} · 从当时的目标，回看事情如何推进</p></div>
      {cover && <ReaderCover cover={cover}/>}
    </header>
    <div className="depth-reader-layout depth-story-layout">
      <article className="depth-reader-main depth-experience-prose">
        <section><span className="depth-eyebrow">01 · 目标</span><h4>当时想解决什么</h4>{renderPart(exhibit.goal)}</section>
        <section><span className="depth-eyebrow">02 · 过程</span><h4>怎么一步步推进</h4><ol>{exhibit.process.map((part, index) => <li key={index}>{renderPart(part)}</li>)}</ol></section>
        <section><span className="depth-eyebrow">03 · 结果</span><h4>做到了哪里</h4>{renderPart(exhibit.result)}</section>
        <p className="depth-experience-boundary">这是一段已保存的经历草稿，时间范围独立于本次选展。未确认叙述不进入原始记录导出。</p>
      </article>
      <aside className="depth-reader-evidence depth-story-sources" aria-label="经历出处"><span className="depth-eyebrow">BACK TO THE SOURCE</span><h4>原话与留下的记录</h4>
        <p>这里分开保留你的表达、助手说明与项目材料。</p>
        {sources.map(source => <figure className="depth-story-source" key={source.id}><figcaption>{source.id} · {sourceLabels[source.role]}<time dateTime={source.timestamp}>{sourceDate(source.timestamp)}</time></figcaption>
          {source.quote && <blockquote>{source.quote}</blockquote>}
          <details><summary>{source.quote ? "查看完整出处" : "展开原始记录"}</summary><pre>{source.text}</pre><small>{source.filename} · 第 {source.line} 行</small></details>
        </figure>)}
      </aside>
    </div>
  </section>;
}

function ReaderCover({ cover }: { cover: StoryCover }) {
  return <figure className="depth-reader-cover">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={cover.image} alt={cover.alt}/>
  </figure>;
}

function StoryContent({ story, cover }: { story: StoryDraft; cover?: StoryCover }) {
  const [chapterIndex, setChapterIndex] = useState(0);
  const chapter = story.chapters[chapterIndex];
  const chapterNav = useRef<HTMLElement>(null);
  const chapterHeading = useRef<HTMLHeadingElement>(null);
  const previousChapter = useRef(chapterIndex);
  const sources = chapter.source_ids.map(id => story.sources.find(source => source.id === id)!).filter(Boolean);
  const standaloneQuotes = new Set(sources.map(source => source.quote).filter(Boolean));

  useEffect(() => {
    const selected = chapterNav.current?.querySelector<HTMLElement>('[aria-current="step"]');
    if (selected && chapterNav.current) chapterNav.current.scrollLeft = selected.offsetLeft - chapterNav.current.offsetLeft - 24;
    if (previousChapter.current !== chapterIndex) {
      chapterHeading.current?.focus({ preventScroll: true });
      chapterHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
      previousChapter.current = chapterIndex;
    }
  }, [chapterIndex]);

  return <section className="depth-story" aria-label="已保存的阶段故事">
    <header className="depth-story-head"><div><span className="depth-eyebrow">A STORY IN THE MAKING · 待本人确认</span>
      <h3>{story.title}</h3><p>完整项目故事 · {story.starts_on} — {story.ends_on} · {story.chapters.length} 章</p>
      <p className="depth-story-scope">这份已保存的故事独立于本次日期筛选。叙述为待确认草稿，原话保留出处；当前导出仅包含勾选的原始记录。</p></div>
      {cover && <ReaderCover cover={cover}/>}
    </header>
    <nav ref={chapterNav} className="depth-record-nav depth-chapter-nav" aria-label="故事章节">
      {story.chapters.map((item, index) => <button type="button" key={item.id} aria-current={chapterIndex === index ? "step" : undefined} onClick={() => setChapterIndex(index)}>
        <small>{pad(index + 1)}</small><span>{item.title}</span>
      </button>)}
    </nav>
    <div className="depth-reader-layout depth-story-layout" key={chapter.id}>
      <article className="depth-reader-main depth-story-prose">
        <p className="depth-eyebrow">CHAPTER {pad(chapterIndex + 1)} / {pad(story.chapters.length)}</p>
        <h4 ref={chapterHeading} tabIndex={-1}>{chapter.title}</h4>
        {chapter.paragraphs.map((paragraph, index) => standaloneQuotes.has(paragraph)
          ? <blockquote key={index}>{paragraph}</blockquote> : <p key={index}>{paragraph}</p>)}
        <div className="depth-story-pagination"><button type="button" aria-label="上一章" disabled={chapterIndex === 0} onClick={() => setChapterIndex(chapterIndex - 1)}>← 上一章</button>
          <span>{pad(chapterIndex + 1)} / {pad(story.chapters.length)}</span>
          <button type="button" aria-label="下一章" disabled={chapterIndex === story.chapters.length - 1} onClick={() => setChapterIndex(chapterIndex + 1)}>下一章 →</button></div>
      </article>
      <aside className="depth-reader-evidence depth-story-sources" aria-label="本章出处"><span className="depth-eyebrow">WORDS YOU LEFT BEHIND</span><h4>当时留下的话</h4>
        <p>引文逐字保留。助手说明与项目记录单独标明，不替代你的确认。</p>
        {sources.map(source => <figure key={source.id} className="depth-story-source">
          <figcaption>{sourceLabels[source.role]}<time dateTime={source.timestamp}>{sourceDate(source.timestamp)}</time></figcaption>
          {source.quote && <blockquote>{source.quote}</blockquote>}
          <details><summary>{source.quote ? "查看完整出处" : "展开原始记录"}</summary><pre>{source.text}</pre>
            <small>{source.filename} · 第 {source.line} 行</small>
          </details>
        </figure>)}
      </aside>
    </div>
    {story.open_questions.length > 0 && <details className="depth-story-questions"><summary>留给自己补充的空白 · {story.open_questions.length} 项</summary>
      <ul>{story.open_questions.map(question => <li key={question}>{question}</li>)}</ul>
    </details>}
  </section>;
}
