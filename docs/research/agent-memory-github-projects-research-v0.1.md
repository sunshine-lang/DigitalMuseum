# GitHub 开源 Agent Memory 项目调研 v0.1

> 调研日期与来源访问日期：2026-09-04
> 研究范围：GitHub 上开源的 AI/LLM Agent 记忆系统与记忆层项目，含通用记忆框架、记忆操作系统、时间知识图谱、编码 Agent 专用记忆、MCP 记忆服务、Markdown/文件式本地记忆五类，正文收录 16 个项目，另有 9 条已核实但未入正文的项目/模式简记。
> 证据口径：只采用各项目 GitHub 仓库（README 与仓库元数据，经 GitHub API 于 2026-09-04 当日抓取）与项目官方文档站的一手资料；星数与最近推送时间为 2026-09-04 快照；各项目 README 中的 benchmark 分数一律视为**项目方自报口径**，不当作已验证效果；营销性口号（"#1"、"best-benchmarked" 等）不作事实引用。
> 本文严格区分：**来源事实**（一手资料明确说明）、**对 DigitalMuseum 的推断/启示**（基于事实做的判断）、**与本项目边界冲突**（本地优先、无模型调用、确定性提取、SHA-256 证据、静态导出契约相抵触的部分）。
> 同目录的《回忆录 / 数字记忆产品调研》面向消费级产品；本文面向开源 Agent Memory 基础设施，两者互补，不重复。

---

## 0. 先给结论

### 0.1 领域已经分成五条清晰路线，且头部项目在 2026 年大幅换血

1. **通用记忆层框架**（给任意 Agent/App 加记忆的 SDK/服务）：mem0、cognee、MemOS、supermemory、hindsight；
2. **记忆操作系统 / 上下文数据库**（把记忆当资源管理）：letta（MemGPT 后裔）、OpenViking；
3. **时间知识图谱**：graphiti（Zep 开源内核），Zep 开源版本体已死；
4. **编码 Agent 专用记忆**（Claude Code / Codex / OpenCode / DSH 等本机会话 harness）：MemPalace、engram、memsearch、agentmemory、mcp-memory-service；
5. **Markdown/文件式本地记忆**：basic-memory、EverOS。

与一年前相比的结构性变化（均为仓库一手资料可见）：Zep 开源社区版弃维护、仓库降级为云服务示例集；letta 主仓库退化为落地页，活跃开发迁往 letta-code；mem0 旗下 OpenMemory 从本地记忆面板转型为跨 harness 会话搬运 CLI；memobase、A-Mem 等项目停滞。新晋高星项目（MemPalace 5.9 万、OpenViking 3.5 万、agentmemory 2.8 万、hindsight 2.2 万）几乎全部以**编码 Agent 会话记忆**为主战场——这正是 DigitalMuseum 的数据源地带。

### 0.2 与 DigitalMuseum 边界最同路的，是"原文层 + 派生索引层"这一族

编码 Agent 记忆阵营在 2026 年收敛出一个与 DigitalMuseum 高度同构的工程姿势：**逐字原文是不可变真相源，一切索引/摘要都是派生的、可重建的缓存**。

- MemPalace 自述"逐字存储对话原文，不概括、不抽取、不复述"，检索层（ChromaDB）可插拔替换；
- memsearch 明确"Markdown 是真相源，Milvus 只是影子索引：派生、可重建的缓存"，并用 SHA-256 内容哈希跳过未变内容；
- EverOS 用"规范 Markdown 文件 + 本地 SQLite + LanceDB，不依赖任何外部服务"；
- basic-memory 是"磁盘上的纯文本，AI 和人读写同一批 Markdown"。

DigitalMuseum 的 Evidence Blob（SHA-256 落盘）+ 派生视图结构，在这个生态里不是异类，而是被头部项目反复验证的同一路线。差别只在目的：它们把记忆**喂回给 Agent**，DigitalMuseum 把证据**呈现给人**。

### 0.3 主流框架的核心机制全部依赖模型调用，与"无模型"边界直接冲突

mem0 的记忆抽取、cognee 的知识图谱构建（需 LLM_API_KEY）、graphiti 的实体/事实抽取、supermemory 的事实与画像提取、EverOS 的记忆写入（需 OpenRouter key）、OpenViking 的三层摘要加工，本质都是"用 LLM 把原文蒸馏成记忆"。这与 PRD v0.3 的硬性约定（不引入模型调用；将来引入时输出只能是 candidate + 逐字锚定）冲突。**可以借鉴的是它们的确定性工程件，不是语义管线**：SHA-256 哈希去重、FTS5/BM25 关键字检索、无嵌入退化路径、快照替换、时间有效窗口、provenance 回溯。

### 0.4 DigitalMuseum 无需跟进"记忆 benchmark 军备竞赛"

当前所有头部项目都在用 LoCoMo / LongMemEval / OmniMemEval / BEAM 等基准互相比分（mem0 自报 92.5 LoCoMo、MemOS 88.83、supermemory 自称三项第一、hindsight 自称 SOTA 且有第三方复现）。注意 mem0 自己在 README 里声明：这些分数来自含专有优化的托管平台，"开源用户应预期方向相似但数值不同"。这是典型的**模型栈绑定 + 厂商自报**赛道。DigitalMuseum 的价值在确定性可复算（时间戳/计数/哈希校验），不存在"记忆检索准确率"这个维度，不应被带进这场竞赛。

### 0.5 生态位提示：DM 的四适配器 + 幂等同步口径在该生态里仍然独特

与 DM 数据源正面重叠的是 OpenMemory（mem0 官方，已转型）与各编码 Agent 记忆插件的"会话捕获钩子"。但它们的目的是让 Agent 跨会话/跨 harness 复用上下文（搬运整段会话、自动总结、注入提示），没有一家做"确定性提取 + 分级信任 + 证据链 + 静态展览"。DM 的差异化恰好在这些项目都不做、也做不到无模型完成的事情上。另外：memOS / EverOS / memsearch 在 2026 年都已提供 DeepSeek Harness（dsh）官方插件或适配，说明 DM 严口径的四产品（claude/codex/pi/dsh）在本机生态中有真实需求基础。

---

## 1. 对比总表

星数与最近推送均为 2026-09-04 GitHub API 快照。"模型依赖"指核心机制（抽取/构图/摘要）是否需要 LLM 调用。

| 项目 | 维护方 | Stars | 主语言 / License | 核心机制 | 模型依赖 | 部署形态 | 编码 Agent / MCP 接入 |
|---|---|---|---|---|---|---|---|
| [mem0](https://github.com/mem0ai/mem0) | Mem0（YC S24） | 64,702 | Python / Apache-2.0 | ADD-only 记忆抽取 + 实体链接 + 语义/BM25/实体多信号融合检索 + 时间感知 | 必需 | 库 / 自托管 Docker / 云平台 | 官方 mem0-mcp 仓库 + CLI |
| [MemPalace](https://github.com/MemPalace/mempalace) | MemPalace | 58,837 | Python / MIT | 逐字原文存储 + 结构化索引（wings/rooms/drawers）+ 语义检索，检索后端可插拔（默认 ChromaDB） | 检索用本地嵌入，宣称零 API 调用 | 本地优先（uv/pipx/Docker） | MCP server + 三个 Agent 技能，主打 Claude Code 会话留存 |
| [OpenViking](https://github.com/volcengine/OpenViking) | 火山引擎 | 35,460 | Python / AGPL-3.0 | `viking://` 虚拟文件系统统一记忆/资源/技能，L0/L1/L2 三层分级加载，可观察检索轨迹 | 必需 | 自托管 / Studio 在线演示 | OpenClaw / Hermes / Claude Code 集成 |
| [graphiti](https://github.com/getzep/graphiti) | Zep | 30,587 | Python / Apache-2.0 | 时序知识图谱：实体 + 带时间有效窗口的事实边 + episodes 溯源，增量更新不重算全图 | 必需 | 自托管框架（自带图数据库） | 官方 MCP server 目录 |
| [cognee](https://github.com/topoteretes/cognee) | Topoteretes | 30,460 | Python / Apache-2.0 | 向量嵌入 + 知识图谱 + 认知科学本体生成的记忆管道 | 必需（LLM_API_KEY） | 自托管（pip/Docker） | Claude Code 插件、OpenClaw 插件、MCP 镜像 |
| [supermemory](https://github.com/supermemoryai/supermemory) | Supermemory | 29,226 | TypeScript / MIT | 事实抽取 + 自动画像 + 矛盾/过期处理 + RAG 记忆混合检索 + 连接器 | 必需（可 Ollama 全离线） | 自托管单二进制 / 云 | App、浏览器插件、MCP server |
| [agentmemory](https://github.com/rohitg00/agentmemory) | Rohit Gupta | 28,006 | TypeScript / Apache-2.0 | 会话记忆服务器（iii 引擎）：54 个 MCP 工具 + 12 自动钩子，BM25/图检索可无 key 运行 | 可选（keyless 即 BM25） | 本地 npm 服务（零外部数据库） | Claude Code / Codex / Cursor / Gemini / pi / OpenClaw 等 20 适配器 |
| [letta](https://github.com/letta-ai/letta) | Letta | 24,617（落地页）+ 3,201（letta-code） | TypeScript（letta-code）/ Apache-2.0 | 有状态 Agent 平台：记忆/身份/自我改进，MemGPT 分层记忆血统 | 必需 | npm CLI / 桌面 App / Letta Cloud | 桌面/浏览器/Slack 等渠道，Agent SDK |
| [hindsight](https://github.com/vectorize-io/hindsight) | Vectorize | 22,485 | Python / MIT | retain/recall/reflect 三操作 + observations + 心智模型/知识页 + 记忆银行隔离 | 必需（25+ 提供商，可全本地 ollama） | Docker / pip / K8s / 嵌入式 Python / 云 | MCP server（每 bank 一个端点）+ 编码 Agent 集成 |
| [EverOS](https://github.com/EverMind-AI/EverOS) | EverMind | 12,699 | Python / Apache-2.0 | Markdown 规范源 + SQLite + LanceDB 三件套；用户 episodes/profile 与 agent cases/skills 双轨；离线反思进化 | 必需（OpenRouter key；demo 无 key 仅关键字） | 本地优先运行时（Python 库） | dsh / Hermes / OpenClaw / Raven / Dify 插件 |
| [MemOS](https://github.com/MemTensor/MemOS) | MemTensor | 11,184 | TypeScript / Apache-2.0 | 记忆操作系统：统一记忆 API（可检视图记忆）、记忆立方体、异步调度、自然语言纠错 | 必需 | 云 API / 自托管（Neo4j+Qdrant）/ 本地插件（SQLite+FTS5+向量） | OpenClaw / Hermes / DeepSeek Harness 插件 |
| [engram](https://github.com/Gentleman-Programming/engram) | Gentleman Programming | 6,318 | Go / MIT | 单 Go 二进制 + SQLite FTS5 全文检索（无嵌入），策展式项目记忆 + 会话交接协议 | 不需要（纯关键字检索） | 单二进制本地（~/.engram/engram.db） | MCP stdio：Claude Code / Codex / Cursor / Windsurf 等 |
| [basic-memory](https://github.com/basicmachines-co/basic-memory) | Basic Machines | 3,855 | Python / AGPL-3.0 | Markdown 文件知识库 + observations/wikilinks 知识图谱 + 语义检索（可选重排） | 语义检索需要，文件读写不需要 | 本地优先（uv 工具），可选云同步 | MCP 原生（全客户端） |
| [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) | OSU NLP 组 | 3,980 | Python / MIT | 海马体索引理论启发的离线图谱索引 + 在线个性化 PageRank 检索（NeurIPS'24 / ICML'25） | 必需（OpenAI 或 vllm/gritlm 本地） | 研究框架（pip 包） | 无 |
| [memsearch](https://github.com/zilliztech/memsearch) | Zilliz | 2,564 | Python / MIT | Markdown 真相源 + Milvus 影子索引（可重建缓存），SHA-256 哈希跳过未变内容，三层召回 | 捕获即总结（需模型）| 本地插件（每平台安装脚本） | Claude Code / Codex / DSH / OpenClaw / OpenCode 官方插件 |
| [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) | doobidoo | 1,923 | Python / Apache-2.0 | 自托管记忆后端：SQLite + 本地 ONNX 嵌入 + 带类型边的知识图谱 + 自动整合 | 检索用本地 ONNX，无需云端 API | 单服务自托管（REST/MCP/OAuth/CLI/面板） | Claude Desktop / Claude Code / OpenCode / LangGraph 等 |

未入正文但已核实的相关项目：[memobase](https://github.com/memodb-io/memobase)（2,885 星，2026-01 起停滞）、[memU](https://github.com/NevaMind-AI/memU)（14,379 星，云服务型）、[A-Mem](https://github.com/agiresearch/A-mem)（1,167 星，研究代码，2025-12 起无推送）、[mem0ai/openmemory](https://github.com/mem0ai/openmemory)（34 星，已转型跨 harness 会话搬运 CLI）、[getzep/zep](https://github.com/getzep/zep)（4,889 星，降级为 Zep Cloud 示例仓库）、memory-bank 模式（散布为模板/skill 包，无单一头部项目）。详见第 3 章。

---

## 2. 逐项目证据与判断

### 2.1 通用记忆层框架

#### 2.1.1 mem0：事实只增不覆盖的"记忆层"标准件

**来源事实**

- 定位为"AI Agent 与应用的记忆层"，提供库、自托管 Docker 服务、托管云平台三种形态（README 对比表）。[mem0 GitHub](https://github.com/mem0ai/mem0)
- 2026-04 新算法核心变化：单趟 ADD-only 抽取（一次 LLM 调用，无 UPDATE/DELETE，记忆只累积不覆盖）；Agent 确认过的事实成为一等公民；实体抽取、嵌入、跨记忆链接；语义 + BM25 + 实体匹配多信号融合检索；时间感知检索（按当前状态/过去事件/未来计划排序正确的日期实例）。[README](https://github.com/mem0ai/mem0#new-memory-algorithm-april-2026)
- README 自报 LoCoMo 92.5 / LongMemEval 94.4 / BEAM 分数，同时明确声明：分数来自含专有优化的托管平台，"开源用户应预期方向相似但数值不同"；评测框架在 [mem0ai/memory-benchmarks](https://github.com/mem0ai/memory-benchmarks) 开源可复现。[README](https://github.com/mem0ai/mem0#research-highlights)
- 多级记忆模型：User / Session / Agent 三级状态。[README](https://github.com/mem0ai/mem0#key-features--use-cases)
- CLI 支持"Agent 自助注册"（`mem0 init --agent`，五秒铸造 API key，人类所有者事后认领）。[README](https://github.com/mem0ai/mem0#sign-up-as-an-agent)
- 官方 MCP 服务器在独立仓库 [mem0ai/mem0-mcp](https://github.com/mem0ai/mem0-mcp)（658 星，2026-09-04 快照）。
- 仓库元数据（2026-09-04）：64,702 星，Python，Apache-2.0，当日仍有推送。

**对 DigitalMuseum 的推断/启示**

- "ADD-only、不覆盖旧记忆"与 DM 的 Evidence Blob 不可原地改写同构：记忆系统的可信度来自"发生过的事实永不改口"，改错走追加修正而非原地抹除。DM 的快照替换（先摘开引用再删旧 occurrence）已经是这个思路。
- mem0 把"开源分数 ≠ 平台分数"写进 README，是引用 benchmark 时应有的纪律；DM 调研/决策文档引用任何自报分数时应保持同样口径。
- 多信号检索（BM25 + 语义 + 实体）是成熟形态，但 DM 当前无检索需求；若未来加，可先走 SQLite FTS5（标准库级），与 mem0 的"语义只是其中一路信号"分层一致。

**与边界冲突**

- 核心记忆抽取完全依赖 LLM 调用，且默认形态是云平台/API key；DM 不引入模型调用、不把数据送云端，mem0 的管线整体不可用，只能作机制参照。

#### 2.1.2 MemPalace：逐字存储 + 结构化索引，与 DM 严口径最接近的高星项目

**来源事实**

- 自我定位一句话："Local-first AI memory. Verbatim storage, pluggable backend"——把对话历史**逐字**存储，用语义检索取回，"不概括、不抽取、不复述"；索引是结构化的：人物/项目成 wings、话题成 rooms、原文住 drawers，检索可以按范围圈定而非全库平铺。[README](https://github.com/MemPalace/mempalace#what-it-is)
- "Nothing leaves your machine unless you opt in"；检索层可插拔，默认 ChromaDB，接口在 `mempalace/backends/base.py`。[README](https://github.com/MemPalace/mempalace#what-it-is)
- 宣称"96.6% R@5 raw on LongMemEval — zero API calls"（自报口径）。[README](https://github.com/MemPalace/mempalace) 标题区
- 分发形态：`npx skills add` 装三个 Agent 技能（安装引导 / search-before-answer 回忆 / logstream 委托），技能引导安装 CLI 与 MCP server；或 `uv tool install mempalace` 直装；另有容器镜像跑 MCP server / CLI。[README](https://github.com/MemPalace/mempalace#install)
- README 头部有显眼的防假冒站点警告（官方只有 GitHub / PyPI / mempalaceofficial.com，其余域名可能是恶意仿冒）。[README](https://github.com/MemPalace/mempalace) CAUTION 块
- README 专门提示"Claude Code 会话 30 天后过期（未接自动保存钩子时）"并给出留存检查清单，把"抢救本机会话原文"列为核心动机。[README](https://github.com/MemPalace/mempalace#what-it-is)、[Discussion #1388](https://github.com/MemPalace/mempalace/discussions/1388)
- 仓库元数据（2026-09-04）：58,837 星，Python，MIT，当日有推送。

**对 DigitalMuseum 的推断/启示**

- MemPalace 与 DM 的第一动机完全同源：**本机 Agent 会话是易失品，先原文保全，再做一切**。它证明了"不做摘要的逐字记忆"在这个生态里能拿到最高量级的星数——DM 的严口径（只提取时间戳/计数/首条消息原文，不整份复制、不解读内容）在用户心智上有同盟。
- "结构化索引只用于圈定检索范围（wings/rooms/drawers），原文永远在抽屉里"——对应 DM 的浏览镜头（按项目/按 Agent/按日期）只做事实重排，不产生新事实。DM 已是同构，可作为将来论述"我们与记忆层产品的区别"时的例证。
- 防假冒站点警告值得留意：本地工具一旦有了知名度，下载渠道安全（哈希校验、官方域名声明）就是数据完整性的一部分，DM 的"永不偷懒例外"清单精神一致。

**与边界冲突**

- 语义检索需要本地嵌入模型（ChromaDB 默认路径）；DM 无检索功能需求时不必引入，引入也应作为可选派生索引而非真相源。

#### 2.1.3 cognee：需要 LLM 的图谱记忆管道

**来源事实**

- 定位"开源 AI 记忆平台"：摄入任意格式数据，持续构建自托管知识图谱；向量嵌入 + 图推理 + 认知科学本体生成结合。[README](https://github.com/topoteretes/cognee#about-cognee)
- 快速开始第二步即配置 `LLM_API_KEY`（默认 OpenAI），支持多 LLM 提供商。[README](https://github.com/topoteretes/cognee#step-2-configure-the-llm)
- 卖点包括"Build Company Brain"（团队知识统一）、用户/租户隔离、可追溯性（traceability）、OTEL 审计。[README](https://github.com/topoteretes/cognee#why-use-cognee)
- 分发：pip/uv 包、Docker Compose（`cognee` 与 `cognee-mcp` 两个服务）、Claude Code 插件（cognee-integrations 仓库）、OpenClaw 插件、Rust/TypeScript 客户端。[README](https://github.com/topoteretes/cognee)
- 研究论文：[Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning](https://arxiv.org/abs/2505.24478)（2025）。
- 仓库元数据（2026-09-04）：30,460 星，Python，Apache-2.0，当日有推送。

**对 DigitalMuseum 的推断/启示**

- "traceability / audit traits"作为记忆平台卖点，印证"可追溯"已是该赛道的合规基线；DM 的证据链（blob 哈希 + anchor）在这一点上领先于多数同类。
- Claude Code 插件目录式分发（cognee-integrations）是观察"第三方如何挂进 Claude Code"的样本，与 DM 无直接关系但可留档。

**与边界冲突**

- 图谱与本体生成都依赖模型调用；整体机制与 DM 的确定性提取不可调和，不借鉴其管线。

#### 2.1.4 MemOS：记忆操作系统，本地插件形态值得看

**来源事实**

- 定位"LLM 与 Agent 的记忆操作系统"，统一 store/retrieve/manage；核心特性：统一记忆 API（记忆结构化为**可检视、可编辑的图**，明确自称"不是黑盒嵌入库"）、多模态记忆、可组合的记忆立方体（多知识库隔离/受控共享）、MemScheduler 异步摄取、自然语言反馈纠错。[README](https://github.com/MemTensor/MemOS#key-features)
- 四种部署入口：Cloud API / 自托管（Neo4j + Qdrant）/ Cloud 插件 / 本地插件（`100% on-device`，SQLite 持久化 + FTS5+向量混合检索 + Memory Viewer 面板，面向 DeepSeek Harness、Hermes、OpenClaw）。[README](https://github.com/MemTensor/MemOS#-quick-start)
- 2026-08-17 官宣接入 DeepSeek Harness（dsh）：任务前自动召回、成功回合后留存经验，不改其内核。[README](https://github.com/MemTensor/MemOS) News 区
- 本地插件血统：L1 traces / L2 policies / L3 world models / 结晶化 Skills 分层；"100% local, zero cloud dependency"。[README](https://github.com/MemTensor/MemOS) News 区
- 自报 LoCoMo 88.83 / LongMemEval 89.20 等分数，评测走其开源的 [OmniMemEval](https://github.com/MemTensor/OmniMemEval)（14 个商业记忆产品 × 10 个数据集的统一评测）。[README](https://github.com/MemTensor/MemOS#-performance)
- 论文：[MemOS: A Memory OS for AI System](https://arxiv.org/abs/2507.03724)。
- 仓库元数据（2026-09-04）：11,184 星，主语言已转为 TypeScript，Apache-2.0，2026-09-03 有推送。

**对 DigitalMuseum 的推断/启示**

- "记忆图可检视可编辑，拒绝黑盒嵌入库"与 DM"证据必须能回到原文"的理念相通，可作为 S5 侧滑证据抽屉的同温层例证。
- OmniMemEval 把评测分为"用户记忆任务 / Agent 记忆任务"两族的做法，对 DM S6 以会话数据重建评测基线时有分类学参考价值（DM 对应的是"确定性读数正确性"，不是语义回忆）。
- dsh 官方插件（memOS、EverOS、memsearch 三家都有）说明 DeepSeek Harness 是 2026 年记忆生态的一等公民，DM 对 dsh 的适配器投入有生态依托。

**与边界冲突**

- 记忆抽取/纠错/调度全部依赖模型；云 API 是默认入口之一。本地插件的 FTS5 检索部分是确定性工程件，其余不借鉴。

#### 2.1.5 supermemory：单二进制自托管 + 全离线路径

**来源事实**

- 定位"memory and context engine"，能力表：从对话抽取事实、处理时间变化与矛盾、自动遗忘过期信息、自动维护用户画像（~50ms）、RAG + 记忆混合检索、Google Drive/Gmail/Notion/GitHub 等连接器、PDF/图片 OCR/视频转写/代码 AST 分块等多模态抽取。[README](https://github.com/supermemoryai/supermemory)
- 自称 LongMemEval / LoCoMo / ConvoMem 三大基准第一（95% Recall@15，99.4% 上下文缩减）——营销口径，属自报。[README](https://github.com/supermemoryai/supermemory)
- 自托管形态："One binary. Zero config. Bring any model — or run fully offline with Ollama"，一条 curl 脚本安装；另有托管云。产品面含 App、浏览器插件、MCP server（`https://mcp.supermemory.ai/mcp`）。[README](https://github.com/supermemoryai/supermemory)
- 仓库元数据（2026-09-04）：29,226 星，TypeScript，MIT，2026-09-02 有推送。

**对 DigitalMuseum 的推断/启示**

- "单二进制 + 可选 Ollama 全离线"证明记忆产品的本地化打包已成熟（单文件交付的思路与 DM 的静态单文件 HTML 导出在工程哲学上同路：交付物自包含、无运行时依赖）。
- 矛盾处理与自动遗忘属于语义层能力，DM 无模型不碰；但"记忆有生命周期（会过期、会被取代）"这个产品认知，与 DM 分级信任里"用户裁决优先于系统读数"同向。

**与边界冲突**

- 事实抽取/画像/遗忘决策全部依赖模型；连接器生态把第三方云端数据卷入，与 DM 单机严口径冲突。

#### 2.1.6 hindsight：把"记忆"升级为"学习"，评测声明最讲究的一家

**来源事实**

- 自我区分："多数 Agent 记忆系统关注回忆对话历史，Hindsight 专注让 Agent 学习，而不只是记住"；核心概念：retain / recall / reflect 三操作、observations、心智模型与知识页（mental models & knowledge pages）、记忆银行（banks）隔离。[README](https://github.com/vectorize-io/hindsight#core-concepts)
- 部署：Docker / pip / Kubernetes Helm / **Python 嵌入式（无需起服务）** / 托管 Hindsight Cloud；支持 25+ LLM 提供商，包括全本地 ollama/lmstudio/llamacpp，甚至可用 `claude-code`（Claude Pro/Max 订阅）等既有订阅作推理通道。[README](https://github.com/vectorize-io/hindsight#quick-start)
- MCP server 内建，每个 bank 一个端点（`/mcp/{bank_id}/`），默认开启。[README](https://github.com/vectorize-io/hindsight#mcp-server)
- 评测声明：自称 LongMemEval SOTA，并写明"Hindsight 的数据已由 Virginia Tech Sanghani Center 与 The Washington Post 独立复现；**其余各家分数均为厂商自报**"；持续更新的榜单在 benchmarks.hindsight.vectorize.io。[README](https://github.com/vectorize-io/hindsight#memory-performance--accuracy)
- 论文：[arXiv 2512.12818](https://arxiv.org/abs/2512.12818)。
- 仓库元数据（2026-09-04）：22,485 星，Python，MIT，当日有推送。

**对 DigitalMuseum 的推断/启示**

- "本家数据第三方复现、他家数据厂商自报"的声明格式，是 DM 引用外部 benchmark 时的最佳措辞模板；DM 的大考机器证据附录（独立复算 26 段单源事件一致）本质就是这种"可复现声明"。
- bank（记忆银行）隔离与 DM 的 origin 白名单隔离（各 Agent 家族互不聚合）是同一个问题的两种解法，DM 已有等价物。

**与边界冲突**

- reflect/心智模型是模型重活；整体不可用于 DM。

### 2.2 记忆操作系统 / 上下文管理型

#### 2.2.1 letta（MemGPT）：主仓库已落地页化，活体在 letta-code

**来源事实**

- letta 主仓库 README 明确：本仓库现在是 Letta 项目的**落地页**；当前源码在 [letta-ai/letta-code](https://github.com/letta-ai/letta-code)（Agent harness、终端 UI、App Server、channels、桌面/Web 运行时）；退役的 Letta V1 服务器源码保存在 `archive` 分支"供历史参考"，明确不再修复。[letta README](https://github.com/letta-ai/letta)
- 安装：`npm install -g @letta-ai/letta-code`，`letta` 起终端 UI，`letta server` 起本地/自托管 App Server；另有桌面应用、chat.letta.com 浏览器端、Slack/Telegram/Discord 渠道、TypeScript Agent SDK、Letta Cloud（跨设备保留记忆/身份/会话）。[letta README](https://github.com/letta-ai/letta#get-started)
- letta-code 仓库元数据（2026-09-04）：3,201 星，TypeScript，Apache-2.0，当日有推送；letta 主仓库 24,617 星（历史积累），2026-08-23 后无代码推送。
- 定位标语："Stateful agents that are like people, with memory, identity, and the ability to learn and adapt"。[letta-code 仓库描述](https://github.com/letta-ai/letta-code)

**对 DigitalMuseum 的推断/启示**

- MemGPT 一脉是"把记忆当 OS 资源管理（core memory / archival / recall 分层）"的源头；这个分层思想对 DM 的等价物是"浏览层（镜头）/ 策展层（展出勾选）/ 证据层（blob+anchor）"，DM 已有自己的三层，无需引入。
- letta 的历史处理方式对 DM 有直接参照价值：**旧能力归档（archive 分支 + 发布标签保留可复现）而非删除**——DM 的备份格式演进（archive-v3，v1/v2 作废）与"不从 git 历史复活旧通道"的约定，是同一纪律。
- 星数迁移陷阱：主仓库 24.6k 星不再代表活跃度，letta-code 3.2k 星才是活体。DM 调研引用星数必须与"代码所在仓库"对齐，本文所有星数均按此口径标注。

**与边界冲突**

- letta-code 是有状态 Agent 运行时（记忆驱动 Agent 行为），与 DM 的只读档案库目的相反；且 Cloud 是跨设备记忆的默认出口之一。

#### 2.2.2 OpenViking（火山引擎）：上下文数据库，分层加载与可观察检索

**来源事实**

- 定位"AI Agent 的上下文数据库"：记忆、资源、技能统一进 `viking://` 虚拟文件系统，Agent 用 `ls`/`tree`/`find` 浏览自己的上下文，而非查询黑盒向量库。[README](https://github.com/volcengine/OpenViking#what-is-openviking)
- 写入时把内容加工成三层：L0 摘要（~100 token，快速相关性判断）、L1 概览（~2k token，结构与要点）、L2 完整原文（按需加载）；目录自带 L0/L1，读任何全文前可先判相关性。[README](https://github.com/volcengine/OpenViking#why-openviking)
- 检索：向量先定位最高分目录，再逐层下钻，结果带周边上下文；**每次检索保留可回看的目录浏览轨迹**（"结果不对时能看到是哪条路径产生的"）。[README](https://github.com/volcengine/OpenViking#why-openviking)
- 会话结束 commit 后异步抽取用户偏好与 Agent 经验入长期记忆。[README](https://github.com/volcengine/OpenViking#why-openviking)
- 基准自报：LoCoMo 上 OpenClaw 24.20%→82.08%、Hermes 33.38%→82.86%、Claude Code 57.21%→80.32%，且注明评测模型为豆包 2.0 Pro + 豆包嵌入（模型栈绑定，自报口径）。[README](https://github.com/volcengine/OpenViking#proof-it-works)
- 仓库元数据（2026-09-04）：35,460 星，Python，AGPL-3.0，当日有推送；有 OpenViking Studio 在线演示。

**对 DigitalMuseum 的推断/启示**

- L0/L1/L2 分层加载对 DM 展览信息密度分层是现成的心智模型：DM 的等价物可以是无模型的"读数层（计数/日期）→ 卡片层（标题+原话钩子）→ 证据层（blob 原文）"，三层都从确定性数据派生，不加工内容。
- "可观察检索轨迹"与 DM 侧滑证据抽屉同理：任何结论都要能看到"它从哪条数据来"。
- **License 警示**：AGPL-3.0 有强传染性；DM 只能借鉴其思想，不可复制其代码，否则污染整个仓库的许可边界。

**与边界冲突**

- 三层加工与偏好抽取都是模型调用；且为字节系云生态导流的设计（Studio、豆包模型栈）与 DM 无云边界冲突。

### 2.3 时间知识图谱

#### 2.3.1 graphiti（Zep 开源内核）：episodes 溯源 + 事实时间有效窗口

**来源事实**

- 定位"构建时序知识图谱（temporal context graphs）的框架"：与静态知识图谱不同，追踪事实如何随时间变化、保持到源数据的 provenance、支持规定与学习两种本体。[README](https://github.com/getzep/graphiti)
- context graph 三要素：实体（节点，摘要随时间演化）、事实/关系（边，三元组带**时间有效窗口**——何时为真、何时被取代）、**episodes（provenance：摄入的原始数据即 ground truth 流，每条派生事实都能回溯到这里）**。[README](https://github.com/getzep/graphiti#what-is-a-context-graph)
- 检索为混合式：语义 + 关键字 + 图遍历；支持增量更新，无需全图重算。[README](https://github.com/getzep/graphiti)
- 与 Zep 的关系：graphiti 是开源框架（自带第三方图数据库、自托管）；Zep 是托管平台（专有 Context Graph Engine、用户/会话管理、<200ms 检索）。论文 [Zep: A Temporal Knowledge Graph Architecture for Agent Memory](https://arxiv.org/abs/2501.13956)。[README](https://github.com/getzep/graphiti#graphiti-and-zep)
- 仓库含官方 MCP server 目录（`mcp_server`），让 AI 助手经 MCP 操作 context graph。[README](https://github.com/getzep/graphiti#mcp-server)
- Zep 开源版现状：[getzep/zep](https://github.com/getzep/zep) 仓库已改为"Zep Cloud: Examples & Integrations"，README 明确"本仓库不是 Zep 的产品或服务"，社区版（Community Edition）弃维护、代码移入 `legacy/`，官方博客《Announcing a New Direction for Zep's Open Source Strategy》。[zep README](https://github.com/getzep/zep)
- 仓库元数据（2026-09-04）：graphiti 30,587 星，Python，Apache-2.0，2026-09-03 有推送；zep 仓库 4,889 星。

**对 DigitalMuseum 的推断/启示**

- episodes（原始数据为 ground truth、派生事实必须回溯）与 DM 的 occurrence/evidence anchor 完全同构——这证明"派生层必须挂原文"已是图谱阵营的架构共识，DM 不孤独。
- **事实的时间有效窗口（valid_at / invalid_at）是 DM 可以确定性借用的概念**：不引入模型也能做"项目活跃期 / 会话休止期"（首末 occurrence 日期）这类带起止的叙事窗，比单一时间戳更接近 graphiti 表达力。
- Zep 的开源→云化收缩史是一个警示案例：记忆基础设施的商业引力会把开源版变成云服务的示例集。DM 承诺本地优先单用户、无云部署，正好站在这个引力的反面，是差异化而非劣势。

**与边界冲突**

- 实体与事实抽取依赖 LLM；图谱构建管线不可用于 DM（时间窗口与 provenance 两个数据模型概念可借）。

#### 2.3.2 HippoRAG：学术脉络的"从 RAG 到记忆"

**来源事实**

- HippoRAG 2 自述"面向 LLM 的记忆框架，识别并利用新知识中的连接，模拟人类长期记忆的关键功能"；主打多跳联想检索（associativity）与复杂语境整合（sense-making），在线过程低成本、离线索引资源消耗低于 GraphRAG/RAPTOR/LightRAG（自报）。[README](https://github.com/OSU-NLP-Group/HippoRAG)
- 论文两篇：HippoRAG（NeurIPS'24，[arXiv 2405.14831](https://arxiv.org/abs/2405.14831)）、HippoRAG 2: From RAG to Memory（ICML'25，[arXiv 2502.14802](https://arxiv.org/abs/2502.14802)）。
- 安装为 Python 3.10 研究环境；需 OpenAI key 或 vllm/gritlm 本地模型（可选 CUDA 多卡）。[README](https://github.com/OSU-NLP-Group/HippoRAG#installation)
- 仓库元数据（2026-09-04）：3,980 星，Python，MIT，2026-09-03 有推送。

**对 DigitalMuseum 的推断/启示**

- 学术界已把"记忆"从"检索增强"中独立出来（非参数持续学习）；DM 的话语体系（档案/证据/信任分级）与这条脉络正交，互不需要。
- 复现导向的仓库管理（明确 SDK 版本约束文件 `constraints/openai-tested.txt`、干净环境校验说明）是研究代码工程化的好样本，DM 的评测重建（S6）可参考其"可复现环境声明"。

**与边界冲突**

- 需 GPU/LLM 的研究框架，与 DM 无模型边界全面冲突，仅作脉络注脚。

### 2.4 编码 Agent 专用记忆 / MCP 记忆服务

#### 2.4.1 engram：单二进制 SQLite+FTS5，"策展记忆而非转录垃圾场"

**来源事实**

- 形态：一个 Go 二进制 + SQLite（FTS5 全文检索），存于 `~/.engram/engram.db`；不需要 Node.js/Python/Docker；暴露 CLI、HTTP API、MCP、TUI 四种界面。[README](https://github.com/Gentleman-Programming/engram)
- 支持任何 MCP 兼容 Agent：Claude Code、OpenCode、Gemini CLI、Codex、VS Code Copilot、Antigravity、Cursor、Windsurf；`engram setup` 自动写入各 Agent 的 MCP 配置。[README](https://github.com/Gentleman-Programming/engram)
- 给 Agent 的操作契约（Memory Protocol）明确写着："把 engram 当**策展过的项目记忆，不是 transcript 垃圾场**"——先定向、先搜索再行动、渐进取回（search → timeline → observation）、只刻意保存重要知识、稳定 topic_key 演进、会话结束留 handoff 总结、压缩后恢复。[README](https://github.com/Gentleman-Programming/engram#for-agents)
- 本地或云（Engram Cloud）双形态；安装走 Homebrew tap。[README](https://github.com/Gentleman-Programming/engram#quick-start)
- 仓库元数据（2026-09-04）：6,318 星，Go，MIT，当日有推送。

**对 DigitalMuseum 的推断/启示**

- engram 与 DM 是互补的两半：engram 教 Agent **主动沉淀结论**（写入侧），DM 只读 Agent **已经产生的会话**（读取侧）。DM 永不写入 Agent 目录，engram 只写自己的库——边界清晰，未来若用户同时使用两者，DM 的档案不受影响。
- 纯 FTS5 关键字检索（无嵌入、无模型）就能支撑一个 6k 星的编码 Agent 记忆产品——这是"检索不必须有嵌入"的最有力例证。DM 将来若加会话内检索，SQLite FTS5 是符合懒惰阶梯（标准库/平台原生）的第一步。
- "Memory Protocol"（把使用纪律写进 README 让 Agent 遵守）是一种面向 Agent 的文档形态，DM 的 AGENTS.md 已在做同类事情。

**与边界冲突**

- 无实质冲突（无模型、单机、自包含）；只是目的不同：engram 为 Agent 复用，DM 为人类回看。

#### 2.4.2 memsearch（Zilliz）：Markdown 真相源 + 影子索引，与 DM 结构最同构

**来源事实**

- 定位"跨平台编码 Agent 语义记忆"，官方插件覆盖 Claude Code（plugin marketplace）、Codex、**DeepSeek Harness**、OpenClaw、OpenCode；"一个 Agent 里的对话变成所有 Agent 里可检索的上下文"。[README](https://github.com/zilliztech/memsearch#why-memsearch)
- 数据模型："**Markdown 是真相源**——你的记忆就是 `.md` 文件，人类可读、可编辑、可版本化；**Milvus 是影子索引：派生的、可重建的缓存**"。[README](https://github.com/zilliztech/memsearch#why-memsearch)
- 增量与去重：**SHA-256 内容哈希跳过未变内容**；文件 watcher 实时索引；三层召回（search → expand → transcript）；稠密向量 + BM25 稀疏 + RRF 融合重排。[README](https://github.com/zilliztech/memsearch#why-memsearch)
- 后台维护任务保持 `PROJECT.md` 与 `USER.md` 常新；"Skills from Memory"把重复工作流蒸馏成可安装的 Agent 技能（自述受 OpenClaw 启发，属第三层"程序性记忆"）。[README](https://github.com/zilliztech/memsearch) What's New
- 安装后验证方式：`ls .memsearch/memory/` 查看**按日落盘的 .md 文件**。[README](https://github.com/zilliztech/memsearch#for-claude-code-users)
- 仓库元数据（2026-09-04）：2,564 星，Python，MIT，2026-09-02 有推送；维护方 Zilliz（Milvus 母公司）。

**对 DigitalMuseum 的推断/启示**

- memsearch 的"原文层（Markdown/逐字）+ 派生索引层（可丢弃重建的影子）+ 内容哈希增量"三件套，与 DM 的"Evidence Blob（SHA-256 落盘）+ source_key 幂等 + 派生视图"几乎逐点对应。这给 DM 的架构叙事提供了行业印证：**头部基础设施厂商（Zilliz）也选择了这条路线**。
- 具体可对表的两点：① DM 同步跳过条件是"occurrence 完整且文档字节相同"，与 memsearch 的 SHA-256 跳过同构，可考虑把"文档字节相同"的判断显式落为哈希比较并写进回归测试；② "按日落盘的 .md"对应 DM 的按天事件聚合——按天是这类工具的自然粒度共识。
- PROJECT.md/USER.md 与"skills from memory"是语义生成（模型加工），超出 DM 边界，仅观察。

**与边界冲突**

- 捕获时逐回合"capture and summarize each turn"（Codex 插件说明），总结需要模型；影子索引要跑嵌入模型（ONNX 网络下载）。DM 的确定性提取不受影响，但其插件本体不适合直接引入。

#### 2.4.3 agentmemory（rohitg00）：keyless 退化路径 + 20 个 Agent 适配器

**来源事实**

- 定位"AI 编码 Agent 的持久记忆"，基于 iii 引擎；支持 Claude Code、GitHub Copilot CLI、Cursor、Gemini CLI、Codex CLI、Hermes、OpenClaw、**pi**、OpenCode 等（README 列 20 个适配器）。[README](https://github.com/rohitg00/agentmemory)
- npm 安装（Node 20+），首次运行交互式接线；本地运行时占 3111/3112/3113/49134 四个端口，状态存平台数据目录的 SQLite（state_store.db）；**零外部数据库**。[README](https://github.com/rohitg00/agentmemory#install)
- **keyless 模式关闭向量嵌入**：`memory_recall` 走 BM25，`memory_smart_search` 可融合结构图匹配；要免费本机语义召回可选 `EMBEDDING_PROVIDER=local`（首次下载 Xenova/all-MiniLM-L6-v2，之后本地推理）。LLM 压缩观察记录需显式开 `AGENTMEMORY_AUTO_COMPRESS=true`。[README](https://github.com/rohitg00/agentmemory#install)
- 规格标签（自报）：95.2% R@5、92% token 节省、54 个 MCP 工具、12 个自动钩子、1,674+ 测试通过；自称源自对 Karpathy "LLM Wiki 模式" gist 的扩展（置信度打分、生命周期、知识图谱、混合检索）。[README](https://github.com/rohitg00/agentmemory)
- 分发含 17 个原生 Agent 技能（`npx skills add rohitg00/agentmemory`）与实时查看器（3113 端口）。[README](https://github.com/rohitg00/agentmemory#install)
- 仓库元数据（2026-09-04）：28,006 星，TypeScript，Apache-2.0，2026-08-31 有推送。

**对 DigitalMuseum 的推断/启示**

- **"无 key 退化路径"是 DM 可以借鉴的功能设计**：默认全功能、无模型时自动降级到确定性子集（BM25/计数），模型能力全部 opt-in。DM 若未来加任何可选语义特性，应照此设计——默认路径永远无模型。
- 适配器清单里出现 pi（与 DM 四产品之一同名同位），说明"小众 harness 也有人做记忆接入"，DM 的 pi/dsh 适配器在生态里有同类先例。
- 其"95.2% R@5"等为自报标签，引用需按自报口径处理。
- 注意：仓库存在多端口常驻服务与 npm 引导安装，与 DM"用户数据不出本机、不装常驻后台"的产品性格不同，仅作机制参考。

**与边界冲突**

- 常驻服务 + LLM 压缩为可选模型路径；本体不适用于 DM。

#### 2.4.4 mcp-memory-service：自托管记忆后端的老牌 MCP 服务

**来源事实**

- 定位：开源记忆后端，"REST API、MCP、OAuth、CLI、dashboard——一个自托管服务，所有传输方式"；与 LangGraph/CrewAI/AutoGen/任何 HTTP 客户端/Claude Desktop/OpenCode 配合。[README](https://github.com/doobidoo/mcp-memory-service)
- 机制：SQLite 存储 + **本地 ONNX 嵌入（"memory never leaves your infrastructure"）** + 带类型边的知识图谱（causes/fixes/contradicts）+ 自动整合压缩旧记忆 + `X-Agent-ID` 按 Agent 身份圈定检索 + `conversation_id` 绕过去重做增量会话存储 + SSE 实时事件；自报 5ms 检索。[README](https://github.com/doobidoo/mcp-memory-service#key-capabilities-for-agent-pipelines)
- Claude Code 一条命令接入：`claude mcp add memory -- memory server`。[README](https://github.com/doobidoo/mcp-memory-service) Claude Code 小节
- 主页 mcpmemory.services；官网有 3D 知识图谱可视化演示。
- 仓库元数据（2026-09-04）：1,923 星，Python，Apache-2.0，2026-09-02 有推送。

**对 DigitalMuseum 的推断/启示**

- "同一服务多传输（stdio MCP / HTTP REST / OAuth）"的接入分层对 DM 无直接需求（DM 是本地 Web 应用），但"一个后端、多种消费面"的思路与 DM 的"同一档案库，多个浏览镜头"同构。
- 本地 ONNX 嵌入（不联网）是"要嵌入但不出网"的折中样本；若 DM 远期需要语义检索，这是合规形态（但仍违背当前无模型边界，需 PRD 决策）。

**与边界冲突**

- 知识图谱边类型与自动整合是语义层；本体为服务形态，与 DM 单机内嵌架构不同。

### 2.5 Markdown / 文件式本地记忆

#### 2.5.1 basic-memory：人与 AI 读写同一批 Markdown

**来源事实**

- 定位："你的知识以 Markdown 文件存在，你与你的 AI 都能读、写、搜索它们"；"Local-first. Plain text on your disk. Forever."；"Cloud, optional. Sync across devices when you want — never required."。[README](https://github.com/basicmachines-co/basic-memory)
- 机制：AI 与人**双写同一批文件**（sync 保持一致）；observations 与 wikilinks 累积成"真正的知识图谱"；语义检索（可选 cross-encoder 重排提升向量/混合检索质量）；MCP 原生，支持所有主流 AI 客户端。[README](https://github.com/basicmachines-co/basic-memory)
- **渐进式工具发现**：每个 MCP 工具带行为提示标签（read-only / destructive / idempotent），Agent 按需选择，不浪费上下文试错。[README](https://github.com/basicmachines-co/basic-memory)
- 本地安装走 uv（Python 3.12+，需 pre-release 标志装 FastMCP 4）；商业形态为 $15/月云版与 Teams 共享工作区。[README](https://github.com/basicmachines-co/basic-memory)
- 仓库元数据（2026-09-04）：3,855 星，Python，AGPL-3.0，当日有推送。

**对 DigitalMuseum 的推断/启示**

- "行为提示标签（read-only/destructive/idempotent）"是 API 自描述的好实践：DM 的 `GET /api/v1/blobs/{sha256}`（只读、无列举、无删除、可永久缓存）已经隐式做了这种行为设计，将来在 API 文档/OpenAPI 描述里显式标注行为类别，对 AI 协作助手（本项目目标用户）是低成本增益。
- AGPL-3.0 许可：同 OpenViking，只借鉴思想不复制代码。

**与边界冲突**

- 双写模型（AI 写入用户知识库）与 DM"绝不修改对应产品本机目录"的只读铁律方向相反；语义检索需嵌入。文件式理念相通，写入边界相反。

#### 2.5.2 EverOS：Markdown + SQLite + LanceDB 本地三件套

**来源事实**

- 自我定位："Python 库 + 本地优先记忆运行时"，为编码助手/App/设备/工作流提供"一个可移植记忆层"；**把会话、文件、Agent 轨迹存为可读 Markdown**，再同步本地 SQLite 与 LanceDB 索引做快速检索与自进化复用。[README](https://github.com/EverMind-AI/EverOS#why-everos)
- README 对比表（自我声明）：Markdown 规范源（可读/可编辑/可 diff/可 Git 版本化）、直接编辑文件（cascade watcher 同步）、本地三件套（"no MongoDB, Elasticsearch, or Redis required"）、**用户轨（episodes/profile）与 Agent 轨（cases/skills）分离**、正交检索维度（user_id/agent_id/app_id/project_id/session_id）、可编辑且带来源的 Knowledge Wiki、离线反思（会话之间合并 episode 簇、精炼 profile 与 skills）。[README](https://github.com/EverMind-AI/EverOS#why-everos)
- 集成：DeepSeek Harness、Hermes、OpenClaw、Raven（内置）、Dify 插件。[README](https://github.com/EverMind-AI/EverOS#ecosystem-integrations)
- 快速开始需要一个 OpenRouter API key；`everos demo` 无 key 可跑（ingest → extract → index → recall 流程，无 key 时为关键字检索）。[README](https://github.com/EverMind-AI/EverOS#quick-start)
- 仓库元数据（2026-09-04）：12,699 星，Python，Apache-2.0，当日有推送。

**对 DigitalMuseum 的推断/启示**

- EverOS 是与 DM 技术栈最近的项目：**Markdown/文件 + SQLite + 本地向量索引，明确拒绝重型外部服务**。DM 的"标准库优先、不引云数据库"阶梯在这个生态里有同路人。
- "用户轨与 Agent 轨分离"对 DM 有启发：DM 当前只有"用户经历"一轨；若将来做"Agent 工作方式档案"（各产品的会话密度、工具使用模式——注意 DM 口径下只有计数可用），应作为独立轨道，不与人的事件混编。
- 正交检索五维（user/agent/app/project/session）与 DM 的 origin/project/date 浏览镜头是同一设计问题的不同解。

**与边界冲突**

- 记忆写入与反思进化依赖模型（OpenRouter key 是快速开始前置条件）；demo 的无 key 路径恰说明"无模型时只剩确定性骨架"——这正是 DM 的常驻形态。

---

## 3. 已核实但未入正文的项目与模式

以下项目均于 2026-09-04 经 GitHub API / README 核实，因停滞、转型或不构成"有维护的记忆项目"而只做简记。

- **[memodb-io/memobase](https://github.com/memodb-io/memobase)**：2,885 星，Python，Apache-2.0；用户画像式长期记忆（profile + 事件时间线，自报在线延迟 <100ms，900 轮对话与 mem0 对比）。**2026-01-11 后无推送，停滞约 8 个月**；README News 区已转向后继项目 Acontext（Context Data Platform）。[README](https://github.com/memodb-io/memobase)
- **[NevaMind-AI/memU](https://github.com/NevaMind-AI/memU)**：14,379 星，README 标 Apache-2.0（仓库 license 字段未被 GitHub 识别，NOASSERTION）；"以 Wiki 形式存储的个人记忆，跨会话/跨 Agent/跨设备"，核心逻辑自称仅约 500 行，可从 Agent 历史自动蒸馏可复用技能；依赖 memu.so 云 API key，主机适配器覆盖 ChatGPT(Work)/Claude Code/Cursor/OpenClaw/Hermes/WorkBuddy。**云服务型，本地优先边界外**。[README](https://github.com/NevaMind-AI/memU)
- **[agiresearch/A-mem](https://github.com/agiresearch/A-mem)**：1,167 星，Python，MIT；论文《A-MEM: Agentic Memory for LLM Agents》（[arXiv 2502.12110](https://arxiv.org/pdf/2502.12110)）的 Zettelkasten 式动态记忆组织（ChromaDB 索引、结构化笔记、记忆演化）。**2025-12-12 后无推送，研究代码属性**；论文复现另在 WujiangXu/AgenticMemory。[README](https://github.com/agiresearch/A-mem)
- **[mem0ai/openmemory](https://github.com/mem0ai/openmemory)**：34 星，TypeScript，MIT；**已从"本地记忆 MCP + 面板"转型为跨 harness 会话搬运 CLI/TUI**（Beta 支持 Claude Code / Codex / OpenCode；roadmap：OpenClaw、Hermes、Skills/MCP/Plugins/CLAUDE.md/AGENTS.md 搬运、实时 autosync）。README 明确对标 Codex 单向导入与 OpenCode 手动导入的不足，主打"全向、有预览、可选哪些会话搬走"。[README](https://github.com/mem0ai/openmemory)——这是与 DM 四适配器生态位最重叠的项目：同为"读本机会话转录"起家，但目的是喂给 Agent 复用，而非确定性提取给人看。
- **[getzep/zep](https://github.com/getzep/zep)**：4,889 星，Apache-2.0；**已降级为 Zep Cloud 的示例/集散仓库**，README 自述"不是 Zep 的产品或服务"，社区版弃维护移入 legacy/。[zep README](https://github.com/getzep/zep)。Zep 系的活体开源是 graphiti（见 2.3.1）。
- **memory-bank 模式**：把记忆做成一组由 Agent 自读自写的 Markdown 文件（源自 Cline Memory Bank 概念）。2026-09-04 搜索核实的代表仓库：centminmod/my-claude-code-setup（2,619 星，Claude Code 配置模板+memory bank 体系）、alioshr/memory-bank-mcp（919 星，**2025-08 后停滞**）及大量 skill 包（mrvladd-d/memobank、fockus/skill-memory-bank 等，均 <100 星）。**该模式影响大但没有单一头部项目**，故不入正文；其"记忆即项目内 Markdown 文档树"的思想已被 basic-memory / EverOS / memsearch 收编。
- **[TencentCloud/TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory)**：25,917 星，主语言 TypeScript，license 未识别（NOASSERTION）；"团队级 Agent 记忆枢纽"，商业云数据库伴生项目，未深入核实（与 DM 本地单用户边界无关）。
- **其余一眼掠过的相关项**（搜索结果快照，未开仓库细读，仅备线索）：[semantica-agi/semantica](https://github.com/semantica-agi/semantica)（11,966 星，"图原生的上下文与可问责 AI 基础设施"）、[plastic-labs/honcho](https://github.com/plastic-labs/honcho)（7,014 星，AGPL，"构建有状态 Agent 的记忆库"）、[memvid/memvid](https://github.com/memvid/memvid)（16,469 星，"把记忆压进视频文件"的单文件记忆层）、[MemoriLabs/Memori](https://github.com/MemoriLabs/Memori)（16,405 星，Agent 原生记忆基础设施）、[campfirein/byterover-cli](https://github.com/campfirein/byterover-cli)（4,954 星，编码 Agent 便携记忆层，前 Cipher）。
- **awesome 清单**（找项目的线索来源，本身不算项目）：[IAAR-Shanghai/Awesome-AI-Memory](https://github.com/IAAR-Shanghai/Awesome-AI-Memory)（MemOS README 官方推荐）、[ai-boost/awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering)（3,985 星，harness 工程含 memory/MCP 条目）。

---

## 4. 机制横评：对 DigitalMuseum 有直接参考价值的确定性设计

以下均为各项目**来源事实**中已出现的机制，按"DM 能否无模型采用"归档。

### 4.1 DM 已有同构物的（外部印证）

| 机制 | 外部先例 | DM 对应物 |
|---|---|---|
| 原文不可变、派生层可丢弃重建 | memsearch"Milvus 影子索引"、MemPalace"verbatim + 可插拔后端"、EverOS"Markdown 规范源" | Evidence Blob（SHA-256 落盘）+ 派生视图；索引/叙事永远可从原文重建 |
| 派生事实必须回溯原始数据 | graphiti episodes（"每条派生事实回溯到 ground truth 流"） | claims/evidence anchor、侧滑证据抽屉 |
| 内容哈希跳过未变内容 | memsearch SHA-256 哈希去重 | source_key 幂等同步 + "文档字节相同"跳过条件 |
| 只累积不覆盖 | mem0 ADD-only（"无 UPDATE/DELETE，记忆只累积"） | 快照替换（先摘引用再删旧）；occurrence 唯一键并入不复制 |
| 按 Agent 家族隔离记忆域 | hindsight banks、mcp-memory-service 的 `X-Agent-ID`、mem0 User/Session/Agent 分级 | origin 白名单（同题同日聚合只在家族内） |
| 按日聚合 | memsearch 按日落盘 `.md`、DM 四适配器同口径 | 按天事件的粒度共识 |

### 4.2 DM 可以确定性借用、当前尚未做的

1. **事实时间有效窗口**（graphiti 的 valid_at/invalid_at）：用首末 occurrence 日期表达"项目活跃期/休止期"，纯日期运算，可进确定性叙事底稿。
2. **无 key 退化路径**（agentmemory keyless BM25、EverOS 无 key demo）：任何未来可选语义特性都设计为 opt-in，默认路径零模型——把这条写成架构约定，与真实性契约互补。
3. **FTS5/BM25 关键字检索起步**（engram 纯 FTS5、agentmemory keyless、MemOS 本地插件 FTS5+向量混合）：若 DM 未来加会话内检索，第一档用 SQLite FTS5（标准库级），第二档才是本地嵌入，永不联网 API。
4. **信息密度分层加载**（OpenViking L0/L1/L2）：读数层 → 卡片层 → 证据层的三档交互，全部确定性派生。
5. **工具行为标签**（basic-memory 的 read-only/destructive/idempotent）：在 API 文档层面显式标注每个端点的行为类别（DM 的 blobs 只读端点即 read-only + cacheable）。
6. **可复现评测声明**（hindsight"本家第三方复现、他家自报"、mem0"开源分数≠平台分数"、memPalace/HippoRAG 的复现脚本公开）：DM 大考的机器证据附录已是同型实践，可补一句"各家 benchmark 均为自报口径"的引用纪律到 docs。

### 4.3 与 DM 边界冲突、明确不照搬的

- **一切语义管线**：mem0/cognee/graphiti/supermemory/OpenViking/MemOS/EverOS/memsearch 的抽取、构图、画像、摘要、遗忘、纠错——全部依赖模型调用，与 PRD"不引入模型调用"直接冲突；将来即便引入，输出只能是 candidate + 逐字锚定，不能进入 verified。
- **云平台形态**：mem0 platform、Zep Cloud、Letta Cloud、Hindsight Cloud、MemOS Cloud、memu.so、basic-memory 云版——DM 无云部署、单用户本地优先，不接入任何托管记忆服务。
- **AI 写入用户数据**（basic-memory 双写、memory-bank 自读写、engram/agentmemory 主动保存）：DM 的适配器绝不修改对应产品的本机目录，方向相反。
- **AGPL 代码复用**（OpenViking、basic-memory、honcho）：只借鉴思想，不复制实现。
- **常驻后台服务**（agentmemory 四端口、各 MCP server）：DM 是按需启动的本地工具，不引入常驻记忆服务。

---

## 5. 最终判断

1. **DM 的架构选型被 2026 年的生态验证了**：原文层 + 哈希幂等 + 派生可重建视图 + 按 Agent 家族隔离，这四件事在 memsearch、MemPalace、EverOS、graphiti、engram 上分别有高星实现。DM 不需要为"没有语义记忆"焦虑——同生态的 engram（纯 FTS5、无嵌入）与 agentmemory keyless 模式证明了确定性路径可以独立成立。
2. **DM 与这些项目是两台不同的机器**：它们是"给 Agent 的大脑"（运行时检索、喂上下文、改行为），DM 是"给人的档案馆"（证据、信任分级、展览导出）。生态位重叠只在数据源（本机会话转录）处——OpenMemory 的转型说明这个交集会越来越热闹，DM 的差异化恰是"确定性提取 + 分级信任 + 证据链 + 静态展览"这条它们不做、DM 无模型也做得对的路线。
3. **churn 警示**：Zep 开源版死亡、letta 主仓落地页化、memobase/A-Mem/mcp-memory-service（后者尚活跃但体量小）等案例说明记忆基础设施赛道换血极快。DM 不应把任何一家接入为运行时依赖；本调研的价值是机制参照与话语对齐，不是集成清单。
4. **引用纪律**：该领域所有 benchmark 分数（LoCoMo/LongMemEval/OmniMemEval/BEAM）均为厂商自报或特定模型栈绑定；DM 文档引用时一律标注"自报口径"，与 mem0/hindsight README 里的声明做法对齐。
