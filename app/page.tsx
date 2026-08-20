"use client";

import { useState } from "react";

type View = "cover" | "owner" | "visitor";
type Section = "overview" | "import" | "review" | "curate";

const events = [
  {
    date: "2024.02",
    title: "第一次把 AI 工具交给真实用户",
    summary: "从需求确认、原型迭代到现场培训，一次交付留下了完整的证据链。",
    status: "待核验",
    evidence: 12,
    accent: "coral",
  },
  {
    date: "2024.06",
    title: "从一次交付，走向可复用的平台",
    summary: "项目文档与代码记录显示，关注点开始从单点功能转向权限、审计与知识治理。",
    status: "已确认",
    evidence: 31,
    accent: "blue",
  },
  {
    date: "2025.06",
    title: "在分享中找到自己的方法",
    summary: "演讲稿、照片与会后笔记共同记录了第一次向更多人讲述企业 AI 实践。",
    status: "已确认",
    evidence: 18,
    accent: "ochre",
  },
  {
    date: "2026.06",
    title: "决定重新选择职业方向",
    summary: "一组相互关联的笔记被聚合为转折事件，但其中两条动机判断仍需本人确认。",
    status: "有存疑",
    evidence: 24,
    accent: "violet",
  },
];

const navItems: Array<{ id: Section; label: string; glyph: string; count?: number }> = [
  { id: "overview", label: "建馆概览", glyph: "⌂" },
  { id: "import", label: "导入资料", glyph: "＋" },
  { id: "review", label: "事件审阅", glyph: "✓", count: 3 },
  { id: "curate", label: "策展工作台", glyph: "◇" },
];

export default function Home() {
  const [view, setView] = useState<View>("cover");
  const [section, setSection] = useState<Section>("overview");

  if (view === "cover") {
    return (
      <main className="cover-shell">
        <header className="cover-nav">
          <button className="brand" aria-label="Digital Museum 首页">
            <span className="brand-mark"><i /></span>
            <span>Digital Museum</span>
          </button>
          <div className="cover-nav-actions">
            <span className="concept-pill">交互概念演示 · 示例数据</span>
            <button className="text-button" onClick={() => setView("visitor")}>访客预览 <span>↗</span></button>
          </div>
        </header>

        <section className="cover-hero">
          <div className="cover-copy">
            <p className="eyebrow"><span /> YOUR LIFE, CURATED</p>
            <h1>把散落的数字痕迹，<br /><em>变成你的人生博物馆。</em></h1>
            <p className="lead">
              Digital Museum 不是另一个知识库。它先用证据还原发生过的事，
              再由你决定，哪些故事值得被展出。
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => setView("owner")}>
                开始 3 分钟演示 <span>→</span>
              </button>
              <button className="secondary-button" onClick={() => setView("visitor")}>先看最终展览</button>
            </div>
            <div className="trust-note">
              <span className="shield-glyph">◒</span>
              <p><strong>Local-first</strong><br />资料默认留在本地，AI 推断永远不会伪装成事实。</p>
            </div>
          </div>

          <div className="museum-preview" aria-label="事件形成过程预览">
            <div className="preview-topline">
              <span>正在形成的事件</span>
              <span className="live-dot">本地分析中</span>
            </div>
            <div className="preview-date">2024 / 02</div>
            <div className="artifact-stack">
              <article className="artifact-card note-artifact">
                <span className="artifact-label">NOTE · 02.18</span>
                <p>“终于把第一版流程跑通了，明天和客户一起验证。”</p>
                <div className="note-lines"><i /><i /><i /></div>
              </article>
              <article className="artifact-card photo-artifact">
                <div className="abstract-photo">
                  <span className="screen-shape" />
                  <span className="person-shape one" />
                  <span className="person-shape two" />
                </div>
                <span className="artifact-label">PHOTO · 02.28</span>
              </article>
              <article className="artifact-card code-artifact">
                <span className="artifact-label">WORK · delivery-log.md</span>
                <code><b>✓</b> prototype ready<br /><b>✓</b> user training<br /><b>+</b> feedback captured</code>
              </article>
            </div>
            <div className="event-emerges">
              <span className="emerge-icon">✦</span>
              <div><small>候选事件 · 可信度 82%</small><strong>第一次把 AI 工具<br />交给真实用户</strong></div>
              <button aria-label="查看候选事件" onClick={() => { setView("owner"); setSection("review"); }}>→</button>
            </div>
            <div className="preview-caption">3 份资料 → 4 条主张 → 1 个候选事件</div>
          </div>
        </section>

        <section className="difference-strip">
          <div className="difference-intro">
            <span>01</span>
            <p>它不急着替你讲故事，<br /><strong>先把事实讲清楚。</strong></p>
          </div>
          <div className="chain">
            {["证据 Evidence", "主张 Claim", "事件 Event", "展览 Exhibition"].map((item, index) => (
              <div className="chain-item" key={item}>
                <i>{index + 1}</i><span>{item}</span>{index < 3 && <b>→</b>}
              </div>
            ))}
          </div>
          <div className="truth-key">
            <span><i className="fact" />事实</span>
            <span><i className="inference" />AI 推断</span>
            <span><i className="unknown" />证据不足</span>
          </div>
        </section>
      </main>
    );
  }

  if (view === "visitor") {
    return (
      <main className="visitor-placeholder">
        <button className="return-owner" onClick={() => setView("owner")}>← 返回馆主模式</button>
        <div>
          <p>PRIVATE EXHIBITION · 01</p>
          <h1>向未知处<br /><em>生长</em></h1>
          <span>一位 AI 实践者的 30 个月</span>
          <button onClick={() => setView("owner")}>进入展览 <b>↓</b></button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand sidebar-brand" onClick={() => setView("cover")}>
          <span className="brand-mark"><i /></span><span>Digital Museum</span>
        </button>
        <div className="museum-owner">
          <span className="owner-avatar">林</span>
          <div><strong>林然的博物馆</strong><small>AI 人生档案馆</small></div>
          <button aria-label="更多选项">···</button>
        </div>
        <nav className="side-nav" aria-label="产品演示导航">
          <p>建馆</p>
          {navItems.map((item) => (
            <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
              <span>{item.glyph}</span>{item.label}{item.count && <i>{item.count}</i>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="preview-exhibition" onClick={() => setView("visitor")}><span>◫</span> 预览我的展览 <b>↗</b></button>
          <div className="local-state"><i />所有资料已在本地保存</div>
          <button className="demo-help">? <span>演示说明</span></button>
        </div>
      </aside>

      <section className="app-content">
        <header className="app-topbar">
          <div><span className="mobile-mark">DM</span><p>阶段性建馆</p><b>/</b><strong>{navItems.find((n) => n.id === section)?.label}</strong></div>
          <div><span className="scope-tag">MVP 验证范围</span><button className="icon-button" aria-label="通知">◌<i /></button><button className="avatar-button">林</button></div>
        </header>

        <div className="overview-content">
          <section className="welcome-row">
            <div>
              <p className="section-kicker">GOOD EVENING, LIN RAN</p>
              <h1>你的数字痕迹，正在成为<em>可核验的历史。</em></h1>
              <p>当前建馆范围：2024.02 — 2026.08 · AI 职业旅程</p>
            </div>
            <button className="import-button" onClick={() => setSection("import")}><span>＋</span> 导入新资料</button>
          </section>

          <section className="journey-card">
            <div className="journey-head">
              <div><span className="spark">✦</span><div><strong>本次建馆进度</strong><p>642 份资料已完成本地分析</p></div></div>
              <span className="progress-value">72%</span>
            </div>
            <div className="progress-line"><i /></div>
            <div className="journey-steps">
              <button className="done"><i>✓</i><span>导入资料<small>照片、笔记、工作文档</small></span></button>
              <b>→</b>
              <button className="done"><i>✓</i><span>AI 整理<small>聚合出 8 个候选事件</small></span></button>
              <b>→</b>
              <button className="current" onClick={() => setSection("review")}><i>3</i><span>事件审阅<small>还有 3 个等待你核验</small></span></button>
              <b>→</b>
              <button onClick={() => setSection("curate")}><i>4</i><span>策展<small>由你决定什么值得展出</small></span></button>
            </div>
          </section>

          <section className="stat-grid">
            <article><span>原始证据</span><strong>642</strong><small><i className="up">↑ 86</i> 本次新增</small><b className="stat-glyph">▥</b></article>
            <article><span>候选事件</span><strong>8</strong><small>跨越 <i>30 个月</i></small><b className="stat-glyph">✦</b></article>
            <article className="attention"><span>待处理主张</span><strong>5</strong><small><i>2 条</i> 涉及动机推断</small><b className="stat-glyph">!</b></article>
            <article><span>已确认事件</span><strong>5</strong><small>可进入策展工作台</small><b className="stat-glyph">✓</b></article>
          </section>

          <section className="event-section">
            <div className="section-title-row"><div><p>事件时间轴</p><h2>AI 正在等待你确认的历史</h2></div><button onClick={() => setSection("review")}>查看全部 8 个事件 →</button></div>
            <div className="timeline-line" />
            <div className="event-grid">
              {events.map((event, index) => (
                <button className="event-card" key={event.title} onClick={() => setSection("review")}>
                  <span className={`event-node ${event.accent}`}><i /></span>
                  <div className="event-meta"><span>{event.date}</span><i className={event.status === "已确认" ? "confirmed" : event.status === "有存疑" ? "disputed" : "pending"}>{event.status}</i></div>
                  <h3>{event.title}</h3><p>{event.summary}</p>
                  <footer><span>▥ {event.evidence} 份证据</span><b>{index === 0 ? "开始核验 →" : "查看事件 →"}</b></footer>
                </button>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
