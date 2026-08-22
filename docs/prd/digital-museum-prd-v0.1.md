# Digital Museum 产品 PRD v0.1

> **Slogan：把散落的数字痕迹，变成你的人生博物馆。**
>
> 首个主题馆：**把你与 AI 共同成长的痕迹，整理成可追溯的 AI 人生档案馆。**

- 文档状态：Draft for Phase 0 / Private Alpha alignment
- 版本：v0.1
- 日期：2026-08-18
- 产品形态：macOS 馆主端 + Web 访客端（Private Alpha 目标）
- 当前研发阶段：Phase 0 Research Prototype

---

## 1. 产品概述

Digital Museum 是一个本地优先的个人数字档案与 AI 策展产品。用户主动选择一个 3–12 个月阶段并导入照片、笔记和项目资料，系统从原始资料中提取可追溯 Claim，聚合为 Candidate Event；用户在 Event Review 中确认、修正、合并、拆分或排除后，系统再基于确认事件生成主题、Story 与二维数字展览。

第一批用户聚焦 AI 从业者、转型者、独立开发者与创作者。第一主题馆为“AI 人生档案馆”，但产品级能力不永久限制在 AI 场景。

---

## 2. 背景与问题

### 2.1 用户现状

目标用户在一个阶段内会产生：

- 数百至数千张照片和截图；
- Markdown、TXT、Obsidian 笔记；
- Git Commit、Tag、README、项目文档；
- 文章、作品和发布截图；
- 多个平台的 AI 对话。

这些资料可以分别回答：

```text
Photo：发生了什么、在哪里、留下了什么画面
Note：当时在想什么
Work/Git：真正完成了什么
AI Conversation：当时在探索什么、向 AI 表达过什么
```

但用户缺少一套工具把它们重新组织成可信事件。

### 2.2 现有替代方案的不足

| 替代方式 | 能解决什么 | 不能解决什么 |
|---|---|---|
| Google Photos / Apple Photos | 自动回顾照片 | 无法理解项目、笔记与职业变化；推断依据不透明 |
| Apple Journal / Day One | 记录与反思 | 需要用户当时主动写；不能低成本重建散落历史 |
| Obsidian / Notion | 保存和组织资料 | 仍依赖人工整理，不能自动建立人生事件 |
| OpenRecall / Rewind 类 | 搜索屏幕历史 | Search 不等于 Event；时间线不等于人生叙事 |
| RAG / AI Second Brain | 问答和语义检索 | 容易把 AI 输出与用户事实混合；缺少人工事件确认 |
| 年度总结生成器 | 快速生成文案 | 容易虚构、过度推断，无法追溯证据 |

---

## 3. 产品目标

### 3.1 北极星目标

> 帮助用户以低于手工整理的成本，获得一组自己认可、可追溯、能重新唤起阶段记忆的人生事件。

### 3.2 第一价值时刻

用户在 Event Review 中看到一个事件，并产生：

> “这件事确实发生过；它找到了我可能漏掉的经历，而且没有替我编故事。”

### 3.3 第二价值时刻

用户完成策展后产生：

> “原来我的这一阶段可以这样被看见，我愿意保存这座展览。”

### 3.4 阶段目标

#### Phase 0

验证：

```text
Evidence → Claim → Candidate Event → Event Review
```

#### Phase 0.5

验证 ChatGPT Export 是否能增量提升 AI 成长事件的 Recall，且不显著增加 Unsupported Assertion 与 Correction Load。

#### Private Alpha

验证完整链路：

```text
Import → Event Review → Theme → Exhibition → Save / Reuse / Optional Share
```

---

## 4. 非目标

Phase 0 / 首轮 Alpha 不做：

- 全平台持续同步；
- OAuth 或云盘连接；
- 自动全盘扫描；
- 邮件、聊天软件和社交媒体连接器；
- 移动端馆主 App；
- 3D 虚拟展厅；
- 公共内容社区；
- 多人共同 Archive；
- 数字遗产；
- 全自动事实确认；
- 无需用户审核的一键 AI 自传；
- 商业定价验证；
- 将 ChatGPT Assistant 输出直接视为用户观点或事实。

---

## 5. 目标用户

### 5.1 Primary Persona：AI 转型/创作型知识工作者

- macOS 用户；
- 过去 3–12 个月持续使用 AI；
- 至少拥有 Note + Work/Git，或 Photo + Note 两类资料；
- 经历 AI 学习、项目发布、职业转型或内容创作；
- 愿意配置 BYOK；
- 接受经授权的云端语义处理；
- 愿意投入 30–60 分钟完成 Event Review。

### 5.2 Persona 示例

**独立开发者**

- 数据：Git、README、产品截图、AI 对话、项目笔记；
- 目标：《我的第一个 AI 产品》。

**AI 产品转型者**

- 数据：课程笔记、项目资料、文章、AI 对话、面试复盘；
- 目标：《从 AI 工程到 AI 产品》。

**内容创作者**

- 数据：选题笔记、文章、图片、发布记录、AI 辅助写作对话；
- 目标：《我如何建立自己的 AI 产品判断》。

---

## 6. 核心用户故事

### US-01 创建阶段

作为用户，我希望选择一个起止时间和阶段名称，以限制本次分析范围并降低隐私与审核成本。

### US-02 导入资料

作为用户，我希望拖入照片文件夹、Markdown/TXT 文件夹和本地 Git 仓库，并在导入前看到支持、不支持和预计占用。

### US-03 了解处理覆盖

作为用户，我希望知道哪些资料已导入、已本地解析、已语义分析、失败或被跳过，避免把“没处理”理解成“没发生”。

### US-04 审阅事件

作为用户，我希望看到系统发现的 Event、Core Claim、证据来源和真实性状态，并可确认、修正、合并、拆分或排除。

### US-05 保持 Unknown

作为用户，我希望在资料不足时选择“不确定/跳过”，系统继续保持 Unknown，而不是替我补全。

### US-06 补充档案

作为用户，我希望回答证据驱动、非诱导的 Gap Interview；回答作为新的 UserStatement Evidence 保存。

### US-07 创建 AI 成长主题

作为用户，我希望在事件确认后选择《我的 AI 转型》《独立开发之路》等主题，由系统从已确认 Event 中策展。

### US-08 分享最小内容

作为用户，我希望分享时只公开选中的展览内容，不暴露完整 Archive 和证据链。

---

## 7. 产品范围

## 7.1 Phase 0 Research Prototype

### 输入

| Adapter | 支持范围 |
|---|---|
| Photo | JPEG、PNG、HEIC；EXIF、时间、地点、基础 OCR |
| Note | Markdown、TXT、YAML Frontmatter、本地图片附件 |
| Work/Git | 本地 Git Repo；Commit、Tag、README、Markdown 文档、选定 diff |

### 核心对象

```text
EvidenceBlob
→ EvidenceOccurrence
→ EvidenceTimestamp / Anchor
→ Candidate Claim
→ ClaimAssessment
→ Candidate Event
→ Event
→ Event Review Snapshot Artifact
```

### 核心能力

- 导入与解析构造数据；
- 确定性 Development Provider/Test Double；
- Claim 可定位 Evidence Anchor；
- Candidate Event 成立门槛；
- Event Review；
- Merge / Split / Reject / Unknown；
- UserStatement 时间修订；
- 处理 Coverage；
- Reference Annotation 与指标导出。

### 明确排除

- Production Archive；
- 加密、备份和 Share；
- ChatGPT Adapter；
- Story / Exhibition；
- 真实用户数据的未保护摄入。

## 7.2 Phase 0.5：ChatGPT Export Adapter

仅在 Phase 0 Gate 通过后进入。

### 数据入口

- 用户通过 ChatGPT 设置或 Privacy Portal 手动导出 ZIP；
- 不做持续同步；
- 不做账号登录和 OAuth；
- 兼容 `conversations.json` 或编号 JSON 文件；
- 记录导出批次与快照时间。

### 角色语义

| 内容 | 默认证据意义 |
|---|---|
| User message：明确自述 | UserStatement Evidence 候选 |
| User message：问题/假设 | 关注点或探索，不代表事实发生 |
| Assistant message | AI Output Evidence，不代表用户认同 |
| Tool output / pasted material | 外部内容，需保留来源，不等于用户观点 |
| 对话标题 | 弱 metadata，不作为 Core Claim |

### 升级规则

以下 Claim 不得仅凭聊天成立：

- 项目已完成；
- 用户已离职/转型；
- 用户掌握某项能力；
- AI 建议被用户采纳；
- 某事件导致另一事件。

需要 Note、Git、作品、照片或 User Confirmation 交叉支持。

### 成功标准

- AI 相关 Key Event Recall 明显提升；
- P0 Unsupported Assertion 仍为 0；
- Correction Load 不出现不可接受增长；
- 用户认为新增 Rediscovery 有价值。

## 7.3 Private Alpha

- macOS Desktop 馆主端；
- Managed Archive；
- Local-first hybrid；
- BYOK + 单一 Reference Provider；
- Event Review；
- Gap Interview；
- Theme / Story / 2D Exhibition；
- Local Preview；
- 可选 Unlisted / Protected Share Host。

---

## 8. 核心流程

### 8.1 主流程

```text
创建阶段
↓
导入资料
↓
本地预处理
↓
Coverage 与 AI 分析计划
↓
用户授权 Egress
↓
分批生成 Candidate Claim / Event
↓
领域校验
↓
Event Review
↓
用户确认与修订
↓
Archive Ready
↓
主题建议
↓
ExhibitionSelection
↓
Story / Exhibition
↓
Local Preview / Optional Share
```

### 8.2 Event Review 信息层级

每张事件卡包含：

1. Event 标题；
2. 时间范围及精度；
3. Core Claim；
4. 真实性状态；
5. Supporting Evidence；
6. 冲突、Unknown 与 Coverage 提示；
7. AI 推荐进入展览的理由；
8. 操作：确认、修正、合并、拆分、排除、提问。

示例：

```text
《第一次发布自己的 AI 产品》
2026-05-12 — 2026-05-20

Core Claim：用户在这一阶段完成并公开发布一个独立产品。

Evidence：
- Git Tag v1.0
- README 发布说明
- 5 月 19 日个人笔记
- 产品页面截图

状态：
- 发布事件：Established
- 日期：高可信
- “第一个独立产品”：Inference，待确认
```

---

## 9. 真实性契约

### 9.1 Claim 状态

- Fact；
- Inference；
- User-confirmed；
- Disputed；
- Unknown。

### 9.2 核心原则

- Evidence 不被 AI 原地改写；
- 所有正式 Core Claim 可定位 Evidence；
- Event 不能直接由原始资料跳到 Story；
- 时间相邻不代表因果；
- AI 输出不代表用户观点；
- 用户今天的回忆保留 retrospective 来源；
- 缺少证据时保持 Unknown；
- 用户确认、策展选择、公开授权和证据公开是不同状态。

### 9.3 ChatGPT 特殊规则

```text
用户问过什么
≠ 用户做过什么

AI 给出过什么
≠ 用户认同什么

AI 生成了代码
≠ 产品已经发布
```

---

## 10. 策展与展览

### 10.1 结构

```text
Cover
→ Curatorial Intro
→ Timeline Overview
→ Story Chapters
→ Event / Exhibit Cards
→ Epilogue
```

### 10.2 浏览原则

> 档案按时间建立秩序，展览按故事建立观看顺序。

### 10.3 叙事声部

- 默认：克制的策展人声部；
- 第一人称：用户主动启用并公开前确认；
- 直接引语：必须逐字可追溯；
- 情绪、动机和人生意义：需要 Evidence 或用户确认。

### 10.4 首批主题模板

- 《我的 AI 转型之路》；
- 《我的第一个独立 AI 产品》；
- 《从学习到交付》；
- 《我与 AI 一同成长的 12 个月》；
- 《我的 2026》。

---

## 11. 数据与隐私要求

### 11.1 Local-first

本地默认保存：

- Evidence；
- Archive；
- OCR、Embedding、缩略图；
- Revision；
- User Confirmation；
- Egress / Inference Audit。

### 11.2 云端推理

- 明确用途；
- 最小化发送；
- 任务级授权；
- 服务商、数据范围和预计费用可见；
- 图片与文本授权分离；
- Provider 输出只进入 Candidate；
- 关闭云端后明确降级，不伪装同等体验。

### 11.3 数据所有权

- Archive Bundle 可迁移；
- 核心 Schema 开放；
- 用户拥有删除权；
- Share Package 与 Archive 分离；
- API Key 不进入 Archive/日志/备份。

---

## 12. 非功能需求

### 12.1 可追溯

- Core Claim Grounding = 100%；
- Candidate 保留 Provider/Prompt/Pipeline lineage；
- Event Review 可查看 Evidence Anchor。

### 12.2 可恢复

- Pipeline 分阶段、可暂停、可恢复；
- 局部失败不破坏已完成 Archive；
- 相同输入与版本可复用推理结果；
- 重试产生新的 Attempt，不覆盖旧失败。

### 12.3 性能目标（Private Alpha 初始目标）

- 1,000 个文本/图片 Evidence 的本地导入可恢复；
- 部分结果完成后可立即 Review；
- Event Review 页面常规交互 <300ms；
- 预计费用与实际消耗可查看。

### 12.4 安全

- 未授权 Egress = 0；
- 未授权 Evidence Disclosure = 0；
- Secret Scanner fail closed；
- Sensitive/Disclosure Risk 与真实性分离。

---

## 13. 指标体系

### 13.1 Phase 0 Scorecard

| 指标 | 定义 |
|---|---|
| Key Event Recall | Evidence 能支持的事前关键事件中被系统建立的比例 |
| Event Acceptance Rate | 直接确认或轻微修改后确认的正式 Event 比例 |
| Claim Correction Load | 每 10 个接受 Event 的主动审阅和事实修正时间 |
| Valuable Rediscovery | 用户未事前列出、系统发现、用户确认真实且有价值的事件 |
| Unsupported Assertion Incidents | 无依据却以确定事实/关系表达的事故 |

硬门槛：

- P0 Severe Unsupported Assertion = 0；
- Core Claim Grounding = 100%。

### 13.2 Private Alpha 指标

- ≥8 位设计伙伴完成完整测试；
- ≥75% 独立或仅提示后完成导入与 Event Review；
- ≥70% 认为 Review 准确、可理解、负担可接受；
- ≥70% 保存至少一座 Exhibition；
- ≥50% 创建第二主题或开始下一阶段；
- 至少 3 位真实发布 Unlisted/Protected Link，作为分享诊断信号。

---

## 14. 验收标准

### Phase 0 Go / No-Go

- 5 组 held-out 数据；
- 中位 Key Event Recall ≥80%，任何单组 ≥60%；
- Event Acceptance ≥70%；
- 每 10 个接受 Event 的 Active Review 中位 ≤30 分钟；
- 3/5 出现 Valuable Rediscovery；
- P0 = 0；
- 100% Core Claim 可定位 Evidence；
- 相对最佳简单 baseline：Recall/Acceptance 至少 +10pp，或 Correction Load 降低 ≥25%，其他核心指标无明显退化。

### ChatGPT Adapter Go / No-Go

- Chat-only 证据不产生行动完成类正式事件；
- User/Assistant role 分离准确；
- 加入聊天后 AI 相关 Recall 有实际提升；
- P0 仍为 0；
- 修正负担没有抵消 Recall 收益。

---

## 15. 路线图

### Phase 0：Research Prototype

- Note tracer bullet；
- Egress/scanner contract；
- Photo、Git Evidence；
- Candidate Event operations；
- Entity / Time / Unknown；
- Evaluation harness；
- Held-out Gate。

### Phase 0.5：AI Conversation Evidence

- ChatGPT Export ZIP；
- 消息角色与引用 Anchor；
- 对话主题与成长线索；
- 多源交叉验证；
- 增量评测。

### Phase 1：Private Alpha

- macOS App；
- Managed Archive；
- BYOK；
- Event Review UX；
- Theme / Exhibition；
- Backup / Restore；
- Local Preview + Minimal Share Host。

### 后续

- Windows；
- 更多 AI 平台导出；
- PDF/DOCX；
- 地图；
- 多阶段人生视图；
- 3D 是否开发需重新验证。

---

## 16. 主要开放问题

1. 用户是否愿意完成 Event Review？
2. 有多少事件能被直接确认？
3. ChatGPT 对话对 Recall 的净增益是多少？
4. “AI 人生档案馆”是主题模板还是独立产品定位？
5. 用户更想保存展览、导出报告，还是继续问答？
6. 第二次使用来自第二主题还是第二阶段？
7. 低频产品适合买断、年度维护还是按次建馆？
8. 用户是否会分享，或只把它当私人档案？

---

## 17. 产品决策摘要

### 保持

- Slogan：把散落的数字痕迹，变成你的人生博物馆；
- 产品核心：可信事件还原；
- 第一垂直：AI 成长档案；
- 第一价值：Event Review；
- 第二价值：Exhibition；
- Archive 与 Exhibition 分离；
- Local-first、用户拥有数据。

### 收紧

- ChatGPT 对话只是证据之一；
- 第一版不做持续同步；
- 第一版不做“大而全 Second Brain”；
- 第一版不把 3D 当作博物馆感来源；
- 不用 GitHub Star 或社区点赞替代真实用户验证。

### 最终产品判断

> **Digital Museum 的核心产品不是“AI 记忆”，而是“AI 时代的个人历史学家与策展工具”。**

> **它必须先证明自己有资格说“这件事发生过”，之后才有资格说“这段人生可以这样讲”。**

---

## 18. 研究来源

详见配套文档《Digital Museum 需求分析与可行性研究 v0.1》的参考资料章节。
