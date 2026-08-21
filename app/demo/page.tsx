"use client";

import { useState } from "react";
import {
  groundedClaimCount,
  missingRecordCount,
  museumEvents,
  primaryRecordCount,
  sourceRecordCount,
  type ClaimKind,
  type MuseumEvent,
} from "../museum-data";

type View = "cover" | "owner" | "visitor";
type Section = "overview" | "import" | "review" | "curate";

const navItems: Array<{ id: Section; label: string; glyph: string; count?: number }> = [
  { id: "overview", label: "建馆概览", glyph: "⌂" },
  { id: "import", label: "导入资料", glyph: "＋" },
  { id: "review", label: "事件审阅", glyph: "✓", count: museumEvents.length },
  { id: "curate", label: "策展工作台", glyph: "◇" },
];

export default function Home() {
  const [view, setView] = useState<View>("cover");
  const [section, setSection] = useState<Section>("overview");
  const [importState, setImportState] = useState<"choose" | "scanning" | "done">("choose");
  const [sources, setSources] = useState(["一手记录", "本人陈述", "缺失原件"]);
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [claimDecision, setClaimDecision] = useState<"pending" | "confirmed" | "disputed">("pending");
  const [eventConfirmed, setEventConfirmed] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState(0);
  const [curatedEvents, setCuratedEvents] = useState([0, 3, 5, 6, 7]);
  const [evidenceDrawer, setEvidenceDrawer] = useState(false);
  const [toast, setToast] = useState("");

  const openEvent = (index: number) => {
    setSelectedEventIndex(index);
    setActiveEvidence(0);
    setClaimDecision("pending");
    setEventConfirmed(false);
    setSection("review");
  };

  if (view === "cover") {
    return (
      <main className="cover-shell">
        <header className="cover-nav">
          <button className="brand" aria-label="Digital Museum 首页">
            <span className="brand-mark"><i /></span>
            <span>Digital Museum</span>
          </button>
          <div className="cover-nav-actions">
            <span className="concept-pill">真实会话档案 · 原始证据待补</span>
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
                <span className="artifact-label">PROFILE · CAREER RECORD</span>
                <p>搭建、部署、测试、优化，并完成用户培训。</p>
                <div className="note-lines"><i /><i /><i /></div>
              </article>
              <article className="artifact-card photo-artifact">
                <div className="abstract-photo">
                  <span className="screen-shape" />
                  <span className="person-shape one" />
                  <span className="person-shape two" />
                </div>
                <span className="artifact-label">PROJECT · AZURE OPENAI</span>
              </article>
              <article className="artifact-card code-artifact">
                <span className="artifact-label">RESULT · USER-STATED</span>
                <code><b>↗</b> 20 万 → 100 万字 / 周<br /><b>↗</b> 字数统计效率 +80%<br /><b>○</b> 原始测试报告待补</code>
              </article>
            </div>
            <div className="event-emerges">
              <span className="emerge-icon">✦</span>
              <div><small>候选事件 · 用户已陈述</small><strong>交付 Azure OpenAI<br />翻译助手</strong></div>
              <button aria-label="查看候选事件" onClick={() => { setView("owner"); openEvent(0); }}>→</button>
            </div>
            <div className="preview-caption">3 条来源记录 → 5 条主张 → 1 个待补原件事件</div>
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
          <span className="owner-avatar">袁</span>
          <div><strong>小袁的博物馆</strong><small>AI 人生档案馆</small></div>
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
          <div className="local-state"><i />真实会话摘要已载入 · 原件待补</div>
          <button className="demo-help">? <span>演示说明</span></button>
        </div>
      </aside>

      <section className="app-content">
        <header className="app-topbar">
          <div><span className="mobile-mark">DM</span><p>阶段性建馆</p><b>/</b><strong>{navItems.find((n) => n.id === section)?.label}</strong></div>
          <div><span className="scope-tag">真实数据校对版</span><button className="icon-button" aria-label="通知">◌<i /></button><button className="avatar-button">袁</button></div>
        </header>

        {section === "overview" && <div className="overview-content">
          <section className="welcome-row">
            <div>
              <p className="section-kicker">GOOD EVENING, XIAO YUAN</p>
              <h1>你的数字痕迹，正在成为<em>可核验的历史。</em></h1>
              <p>当前建馆范围：2024.02 — 2026.08 · 真实对话与项目记录 · 原始文件尚未完整导入</p>
            </div>
            <button className="import-button" onClick={() => setSection("import")}><span>＋</span> 导入新资料</button>
          </section>

          <section className="journey-card">
            <div className="journey-head">
              <div><span className="spark">✦</span><div><strong>真实数据首轮审计</strong><p>{sourceRecordCount} 条来源记录已整理为 {museumEvents.length} 个候选事件</p></div></div>
              <span className="progress-value">{museumEvents.length}/{museumEvents.length}</span>
            </div>
            <div className="progress-line"><i /></div>
            <div className="journey-steps">
              <button className="done"><i>✓</i><span>载入摘要<small>过往对话、项目文档、部署记录</small></span></button>
              <b>→</b>
              <button className="done"><i>✓</i><span>提取主张<small>{groundedClaimCount} 条可定位事实或本人陈述</small></span></button>
              <b>→</b>
              <button className="current" onClick={() => openEvent(0)}><i>3</i><span>事件审阅<small>{missingRecordCount} 类原始证据等待补充</small></span></button>
              <b>→</b>
              <button onClick={() => setSection("curate")}><i>4</i><span>策展<small>由你决定什么值得展出</small></span></button>
            </div>
          </section>

          <section className="stat-grid">
            <article><span>来源记录</span><strong>{sourceRecordCount}</strong><small>按事件建模后的真实记录</small><b className="stat-glyph">▥</b></article>
            <article><span>候选事件</span><strong>{museumEvents.length}</strong><small>跨越 <i>30 个月</i></small><b className="stat-glyph">✦</b></article>
            <article className="attention"><span>待补原始证据</span><strong>{missingRecordCount}</strong><small>报告、部署或活动材料</small><b className="stat-glyph">!</b></article>
            <article><span>一手记录</span><strong>{primaryRecordCount}</strong><small>时间戳对话、文档与数据记录</small><b className="stat-glyph">✓</b></article>
          </section>

          <section className="event-section">
            <div className="section-title-row"><div><p>真实事件时间轴</p><h2>从过往对话中整理出的候选历史</h2></div><button onClick={() => openEvent(0)}>从第一个事件开始审阅 →</button></div>
            <div className="event-grid">
              {museumEvents.map((event, index) => (
                <button className="event-card" key={event.id} onClick={() => openEvent(index)}>
                  <span className={`event-node ${event.accent}`}><i /></span>
                  <div className="event-meta"><span>{event.date}</span><i className={event.statusClass}>{event.status}</i></div>
                  <h3>{event.title}</h3><p>{event.summary}</p>
                  <footer><span>▥ {event.evidence.length} 条来源记录</span><b>{index === 0 ? "开始核验 →" : "查看事件 →"}</b></footer>
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
          <RealReviewSection
            event={museumEvents[selectedEventIndex]}
            eventIndex={selectedEventIndex}
            activeEvidence={activeEvidence}
            setActiveEvidence={setActiveEvidence}
            claimDecision={claimDecision}
            setClaimDecision={setClaimDecision}
            eventConfirmed={eventConfirmed}
            onConfirm={() => {
              setEventConfirmed(true);
              setToast("事件边界已确认；事实层级与缺失证据保持不变");
              window.setTimeout(() => setToast(""), 2600);
            }}
            onNavigate={openEvent}
            onCurate={() => setSection("curate")}
          />
        )}

        {section === "curate" && (
          <CurateSection
            events={museumEvents}
            selected={curatedEvents}
            toggle={(index) => setCuratedEvents((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}
            onPreview={() => setView("visitor")}
          />
        )}
      </section>
      {toast && <div className="toast" role="status" aria-live="polite"><span>✓</span>{toast}</div>}
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
    { name: "一手记录", count: `${primaryRecordCount} 条`, records: primaryRecordCount, detail: "带时间戳的对话、文档与后台数据", glyph: "⌁", color: "blue" },
    { name: "本人陈述", count: "6 条", records: 6, detail: "个人项目履历与过往经历摘要", glyph: "≡", color: "coral" },
    { name: "缺失原件", count: `${missingRecordCount} 条`, records: missingRecordCount, detail: "只保留证据缺口，不生成替代内容", glyph: "○", color: "ochre" },
  ];
  const selectedRecords = sourceOptions
    .filter((source) => sources.includes(source.name))
    .reduce((total, source) => total + source.records, 0);

  return (
    <div className="workspace-content import-workspace">
      <header className="workspace-heading">
        <div>
          <p className="section-kicker">BUILD A PHASE</p>
          <h1>校对这批真实记录，<em>开始阶段性建馆。</em></h1>
          <p>本批数据来自过往会话、个人项目文档与部署记录；没有找到的原始文件会明确标记为缺失。</p>
        </div>
        <span className="privacy-badge"><i />人工整理 · 非自动同步</span>
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
              <button className="select-field"><span>2024.02</span><i>→</i><span>2026.08.20</span><b>⌄</b></button>
            </div>
          </div>

          <div className="source-title">
            <div><strong>选择记录层级</strong><span>已建模 {sourceRecordCount} 条真实来源记录</span></div>
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
            <div><strong>当前数据边界</strong><p>这里展示的是从会话上下文人工整理出的结构化记录，不代表 ChatGPT Adapter、持续同步或自动抓取已经实现；原始照片、仓库、测试报告与客户材料仍需手动导入。</p></div>
          </aside>

          <footer className="import-footer">
            <div><span>{sources.length}</span> 类来源 · <strong>{selectedRecords}</strong> 条记录</div>
            <button className="primary-button" disabled={!sources.length} onClick={onScan}>重新生成候选事件 <span>→</span></button>
          </footer>
        </section>
      )}

      {state === "scanning" && (
        <section className="scan-panel" aria-live="polite">
          <div className="scan-visual">
            <span className="orbit one" /><span className="orbit two" />
            <span className="scan-core">✦</span>
            <span className="floating-file file-a">CHAT</span>
            <span className="floating-file file-b">DOC</span>
            <span className="floating-file file-c">DEPLOY</span>
          </div>
          <p className="section-kicker">LOCAL ANALYSIS</p>
          <h2>正在重新核对时间、陈述与来源…</h2>
          <p>加载会话摘要 → 提取可追溯陈述 → 标记缺失证据</p>
          <div className="scan-progress"><i /></div>
          <small>不会把“用户问过”写成“用户做过”</small>
        </section>
      )}

      {state === "done" && (
        <section className="result-panel">
          <span className="result-mark">✓</span>
          <p className="section-kicker">ANALYSIS COMPLETE</p>
          <h2>从 {sourceRecordCount} 条来源记录中，整理出 <em>{museumEvents.length} 个候选事件。</em></h2>
          <p>{primaryRecordCount} 条一手记录可直接定位，{missingRecordCount} 类关键原件仍需补充。</p>
          <div className="result-stats">
            <div><strong>{sourceRecordCount}</strong><span>来源记录</span></div>
            <div><strong>{groundedClaimCount}</strong><span>事实 / 本人陈述</span></div>
            <div><strong>{museumEvents.length}</strong><span>候选事件</span></div>
            <div className="warning"><strong>{missingRecordCount}</strong><span>待补原件</span></div>
          </div>
          <div className="result-preview">
            <span className="event-node coral"><i /></span>
            <div><small>最早的候选事件 · 2024.02</small><strong>交付 Azure OpenAI 翻译助手</strong><p>3 条来源记录 · 5 条主张 · 原始测试报告待补</p></div>
            <button onClick={onReview}>开始核验 →</button>
          </div>
          <div className="result-actions"><button className="secondary-button" onClick={onReset}>重新选择</button><button className="primary-button" onClick={onReview}>进入事件审阅 <span>→</span></button></div>
        </section>
      )}
    </div>
  );
}

function RealReviewSection({
  event,
  eventIndex,
  activeEvidence,
  setActiveEvidence,
  claimDecision,
  setClaimDecision,
  eventConfirmed,
  onConfirm,
  onNavigate,
  onCurate,
}: {
  event: MuseumEvent;
  eventIndex: number;
  activeEvidence: number;
  setActiveEvidence: (index: number) => void;
  claimDecision: "pending" | "confirmed" | "disputed";
  setClaimDecision: (value: "pending" | "confirmed" | "disputed") => void;
  eventConfirmed: boolean;
  onConfirm: () => void;
  onNavigate: (index: number) => void;
  onCurate: () => void;
}) {
  const evidence = event.evidence[activeEvidence] ?? event.evidence[0];
  const grounded = event.claims.filter((claim) => claim.kind === "fact" || claim.kind === "user").length;
  const needsDecision = event.claims.some((claim) => claim.kind === "inference");
  const primaryCount = event.evidence.filter((record) => record.level === "primary").length;
  const secondaryCount = event.evidence.filter((record) => record.level === "secondary").length;
  const missingCount = event.evidence.filter((record) => record.level === "missing").length;

  const labels: Record<ClaimKind, string> = {
    fact: "● 可定位事实",
    user: "◆ 用户已陈述",
    inference: "◇ AI 推断",
    unknown: "○ Unknown",
  };
  const classNames: Record<ClaimKind, string> = {
    fact: "fact-claim",
    user: "user-claim",
    inference: "inference-claim",
    unknown: "unknown-claim",
  };

  return (
    <div className="workspace-content review-workspace">
      <header className="review-heading">
        <div>
          <p className="section-kicker">EVENT REVIEW · {String(eventIndex + 1).padStart(2, "0")} / {String(museumEvents.length).padStart(2, "0")}</p>
          <div className="review-title-line">
            <h1>{event.title}</h1>
            <span className={`event-status ${eventConfirmed || event.statusClass === "confirmed" ? "confirmed" : ""}`}>
              {eventConfirmed ? "事件边界已确认" : event.status}
            </span>
          </div>
          <p>{event.period} · {event.category} · {event.evidence.length} 条来源记录</p>
        </div>
        <div className="confidence-ring"><span>{grounded}<small>/{event.claims.length}</small></span><p>主张已定位</p></div>
      </header>

      <div className="review-layout">
        <section className="claims-column">
          <div className="column-heading">
            <div><span>主张 Claims</span><small>{event.claims.length} 条 · {needsDecision ? "1 条推断需要判断" : "无待处理推断"}</small></div>
            <button>事实层级说明</button>
          </div>

          {event.claims.map((claim) => (
            <article key={claim.id} className={`claim-card ${classNames[claim.kind]} ${claim.kind === "inference" && claimDecision !== "pending" ? "decided" : ""}`}>
              <div className="claim-tag">
                <span>{labels[claim.kind]}</span>
                <small>{claim.kind === "fact" ? "有时间戳或文档支持" : claim.kind === "user" ? "来自本人过往陈述" : claim.kind === "inference" ? "不能自动升级为事实" : "证据不足，保持留白"}</small>
              </div>
              <p>{claim.text}</p>
              {claim.note && claim.kind !== "inference" && <div className="why-inference"><span>证据说明</span><p>{claim.note}</p></div>}

              {claim.kind === "inference" ? (
                <>
                  <div className="why-inference"><span>为什么是推断？</span><p>{claim.note ?? "现有来源没有直接表达这一层意义。"}</p></div>
                  {claimDecision === "pending" ? (
                    <div className="claim-actions">
                      <button onClick={() => setClaimDecision("confirmed")}>✓ 符合我的真实判断</button>
                      <button onClick={() => setClaimDecision("disputed")}>× 不准确 / 暂不确定</button>
                    </div>
                  ) : (
                    <div className={`decision-result ${claimDecision}`}>
                      <span>{claimDecision === "confirmed" ? "✓ 已升级为本人确认，不改写为客观事实" : "× 已标记为存疑，不进入展览正文"}</span>
                      <button onClick={() => setClaimDecision("pending")}>修改</button>
                    </div>
                  )}
                </>
              ) : (
                <footer>
                  <span>依据：{claim.source}</span>
                  <button onClick={() => {
                    const index = event.evidence.findIndex((record) => claim.source.includes(record.name.split(" · ")[0]));
                    setActiveEvidence(index >= 0 ? index : 0);
                  }}>{claim.kind === "unknown" ? "查看缺口" : "查看来源"}</button>
                </footer>
              )}
            </article>
          ))}
        </section>

        <aside className="evidence-column">
          <div className="column-heading">
            <div><span>来源记录 Evidence</span><small>区分一手记录、二手陈述与缺失原件</small></div>
            <span className="evidence-count">{event.evidence.length} 条</span>
          </div>
          <div className="evidence-tabs">
            {event.evidence.map((item, index) => (
              <button className={activeEvidence === index ? "active" : ""} key={item.name} onClick={() => setActiveEvidence(index)}>
                <span>{item.glyph}</span><div><strong>{item.type}</strong><small>{item.name}</small></div><i>›</i>
              </button>
            ))}
          </div>
          <article className="evidence-viewer">
            <header><span>{evidence.glyph}</span><div><strong>{evidence.name}</strong><small>{evidence.date}</small></div><button aria-label="来源详情">↗</button></header>
            <div className={`evidence-paper evidence-level-${evidence.level}`}>
              <span className="paper-label">{evidence.type.toUpperCase()} · {evidence.level.toUpperCase()}</span>
              <p>{evidence.text}</p>
              <div className="check-lines evidence-audit-lines">
                <span>{evidence.level === "primary" ? "✓ 一手记录可定位" : evidence.level === "secondary" ? "◆ 本人陈述已收录" : "○ 原始材料缺失"}</span>
                <span>{evidence.level === "missing" ? "○ 不生成替代内容" : "✓ 来源层级已标注"}</span>
              </div>
            </div>
            <footer><span>◒ {evidence.meta}</span><button>查看来源说明</button></footer>
          </article>
          <div className="evidence-logic">
            <strong>✦ 当前事件的证据构成</strong>
            <div><span>一手记录 <i>{primaryCount}</i></span><span>用户陈述 <i>{secondaryCount}</i></span><span>缺失原件 <i>{missingCount}</i></span></div>
            <p>这里的数量来自当前真实数据模型，不代表原始照片、仓库或客户材料已经完成导入。</p>
          </div>
        </aside>
      </div>

      <footer className="review-footer">
        <div>
          <button disabled={eventIndex === 0} onClick={() => onNavigate(eventIndex - 1)}>← 上一个事件</button>
          <span>{eventIndex + 1} / {museumEvents.length}</span>
          <button disabled={eventIndex === museumEvents.length - 1} onClick={() => onNavigate(eventIndex + 1)}>下一个事件 →</button>
        </div>
        <div>
          <button className="secondary-button">拆分 / 合并事件</button>
          {eventConfirmed ? (
            <button className="primary-button" onClick={onCurate}>进入策展 <span>→</span></button>
          ) : (
            <button className="primary-button" disabled={needsDecision && claimDecision === "pending"} onClick={onConfirm}>
              {needsDecision && claimDecision === "pending" ? "请先处理 AI 推断" : "确认事件边界"} <span>✓</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function CurateSection({
  events,
  selected,
  toggle,
  onPreview,
}: {
  events: MuseumEvent[];
  selected: number[];
  toggle: (index: number) => void;
  onPreview: () => void;
}) {
  const curationEvents = events;
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
          <div className="curate-toolbar"><div><strong>真实候选事件</strong><span>待补原件的事件只能进入馆主草稿预览</span></div><span>{selected.length} / {curationEvents.length} 已入选</span></div>
          {curationEvents.map((event, index) => {
            const isSelected = selected.includes(index);
            return (
              <button key={event.title} className={`curation-item ${isSelected ? "selected" : ""}`} onClick={() => toggle(index)}>
                <span className={`curation-check ${isSelected ? "checked" : ""}`}>{isSelected ? "✓" : ""}</span>
                <span className={`curation-swatch ${event.accent}`}>{event.date.replace(".", "/")}</span>
                <div><small>CHAPTER {String(index + 1).padStart(2, "0")} · {event.chapter}</small><strong>{event.title}</strong><p>{event.status} · {event.evidence.length} 条来源记录</p></div>
                <span className="drag-handle">⠿</span>
              </button>
            );
          })}
          <aside className="curate-boundary"><span>!</span><p><strong>删除展品不会删除档案。</strong> 策展选择与历史记录相互独立，你随时可以用同一批事件创建另一种叙事。</p></aside>
        </section>

        <aside className="exhibition-outline">
          <header><p>EXHIBITION · 01</p><span>仅馆主草稿</span></header>
          <h2>向未知处<em>生长</em></h2>
          <p className="outline-subtitle">一位 AI 实践者的 30 个月</p>
          <div className="outline-meta"><span>2024.02—2026.08</span><span>{selected.length} 个事件</span><span>私人展览</span></div>
          <div className="outline-rule" />
          <strong className="outline-label">展览结构</strong>
          <div className="chapter-list">
            {curationEvents.filter((_, index) => selected.includes(index)).map((event, index) => (
              <div key={event.id}><span>{String(index + 1).padStart(2, "0")}</span><i className={event.accent} /><p>{event.chapter}<small>{event.title}</small></p></div>
            ))}
          </div>
          <button className="outline-preview" onClick={onPreview}>打开沉浸式展览 <span>→</span></button>
          <small className="outline-note">当前含待补原件事件，只能用于馆主预览，不代表已公开授权。</small>
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
        <button className="exhibition-brand" onClick={onReturn}><span>DM</span><div><strong>DIGITAL MUSEUM</strong><small>OWNER DRAFT · 01</small></div></button>
        <div><span>小袁 · 馆主草稿预览</span><button onClick={onReturn}>返回馆主模式</button></div>
      </header>

      <section className="exhibition-cover">
        <div className="cover-index"><span>01</span><i /><small>2024—2026</small></div>
        <div className="exhibition-title">
          <p>AN AI PRACTITIONER&apos;S JOURNEY</p>
          <h1>向未知处<br /><em>生长</em></h1>
          <div><span>一位 AI 实践者的 30 个月</span><small>由 5 个候选事件与 12 条来源记录构成 · 尚未公开授权</small></div>
        </div>
        <div className="exhibition-object">
          <span className="halo" />
          <article className="floating-note"><small>USER-STATED RESULT</small><p>周处理能力<br />20 万 → 100 万字</p></article>
          <article className="floating-frame"><div className="gallery-image"><i /><span className="g-person a" /><span className="g-person b" /></div><small>PROJECT RECORD · ORIGINAL PENDING</small></article>
          <article className="floating-ticket"><small>EVENT / 01</small><strong>Azure OpenAI<br />翻译助手交付</strong><span>待补原件</span></article>
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
          <p className="chapter-date">2024.02 · 月份待原件复核</p>
          <h2>把翻译助手<br /><em>交付给真实客户</em></h2>
          <p>过往履历记录：为瑞允翻译工作室完成 Azure OpenAI Translation Assistant 的搭建、部署、测试、优化与用户培训。</p>
          <div className="chapter-tags"><span>本人陈述 2</span><span>AI 推断 1</span><span>Unknown 2</span></div>
          <button onClick={() => setEvidenceOpen(true)}>查看策展依据 <span>↗</span></button>
        </div>
        <div className="chapter-artifacts">
          <article className="large-document"><header><span>CAREER RECORD</span><small>2024 / 02</small></header><h3>从应用搭建到<br />客户培训</h3><div className="doc-list"><span><i>✓</i> 搭建与部署</span><span><i>✓</i> 测试与优化</span><span><i>✓</i> 用户培训</span><span className="faded"><i>○</i> 测试报告原件</span></div><footer>README + 过往职业经历摘要</footer></article>
          <div className="artifact-caption"><span>01</span><p>职责和量化结果来自本人过往陈述；<br />部署日志、测试报告与客户反馈仍需补充。</p></div>
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
          <p className="chapter-date">2024—2025 · 精确月份待确认</p>
          <h2>把分散文档，<br /><em>做成企业 RAG 平台</em></h2>
          <p>个人项目履历记录的工作范围包括架构、研发与私有化部署，并覆盖解析、OCR、向量检索、Rerank、引用定位、权限与审计。</p>
          <div className="chapter-tags"><span>多格式解析</span><span>OCR</span><span>Rerank</span><span>引用定位</span></div>
          <button onClick={() => setEvidenceOpen(true)}>查看 2 条来源记录 <span>↗</span></button>
        </div>
      </section>

      <section className="chapter chapter-turn">
        <aside><span>CHAPTER</span><strong>03</strong><i /></aside>
        <div className="turn-quote"><span>2026 / 06—07</span><h2>6 月 25 日提出离职，<br />7 月 16 日获得同意，<br /><em>7 月 24 日离开。</em></h2></div>
        <div className="turn-note"><p>这一章仍保留两处存疑。关于“为什么离开”的动机，档案只记录当事人后来确认的部分，没有用 AI 猜测补齐。</p><button onClick={() => setEvidenceOpen(true)}>查看事件修订记录 →</button></div>
      </section>

      <section className="epilogue">
        <p>EPILOGUE · 仍在发生</p>
        <h2>博物馆不是终点。<br /><em>它只是让你看见，自己如何走到这里。</em></h2>
        <div><span>当前阶段</span><strong>2026.08 — PHASE 0</strong><button onClick={onReturn}>回到我的档案 <b>→</b></button></div>
        <footer><span>DIGITAL MUSEUM</span><small>每个结论，都应回到证据。</small><i>EXHIBITION 01 / 01</i></footer>
      </section>

      {evidenceOpen && (
        <div className="evidence-drawer-backdrop" onClick={() => setEvidenceOpen(false)}>
          <aside className="visitor-evidence-drawer" onClick={(event) => event.stopPropagation()}>
            <header><div><p>CURATOR&apos;S NOTE</p><h3>这段叙述从何而来？</h3></div><button onClick={() => setEvidenceOpen(false)}>×</button></header>
            <div className="drawer-chain"><span>3 条来源记录</span><b>→</b><span>5 条主张</span><b>→</b><span>1 个候选事件</span></div>
            <article><span className="drawer-tag confirmed">用户已陈述</span><p>完成应用搭建、部署、测试、优化与用户培训；履历中记录周处理能力约 20 万→100 万字。</p><small>来源：个人项目履历 README.md / 过往职业经历摘要</small></article>
            <article><span className="drawer-tag fact">AI 推断</span><p>“这是第一次真实客户交付”尚未得到独立证据支持，必须经本人确认后才能进入展览正文。</p><small>当前状态：待判断</small></article>
            <article><span className="drawer-tag unknown">留白</span><p>准确率和效率的统计口径、原始测试报告以及交付后的长期效果均未找到原件。</p></article>
            <footer><span>◒ 原始项目文件尚未导入</span><p>当前草稿只展示已分层的会话摘要，不把履历陈述伪装成客户验收事实。</p></footer>
          </aside>
        </div>
      )}
    </main>
  );
}
