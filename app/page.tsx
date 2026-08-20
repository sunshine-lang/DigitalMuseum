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
  const [importState, setImportState] = useState<"choose" | "scanning" | "done">("choose");
  const [sources, setSources] = useState(["照片", "笔记", "工作文档"]);
  const [claimDecision, setClaimDecision] = useState<"pending" | "confirmed" | "disputed">("pending");
  const [eventConfirmed, setEventConfirmed] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState(0);
  const [curatedEvents, setCuratedEvents] = useState([0, 1, 2]);
  const [evidenceDrawer, setEvidenceDrawer] = useState(false);
  const [toast, setToast] = useState("");

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
      <VisitorExhibition
        onReturn={() => setView("owner")}
        evidenceOpen={evidenceDrawer}
        setEvidenceOpen={setEvidenceDrawer}
      />
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

        {section === "overview" && <div className="overview-content">
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
        </div>}

        {section === "import" && (
          <ImportSection
            state={importState}
            sources={sources}
            toggleSource={(source) => setSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source])}
            onScan={() => {
              setImportState("scanning");
              window.setTimeout(() => setImportState("done"), 1500);
            }}
            onReview={() => setSection("review")}
            onReset={() => setImportState("choose")}
          />
        )}

        {section === "review" && (
          <ReviewSection
            activeEvidence={activeEvidence}
            setActiveEvidence={setActiveEvidence}
            claimDecision={claimDecision}
            setClaimDecision={setClaimDecision}
            eventConfirmed={eventConfirmed}
            onConfirm={() => {
              setEventConfirmed(true);
              setToast("事件已确认，并保留了本次修订记录");
              window.setTimeout(() => setToast(""), 2600);
            }}
            onCurate={() => setSection("curate")}
          />
        )}

        {section === "curate" && (
          <CurateSection
            selected={curatedEvents}
            toggle={(index) => setCuratedEvents((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}
            onPreview={() => setView("visitor")}
          />
        )}
      </section>
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

function ImportSection({
  state,
  sources,
  toggleSource,
  onScan,
  onReview,
  onReset,
}: {
  state: "choose" | "scanning" | "done";
  sources: string[];
  toggleSource: (source: string) => void;
  onScan: () => void;
  onReview: () => void;
  onReset: () => void;
}) {
  const sourceOptions = [
    { name: "照片", count: "286 张", detail: "时间、地点与相册信息", glyph: "▧", color: "blue" },
    { name: "笔记", count: "146 篇", detail: "Markdown 与纯文本", glyph: "≡", color: "coral" },
    { name: "工作文档", count: "73 份", detail: "项目记录与交付材料", glyph: "▤", color: "ochre" },
  ];

  return (
    <div className="workspace-content import-workspace">
      <header className="workspace-heading">
        <div>
          <p className="section-kicker">BUILD A PHASE</p>
          <h1>圈定一段时间，<em>开始阶段性建馆。</em></h1>
          <p>演示只读取照片、笔记与工作文档；你的原始文件不会被移动或修改。</p>
        </div>
        <span className="privacy-badge"><i />本地处理</span>
      </header>

      <div className="mini-flow" aria-label="建馆流程">
        <span className={state === "choose" ? "active" : "done"}><i>{state === "choose" ? "1" : "✓"}</i>选择资料</span><b>—</b>
        <span className={state === "scanning" ? "active" : state === "done" ? "done" : ""}><i>{state === "done" ? "✓" : "2"}</i>本地分析</span><b>—</b>
        <span className={state === "done" ? "active" : ""}><i>3</i>查看候选事件</span>
      </div>

      {state === "choose" && (
        <section className="import-panel">
          <div className="range-row">
            <div>
              <span className="field-label">建馆主题</span>
              <button className="select-field"><span>AI 职业旅程</span><b>⌄</b></button>
            </div>
            <div>
              <span className="field-label">时间范围</span>
              <button className="select-field"><span>2024.02.01</span><i>→</i><span>2026.08.20</span><b>⌄</b></button>
            </div>
          </div>

          <div className="source-title">
            <div><strong>选择资料来源</strong><span>已发现 505 份可用资料</span></div>
            <button onClick={() => sourceOptions.forEach((source) => !sources.includes(source.name) && toggleSource(source.name))}>全选</button>
          </div>
          <div className="source-grid">
            {sourceOptions.map((source) => {
              const selected = sources.includes(source.name);
              return (
                <button key={source.name} className={`source-card ${selected ? "selected" : ""}`} onClick={() => toggleSource(source.name)}>
                  <span className={`source-icon ${source.color}`}>{source.glyph}</span>
                  <div><strong>{source.name}</strong><small>{source.detail}</small></div>
                  <span className="source-count">{source.count}</span>
                  <i className="source-check">{selected ? "✓" : ""}</i>
                </button>
              );
            })}
          </div>

          <aside className="boundary-note">
            <span>i</span>
            <div><strong>这次不会导入什么？</strong><p>聊天记录持续同步、云盘自动抓取与人脸识别不在当前验证范围。演示仅模拟手动导入。</p></div>
          </aside>

          <footer className="import-footer">
            <div><span>{sources.length}</span> 类资料 · 约 <strong>{sources.length === 3 ? "505" : sources.length === 2 ? "359" : sources.length === 1 ? "146" : "0"}</strong> 份</div>
            <button className="primary-button" disabled={!sources.length} onClick={onScan}>开始本地分析 <span>→</span></button>
          </footer>
        </section>
      )}

      {state === "scanning" && (
        <section className="scan-panel" aria-live="polite">
          <div className="scan-visual">
            <span className="orbit one" /><span className="orbit two" />
            <span className="scan-core">✦</span>
            <span className="floating-file file-a">NOTE</span>
            <span className="floating-file file-b">PHOTO</span>
            <span className="floating-file file-c">WORK</span>
          </div>
          <p className="section-kicker">LOCAL ANALYSIS</p>
          <h2>正在寻找可以相互印证的痕迹…</h2>
          <p>按时间粗切 → 多模态聚类 → 生成候选主张</p>
          <div className="scan-progress"><i /></div>
          <small>原始文件不会离开你的设备</small>
        </section>
      )}

      {state === "done" && (
        <section className="result-panel">
          <span className="result-mark">✓</span>
          <p className="section-kicker">ANALYSIS COMPLETE</p>
          <h2>从 505 份资料中，发现了 <em>8 个候选事件。</em></h2>
          <p>其中 5 个证据较完整，3 个需要你补充或修正。</p>
          <div className="result-stats">
            <div><strong>642</strong><span>证据片段</span></div>
            <div><strong>29</strong><span>候选主张</span></div>
            <div><strong>8</strong><span>候选事件</span></div>
            <div className="warning"><strong>5</strong><span>待处理主张</span></div>
          </div>
          <div className="result-preview">
            <span className="event-node coral"><i /></span>
            <div><small>最早的候选事件 · 2024.02</small><strong>第一次把 AI 工具交给真实用户</strong><p>12 份证据 · 4 条主张 · 可信度 82%</p></div>
            <button onClick={onReview}>开始核验 →</button>
          </div>
          <div className="result-actions"><button className="secondary-button" onClick={onReset}>重新选择</button><button className="primary-button" onClick={onReview}>进入事件审阅 <span>→</span></button></div>
        </section>
      )}
    </div>
  );
}

function ReviewSection({
  activeEvidence,
  setActiveEvidence,
  claimDecision,
  setClaimDecision,
  eventConfirmed,
  onConfirm,
  onCurate,
}: {
  activeEvidence: number;
  setActiveEvidence: (index: number) => void;
  claimDecision: "pending" | "confirmed" | "disputed";
  setClaimDecision: (value: "pending" | "confirmed" | "disputed") => void;
  eventConfirmed: boolean;
  onConfirm: () => void;
  onCurate: () => void;
}) {
  const evidence = [
    { type: "笔记", name: "02-21 项目复盘.md", date: "2024.02.21 · 23:14", text: "第一版已经能跑通完整流程。明天继续补异常处理，再邀请客户一起验证。", meta: "正文时间与文件创建时间一致", glyph: "≡" },
    { type: "工作文档", name: "delivery-checklist.md", date: "2024.02.28 · 18:06", text: "✓ 原型演示  ✓ 使用培训  ✓ 交付说明  ○ 一个月后效果回访", meta: "最后一项尚无完成证据", glyph: "▤" },
    { type: "照片", name: "IMG_2841.JPG", date: "拍摄于 2024.02.28 · 15:42", text: "现场照片显示两位参会者与投屏中的产品界面。照片本身无法证明培训效果。", meta: "未启用人物身份识别", glyph: "▧" },
  ];

  return (
    <div className="workspace-content review-workspace">
      <header className="review-heading">
        <div>
          <p className="section-kicker">EVENT REVIEW · 01 / 08</p>
          <div className="review-title-line"><h1>第一次把 AI 工具<br /><em>交给真实用户</em></h1><span className={eventConfirmed ? "event-status confirmed" : "event-status"}>{eventConfirmed ? "已确认" : "待核验"}</span></div>
          <p>2024.02.18 — 2024.02.28 · 企业 AI 项目 · 12 份原始证据</p>
        </div>
        <div className="confidence-ring"><span>82<small>%</small></span><p>证据完整度</p></div>
      </header>

      <div className="review-layout">
        <section className="claims-column">
          <div className="column-heading"><div><span>主张 Claims</span><small>4 条 · 1 条需要你判断</small></div><button>什么是主张？</button></div>

          <article className="claim-card fact-claim">
            <div className="claim-tag"><span>● 事实</span><small>2 份证据支持</small></div>
            <p>2 月 21 日，完成了一个可以跑通完整流程的原型。</p>
            <footer><span>依据：项目复盘.md、提交记录</span><button onClick={() => setActiveEvidence(0)}>查看证据</button></footer>
          </article>

          <article className="claim-card fact-claim">
            <div className="claim-tag"><span>● 事实</span><small>3 份证据支持</small></div>
            <p>2 月 28 日，进行了现场演示、使用培训并交付说明文档。</p>
            <footer><span>依据：交付清单、现场照片、会议纪要</span><button onClick={() => setActiveEvidence(1)}>查看证据</button></footer>
          </article>

          <article className={`claim-card inference-claim ${claimDecision !== "pending" ? "decided" : ""}`}>
            <div className="claim-tag"><span>◆ AI 推断</span><small>需要本人判断</small></div>
            <p>这次交付让她第一次相信，自己能够独立完成一款 AI 产品。</p>
            <div className="why-inference"><span>为什么是推断？</span><p>资料记录了“第一次完整交付”，但没有直接表达当时的内心感受。</p></div>
            {claimDecision === "pending" ? (
              <div className="claim-actions"><button onClick={() => setClaimDecision("confirmed")}>✓ 符合我的真实感受</button><button onClick={() => setClaimDecision("disputed")}>× 不准确 / 暂不确定</button></div>
            ) : (
              <div className={`decision-result ${claimDecision}`}><span>{claimDecision === "confirmed" ? "✓ 已由本人确认" : "× 已标记为存疑，不进入事件叙述"}</span><button onClick={() => setClaimDecision("pending")}>修改</button></div>
            )}
          </article>

          <article className="claim-card unknown-claim">
            <div className="claim-tag"><span>○ 证据不足</span><small>保持留白</small></div>
            <p>交付后的一个月，客户工作效率显著提升。</p>
            <footer><span>交付清单显示“效果回访”尚未完成，不能得出结论。</span><button>补充证据</button></footer>
          </article>
        </section>

        <aside className="evidence-column">
          <div className="column-heading"><div><span>原始证据 Evidence</span><small>所有结论都可追溯</small></div><span className="evidence-count">3 / 12</span></div>
          <div className="evidence-tabs">
            {evidence.map((item, index) => (
              <button className={activeEvidence === index ? "active" : ""} key={item.name} onClick={() => setActiveEvidence(index)}>
                <span>{item.glyph}</span><div><strong>{item.type}</strong><small>{item.name}</small></div><i>›</i>
              </button>
            ))}
          </div>
          <article className="evidence-viewer">
            <header><span>{evidence[activeEvidence].glyph}</span><div><strong>{evidence[activeEvidence].name}</strong><small>{evidence[activeEvidence].date}</small></div><button>↗</button></header>
            <div className={`evidence-paper evidence-${activeEvidence}`}>
              <span className="paper-label">{evidence[activeEvidence].type.toUpperCase()} · ORIGINAL</span>
              <p>{evidence[activeEvidence].text}</p>
              {activeEvidence === 0 && <div className="paper-lines"><i /><i /><i /><i /></div>}
              {activeEvidence === 1 && <div className="check-lines"><span>✓ 原型演示</span><span>✓ 使用培训</span><span>✓ 交付说明</span><span>○ 效果回访</span></div>}
              {activeEvidence === 2 && <div className="mini-photo"><i className="mini-screen" /><i className="mini-person a" /><i className="mini-person b" /></div>}
            </div>
            <footer><span>◒ {evidence[activeEvidence].meta}</span><button>查看时间戳详情</button></footer>
          </article>
          <div className="evidence-logic"><strong>✦ AI 为什么把它们聚在一起？</strong><div><span>时间接近 <i>92%</i></span><span>主题相似 <i>88%</i></span><span>实体重合 <i>76%</i></span></div><p>聚类结果只是候选关系，最终事件边界由你确认。</p></div>
        </aside>
      </div>

      <footer className="review-footer">
        <div><button>← 上一个事件</button><span>1 / 8</span><button>下一个事件 →</button></div>
        <div><button className="secondary-button">拆分 / 合并事件</button>{eventConfirmed ? <button className="primary-button" onClick={onCurate}>进入策展 <span>→</span></button> : <button className="primary-button" disabled={claimDecision === "pending"} onClick={onConfirm}>{claimDecision === "pending" ? "请先处理 AI 推断" : "确认这个事件"} <span>✓</span></button>}</div>
      </footer>
    </div>
  );
}

function CurateSection({
  selected,
  toggle,
  onPreview,
}: {
  selected: number[];
  toggle: (index: number) => void;
  onPreview: () => void;
}) {
  const curationEvents = [
    { date: "2024.02", title: "第一次把 AI 工具交给真实用户", chapter: "开始", color: "coral" },
    { date: "2024.06", title: "从一次交付，走向可复用的平台", chapter: "搭建", color: "blue" },
    { date: "2025.06", title: "在分享中找到自己的方法", chapter: "表达", color: "ochre" },
    { date: "2026.06", title: "决定重新选择职业方向", chapter: "转弯", color: "violet" },
    { date: "2026.08", title: "开始建造自己的数字博物馆", chapter: "重启", color: "green" },
  ];
  return (
    <div className="workspace-content curate-workspace">
      <header className="workspace-heading curate-heading">
        <div>
          <div className="alpha-label">PRIVATE ALPHA · 概念预览</div>
          <p className="section-kicker">CURATION STUDIO</p>
          <h1>档案负责还原，<em>策展负责表达。</em></h1>
          <p>AI 可以提出选展理由，但是否展出、如何排序，始终由你决定。</p>
        </div>
        <button className="primary-button" onClick={onPreview}>预览访客视角 <span>↗</span></button>
      </header>

      <div className="curate-layout">
        <section className="curation-list">
          <div className="curate-toolbar"><div><strong>已确认事件</strong><span>选择本次展览的展品</span></div><span>{selected.length} / {curationEvents.length} 已入选</span></div>
          {curationEvents.map((event, index) => {
            const isSelected = selected.includes(index);
            return (
              <button key={event.title} className={`curation-item ${isSelected ? "selected" : ""}`} onClick={() => toggle(index)}>
                <span className={`curation-check ${isSelected ? "checked" : ""}`}>{isSelected ? "✓" : ""}</span>
                <span className={`curation-swatch ${event.color}`}>{event.date.replace(".", "/")}</span>
                <div><small>CHAPTER {String(index + 1).padStart(2, "0")} · {event.chapter}</small><strong>{event.title}</strong><p>已确认事件 · {12 + index * 5} 份证据 · 可追溯</p></div>
                <span className="drag-handle">⠿</span>
              </button>
            );
          })}
          <aside className="curate-boundary"><span>!</span><p><strong>删除展品不会删除档案。</strong> 策展选择与历史记录相互独立，你随时可以用同一批事件创建另一种叙事。</p></aside>
        </section>

        <aside className="exhibition-outline">
          <header><p>EXHIBITION · 01</p><span>草稿已保存</span></header>
          <h2>向未知处<em>生长</em></h2>
          <p className="outline-subtitle">一位 AI 实践者的 30 个月</p>
          <div className="outline-meta"><span>2024.02—2026.08</span><span>{selected.length} 个事件</span><span>私人展览</span></div>
          <div className="outline-rule" />
          <strong className="outline-label">展览结构</strong>
          <div className="chapter-list">
            {curationEvents.filter((_, index) => selected.includes(index)).map((event, index) => (
              <div key={event.title}><span>{String(index + 1).padStart(2, "0")}</span><i className={event.color} /><p>{event.chapter}<small>{event.title}</small></p></div>
            ))}
          </div>
          <button className="outline-preview" onClick={onPreview}>打开沉浸式展览 <span>→</span></button>
          <small className="outline-note">访客只能看到你授权公开的摘要与证据。</small>
        </aside>
      </div>
    </div>
  );
}

function VisitorExhibition({
  onReturn,
  evidenceOpen,
  setEvidenceOpen,
}: {
  onReturn: () => void;
  evidenceOpen: boolean;
  setEvidenceOpen: (open: boolean) => void;
}) {
  return (
    <main className="exhibition">
      <header className="exhibition-nav">
        <button className="exhibition-brand" onClick={onReturn}><span>DM</span><div><strong>DIGITAL MUSEUM</strong><small>PRIVATE EXHIBITION · 01</small></div></button>
        <div><span>林然 · 馆主授权预览</span><button onClick={onReturn}>返回馆主模式</button></div>
      </header>

      <section className="exhibition-cover">
        <div className="cover-index"><span>01</span><i /><small>2024—2026</small></div>
        <div className="exhibition-title">
          <p>AN AI PRACTITIONER&apos;S JOURNEY</p>
          <h1>向未知处<br /><em>生长</em></h1>
          <div><span>一位 AI 实践者的 30 个月</span><small>由 5 个已确认事件与 103 份证据构成</small></div>
        </div>
        <div className="exhibition-object">
          <span className="halo" />
          <article className="floating-note"><small>2024.02.21</small><p>“第一版终于跑通了。”</p></article>
          <article className="floating-frame"><div className="gallery-image"><i /><span className="g-person a" /><span className="g-person b" /></div><small>EVIDENCE 024</small></article>
          <article className="floating-ticket"><small>EVENT / 01</small><strong>第一次<br />真实交付</strong><span>可信事件</span></article>
        </div>
        <a href="#prologue" className="scroll-cue"><span>向下浏览</span><i>↓</i></a>
      </section>

      <section className="prologue" id="prologue">
        <span className="big-number">00</span>
        <div><p>PROLOGUE · 前言</p><h2>成长不是一条被提前画好的路线，<br />而是一些当时看不清意义的<em>真实时刻。</em></h2></div>
        <blockquote>这不是一份“我做过什么”的简历。它保留了成功，也保留证据不足的空白；保留后来讲出的故事，也保留故事发生前的原始痕迹。</blockquote>
      </section>

      <section className="chapter chapter-light">
        <aside><span>CHAPTER</span><strong>01</strong><i /></aside>
        <div className="chapter-copy">
          <p className="chapter-date">2024.02 · BEIJING</p>
          <h2>第一次把 AI 工具<br /><em>交给真实用户</em></h2>
          <p>此前，“产品”更多存在于本地代码和演示环境里。直到这一天，它第一次离开开发者的电脑，进入一个真实工作流程。</p>
          <div className="chapter-tags"><span>事实 3</span><span>本人确认 1</span><span>证据不足 1</span></div>
          <button onClick={() => setEvidenceOpen(true)}>查看策展依据 <span>↗</span></button>
        </div>
        <div className="chapter-artifacts">
          <article className="large-document"><header><span>DELIVERY LOG</span><small>2024 / 02</small></header><h3>从“能运行”到<br />“有人使用”</h3><div className="doc-list"><span><i>✓</i> 原型演示</span><span><i>✓</i> 使用培训</span><span><i>✓</i> 交付说明</span><span className="faded"><i>○</i> 效果回访</span></div><footer>Evidence 018—024</footer></article>
          <div className="artifact-caption"><span>01</span><p>交付记录与现场资料共同证明“交付发生”；<br />但无法单独证明“效果显著”。</p></div>
        </div>
      </section>

      <section className="chapter chapter-dark">
        <aside><span>CHAPTER</span><strong>02</strong><i /></aside>
        <div className="dark-visual">
          <span className="platform-grid" />
          <article className="system-card card-a"><small>ACCESS</small><strong>权限</strong><i>01</i></article>
          <article className="system-card card-b"><small>TRACE</small><strong>引用</strong><i>02</i></article>
          <article className="system-card card-c"><small>AUDIT</small><strong>审计</strong><i>03</i></article>
          <span className="connection l1" /><span className="connection l2" />
        </div>
        <div className="chapter-copy">
          <p className="chapter-date">2024.06 · SYSTEMS</p>
          <h2>从一次交付，<br /><em>走向可复用的平台</em></h2>
          <p>零散的需求开始显露共同结构：知识如何进入系统、回答如何回到原文、谁能够看见什么，以及出现错误后如何追溯。</p>
          <blockquote>“真正难的不是让模型回答，而是让系统对回答负责。”</blockquote>
          <button onClick={() => setEvidenceOpen(true)}>查看 31 份关联证据 <span>↗</span></button>
        </div>
      </section>

      <section className="chapter chapter-turn">
        <aside><span>CHAPTER</span><strong>03</strong><i /></aside>
        <div className="turn-quote"><span>2026 / 06</span><h2>有些转弯，<br />不是因为已经知道答案，<br /><em>而是不愿继续忽略问题。</em></h2></div>
        <div className="turn-note"><p>这一章仍保留两处存疑。关于“为什么离开”的动机，档案只记录当事人后来确认的部分，没有用 AI 猜测补齐。</p><button onClick={() => setEvidenceOpen(true)}>查看事件修订记录 →</button></div>
      </section>

      <section className="epilogue">
        <p>EPILOGUE · 仍在发生</p>
        <h2>博物馆不是终点。<br /><em>它只是让你看见，自己如何走到这里。</em></h2>
        <div><span>下一阶段</span><strong>2026.08 — UNKNOWN</strong><button onClick={onReturn}>回到我的档案 <b>→</b></button></div>
        <footer><span>DIGITAL MUSEUM</span><small>每个结论，都应回到证据。</small><i>EXHIBITION 01 / 01</i></footer>
      </section>

      {evidenceOpen && (
        <div className="evidence-drawer-backdrop" onClick={() => setEvidenceOpen(false)}>
          <aside className="visitor-evidence-drawer" onClick={(event) => event.stopPropagation()}>
            <header><div><p>CURATOR&apos;S NOTE</p><h3>这段叙述从何而来？</h3></div><button onClick={() => setEvidenceOpen(false)}>×</button></header>
            <div className="drawer-chain"><span>3 份证据</span><b>→</b><span>4 条主张</span><b>→</b><span>1 个事件</span></div>
            <article><span className="drawer-tag fact">事实</span><p>完成可运行原型，并在 2 月 28 日进行演示、培训与文档交付。</p><small>来源：项目复盘、交付清单、现场照片</small></article>
            <article><span className="drawer-tag confirmed">本人确认</span><p>“这是我第一次把一套完整的 AI 工作流交到真实用户手中。”</p><small>确认于 2026.08.14 · 保留原始修订记录</small></article>
            <article><span className="drawer-tag unknown">留白</span><p>现有资料无法证明交付后的长期效果，因此未写入展览叙事。</p></article>
            <footer><span>◒ 原始证据未公开</span><p>访客只看到馆主授权的摘要。原始文件仍保留在本地档案中。</p></footer>
          </aside>
        </div>
      )}
    </main>
  );
}
