# Digital Museum 需求分析与可行性研究 v0.1

> 项目 Slogan：**把散落的数字痕迹，变成你的人生博物馆。**
>
> 首个垂直场景表达：**把你与 AI 共同成长的痕迹，整理成可追溯的 AI 人生档案馆。**

- 文档状态：Research / Decision Support
- 版本：v0.1
- 日期：2026-08-18
- 研究对象：Digital Museum
- 当前结论：**Conditional Go——继续 Phase 0 验证，不直接建设完整产品。**

---

## 1. 执行摘要

Digital Museum 要解决的并不是“如何保存更多资料”，而是：

> 用户已经在照片、笔记、项目、Git 记录和 AI 对话中留下了大量数字痕迹，但这些痕迹彼此分散，无法低成本、可信地回答“这段时间我真正经历、完成和改变了什么”。

外部研究显示，以下底层需求真实存在：

1. **个人信息碎片化与重新查找困难是真问题。** 个人信息管理研究长期发现，跨软件、跨时间、跨项目的信息碎片化普遍存在，文件数量、版本和工作负担会降低重新查找成功率与效率。[S16][S17]
2. **用户有回顾、重新发现和解释生活经历的需求。** Google Photos Memories 月活使用规模、Apple Journal 的个性化回顾建议，以及日记社区中对“保存记忆”的稳定讨论，都说明“回看人生片段”并非伪需求。[S1][S2][S12]
3. **AI 记忆、个人知识库和本地可控数据正在形成明确趋势。** OpenRecall、OpenChronicle、Reor 等项目获得了显著开发者关注；X 上也出现持续同步个人内容、构建私人知识库和跨 AI 可迁移记忆的讨论。[S4][S5][S8][S13][S14]
4. **现有产品主要解决 Capture、Search、RAG 和 Agent Context，而不是可信的人生事件重建。** 多数项目帮助用户“搜到某个内容”或“让 AI 记住我”，很少把 Evidence、Claim、Event 与人工确认作为核心产品流程。

但目前仍未被证明的部分是：

- 用户是否愿意花 20–60 分钟审阅 AI 还原的事件；
- “人生博物馆”是否比时间线、搜索、年度总结或作品集更有持续价值；
- 用户是否会创建第二座馆、反复策展或付费；
- ChatGPT 等 AI 对话是否能提供足够高信噪比的成长证据。

因此，本项目的合理策略不是直接开发完整 macOS 产品，而是继续执行已经锁定的 Phase 0：

```text
Evidence
→ Claim
→ Candidate Event
→ Event Review
```

Phase 0 首先验证：

> AI 是否能以低于人工整理的成本，从真实数字痕迹中找到用户认可的事件，并把严重静默编造控制为零。

---

## 2. 产品定义

### 2.1 项目级定义

Digital Museum 是一款本地优先的个人档案与 AI 策展产品。它从用户主动导入的照片、笔记、项目和其他数字资料中提取可追溯的 Claim，聚合为人生 Event，经用户确认后再组织成 Story 与 Exhibition。

### 2.2 首个垂直场景

建议将第一批用户和第一座主题馆收窄为：

> **AI 从业者、转型者和独立创作者的“AI 成长档案馆”。**

用户导入一个明确阶段内的：

- AI 学习笔记；
- Git 仓库与项目文档；
- 产品截图、发布记录和作品；
- 后续阶段再加入 ChatGPT/Claude 等对话导出；

系统还原：

- 用户何时开始关注某个 AI 方向；
- 哪些探索真正转化成项目或作品；
- 哪些能力、兴趣和职业选择发生了变化；
- 哪些事件是用户自己已经淡忘但确认有价值的经历。

### 2.3 不是什么

Digital Museum 不是：

- 另一个 Obsidian / Notion；
- 全量屏幕录像和搜索工具；
- 普通 RAG 聊天机器人；
- 自动生成“年度小作文”的工具；
- 未经用户确认就替用户定义人生意义的 AI 自传生成器；
- 第一版就持续监听整个人生的同步平台。

---

## 3. 研究范围与方法

本轮研究覆盖四类证据：

1. **GitHub 同类项目**：产品定位、功能边界、活跃度、Star、是否归档；
2. **社区需求信号**：Reddit、X、Hacker News 中的真实痛点、正向反馈和反例；
3. **替代产品**：Google Photos、Apple Journal、Day One、Rewind/Limitless 等；
4. **研究文献**：个人信息管理、lifelog retrieval、life review。

需要注意：

- GitHub Star 只能代表开发者注意力，不能等同于付费需求；
- 社区帖子是定性信号，不是统计抽样；
- 大厂功能证明场景存在，但也意味着某些能力已成为基础能力；
- 本研究用于决定是否继续验证，不用于证明 PMF。

---

## 4. 市场与竞品版图

### 4.1 类别地图

```text
第一层：Capture
截图、录音、照片、聊天、笔记自动采集

第二层：Search / Recall
全文搜索、语义搜索、时间线、问答

第三层：AI Memory / Personal Context
提取偏好、事实、项目上下文，供 AI 调用

第四层：Trusted Event Reconstruction
Evidence → Claim → Event → Human Review

第五层：Curation / Exhibition
选择、分章、展签、观看节奏、分享
```

现有项目主要集中在前三层。Digital Museum 能否成立，取决于第四层是否真正提供新价值，并进一步支撑第五层。

### 4.2 代表项目比较

| 项目 | 截至 2026-08-18 的信号 | 主要能力 | 对 Digital Museum 的启示 |
|---|---:|---|---|
| OpenChronicle | 约 2,671 Stars；2026 年新项目 | 从 macOS 工作上下文生成 timeline/session/event memory | “事件化工作记忆”有强开发者关注，但主要服务 Agent 与工作上下文，不是人生档案 |
| OpenRecall | 约 2,928 Stars | 本地截图、OCR、语义搜索、历史回看 | Capture + Search 已相对成熟，不应成为本项目主差异 |
| Reor | 约 8,571 Stars，已归档 | 本地 AI PKM、RAG、笔记自动关联 | Second Brain 赛道关注高但拥挤，且持续维护困难 |
| MemryLab | 约 12 Stars | 30+ 数据源、本地 AI、思维与情绪演化时间线 | 多源导入和本地时间线已经有人实现；功能丰富不等于需求被验证 |
| me.md | 约 19 Stars | AI 访谈、每条 insight 必须 verify/edit/reject | “关于用户的 AI 结论必须经人确认”与本项目哲学高度一致 |
| personal-ai-memory | 约 58 Stars | 本地捕获多家 AI 对话、混合检索和记忆图谱 | AI 对话归档有需求，但仍偏搜索/上下文，而非成长事件还原 |
| Google Photos Memories | 官方称每月有超过 5 亿用户使用 Memories | 自动重现照片、AI 策展、分享 | 情绪回顾场景极强，但仅基于照片，且事件依据和推断过程不透明 |
| Apple Journal | 系统级活动建议、照片/地点/音频、设备端推荐 | 帮用户记录和反思日常时刻 | 大众日记和“建议写什么”已被大厂覆盖；Digital Museum 应做事后跨源重建，而非日常记录提醒 |

### 4.3 竞争结论

如果 Digital Museum 做成以下形态，不建议继续：

```text
导入文件
→ 向量数据库
→ AI 对话搜索
→ 自动时间线
```

这条路径与 OpenRecall、Reor、MemryLab、各类 AI Memory 项目高度重叠，难以形成理由充分的新产品。

Digital Museum 只有在以下链条成立时才具有独立位置：

```text
Raw Digital Traces
→ Grounded Claim
→ Candidate Life Event
→ Event Review
→ Confirmed Event Archive
→ Curated Exhibition
```

---

## 5. 用户需求是否真实

### 5.1 已有较强证据的需求

#### 需求 A：资料散落，保存后仍无法重新找到

Reddit 中反复出现用户把文章、截图、PDF、社交平台内容和笔记散落在多个应用和文件夹，最终需要一个统一保存与搜索入口的需求。[S11]

研究也显示，信息碎片化存在于不同软件、时间和个人项目中；收藏规模、版本数量和工作负担都会妨碍重新查找。[S16][S17]

**真实性判断：强。**

但它主要支持“统一索引/搜索”需求，不自动证明“人生博物馆”需求。

#### 需求 B：用户需要回看和重新发现生活片段

Google Photos 官方称 Memories 每月有超过 5 亿用户使用；Apple Journal 也把照片、人物、地点和活动组合成反思建议。[S1][S2]

日记社区中，用户明确把持续记录的价值描述为保存每天发生的事情、人物和容易遗忘的细节。[S12]

**真实性判断：强。**

#### 需求 C：用户希望 AI 上下文由自己拥有，并跨工具迁移

X 上有用户讨论把 tweets、bookmarks、likes 持续同步进私有知识库；也有人明确抱怨 ChatGPT、Claude 等 AI 的记忆彼此割裂并形成供应商锁定。[S13][S15]

Rewind/Limitless 被收购后停用原始 Rewind 捕获能力，也说明长期个人记忆若被封闭产品控制，会产生明显连续性风险。[S9]

**真实性判断：中强，尤其在 AI 重度用户和开发者群体。**

#### 需求 D：用户担心 AI 生成内容污染自己的原始资料

X 上一位积累 1,700+ 条个人知识内容的用户明确指出，把自己的写作与 AI 生成内容混在一起会“污染”知识库，希望更清晰地分离来源。[S14]

**真实性判断：中强。** 这直接支持 Digital Museum 的 Evidence / AI Inference / User Confirmation 分层。

### 5.2 证据较弱、必须验证的需求

#### 需求 E：用户愿意审阅 AI 还原的事件

me.md 等项目采用 verify/edit/reject，但其规模和使用数据不足以证明大众用户愿意进行较重审核。[S7]

**真实性判断：待验证。**

#### 需求 F：用户愿意把确认后的事件做成“博物馆”

Google Photos 和日记产品证明用户愿意回看内容，但没有直接证明用户需要策展结构、展签和可分享的个人博物馆。

**真实性判断：核心假设，尚未验证。**

#### 需求 G：用户愿意为低频阶段回顾持续付费

年度回顾、离职、项目结束等触发点天然低频。当前没有充分证据支持月度订阅。

**真实性判断：弱。商业模式应后置。**

---

## 6. 目标用户

### 6.1 第一目标用户

> 使用 macOS、有持续数字创作或记录习惯，并希望回顾一个 3–12 个月阶段的 AI 从业者、独立开发者和创作者。

特征：

- 使用 ChatGPT、Claude、Gemini、Codex 等多个 AI 工具；
- 有 Markdown/Obsidian、Git、项目文档、截图等数据；
- 正在经历 AI 学习、职业转型、产品开发或内容创作；
- 能判断系统还原的事件是否正确；
- 对隐私、可追溯和数据所有权敏感；
- 愿意配置 BYOK 并参与 30–60 分钟 Review。

### 6.2 次级用户

- 设计师、写作者、摄影师等独立创作者；
- 有年度复盘、作品集和阶段总结需求的知识工作者；
- 经常使用日记、照片和项目资料记录生活的人。

### 6.3 当前明确排除

- 希望一键完成、完全不审核的大众用户；
- 需要所有 AI 全离线运行的用户；
- 逝者数字遗产、家庭共同档案；
- 医疗、诉讼等高风险专业档案；
- 主要资料是聊天、邮件且缺少任何可验证产出的人；
- ChatGPT Business/Enterprise 用户作为首批核心样本——官方标准设置不提供普通数据导出。[S10]

---

## 7. 核心 Job To Be Done

### JTBD 1：阶段回顾

> 当我完成一个重要阶段时，我希望系统从散落资料中找出真正发生过的重要事件，让我不必手工翻阅几千张照片、几十篇笔记和多个项目。

### JTBD 2：可信确认

> 当 AI 告诉我“这件事发生过”时，我希望看到它依据了哪些资料，并能确认、修正、合并或排除，避免 AI 替我编故事。

### JTBD 3：重新发现

> 当我回顾过去时，我希望发现自己已经淡忘、但确认有价值的经历和变化，而不只是重新看到我已经记得的大事件。

### JTBD 4：AI 成长档案

> 当我想总结自己如何使用 AI 学习、工作和创造时，我希望系统区分“我问过什么”“AI 建议过什么”和“我真正做成了什么”，并还原为可验证的成长事件。

### JTBD 5：表达与分享

> 当事件已经确认后，我希望将其中一部分组织成一座克制、可控的阶段展览，用于个人保存、作品集或小范围分享。

---

## 8. 场景优先级

| 场景 | 触发时刻 | 数据充分度 | 用户价值 | 当前优先级 |
|---|---|---:|---:|---:|
| AI 年度/半年成长回顾 | 年末、课程/训练结束 | 高 | 高 | P0 |
| 职业转型回顾 | 离职、转岗、求职 | 高 | 高 | P0 |
| 项目生命周期回顾 | 上线、停止维护、复盘 | 很高 | 高 | P0 |
| 内容创作阶段回顾 | 连续写作/视频/设计阶段 | 中高 | 高 | P1 |
| 旅行与生活阶段 | 旅行、搬家、毕业 | 照片高、文本不稳定 | 中高 | P1 |
| 整个人生自动建馆 | 长期历史 | 复杂 | 潜在高 | 后置 |
| 公开展览与社交传播 | 完成策展后 | 取决于隐私 | 未验证 | Private Alpha |

---

## 9. “AI 人生档案馆”是否成立

### 9.1 成立的部分

“人与 AI 一同成长”适合作为第一个垂直主题，原因是：

1. **数据密度高**：聊天、笔记、Git、截图、文章和模型训练记录天然丰富；
2. **客观证据较多**：Commit、Tag、Release、作品链接可以验证“做过什么”；
3. **用户能判断准确性**：AI 从业者能够识别错误事件与错误因果；
4. **阶段触发明确**：转型、求职、项目发布、年度回顾；
5. **社区已有“个人 AI 记忆”和可迁移上下文需求。**[S13][S15]

### 9.2 不成立的简化理解

以下链路不成立：

```text
导入 ChatGPT 聊天
→ 自动总结
→ 这就是我的 AI 成长史
```

因为：

- 用户问过“要不要离职”不等于用户离职；
- AI 生成过代码不等于项目已经完成；
- AI 的观点不等于用户认同；
- 角色、时间和上下文混杂；
- 试验性 Prompt、闲聊和重复内容噪声很高。

### 9.3 正确链路

```text
ChatGPT user message
→ 关注点/意图/用户陈述 Evidence

ChatGPT assistant message
→ AI Output Evidence
→ 不自动代表用户事实或观点

Git / Note / Screenshot / User Confirmation
→ 行动与成果 Evidence

多源交叉支持
→ Claim
→ Candidate Event
→ Event Review
```

因此，ChatGPT Export 是有价值的 **后续 Adapter**，但不能取代 Notes + Work/Git 的客观证据。

官方目前支持个人 Free、Plus、Pro 和部分 Edu 用户导出 ZIP；文件包含聊天历史，较大的导出可能包含 `conversations.json` 或编号 JSON 文件。Business/Enterprise 不支持普通设置导出，且导出可能需要最多 7 天。[S10]

---

## 10. 产品可以立住的点

### 10.1 第一立足点：可信事件还原，而非搜索

最核心的差异不是“AI 能读我的全部数据”，而是：

> AI 每提出一个关于我的 Event，都必须说明依据，允许我修正，并知道什么时候保持 Unknown。

这对应：

```text
Evidence
→ Claim
→ Candidate Event
→ Human Review
```

如果这一链条不能显著优于“按时间聚类”和“直接 LLM 总结”，产品不成立。

### 10.2 第二立足点：Event Review 本身就是产品价值

现有工具往往把 Review 当成后台纠错。Digital Museum 应把它做成第一价值时刻：

- 找到了哪些事件；
- 核心 Claim 是什么；
- 哪些是 Fact、Inference、User Statement、Unknown；
- 证据在哪里；
- 用户可以确认、修正、合并、拆分或排除。

### 10.3 第三立足点：AI 时代的个人成长证据链

与普通“人生相册”相比，AI 成长档案馆能回答：

- 我什么时候开始关注某项技术；
- 哪些 AI 对话只是探索；
- 哪些想法后来成为作品；
- 我的工作方式、判断方式和创作主题如何变化；
- 我与不同 AI 工具的关系如何演进。

### 10.4 第四立足点：用户拥有 Archive，而不是被平台锁定

Rewind/Limitless 的停用说明，即使产品曾强调个人记忆，商业变化仍可能终止能力。[S9]

Digital Museum 的长期可信度来自：

- Local-first Archive；
- 开放 Bundle / Schema；
- 独立恢复工具；
- 原始证据、AI 推断和用户确认分离；
- 可删除、可迁移、可重新策展。

这不是第一价值时刻，但可能成为长期信任优势。

### 10.5 第五立足点：Archive 与 Exhibition 分离

```text
Archive = 长期可信资产
Exhibition = 某次带目的的视图
```

同一批确认事件可以被策展为：

- 《我的 2026》；
- 《从 AI 工程师到 AI 产品经理》；
- 《我的第一个独立产品》；
- 《我与 AI 一同成长的两年》。

这比一次性年度总结更有复用可能。

---

## 11. 可行性评估

### 11.1 技术可行性

| 方面 | 判断 | 说明 |
|---|---|---|
| Photo / Note / Git 本地解析 | 高 | 格式成熟，已有大量库与同类实现 |
| 本地索引、OCR、Embedding | 高 | OpenRecall、Reor、MemryLab 已证明常规桌面设备可实现 |
| 多源 Candidate Event | 中 | 时间、语义、实体聚类可实现，但边界和粒度难 |
| Claim Grounding | 中高 | 可以通过 Anchor 和结构化输出实现，但需要严格验证 |
| Unsupported Assertion 控制 | 中低 | 模型容易把相邻事件、问题和行动错误关联，是 Phase 0 最大风险 |
| ChatGPT Export Adapter | 中高 | 文件可导出、可解析，但角色语义和噪声治理复杂 |
| 完整本地优先桌面产品 | 中 | 存储、加密、备份、删除传播和云端 Egress 增加大量工程复杂度 |
| 3D 博物馆 | 低优先级 | 技术可行，但不验证核心需求，应后置 |

**结论：Phase 0 技术可行；完整产品可行但工程成本显著，不应提前建设。**

### 11.2 需求可行性

| 维度 | 评分 | 判断 |
|---|---:|---|
| 底层痛点真实性 | 8/10 | 信息碎片化、回看与可迁移需求真实 |
| Event Review 价值 | 6/10 | 有合理逻辑，但需要实测 |
| “AI 成长档案”切口 | 7/10 | 数据和触发点明确，适合首批用户 |
| “博物馆”形态 | 5/10 | 情绪价值可能成立，但无充分证据 |
| 分享需求 | 4/10 | 隐私可能导致不分享，不应作为核心 Gate |
| 持续使用频率 | 4/10 | 可能低频，第二主题/第二阶段行为需验证 |
| 付费可行性 | 4/10 | 商业模式尚未证明，订阅尤其不明确 |

### 11.3 差异化可行性

- 如果主打多源导入、本地 AI、时间线：**3/10**；
- 如果主打可信 Event Review：**7.5/10**；
- 如果进一步证明同一 Archive 可反复策展：**8/10 潜力，但未验证**。

### 11.4 综合判断

> **整体可行性：6.5/10，Conditional Go。**

允许继续投入 Phase 0；禁止根据当前信号直接进入完整商业产品开发。

---

## 12. 关键风险

### 12.1 产品风险

- 用户只想搜索旧资料，不愿审核事件；
- 用户认为“博物馆”漂亮但没有复用价值；
- AI 成长档案太窄，泛人生档案又太宽；
- ChatGPT 对话的信噪比低于预期；
- 用户已有年度总结、GitHub、作品集和日记，新增价值不够大。

### 12.2 信任风险

- 把用户提问误认为行动；
- 把 AI 回答误认为用户观点；
- 把时间先后暗示为因果；
- 错认人物、项目和时间；
- 用户在第一次发现虚构后失去全部信任。

### 12.3 数据风险

- 多源资料包含第三方隐私；
- ChatGPT Export 包含敏感附件和完整对话；
- 云端推理造成数据出站顾虑；
- Archive 长期维护、备份和迁移要求高。

### 12.4 商业风险

- 使用频率偏年度或阶段性；
- BYOK 与导入流程提高门槛；
- 大厂可覆盖照片回忆和日记建议；
- 本地桌面软件维护成本高；
- GitHub Star 不等于实际留存与付费。

---

## 13. 建议的验证策略

### 13.1 Phase 0：只验证可信事件还原

范围：

```text
Photo / Note / Work
→ Evidence
→ Claim
→ Candidate Event
→ Event Review
```

不做：

- Story；
- Exhibition；
- Share；
- 3D；
- 完整 Archive 产品化；
- ChatGPT Adapter；
- 商业付费。

Gate：

- P0 Severe Unsupported Assertion = 0；
- Key Event Recall 中位数 ≥80%，单组 ≥60%；
- Event Acceptance ≥70%；
- 每 10 个接受 Event 主动审阅时间中位数 ≤30 分钟；
- 3/5 数据集出现 Valuable Rediscovery；
- 100% 正式核心 Claim 可定位 Evidence；
- 优于时间聚类或 Direct LLM baseline。

### 13.2 Phase 0.5：AI Conversation Adapter 实验

仅在 Phase 0 通过后增加 ChatGPT Export：

- 解析官方手动导出 ZIP；
- 用户/Assistant/Tool message 分离；
- Assistant 内容默认不能支持用户事实；
- “问过”与“做过”分离；
- 只用多源交叉验证升级 Event；
- 单独评估聊天加入后 Recall 增益与 Correction Load 增量。

### 13.3 Private Alpha：验证完整价值链

```text
Event Review
→ Theme
→ Exhibition
→ Save / Second Theme / Second Phase
→ Optional Share
```

核心行为指标：

- 用户能独立完成导入和 Review；
- ≥70% 保存一座展览；
- ≥50% 创建第二主题或启动下一阶段；
- 分享作为诊断信号，不作为核心硬 Gate。

---

## 14. 最终建议

### Go

继续：

- Phase 0；
- AI 从业者/创作者作为首批样本；
- Notes + Work/Git 为主要证据；
- Event Review 与真实性契约；
- “AI 人生档案馆”作为第一主题。

### No-Go

暂不：

- 建设完整 macOS 产品；
- 先做 3D 展厅；
- 全量导入所有平台；
- 把聊天历史直接总结成人生；
- 以 RAG/搜索作为主卖点；
- 提前锁定订阅制。

### 核心判断

> **Digital Museum 可以立住，但必须立在“可信的人生事件还原”上，而不是“AI 记住我的一切”。**

> **“AI 人生档案馆”适合作为第一垂直场景：它用聊天记录发现探索，用笔记理解当时的思考，用 Git、作品和用户确认验证真正发生的行动。**

---

## 15. 参考资料

- [S1] Google Photos, *A new, scrapbook-like Memories view in Google Photos*：https://blog.google/products-and-platforms/products/photos/google-photos-memories-view/
- [S2] Apple, *Apple launches Journal app*：https://www.apple.com/newsroom/2023/12/apple-launches-journal-app-a-new-app-for-reflecting-on-everyday-moments/
- [S3] Day One Gold： https://dayoneapp.com/Gold/
- [S4] OpenChronicle： https://github.com/Einsia/OpenChronicle
- [S5] OpenRecall： https://github.com/openrecall/openrecall
- [S6] MemryLab： https://github.com/laadtushar/MemryLab
- [S7] me.md： https://github.com/memd-app/me.md
- [S8] Reor： https://github.com/reorproject/reor
- [S9] Limitless official FAQ / Rewind sunset： https://developers.limitless.ai/
- [S10] OpenAI, *Exporting your ChatGPT history and data*：https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data
- [S11] Reddit, scattered content across platforms：https://www.reddit.com/r/ProductivityApps/comments/1u9fvgi/
- [S12] Reddit, *Why do people write every single day?*：https://www.reddit.com/r/Journaling/comments/1rec523/
- [S13] Jan Wilmake on X, personal knowledge-base sync：https://x.com/janwilmake/status/2040777994789118078
- [S14] Yucen Z on X, knowledge-base contamination：https://x.com/Yucen_Z/status/2040794575246397446
- [S15] Rich Silver on X, universal AI memory / vendor lock-in：https://x.com/RichSilver/status/1997454755552018698
- [S16] Kljun, *The information fragmentation problem through dimensions of software, time and personal projects*：https://puffbird.ijs.si/index.php/informatica/article/view/809
- [S17] Bergman et al., *Factors hindering shared files retrieval*：https://cris.biu.ac.il/en/publications/factors-hindering-shared-files-retrieval-3/
- [S18] Nguyen, *Moments in Focus: A Transformer-based Approach for Moment-centric Lifelog Retrieval*：https://doras.dcu.ie/31351/
- [S19] Lan et al., *Effects of life review interventions on psychosocial outcomes*：https://pubmed.ncbi.nlm.nih.gov/28124828/
- [S20] Hacker News, Rewind user negative experience：https://news.ycombinator.com/item?id=39459746
- [S21] personal-ai-memory：https://github.com/marswangyang/personal-ai-memory
