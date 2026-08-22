# Digital Museum 开源参考项目调研 v0.1

> 调研日期：2026-08-22。方法：按 PRD 需求链路（而非技术栈）拆为 5 个调研方向并行执行，所有项目的 star 数、license、维护状态均通过 GitHub API / 仓库源码当日核验。
> 结论用途：决定「吸收架构思想」「复用数据模型」「直接引入依赖」三个层次的使用方式。

---

## 0. 总体结论

1. **没有现成项目实现了 Digital Museum 的完整链路**（Evidence → Claim → Candidate Event → 人工 Event Review → Exhibition）。5 个方向调研一致确认：`User-confirmed` 状态、「AI 产出与用户事实分离存储」、Event Review 的合并/拆分/排除交互，在开源界都是空白——这与 PRD 的差异化判断一致，也意味着只能「拼装」而不能「整体借鉴」。
2. 各需求域都有成熟度不一的参考件，最值得直接引入的依赖只有少数几个：**instructor、litellm（SDK）、promptfoo（开发期）、scrollama、gitingest**；其余绝大多数应按「抄数据模型/抄管线设计」处理。
3. **License 红线**：Immich / PhotoPrism / khoj / Tropy / Zingg / OpenRecall / make-a-wrapped 均 AGPL；screenpipe 已转商业许可；RARR 无 license 文件；trufflehog AGPL。这些只看不抄。

---

## 1. Claim 可信度与证据溯源（对应真实性契约、Core Claim Grounding = 100%）

| 项目 | Stars / License | 状态 | 用法 |
|---|---|---|---|
| [ragas](https://github.com/vibrantlabsai/ragas)（已迁 vibrantlabsai org） | 15.4k / Apache-2.0 | 维护放缓 | 引入指标/抄流水线 |
| [trungdong/prov](https://github.com/trungdong/prov) | 138 / MIT | 活跃（v3.0） | 可直接引入 |
| [THUDM/LongCite](https://github.com/THUDM/LongCite) | 521 / Apache-2.0 | 停更（模型可用） | 抄 anchor 设计 |
| [GAIR-NLP/factool](https://github.com/GAIR-NLP/factool) | 933 / Apache-2.0 | 研究原型 | 抄架构 |
| [google-deepmind/long-form-factuality (SAFE)](https://github.com/google-deepmind/long-form-factuality) | 692 / 自定义 | 活跃 | 抄流程 |
| [shmsw25/FActScore](https://github.com/shmsw25/FActScore) | 456 / MIT | 低维护 | 抄 prompt |
| [amazon-science/RefChecker](https://github.com/amazon-science/RefChecker) | 434 / Apache-2.0 | **已归档** | 抄数据模型 |
| [princeton-nlp/ALCE](https://github.com/princeton-nlp/ALCE) | 526 / MIT | 停更 | 抄指标定义 |
| [yuxiaw/Factcheck-GPT](https://github.com/yuxiaw/Factcheck-GPT) | 117 / Apache-2.0 | 停更 | 抄状态标签 |
| [anthonywchen/RARR](https://github.com/anthonywchen/RARR) | 54 / **无 license** | 停更 | 只看思想，禁抄代码 |

关键可吸收设计：

- **按证据类型路由验证器**（FacTool）：照片 EXIF 是程序可验证证据、Git 历史是可计算证据、笔记是文本检索证据、AI 对话只能支撑 Inference——不同来源可信级不同、验证器也不同，这是把「Unsupported Assertion = 0」工程化的架构基础。
- **Claim 原子化 + 去上下文化**（SAFE/FActScore）：claim 抽取后先改写为自包含（去指代），才能独立核验与锚定；FActScore 的 `atomic_facts.py` 是社区复用最多的实现。
- **anchor = 带编号句单元**（LongCite）：把源文档预切成编号句子，引用指向句号而非字符 offset——比 offset 抗重排/格式化，且其 CoF（粗→细两阶段）是低成本落地路径。
- **claim 三元组化**（RefChecker）：结构化 (subject, predicate, object) 抗改写、可入库、可比较，对 Event Review 的合并/拆分操作天然友好；其 localization 模型 = 裁决结果自动映射回 evidence span。
- **AI 产物与用户事实分离的正规模型**（prov，W3C PROV）：`Claim wasDerivedFrom EvidenceAnchor`；`Story wasDerivedFrom Event`；AI 是 Agent/Activity，只有经用户确认的 attribution 才指向用户——用 PROV-DM 最小子集（entity/activity/agent + derivation/generation/attribution）设计 schema，或直接引入该库获得标准化序列化。
- **正确性与引用质量分开度量**（ALCE）：「叙述内容对」和「每句都挂了 anchor」是两个指标；Grounding = 100% 数学上即 citation recall = 100%。AIS 框架（Google）的可归因定义建议直接写进 PRD 作验收定义。
- **Agreement Gate**（RARR）：证据与断言无冲突就不动它，只修被反驳的字段——避免过度改写。
- **check-worthiness 前置过滤**（Factcheck-GPT）：不是每条 claim 都值得核验，观点/不可验证表述直接进 Unknown 桶；其 CP/PS/RE/IR 四态立场标签与我们的五状态机同构。
- 附加：[deepeval](https://github.com/confident-ai/deepeval)（17.8k，Apache-2.0）把 Grounding 断言写成 pytest 风格 CI 门禁；[AlignScore](https://github.com/yuh-zha/AlignScore)（MIT 权重）单个 4GB 本地模型离线做 claim↔evidence 预筛。

## 2. Event Review 人机协同（对应第一价值时刻、Gap Interview、Correction Load）

| 项目 | Stars / License | 状态 | 用法 |
|---|---|---|---|
| [Argilla](https://github.com/argilla-io/argilla) | 5.1k / Apache-2.0 | 活跃 | 抄 suggestion/response 双轨模型 |
| [Label Studio](https://github.com/HumanSignal/label-studio) | 28.1k / Apache-2.0 | 非常活跃 | 抄状态机字段 + 键位体系 |
| [DocETL](https://github.com/ucbepic/docetl) | 4.0k / MIT | 活跃 | 可直接引入（管线原型） |
| [Splink](https://github.com/moj-analytical-services/splink) | 2.4k / MIT | 非常活跃 | 可直接引入（消歧打分引擎） |
| [OpenRefine](https://github.com/OpenRefine/OpenRefine) | 11.9k / BSD-3 | 活跃 | 抄合并交互 + 操作历史 |
| [Zingg](https://github.com/zinggai/zingg) | 1.2k / **AGPL** | 活跃 | 只抄治理模式 |
| [LangGraph](https://github.com/langchain-ai/langgraph) | 40.2k / MIT | 非常活跃 | 抄 interrupt 抽象/可引入 |
| [Typebot](https://github.com/baptisteArno/typebot.io) | 10.3k / **FSL-1.1** | 活跃 | 抄分支问答流机制 |
| [Adala](https://github.com/HumanSignal/Adala) | 1.6k / Apache-2.0 | 活跃 | 可引入（验证回流闭环） |

关键可吸收设计：

- **suggestion / response 双轨**（Argilla）：Candidate Event 拆成 `extraction_suggestion（claim + score + agent + run_id）` 与 `user_decision（status + 修正后内容）` 两张表，AI 建议永不被覆盖；`discarded` 而非删除（保留 Disputed 回溯）；`pending` 是视图不是状态。这是「AI 产出必须经 verify/edit/reject」的最成熟开源数据模型。
- **状态机字段**（Label Studio，已读源码）：`was_cancelled`（skip ≠ reject 两种语义都要有）、`draft_created_at`、`parent_prediction` 溯源链；**`lead_time`（每卡停留毫秒）是 Claim Correction Load 的现成度量先例**；快捷键 + 键位可重绑的批审体系。
- **操作即历史**（OpenRefine）：每次用户修正是一条可撤销、可重放的操作记录而非覆盖式 UPDATE——既是审计日志，操作序列长度即修正负担。
- **合并审核表**（OpenRefine Cluster 对话框）：每行 = 一组疑似重复事件 + 各自证据计数 + Merge? 复选框 + 合并后标题/时间可编辑。
- **人工决策锁定**（Zingg，AGPL 只借模式）：`User-confirmed` 事件在后续增量导入时永不降级、永不自动合并/拆分；判定三态 Match/No/Can't Say（→ Unknown），数字键批量处理。
- **证据权重瀑布**（Splink）：每张事件卡展示「结论 = 证据 A（+3.2 支持）+ 证据 B（−1.4 反对）」的字段级分解，冲突自然浮现；`pip install splink` 可直接当实体消歧打分引擎（DuckDB 本地跑）。
- **中断点抽象**（LangGraph `interrupt()`）：确认=放行落库、修正=改 payload 放行、排除=终止分支并记录，每次人工干预留在 checkpoint 历史。
- **Gap Interview**：Typebot 的分支流引擎机制（hidden field 携带上下文实现非诱导个性化、会话可暂停恢复）+ me.md 的 interview→review queue 闭环 + 「只用本人原话、prompt 禁止发明」写成可测试契约。
- **验证回流**（Adala）：用户确认的 Event 回流为 ground truth/少样本，反哺后续抽取逐步降低 Correction Load——与产品核心闭环同构。

## 3. 导入 Adapter 与 Coverage（对应 Photo/Note/Git/ChatGPT 四类 Adapter、可恢复管线）

| 项目 | Stars / License | 状态 | 用法 |
|---|---|---|---|
| [Immich](https://github.com/immich-app/immich) | 112k / **AGPL** | 活跃 | 抄 job 体系 + Coverage 对账 |
| [ArchiveBox](https://github.com/ArchiveBox/ArchiveBox) | 28.2k / MIT | 活跃 | 抄状态机 + 预建结果行（代码可参考） |
| [ActivityWatch](https://github.com/ActivityWatch/activitywatch) | 18.7k / MPL-2.0 | 活跃 | 抄 bucket 组织模型 |
| [khoj](https://github.com/khoj-ai/khoj) | 36.6k / **AGPL** | 活跃 | 抄内容哈希增量算法 |
| [gitingest](https://github.com/coderamp-labs/gitingest) | 15.3k / MIT | 活跃 | **直接引入**（Git Adapter 库） |
| [obsidian-export](https://github.com/zoni/obsidian-export) | 1.3k / BSD-2-Patent | 活跃 | **直接引入**（Note 解析，Rust） |
| [claude-chat-viewer](https://github.com/osteele/claude-chat-viewer) | 104 / MIT | 活跃 | 抄聊天导出解析（代码可参考） |
| [claude-code-log](https://github.com/daaain/claude-code-log) | 1.2k / MIT | 活跃 | 抄角色×内容块归一化 |
| [chatgpt-exporter](https://github.com/pionxzh/chatgpt-exporter) | 2.7k / MIT | 活跃 | 格式演进预警雷达 |
| [hercules](https://github.com/src-d/hercules) | 2.8k / Apache-2.0 | 停维护 | 抄 Git 挖掘 DAG 算法 |
| [screenpipe](https://github.com/screenpipe/screenpipe) | 21k / **商业许可** | 活跃 | 只看架构（a11y 优先、脱敏中间件、sqlite-vec） |
| [emulo](https://github.com/ohad6k/emulo) | 272 / MIT | 小众 | 跟踪（AI 日志挖成证据→画像，愿景最接近） |

关键可吸收设计：

- **两段式 fan-out + Skipped 一等公民**（Immich，已读 `server/src/enum.ts`）：每个管线阶段 = `QueueAll`（全库扫描投递子任务）+ `Xxx`（单项处理）两种 job，重跑幂等、子任务独立重试；处理器返回 `Success/Failed/Skipped` 三态——「已处理但主动跳过 ≠ 失败」正是 Coverage 报告所需。
- **Coverage 对账三件套**（Immich Integrity 任务）：`MissingFiles`（DB 有文件无）/ `UntrackedFiles`（文件有 DB 无）/ `ChecksumMismatch`（被动过）——「避免把没处理当成没发生」的成品实现。加上 ArchiveBox 的「预建结果行」（计划中的处理先落库，未跑也可见）。
- **append-only attempt**（ArchiveBox 的反面 + 修正）：其 SnapshotMachine（QUEUED→STARTED→SEALED + 显式 PAUSED/RESUME）值得抄，但它重试是原地重置覆盖旧失败——我们应改为追加 attempt 行。它的「文件系统按日期/域名/UUID 组织成人可浏览目录、DB 只做索引」的双表示策略很适合本地优先。
- **内容哈希幂等键**（khoj，已读源码）：chunk → md5 → 按文件对比新旧哈希集合 → 只对差集重建 embedding，重跑永远只做增量。
- **各源各存 bucket**（ActivityWatch）：Photo/Note/Git/Chat 四类 Evidence 各自存桶 + 规范事件类型对齐 + 查询期归并，而不是先揉成一张大表。
- **证据五件套**（Immich asset 表）：原始路径不变 + checksum 身份 + EXIF 时间 + `localDateTime`（本地日历日物化列——人生时间轴应挂本地时区日而非 UTC）+ sidecar 元数据分离。
- **ChatGPT conversations.json 解析共识**（多项目一致）：消息树沿 `current_node` 回溯 parent 链取当前生效分支（编辑/重生成产生孤儿分支）；角色在 `message.author.role`；正文 `content.parts[]` 按 content_type 分型；**conversation UUID + message node id 做主键，标题只是弱 metadata**——与 PRD 角色语义一致。
- **a11y 优先 / OCR 兜底 + 脱敏中间件**（screenpipe，只看架构）：OCR 量可大幅下降；PII 脱敏独立成层。
- 另：OpenRecall 维护已停滞约一年（最后提交 2025-09），别再当参考主线。

## 4. 策展与 2D 展览（对应 Theme/Story/Exhibition、Share Package）

| 项目 | Stars / License | 状态 | 用法 |
|---|---|---|---|
| [Omeka ExhibitBuilder](https://github.com/omeka/plugin-ExhibitBuilder) | 25 / GPL-3.0 | 活跃 | 抄展览四层数据模型（含金量最高） |
| [Omeka S](https://github.com/omeka/omeka-s) | 506 / GPL-3.0 | 活跃 | 抄 Item 池 + 多展览引用架构 |
| [TimelineJS3](https://github.com/NUKnightLab/TimelineJS3) | 3.2k / MPL-2.0 | 活跃 | 抄 JSON schema / 可嵌入 |
| [Scrollama](https://github.com/russellsamora/scrollama) | 6.0k / MIT | 稳定 | **直接引入**（滚动叙事引擎） |
| [Tropy](https://github.com/tropy/tropy) | 1.1k / **AGPL** | 非常活跃 | 抄聚合粒度 + 模板化元数据 |
| [Wax](https://github.com/minicomp/wax) | 180 / MIT | 低频 | 抄静态 Share Package 方法论 |
| [make-a-wrapped](https://github.com/DevMatei/make-a-wrapped) | 95 / **AGPL** | 活跃 | 抄受保护分享令牌模型 |
| [plex-rewind](https://github.com/RaunoT/plex-rewind) | 300 / GPL-3.0 | 活跃 | 抄回顾页 UI 模式 |
| [thumbsup](https://github.com/thumbsup/thumbsup) / [sigal](https://github.com/saimn/sigal) | 862 / 942，MIT | 活跃 | 抄静态展签发布管线 |
| [OpenSeadragon](https://github.com/openseadragon/openseadragon) | 3.5k / BSD-3 | 活跃 | 可选引入（大图深缩放） |

关键可吸收设计：

- **展览四层模型**（ExhibitBuilder，源码逐字段验证，与 PRD 结构几乎一一对应）：`Exhibit`（title、credits、cover_image、summary_page 开关）→ `ExhibitPage`（**parent_id 页面树，观看顺序 = 深度优先遍历**，`short_title` 供导航）→ `ExhibitPageBlock`（页内有序内容块）→ `ExhibitBlockAttachment`（**item 引用 + 独立 caption**：同一 Event 在不同展览可有不同展签，档案永不被复制）。含乐观锁（record_last_modified）。
- **时间线三件套**（TimelineJS JSON）：`events` + **`eras`**（给一段时间打标签，正好对应人生阶段）+ **`display_date`**（真实日期与展示文案分离，适合模糊日期）。
- **滚动叙事 = 档案序与故事序并置**（Scrollama）：左侧滚动章节文字、右侧 sticky 区随步骤切换展品卡片，MIT 零依赖可直接引入。
- **静态 Share Package**（Wax + thumbsup + make-a-wrapped）：从本地档案按选择导出自包含静态站（图片多分辨率变体 + 数据 + 渲染层），任意静态托管即完成 Unlisted 分享；make-a-wrapped 的「只公开聚合结果、快照过期、URL 稳定但仅本人可更新」令牌模型可参考。
- **聚合粒度**（Tropy，AGPL 只借模型）：item = 语义上一组照片而非单张，对应「人生事件 = 若干素材聚合」；图上选区注释对应「直接引语逐字可追溯」的图像版。
- **明确不用**：Mirador/完整 IIIF 栈（机构级互操作，个人档案过重）；Omeka 本体（PHP/LAMP + GPL）；一切 3D 方案。

## 5. 评测 Harness 与可恢复推理管线（对应 Phase 0 Scorecard、BYOK、Egress 审计）

| 项目 | Stars / License | 状态 | 用法 |
|---|---|---|---|
| [inspect_ai](https://github.com/UKGovernmentBEIS/inspect_ai) | 2.6k / MIT | 非常活跃 | 抄 harness 分层 + 缓存 key 规范 |
| [promptfoo](https://github.com/promptfoo/promptfoo) | 24.4k / MIT | 非常活跃 | **直接引入**（gate 跑批） |
| [ragas](https://github.com/vibrantlabsai/ragas) | 15.4k / Apache-2.0 | 放缓 | 抄 Faithfulness 流水线 |
| [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) | 13.7k / MIT | 活跃 | 抄「缓存+跳过」断点模式 |
| [dbos-transact-py](https://github.com/dbos-inc/dbos-transact-py) | 1.5k / MIT | 活跃 | 抄表模型（或引入，需 Postgres） |
| [simonw/llm](https://github.com/simonw/llm) | 12.4k / Apache-2.0 | 活跃 | 抄推理账本 schema |
| [instructor](https://github.com/567-labs/instructor) | 13.8k / MIT | 活跃 | **核心依赖，直接引入** |
| [litellm](https://github.com/BerriAI/litellm) | 56.9k / MIT 核 | 非常活跃 | **核心依赖，SDK 模式引入** |
| [presidio](https://github.com/data-privacy-stack/presidio)（已迁 org） | 10.6k / MIT | 活跃 | **直接引入**（egress PII 检查） |
| [gitleaks](https://github.com/gitleaks/gitleaks) | 28.9k / MIT | 活跃 | 直接引入（secret 规则思路） |

关键可吸收设计：

- **Unsupported Assertion = 0 的算法骨架**（ragas Faithfulness）：claim 分解 → 逐条对 evidence NLI 裁决（可换 HHEM 本地小模型离线跑）→ 不支持条目计数即事故数，gate 断言 = 计数为 0。建议直接自实现两段式流水线（ragas 维护放缓，且 per-claim verdict API 有版本风险）。
- **缓存 key 规范**（inspect + promptfoo 共识）：key = hash(版本化模型名, messages, generate params, tools, prompt/pipeline 版本)；**成功才缓存、失败不缓存（保证重试）；采样次数进独立命名空间；TTL 显式**；用带日期的版本化模型名（`gpt-4-turbo-2024-04-09`）防 provider 漂移。
- **断点续跑 = 结果缓存 + 跳过已评样本**（lm-eval 模式）：Phase 0 harness 无需重型编排引擎。
- **attempt 表模型**（DBOS Transact）：workflow/step/attempt 三表，fork_workflow 从指定步分叉重跑且旧执行保留；无 Postgres 则照表模型用 SQLite 自研。
- **`failed_attempts` 落库**（instructor）：`InstructorRetryException` 暴露每次 attempt 的异常与序号，与 litellm `resolved_model`（别名解析后的真实模型）配合构成 Provider lineage。
- **推理账本**（simonw/llm schema）：消息按内容哈希（BLAKE2b）去重、parent-hash 成树、fork 只挂指针不复制历史、request/response 原文 + token/时长落 SQLite。
- **Egress 门**：presidio Analyzer（出站 PII 检查）+ gitleaks 规则思路（出站含 key/私钥即拒绝，fail closed），结果与任务级授权记录同写审计账本。
- 避坑：openai/evals 事实停更；protectai/llm-guard 2026-07 已归档；Fondant 仓库 404 疑似下线（印证：不要把核心建在小管线框架上，自研薄状态机更稳）。

---

## 6. 最优先行动建议（按 PRD 阶段排序）

1. **Phase 0 立即可做**：抄 Argilla 双轨 + Label Studio 状态字段重构 Candidate Event 表；抄 ragas Faithfulness 流水线做 Unsupported Assertion 检测器；promptfoo 跑三配置（本管线 vs 时间聚类 vs 直接总结）gate 矩阵；引入 instructor 管结构化输出与 attempt。
2. **Phase 0 管线基建**：照 DBOS 表模型用 SQLite 自研 workflow/step/attempt；照 Immich 的 Skipped 语义 + ArchiveBox 预建行做 Coverage；khoj 式内容哈希做增量键。
3. **Phase 0.5（ChatGPT Adapter）**：以 claude-chat-viewer / claude-code-log 的角色×内容块归一化层为参考，主键用 conversation UUID + node id。
4. **Private Alpha（展览）**：ExhibitBuilder 四层模型为 Exhibition schema 蓝本；TimelineJS 的 events/eras/display_date 做时间线总览；Scrollama 直接引入；Wax 方法论做静态 Share Package。
5. **数据模型层**：用 prov（或 PROV-DM 最小子集）统一 Claim→Evidence→Event→Story 溯源，把「AI 是 Activity、用户确认才是 attribution」写进 schema。
