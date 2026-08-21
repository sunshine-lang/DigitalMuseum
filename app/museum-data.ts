export type ClaimKind = "fact" | "user" | "inference" | "unknown";
export type EvidenceLevel = "primary" | "secondary" | "missing";

export type Claim = {
  id: string;
  kind: ClaimKind;
  text: string;
  source: string;
  note?: string;
};

export type EvidenceRecord = {
  type: string;
  name: string;
  date: string;
  text: string;
  meta: string;
  glyph: string;
  level: EvidenceLevel;
};

export type MuseumEvent = {
  id: string;
  date: string;
  period: string;
  title: string;
  shortTitle: string;
  summary: string;
  status: string;
  statusClass: "confirmed" | "pending" | "disputed";
  accent: "coral" | "blue" | "ochre" | "violet" | "green";
  category: string;
  chapter: string;
  claims: Claim[];
  evidence: EvidenceRecord[];
};

export const museumEvents: MuseumEvent[] = [
  {
    id: "azure-translation",
    date: "2024.02",
    period: "2024.02 · 月份来自过往项目档案摘要，待原件复核",
    title: "交付 Azure OpenAI 翻译助手",
    shortTitle: "翻译助手交付",
    summary: "为瑞允翻译工作室完成应用搭建、部署、测试、优化与用户培训；量化结果来自本人过往履历陈述。",
    status: "待补原件",
    statusClass: "pending",
    accent: "coral",
    category: "客户交付",
    chapter: "交付",
    claims: [
      {
        id: "azure-role",
        kind: "user",
        text: "为瑞允翻译工作室完成 Azure OpenAI Translation Assistant 的搭建、部署、测试、优化与用户培训。",
        source: "个人项目履历 README.md",
      },
      {
        id: "azure-result",
        kind: "user",
        text: "项目记录中的结果为：周处理能力约 20 万→100 万字，准确率约 60%→100%，字数统计效率提升约 80%。",
        source: "个人项目履历 README.md / 过往职业经历摘要",
        note: "量化结果是本人陈述，尚未导入测试报告或客户反馈原件。",
      },
      {
        id: "azure-first",
        kind: "inference",
        text: "这是第一次把一套完整的 AI 工具交付给真实客户。",
        source: "由项目时间线与职责描述推断",
        note: "“完成交付”已有本人陈述；“第一次”没有独立证据，需要本人确认。",
      },
      {
        id: "azure-method",
        kind: "unknown",
        text: "准确率与效率提升采用了什么口径、样本规模和统计周期？",
        source: "原始测试报告未导入",
      },
      {
        id: "azure-lasting",
        kind: "unknown",
        text: "上述效果是否在交付后长期保持？",
        source: "缺少后续使用与回访记录",
      },
    ],
    evidence: [
      {
        type: "履历记录",
        name: "README.md · Azure OpenAI Translation Assistant",
        date: "收录于个人项目履历 · 项目月份记为 2024.02",
        text: "职责：应用搭建、部署、测试、优化与用户培训。",
        meta: "用户已陈述；不是自动导入的原始项目文件",
        glyph: "≡",
        level: "secondary",
      },
      {
        type: "结果陈述",
        name: "README.md · 项目量化结果",
        date: "收录于个人项目履历",
        text: "周处理能力约 20 万→100 万字；准确率约 60%→100%；字数统计效率提升约 80%。",
        meta: "用户已陈述；测试口径与报告原件待补",
        glyph: "↗",
        level: "secondary",
      },
      {
        type: "缺失证据",
        name: "部署记录 / 测试报告 / 客户反馈",
        date: "尚未导入",
        text: "当前没有可定位的部署日志、测试报告、培训记录或客户反馈原件，因此量化结果不能升级为“原始证据充分”。",
        meta: "Unknown · 证据不足保持留白",
        glyph: "○",
        level: "missing",
      },
    ],
  },
  {
    id: "fastgpt-governance",
    date: "2024.06",
    period: "2024.06 · 月份来自过往项目档案摘要，待原件复核",
    title: "交付 FastGPT 数据治理官",
    shortTitle: "FastGPT 数据治理",
    summary: "完成私有化部署、数据治理与检索导出能力建设；业务处理效率提升约 50% 来自本人履历陈述。",
    status: "待补原件",
    statusClass: "pending",
    accent: "blue",
    category: "私有化交付",
    chapter: "治理",
    claims: [
      {
        id: "fastgpt-role",
        kind: "user",
        text: "项目包含 FastGPT 私有化部署、数据治理以及检索导出能力建设。",
        source: "个人项目履历 README.md",
      },
      {
        id: "fastgpt-result",
        kind: "user",
        text: "相关业务处理效率提升约 50%。",
        source: "个人项目履历 README.md",
        note: "缺少原始业务基线、测量口径与验收材料。",
      },
      {
        id: "fastgpt-shift",
        kind: "inference",
        text: "关注点开始从“单点 AI 功能”转向数据治理和平台能力。",
        source: "根据两个项目的职责差异推断",
        note: "方向变化可观察，但其主观意义需要本人确认。",
      },
      {
        id: "fastgpt-method",
        kind: "unknown",
        text: "50% 的效率提升如何计算，是否经过客户验收？",
        source: "验收材料未导入",
      },
    ],
    evidence: [
      {
        type: "履历记录",
        name: "README.md · FastGPT Data Governance",
        date: "收录于个人项目履历 · 项目月份记为 2024.06",
        text: "职责：私有化部署、数据治理和检索导出能力建设。",
        meta: "用户已陈述；原始仓库与部署记录待补",
        glyph: "≡",
        level: "secondary",
      },
      {
        type: "结果陈述",
        name: "README.md · 效率结果",
        date: "收录于个人项目履历",
        text: "相关业务处理效率提升约 50%。",
        meta: "用户已陈述；统计口径待补",
        glyph: "↗",
        level: "secondary",
      },
      {
        type: "缺失证据",
        name: "私有化部署与验收材料",
        date: "尚未导入",
        text: "需要补充部署拓扑、验收记录或客户反馈，才能把结果主张升级为原始证据充分。",
        meta: "Unknown · 不补写不存在的证据",
        glyph: "○",
        level: "missing",
      },
    ],
  },
  {
    id: "streamlit-multichat",
    date: "2024.07.02",
    period: "2024.07.02 · 对话时间戳可定位",
    title: "让 Azure OpenAI 应用支持多会话",
    shortTitle: "多会话应用",
    summary: "在对话中提交 Streamlit + Azure OpenAI 代码，并明确提出让不同会话分别展示的需求。",
    status: "对话可追溯",
    statusClass: "confirmed",
    accent: "ochre",
    category: "应用研发",
    chapter: "迭代",
    claims: [
      {
        id: "streamlit-code",
        kind: "fact",
        text: "2024 年 7 月 2 日，在对话中提交了一段使用 Azure OpenAI 的 Streamlit 聊天应用代码。",
        source: "2024-07-02 09:10 UTC 对话记录",
      },
      {
        id: "streamlit-request",
        kind: "fact",
        text: "同日明确提出：切换不同会话时，各自的聊天内容需要独立展示。",
        source: "2024-07-02 09:18 UTC 对话记录",
      },
      {
        id: "streamlit-production",
        kind: "unknown",
        text: "多会话方案是否最终合并并部署到生产环境？",
        source: "后续提交与部署记录未找到",
      },
    ],
    evidence: [
      {
        type: "对话原文",
        name: "2024-07-02 · Streamlit AzureOpenAI 代码",
        date: "2024.07.02 · 09:10 UTC",
        text: "用户展示了 AzureOpenAI 聊天应用代码，包含会话状态以及 Home / About 导航。",
        meta: "时间戳可定位的用户输入",
        glyph: "⌁",
        level: "primary",
      },
      {
        type: "需求原文",
        name: "2024-07-02 · 多会话切换需求",
        date: "2024.07.02 · 09:18 UTC",
        text: "用户要求实现不同会话分别展示聊天内容。",
        meta: "时间戳可定位的用户输入；是否上线仍为 Unknown",
        glyph: "✎",
        level: "primary",
      },
    ],
  },
  {
    id: "enterprise-rag",
    date: "2024—2025",
    period: "2024—2025 · 精确起止月份待确认",
    title: "把分散文档做成企业 RAG 平台",
    shortTitle: "企业 RAG 平台",
    summary: "参与架构、研发和私有化部署，覆盖解析、OCR、向量检索、Rerank、引用定位、权限与审计。",
    status: "月份待确认",
    statusClass: "disputed",
    accent: "violet",
    category: "平台建设",
    chapter: "平台",
    claims: [
      {
        id: "rag-role",
        kind: "user",
        text: "参与企业 RAG 平台的架构、研发与私有化部署。",
        source: "个人项目履历 README.md",
      },
      {
        id: "rag-scope",
        kind: "user",
        text: "平台覆盖多格式解析、OCR、向量检索、Rerank、引用定位、权限与审计。",
        source: "个人项目履历 README.md",
      },
      {
        id: "rag-result",
        kind: "user",
        text: "项目把分散文档转化为可检索、可追溯的企业知识服务。",
        source: "个人项目履历 README.md",
      },
      {
        id: "rag-transition",
        kind: "inference",
        text: "这是从 AI 工程实现走向企业级平台思维的转折。",
        source: "根据职责范围变化推断",
        note: "“转折”的意义需要本人确认。",
      },
      {
        id: "rag-time",
        kind: "unknown",
        text: "两个企业 RAG 项目的准确起止时间与各自边界。",
        source: "项目时间线未导入",
      },
    ],
    evidence: [
      {
        type: "履历记录",
        name: "README.md · Enterprise RAG Platform",
        date: "项目记录未给出精确月份",
        text: "架构、研发与私有化部署；多格式解析、OCR、向量检索、Rerank、引用定位、权限与审计。",
        meta: "用户已陈述；项目起止时间待补",
        glyph: "▤",
        level: "secondary",
      },
      {
        type: "缺失证据",
        name: "项目仓库 / 架构文档 / 部署记录",
        date: "尚未导入",
        text: "技术栈与职责已有履历陈述，但原始仓库、架构文档和客户验收材料尚未进入档案。",
        meta: "Unknown · 不能据此补写项目时间线",
        glyph: "○",
        level: "missing",
      },
    ],
  },
  {
    id: "ai-sharing",
    date: "2025.04—06",
    period: "2025.04—06 · 月份来自过往经历摘要",
    title: "开始向更多人讲述企业 AI 实践",
    shortTitle: "企业 AI 分享",
    summary: "完成一次约 45 分钟的内部 Vibe Coding 分享，并在 2025 年 6 月面向康龙化成 CIO/CISO 做 1 小时分享。",
    status: "待补原件",
    statusClass: "pending",
    accent: "green",
    category: "知识分享",
    chapter: "表达",
    claims: [
      {
        id: "sharing-internal",
        kind: "user",
        text: "2025 年 4—5 月完成一次约 45 分钟的内部 Vibe Coding 分享。",
        source: "过往职业经历摘要",
      },
      {
        id: "sharing-external",
        kind: "user",
        text: "2025 年 6 月面向康龙化成 CIO/CISO 做过 1 小时医药行业 AI 最佳实践分享。",
        source: "过往职业经历摘要",
      },
      {
        id: "sharing-meaning",
        kind: "inference",
        text: "角色开始从“做项目的人”扩展为“总结并传播方法的人”。",
        source: "根据两次分享经历推断",
        note: "这是策展解释，不是事件事实。",
      },
      {
        id: "sharing-result",
        kind: "unknown",
        text: "分享对业务决策或后续合作产生了什么实际影响？",
        source: "会后反馈与后续记录未导入",
      },
    ],
    evidence: [
      {
        type: "经历摘要",
        name: "过往对话 · 对外活动记录",
        date: "记录为 2025.04—06",
        text: "内部 Vibe Coding 分享约 45 分钟；康龙化成 CIO/CISO 分享约 1 小时。",
        meta: "用户已陈述；日历、演讲稿或现场照片待补",
        glyph: "◫",
        level: "secondary",
      },
      {
        type: "缺失证据",
        name: "日历 / 演讲稿 / 现场记录",
        date: "尚未导入",
        text: "当前没有可定位的演讲稿、活动日历或现场记录，不能确认具体日期与后续效果。",
        meta: "Unknown · 保留月份级时间",
        glyph: "○",
        level: "missing",
      },
    ],
  },
  {
    id: "career-transition",
    date: "2026.06—07",
    period: "2026.06.25—07.24 · 来自本人过往对话陈述",
    title: "离开旧岗位，重新选择职业方向",
    shortTitle: "职业转向",
    summary: "6 月 25 日提出离职，7 月 16 日获得同意，记录中的最终离职日为 7 月 24 日。",
    status: "本人已确认",
    statusClass: "confirmed",
    accent: "coral",
    category: "职业转折",
    chapter: "转弯",
    claims: [
      {
        id: "transition-resign",
        kind: "user",
        text: "2026 年 6 月 25 日提出离职；7 月 16 日获得同意；记录中的最终离职日为 7 月 24 日。",
        source: "过往职业规划对话",
      },
      {
        id: "transition-directions",
        kind: "user",
        text: "离职阶段重点考虑 AI 产品、FDE 与 AI Infra 三个方向。",
        source: "2026 年 6—7 月职业规划对话",
      },
      {
        id: "transition-restart",
        kind: "inference",
        text: "这次离职意味着主动重启自己的职业路径。",
        source: "根据离职与后续计划推断",
        note: "“主动重启”涉及动机，需要本人确认后才能进入展览正文。",
      },
      {
        id: "transition-next",
        kind: "unknown",
        text: "下一份正式角色最终会落在哪个方向？",
        source: "截至建馆日期仍未形成已完成记录",
      },
    ],
    evidence: [
      {
        type: "对话记录",
        name: "2026.06—07 · 离职与职业规划",
        date: "2026.06.25—07.24",
        text: "提出离职、获批与最终离职时间，以及 AI 产品 / FDE / AI Infra 的方向讨论。",
        meta: "本人陈述可定位；动机仍需单独确认",
        glyph: "✎",
        level: "primary",
      },
    ],
  },
  {
    id: "agent-notes",
    date: "2026.07.10—19",
    period: "2026.07.10—07.19 · 内容后台数据",
    title: "开始写下 Agent 工程手记",
    shortTitle: "Agent 工程手记",
    summary: "前 10 篇内容累计曝光 5,739、观看 393；封面点击率 6.26%，观看率 38.9%，互动率 2.38%。",
    status: "数据可核验",
    statusClass: "confirmed",
    accent: "ochre",
    category: "内容创作",
    chapter: "记录",
    claims: [
      {
        id: "notes-published",
        kind: "fact",
        text: "2026 年 7 月 10—19 日期间，Agent 工程手记已发布 10 篇内容。",
        source: "内容后台统计与过往复盘",
      },
      {
        id: "notes-metrics",
        kind: "fact",
        text: "累计曝光 5,739，观看 393；封面点击率 6.26%，观看率 38.9%，互动率 2.38%。",
        source: "内容后台数据截图",
      },
      {
        id: "notes-position",
        kind: "user",
        text: "内容定位是从企业 AI 落地实践出发，沉淀产品判断、项目复盘、转型学习与工具观察。",
        source: "2026.08.04 账号战略对话",
      },
      {
        id: "notes-brand",
        kind: "inference",
        text: "账号已经形成稳定的专业影响力。",
        source: "根据早期数据推断",
        note: "只有 10 篇早期数据，不能支持“稳定影响力”。",
      },
    ],
    evidence: [
      {
        type: "数据截图",
        name: "Agent 工程手记 · 前 10 篇数据",
        date: "统计区间 2026.07.10—07.19",
        text: "曝光 5,739；观看 393；封面点击率 6.26%；观看率 38.9%；互动率 2.38%。",
        meta: "来自用户提供的内容后台数据",
        glyph: "↗",
        level: "primary",
      },
      {
        type: "账号策略",
        name: "2026-08-04 · 内容定位对话",
        date: "2026.08.04",
        text: "50% 企业 AI 产品判断、25% 真实项目复盘、15% 转型与学习过程、10% 工具或行业观察。",
        meta: "用户确认的内容规划；规划不等于已经完成",
        glyph: "≡",
        level: "primary",
      },
    ],
  },
  {
    id: "digital-museum",
    date: "2026.08.12—20",
    period: "2026.08.12—08.20 · 对话、文档与部署记录可定位",
    title: "开始建造 Digital Museum",
    shortTitle: "Digital Museum",
    summary: "从团队项目方向出发，逐步冻结真实性契约与 Phase 0 范围，8 月 18 日形成 PRD，8 月 20 日上线交互演示。",
    status: "文档可追溯",
    statusClass: "confirmed",
    accent: "green",
    category: "个人项目",
    chapter: "建馆",
    claims: [
      {
        id: "museum-selected",
        kind: "fact",
        text: "2026 年 8 月 12—13 日，Digital Museum 被选为继续推进的团队项目方向。",
        source: "带时间戳的项目讨论",
      },
      {
        id: "museum-contract",
        kind: "fact",
        text: "8 月 14 日确认 local-first、事实/推断/本人补充/未知分层以及 Evidence→Claim→Event→Exhibition 的真实性契约。",
        source: "Digital Museum 决策对话",
      },
      {
        id: "museum-prd",
        kind: "fact",
        text: "2026 年 8 月 18 日形成 PRD v0.1 与需求分析，结论为 Conditional Go：继续 Phase 0 验证。",
        source: "digital-museum-prd-v0.1.md / requirements-analysis-v0.1.md",
      },
      {
        id: "museum-demo",
        kind: "fact",
        text: "2026 年 8 月 20 日，Digital Museum 交互式产品演示完成并部署。",
        source: "网站版本与部署记录",
      },
      {
        id: "museum-product",
        kind: "unknown",
        text: "真实用户是否能在 30 分钟内完成 10 个事件审阅，并认可至少 70% 的候选事件？",
        source: "Phase 0 尚未完成真实用户验证",
      },
    ],
    evidence: [
      {
        type: "决策对话",
        name: "2026-08-12—14 · 项目选择与真实性契约",
        date: "2026.08.12—08.14",
        text: "项目方向、目标用户、local-first、证据链以及事件审阅规则逐步冻结。",
        meta: "带时间戳的用户决策记录",
        glyph: "⌁",
        level: "primary",
      },
      {
        type: "产品文档",
        name: "digital-museum-prd-v0.1.md",
        date: "2026.08.18",
        text: "状态：Draft for Phase 0 / Private Alpha alignment；当前阶段：Phase 0 Research Prototype。",
        meta: "文档日期与范围可定位",
        glyph: "▤",
        level: "primary",
      },
      {
        type: "研究结论",
        name: "digital-museum-requirements-analysis-v0.1.md",
        date: "2026.08.18",
        text: "Conditional Go：验证 Evidence→Claim→Candidate Event→Event Review；P0 Severe Unsupported Assertion 目标为 0。",
        meta: "这是验证目标，不是已达成结果",
        glyph: "✓",
        level: "primary",
      },
      {
        type: "部署记录",
        name: "Digital Museum · 交互式产品演示",
        date: "2026.08.20",
        text: "交互演示完成并部署；当前为示范体验，不包含真实文件解析、AI 聚类或持久化存储。",
        meta: "部署可定位；“产品验证成功”仍为 Unknown",
        glyph: "↗",
        level: "primary",
      },
    ],
  },
];

export const sourceRecordCount = museumEvents.reduce((total, event) => total + event.evidence.length, 0);
export const primaryRecordCount = museumEvents.reduce(
  (total, event) => total + event.evidence.filter((record) => record.level === "primary").length,
  0,
);
export const missingRecordCount = museumEvents.reduce(
  (total, event) => total + event.evidence.filter((record) => record.level === "missing").length,
  0,
);
export const groundedClaimCount = museumEvents.reduce(
  (total, event) => total + event.claims.filter((claim) => claim.kind === "fact" || claim.kind === "user").length,
  0,
);
