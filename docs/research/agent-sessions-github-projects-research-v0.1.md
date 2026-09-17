# GitHub 开源 Agent 会话（Sessions / History）工具项目调研 v0.1

> 调研日期与来源访问日期：2026-09-05
> 研究范围：GitHub 上开源的「通用 AI 编码 Agent 工具的会话记录——浏览、查看、分析、统计、管理、归档、展示」相关项目，按六个子类展开：会话历史查看器/浏览器、用量/成本统计仪表盘、多会话/并行编排管理器、远程监控/手机控制、会话归档/导出/捕获、会话转文档/复盘生成器；另设「差异化专项」详查与 DigitalMuseum 生态位最近的项目。正文（第 2 章）收录 16 个项目，差异化专项（第 3 章）另详述 4 个，第 4 章简记约 40 个已核实项目/线索。
> 证据口径：只采用各项目 GitHub 仓库（README 与仓库元数据，经 GitHub API 于 2026-09-05 当日抓取）的一手资料；星数、主语言、license、最近推送均为 2026-09-05 快照；README 中的效果宣称一律视为**项目方自报口径**。未能核实的一手信息（如闭源产品）明确标注，不凭训练记忆编写。
> 本文严格区分：**来源事实**（一手资料明确说明）、**对 DigitalMuseum 的推断/启示**（基于事实做的判断）、**与本项目边界相关**（只读铁律、本地优先、无模型调用、确定性提取、静态导出契约）。
> 与同目录前两份调研的关系：《回忆录 / 数字记忆产品调研》面向消费级产品；《GitHub 开源 Agent Memory 项目调研 v0.1》面向记忆基础设施（mem0、MemPalace、memsearch、engram 等）；本文面向**会话的查看/统计/管理/归档/展示**生态位，前文已详述的项目不再逐个展开，只在交叉引用处提及。

---

## 0. 先给结论

### 0.1 「读本机会话文件」已经是一个拥挤的大赛道，且头部全是统计与查看，不是档案

2026-09 的 GitHub 上，直接读取 `~/.claude/projects`、`~/.codex/sessions` 等本机会话文件的开源工具已成规模：用量统计类头部为 ccusage（18,367 星，18 个数据源）、codeburn（10,843 星，41 个工具）、Claude-Code-Usage-Monitor（8,675 星）；查看器类头部为 claude-devtools（3,903 星）、claude-code-history-viewer（2,133 星，29 个工具）、coding-agent-search（1,111 星，26 个数据源）。DigitalMuseum 四适配器的数据源（claude/codex/pi/dsh）在这个生态里全部是一等公民：pi 出现在 ccusage、CCHV、agent-sessions、cass、codeg、entire、yepanywhere 的支持清单里，DeepSeek Harness 出现在 codeg、TokenTracker、dsh-cost-meter、deja-vu 的清单里。**「读这些文件」本身不构成差异化；差异在读完之后做什么。**

### 0.2 六个子类里最繁荣的是「数字」（成本/token），最荒凉的是「记忆」（档案/展览）

用量统计赛道挤满了万星级项目（ccusage/codeburn/monitor/tokscale/abtop/各类菜单栏应用）；多会话编排是万星级（vibe-kanban 28,012 星、claude-squad 8,425 星）；而「把会话转成面向人的档案/时间线/回顾」这一格，全部候选加起来不足 1,500 星，且没有一个同时满足：多工具聚合 × 确定性提取 × 证据链 × 面向人的叙事输出。最接近的四个远亲分别是：claude-code-log（转录渲染成 HTML+时间线，1,208 星）、cc-wrapped（Spotify Wrapped 式年度总结，87 星，已休眠）、clawd-insights（时间线仪表盘+AI 周报，42 星）、worklog（证据优先的工作日志，28 星）——详见第 3 章。**这就是 DigitalMuseum 差异化的直接证据：它做的事在这个生态里没有同行。**

### 0.3 「会话是易失品」是这个生态的共同动机，「30 天清理」是被反复引用的恐惧

MemPalace 的 README 抢救动机（前一份调研已记录）在这里再次出现：Claude-Code-Usage-Monitor v4.0 的 opt-in 本地用量仓库自述「survives Claude's 30-day cleanup」；CCHV 的「One-Click Full Backup」把「history survives Claude Code's automatic cleanup」写进功能名。DigitalMuseum 把会话当不可改写的 Evidence Blob 落盘存证，与这个社区动机同源，且比「备份」更进一步（存证 + 分级信任 + 可回溯原文）。

### 0.4 DigitalMuseum 的两个核心姿势在这个生态里有独立先例，且都是高星项目

- **分级信任的标签化**：Claude-Code-Usage-Monitor v4.0 给每个读数标注来源置信标签——`official` / `local_estimate` / `experimental` / `unknown`，过期的官方捕获会降级为带标签的本地估计。这与 DM 的 verified/candidate 分级同构：**确定性读数与推断读数必须在数据模型里区分，不能在展示层混装**。
- **原文为真相源、派生可重建**：coding-agent-search（cass）的 README 写着「SQLite 是索引会话与消息的唯一真相源；一切派生资产（词法索引、语义向量、分析汇总、留存备份）都可从 SQLite 重建，没有任何派生资产是权威的」。这与 DM 的 Evidence Blob（SHA-256 落盘）+ 派生视图结构逐点对应，且出自完全独立的项目。

### 0.5 只读边界：多数查看器遵守，但不是行业共识

最严格的 claude-devtools 明确「Not a Wrapper——不包裹、不修改、不干扰」，Docker 部署把 `~/.claude` 以只读卷挂载（`:ro`）；但 CCHV 提供 Codex 会话重命名（标题写入 `state_5.sqlite`）与会话删除；specstory 用包装器启动各 CLI 并在项目目录写入 `.specstory/history/`；deja-vu 会往各 harness 的配置目录写引导文件。DM 的「绝不修改对应产品的本机目录」比生态主流更严格，是一个真实的、可对外讲的产品边界，不是一个默认值。

---

## 1. 对比总表

星数与最近推送均为 2026-09-05 GitHub API 快照。「数据源」指它读取什么；「写入被读工具的目录」对 DM 的只读铁律是关键列；「云/模型依赖」指核心功能是否需要模型调用或云服务（运行被管理的 Agent CLI 本身不算）。

| 项目 | 维护方 | Stars | 主语言 / License | 子类 | 数据源 | 展示形态 | 写入被读工具的目录 | 云 / 模型依赖 |
|---|---|---|---|---|---|---|---|---|
| [ccusage](https://github.com/ccusage/ccusage) | ccusage org（原作者 ryoppippi） | 18,367 | Rust / MIT | 用量统计 | 本地 18 个 CLI 的用量数据（含 pi-agent） | CLI 表格 + JSON + statusline | 否（仅读取） | 否（定价数据可 `--offline`） |
| [codeburn](https://github.com/getagentseal/codeburn) | getagentseal | 10,843 | TypeScript / MIT | 用量统计 | 41 个工具的本机会话文件 | TUI 仪表盘 + overview + 菜单栏 | 否（no wrapper/proxy/API key） | 否（LiteLLM 定价日更；桌面版可选匿名遥测） |
| [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) | Maciek Roboł | 8,675 | Python / MIT | 用量统计 | `~/.claude` 会话 + statusline 官方 rate_limits | Rich 终端实时监控 + CSV/JSON | 否（自有 opt-in 仓库） | 否 |
| [claude-devtools](https://github.com/matt1398/claude-devtools) | matt1398 | 3,903 | TypeScript / MIT | 查看器 | `~/.claude` 会话转录 | Electron 桌面 UI + Docker Web | 否（自述 Not a Wrapper，Docker `:ro`） | 否 |
| [claude-code-history-viewer](https://github.com/jhlee0409/claude-code-history-viewer) | jhlee0409 | 2,133 | TypeScript / MIT | 查看器 | 29 个助手本机文件（含 `~/.pi/agent/sessions/`） | Tauri 桌面 + headless WebUI | **部分**（Codex 重命名写 `state_5.sqlite`；可删除会话；全量备份到自有目录） | 否（自述 100% offline） |
| [coding-agent-search (cass)](https://github.com/Dicklesworthstone/coding_agent_session_search) | Dicklesworthstone | 1,111 | Rust / MIT（附 OpenAI/Anthropic rider） | 查看器/检索 | 26 个数据源（含 Pi-Agent） | TUI + `--robot`/`--json` CLI | 否（自建 SQLite 索引） | 语义层可选，词法层必达 |
| [agent-sessions](https://github.com/jazzyalex/agent-sessions) | jazzyalex | 843 | Swift / MIT | 查看器+配额 | 15 个 Agent 本机会话（含 Pi） | macOS 应用 + 菜单栏配额表 | 否（本地索引；显式动作才开终端恢复） | 否（可选公开价格表只读拉取） |
| [claude-squad](https://github.com/smtg-ai/claude-squad) | smtg-ai | 8,425 | Go / AGPL-3.0 | 编排管理 | 不读会话（自己拉起 Agent） | tmux TUI | —（写自有 worktree） | — |
| [vibe-kanban](https://github.com/BloopAI/vibe-kanban) | BloopAI | 28,012 | Rust / Apache-2.0 | 编排管理 | 不读会话（自己拉起 Agent） | Web看板 + worktree 工作区 | —（自有存储） | 云版 + 自托管 |
| [crystal → Nimbalyst](https://github.com/stravu/crystal) | stravu | 3,115 / 1,649 | TypeScript / MIT | 编排管理 | 不读会话 | 桌面 worktree 并行会话 | — | — |
| [codeg](https://github.com/xintaofei/codeg) | xintaofei | 3,206 | Rust / Apache-2.0 | 编排+聚合 | 15 个 Agent 会话（含 Pi、DeepSeek Harness） | 桌面/Server/Docker + iOS/Android | **是**（安装/固定/更新 Agent CLI） | 自托管或本地 |
| [omnara](https://github.com/omnara-ai/omnara) | Omnara | 2,818 | Go / Apache-2.0 | 远程管控 | 平台自管（自建 Postgres 状态） | 仪表盘 + 移动端 + Slack | —（平台运行 Agent） | 云或自托管 |
| [yepanywhere](https://github.com/kzahel/yepanywhere) | kzahel | 521 | TypeScript / 无 license | 远程浏览 | 复用既有 CLI 会话历史（Claude/Codex；pi 实验性） | 自托管 Web/手机 + E2E 加密中继 | 恢复/续聊时写 | E2E 公共中继可选 |
| [specstory](https://github.com/specstoryai/getspecstory) | SpecStory | 1,321 | Go / Apache-2.0（CLI） | 归档/捕获 | 包装 CLI 时捕获（Claude/Codex/Gemini/DeepSeek TUI 等 9 路） | 本地 `.specstory/history/` + 云同步 | **是**（往项目目录写 history） | 云同步与 Lore 挖掘可选 |
| [entire](https://github.com/entireio/cli) | Entire | 5,064 | Go / MIT | 归档/挂钩 | git hooks 捕获（Claude Code/Codex/Gemini/Pi） | 会话↔提交索引 + 检索 | 捕获侧（hooks 写自有索引） | 否 |
| [claude-code-log](https://github.com/daaain/claude-code-log) | daaain | 1,208 | Python / MIT | 转文档 | `~/.claude/projects` JSONL（Codex/Antigravity 实验支持） | 静态 HTML/Markdown + 交互时间线 + TUI | 否（只读转录） | 否 |
| **差异化专项** | | | | | | | | |
| [cc-wrapped](https://github.com/numman-ali/cc-wrapped) | numman-ali | 87 | TypeScript / MIT | 年度回顾 | `~/.claude`（history.jsonl + projects/） | Wrapped 式总结 + 热力图 | 否 | 否 |
| [clawd-insights](https://github.com/yx0716/clawd-insights) | yx0716 | 42 | JavaScript / AGPL-3.0 | 时间线复盘 | Claude Code/Codex/Cursor 等本机会话 | 时间线仪表盘 + 桌面宠物 | 否（自建分析数据） | **是**（摘要经本地 claude/codex 或自配 API） |
| [worklog](https://github.com/cathrynlavery/worklog) | Cathryn Lavery | 28 | Python / MIT | 证据日志 | Agent 主动写入 checkpoint（非读转录） | Markdown 账本 + 日/周 HTML 摘要 | 否（Agent 写 worklog 自身） | 否（标准库、无第三方依赖） |
| [emulo](https://github.com/ohad6k/emulo) | ohad6k | 288 | Python / MIT | 会话→画像 | Claude/Codex/Copilot/OpenCode/Antigravity 日志 | you.md 画像（给 Agent 读） | 部分（画像装进 Agent 配置） | **是**（挖掘需模型，可本地） |

---

## 2. 逐项目证据与判断

### 2.1 会话历史查看器 / 浏览器

#### 2.1.1 claude-code-history-viewer（CCHV）：29 个助手的统一历史浏览器，覆盖面之王

**来源事实**

- 定位「The unified history viewer for AI coding assistants」，桌面应用或 headless server 两种形态，自述 100% offline、无云依赖。[README](https://github.com/jhlee0409/claude-code-history-viewer)
- 支持 29 个助手，README 提供完整数据路径表：Claude Code `~/.claude/projects/`、Codex `~/.codex/sessions/`、**Pi `~/.pi/agent/sessions/`（per-cwd JSONL，含消息/思考/工具调用/token）**、OpenCode `~/.local/share/opencode/`、Aider（项目目录的 chat history 与 edit logs）、Gemini CLI `~/.gemini/history/`、Cursor、Cline 家族、Goose/Crush/llm 的 SQLite、Zed（SQLite+Zstd）等。[README Provider 表](https://github.com/jhlee0409/claude-code-history-viewer)
- 功能：跨提供者全局搜索、分析仪表盘（token/成本/提供者分布）、Session Board（像素视图+活动时间线）、实时文件监听、headless 导出 `--export --format html|json`、WebUI 深链。[README](https://github.com/jhlee0409/claude-code-history-viewer)
- 写边界：v1.15 起「Codex Native Rename & Delete——标题写入 `state_5.sqlite` 并显示在 codex resume 选择器，rollout 转录保持不可变；会话删除走应用内确认，系统回收站不可用时退化为永久删除」；v1.16 起「One-Click Full Backup 把所有 Claude Code 项目的会话复制进档案，history 得以在 Claude Code 自动清理后幸存」。[README v1.15/v1.16 记录](https://github.com/jhlee0409/claude-code-history-viewer)
- 数据隐私：「桌面模式本地优先，不上传会话数据，无分析无跟踪无遥测」；server 模式提供 token 认证与只读模式。[README](https://github.com/jhlee0409/claude-code-history-viewer)
- 仓库元数据（2026-09-05）：2,133 星，TypeScript，MIT，2025-06 建仓，当日仍有推送，220 fork。

**对 DigitalMuseum 的推断/启示**

- CCHV 是「多工具会话读取」覆盖面的天花板（29 路，含 DM 的 claude/pi 两路），其 README 的数据路径表对 DM 是现成的**适配器勘误参考**：例如它把 Claude 项目归属从「转义目录名」改为「优先磁盘文件夹名」、Codex 扫描只读 session-meta 行（mmap+memchr）提速——这些都是 DM 四适配器同款问题的他人解法。
- 它证明「把会话当文件读、给人看」有真实需求（2.1k 星、每日推送），但它止步于**转录浏览器**：没有事件抽象、没有信任分级、没有跨项目的个人叙事，message 是最小单位。DM 的「按天事件 + 展签叙事 + 证据链」在它上面一层，不冲突。
- 它同时是**只读边界的反面教材**：为了「改名/删除/备份」的产品完整性，它会写 Codex 的状态库、删用户的会话文件。DM 的铁律更严——这也意味着 DM 永远不做 CCHV 的这两件事，可在文档中显式对照。

#### 2.1.2 claude-devtools：读 `~/.claude` 重建一切被终端隐藏的细节

**来源事实**

- 动机明确写反 Claude Code v2.1.20 的输出精简：「Claude Code started hiding what it does」；解法是读本机 `~/.claude` 已有的日志与转录，「重建一切」：精确文件路径与行号、regex 命中、内联 diff、逐轮 token 七类归因（CLAUDE.md/skills/@文件/工具 IO/thinking/团队开销/用户文本）、子代理执行树、压缩可视化。[README](https://github.com/matt1398/claude-devtools)
- 「Zero configuration. No API keys. No wrappers. Works with every session you've ever run」；专设「Not a Wrapper」一节：「不包裹、不修改、不干扰 Claude Code，只读取机器上已存在的会话日志」。[README](https://github.com/matt1398/claude-devtools)
- Docker 部署把宿主 `~/.claude` 以只读卷挂载（`-v ~/.claude:/data/.claude:ro`），standalone 服务器「零出站网络调用」，可 `--network none` 运行；整会话可导出 Markdown/JSON/纯文本；支持经 SSH 读远端机器的会话。[README](https://github.com/matt1398/claude-devtools)
- 仓库元数据（2026-09-05）：3,903 星，TypeScript，MIT，**最近推送 2026-05-13（约 4 个月无代码推送）**，文档站 claude-dev.tools。

**对 DigitalMuseum 的推断/启示**

- 「终端隐藏了过程，日志里全都有，所以读日志」——这是与 DM 完全相同的**读取侧立场**，且它把这个立场写成了品牌（Not a Wrapper）。DM 的 AGENTS.md 已有等价表述，可借用这种显式命名的写法。
- Docker `:ro` 挂载与 `--network none` 是「只读 + 零外联」的工程化表达，DM 若做容器化分发（当前无此需求）可照抄这两个姿势。
- 4 个月无推送提示该赛道单产品生命周期波动大；DM 调研引用星数时应同时引用推送日期（本文照此办理）。

#### 2.1.3 coding-agent-search（cass）：26 路数据源进一条可检索时间线

**来源事实**

- 定位「Unified, high-performance TUI to index and search your local coding agent history」，聚合 Codex、Claude Code、Gemini CLI、Cline、OpenCode、Amp、Cursor、ChatGPT、Aider、**Pi-Agent**、Oh My Pi、Copilot、OpenClaw、Hermes、Kimi Code、Qwen Code、Antigravity、OpenHands、Grok Build 等 26 个来源「进单条可检索的时间线」。[README](https://github.com/Dicklesworthstone/coding_agent_session_search)
- 数据契约原文：「SQLite 是已索引会话与消息的唯一真相源；一切派生资产（词法索引、语义向量、分析汇总、留存备份）都可从 SQLite 重建，没有任何派生资产是权威的」；搜索默认 hybrid-preferred：「词法是必达的快速路径，语义细化就绪后加入」。[README](https://github.com/Dicklesworthstone/coding_agent_session_search)
- 为 Agent 场景设计了显式协议：`--robot`/`--json`、stdout 只出数据、stderr 只出诊断、`cass capabilities` 自描述机器 API；支持按 harness 排除索引（`cass sources agents exclude openclaw`）。[README](https://github.com/Dicklesworthstone/coding_agent_session_search)
- License 为「MIT License (with OpenAI/Anthropic Rider)」的自定义变体。[LICENSE](https://github.com/Dicklesworthstone/coding_agent_session_search)
- 仓库元数据（2026-09-05）：1,111 星，Rust，当日仍有推送。

**对 DigitalMuseum 的推断/启示**

- 「SQLite 真相源 + 派生资产可重建」与 DM 的 Evidence Blob + 派生视图是同一条架构原则的两次独立发明，且 cass 把它写成了「Search asset contract」——**把数据契约写成显式章节**这个文档姿势值得 DM 学（DM 的备份格式 archive-v3 已接近，可加一句「任何派生视图可从 blob 全量重建」的契约声明）。
- 「词法必达、语义可选」的退化设计与前一份调研里 agentmemory 的 keyless 模式互为印证，进一步确认这是无模型工具的行业标准姿势。
- License rider 提醒：MIT 变体不是纯 MIT，DM 若引用其代码需先读 rider。

#### 2.1.4 agent-sessions：macOS 单平台的 15 路会话浏览器 + 会话级配额归因

**来源事实**

- 定位：「Live per-session quota burn for Codex and Claude——看见是哪个会话在吃你的 5 小时/每周额度，按模型计价」+「跨 Codex、Claude、OpenCode、Cursor、Copilot CLI、**Pi**、Kimi Code、Grok CLI、Qwen Code、Devin CLI、fx、Antigravity、Hermes、OpenClaw 的可检索转录，本机、仅本地」；macOS 14+，MIT。[README](https://github.com/jazzyalex/agent-sessions)
- 隐私声明细到网络层：「无遥测/分析/远程日志/广告标识/会话上传；读你选择的本地会话目录；建本地索引；唯一网络活动是可选的 Sparkle 更新检查与可选的公开模型价格表只读拉取」。[README](https://github.com/jazzyalex/agent-sessions)
- 独立的 **Session-Bench**：「十个 Agent 的会话格式怎么打分——20 个 pass/fail 门，每个格子背后有证据」，发布页公开。[README](https://github.com/jazzyalex/agent-sessions)
- 工程细节诚实度极高：v5.1.1 自曝三个「用户不可能发现的静默失败」（如 2026-08-21 起 Claude 会话可列出但搜不到、缓存写计价低了约六分之一）并逐条修复。[README](https://github.com/jazzyalex/agent-sessions)
- 仓库元数据（2026-09-05）：843 星，Swift，MIT，当日有推送。

**对 DigitalMuseum 的推断/启示**

- Session-Bench 是对 DM **S6（以会话数据重建评测基线）最直接的外部参照**：它证明「对各家会话格式本身做确定性验收（20 个 pass/fail 门）」是可以独立成文、有传播力的产品件。DM 的 47 个后端用例（含四产品同步幂等与适配器回归）是同一物种，将来可对外表述成同型的 bench。
- 「per-session 归因」是用量视角的原子化（到会话）；DM 的原子是「按天事件」。两者粒度不同但思路同源：把账户级总量切到可指认的最小单元。
- 其版本说明的「静默失败披露」文风，与 DM 大考机器证据附录的可复算精神一致，可作为 changelog 文风参考。

### 2.2 用量 / 成本统计仪表盘

#### 2.2.1 ccusage：18 个 CLI 的本地用量报告标准件

**来源事实**

- 「Analyze coding (agent) CLI token usage and costs from local data」，`npx ccusage@latest` 即用；支持 daily/weekly/monthly/session/blocks（Claude 5 小时计费窗）报告，`--instances` 按 Claude 项目/实例分组、`--project` 过滤、`--json` 导出、`--timezone` 指定时区归日、`--no-cost` 隐藏成本列、`--offline` 用预缓存定价数据离线运行。[README](https://github.com/ccusage/ccusage)
- 支持 18 个数据源：Claude Code、Codex、OpenCode、Amp、Droid、Codebuff、Hermes、**pi-agent（`ccusage pi daily --pi-path` 可指定会话根，支持多路径归档）**、Goose、OpenClaw、Kilo、Kimi、Qwen、Copilot CLI、Gemini CLI、Antigravity、Grok Build CLI、ZCode。[README Supported Sources](https://github.com/ccusage/ccusage)
- Nix 构建把 LiteLLM 定价文件锁进 flake.lock，沙箱构建不联网；定价快照有定时校验工作流。文档站 ccusage.com；正文有赞助商广告位（Lineman.io 团队成本监控等）。[README](https://github.com/ccusage/ccusage)
- 仓库元数据（2026-09-05）：18,367 星，Rust，LICENSE 文件为 MIT（API 的 NOASSERTION 是识别问题），当日有推送；仓库已从 ryoppippi 个人名迁到 ccusage org。

**对 DigitalMuseum 的推断/启示**

- ccusage 与 DM 读的是同一批文件（含 pi），但它的输出是**账户周期表**（日/周/月/会话），DM 的输出是**人生档案事件**。前者回答「花了多少」，后者回答「做过什么」——同一数据源上完全不同的价值层。
- `--timezone` 显式时区归日与 DM 的「UTC 按本机时区归日」口径同题；ccusage 把它做成参数，说明这不是细节而是用户真实会撞上的口径差异。
- 定价数据的离线化（锁定快照 + 校验工作流）是「外部依赖最小化」的工程样本：DM 无定价需求，但其「文档字节相同才跳过」的哈希校验思路与锁定快照校验同构。

#### 2.2.2 codeburn：41 个工具、按任务/模型/项目拆账的本地仪表盘

**来源事实**

- 「Free, open-source, local-first……reads the session files your tools already write to disk，按 task/model/tool/project 拆解每个 token 和每一美元，覆盖 41 个 AI 工具」「No wrapper, no proxy, no API keys, nothing leaves your machine」；定价来自 LiteLLM 每日刷新；桌面版可选匿名分桶用量报告（opt-in）。[README](https://github.com/getagentseal/codeburn)
- `codeburn overview` 输出可直接粘贴的月度汇总（总额/缓存命中/按工具/按模型/最高消耗日/项目榜/逐日表）；`codeburn optimize` 扫描最近 30 天会话与 `~/.claude` 配置找浪费模式，且明确「optimize 的会话统计只用用户启动的主会话，subagent sidechain 转录因上下文与交付行为结构性不同而被排除」。[README](https://github.com/getagentseal/codeburn)
- 形态：npx 即用 / 全局安装 / macOS 菜单栏 / Windows 托盘 / GNOME 扩展；Cursor 与 OpenCode 走 `better-sqlite3` 读库。[README](https://github.com/getagentseal/codeburn)
- 仓库元数据（2026-09-05）：10,843 星，TypeScript，MIT，2026-09-04 有推送。

**对 DigitalMuseum 的推断/启示**

- codeburn 的「主会话 vs subagent sidechain 区分统计」与 DM 的 dsh 适配器口径（`delegationDepth != 0` 的子代理线程排除）、Codex 口径（`thread_source == "user"`）是**同一个过滤决策的三次独立出现**——「子代理转录不算用户经历」已是生态共识，DM 的严口径有同盟。
- 「overview 可粘贴成文」的输出设计（自动去色、管道友好）对 DM 的导出场景是小而实的参照：导出物要能脱离原工具被阅读。

#### 2.2.3 Claude-Code-Usage-Monitor：官方限额信任层 + 读数来源标签

**来源事实**

- v4.0 自称「privacy-first Claude Usage-Ops companion」：Rich 终端实时监控 + statusline 捕获 Claude Code 官方 `rate_limits` + 机器可读状态/导出 + **provenance labels** + 预测 + opt-in 本地用量仓库。[README](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)
- 标签体系原文：「导出与展示的数字区分 `official`、`local_estimate`、`experimental`、`unknown` 四级置信度」；官方捕获过期时降级为带标签的本地估计。[README](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)
- opt-in 的持久用量仓库「survives Claude's 30-day cleanup」，带 project/model/day 维度与 CSV/JSON 报告。[README](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)
- 仓库元数据（2026-09-05）：8,675 星，Python，MIT，最近推送 2026-07-05（约 2 个月）。

**对 DigitalMuseum 的推断/启示**

- 这是本次调研里与 DM **分级信任**最相像的外部实现：四档标签对应 DM 的 verified/candidate（+用户裁决态）。它证明「读数必须带来源等级」在用量场景已是成熟产品意识；DM 把同样原则用在**事实性**上（确定性读数 verified、推断标题 candidate），走得更远。
- 「官方数据过期就降级并显式标注」的处理，对 DM 将来处理「同步后源文件被 30 天清理掉」的场景有直接参照：occurrence 已存证则不受源消失影响（DM 的证据落盘天然免疫），这一点恰是 DM 相对全部读取型工具的结构优势，值得写进产品叙事。

### 2.3 多会话 / 并行会话编排管理器

#### 2.3.1 claude-squad：tmux + git worktree 的终端多 Agent 管理器

**来源事实**

- 「终端应用，在相互隔离的工作区管理多个 Claude Code、Codex、Gemini（及其他本机 Agent，含 Aider），同时处理多个任务」；要点：后台完成任务（含 yolo/auto-accept）、一个终端窗口管理全部实例、应用前审查变更、每任务独立 git 工作区互不冲突；依赖 tmux 与 gh CLI；Homebrew 安装为 `cs`。[README](https://github.com/smtg-ai/claude-squad)
- 仓库元数据（2026-09-05）：8,425 星，Go，**AGPL-3.0**，2026-08-20 有推送，617 fork。

**对 DigitalMuseum 的推断/启示**

- 编排器是「写入侧」工具：它制造会话（worktree + tmux），不消费历史。DM 是纯读取侧，二者关系是**上下游**：claude-squad 们生产出的会话洪流，正是 DM 的原料。编排器越繁荣（claude-squad 8.4k 星、vibe-kanban 28k 星），DM 的数据源越充沛。
- AGPL-3.0 许可：只借鉴思想（如 instance 命名、worktree 隔离的展示方式），不可复制代码。

#### 2.3.2 vibe-kanban：看板驱动的 Agent 工作区，本子类的星数之王

**来源事实**

- 「用 kanban issue 规划工作（私有或团队）；每个工作区给 Agent 一个分支、一个终端、一个 dev server；在 UI 内审 diff、留行内评论、把反馈直接发给 Agent；切换 10+ 编码 Agent（Claude Code、Codex、Gemini CLI、Copilot、Amp、Cursor、OpenCode、Droid、CCR、Qwen Code）；开 PR、AI 生成描述、GitHub 上评审合并」，`npx vibe-kanban` 一条命令启动。[README](https://github.com/BloopAI/vibe-kanban)
- 有 Vibe Kanban Cloud 与自托管 Docker 两条路径；贡献需先经核心团队讨论，不收未讨论的 PR。[README](https://github.com/BloopAI/vibe-kanban)
- 仓库元数据（2026-09-05）：28,012 星，Rust，Apache-2.0，**最近推送 2026-04-24（约 4.5 个月无代码推送）**，2,999 fork。维护方 BloopAI（bloop 代码搜索引擎的公司）。

**对 DigitalMuseum 的推断/启示**

- 28k 星说明「给 Agent 排班」的需求量级远大于「给会话存档」，这是市场的真实温度计，DM 不必焦虑于星数——两个赛道的问题不同（他们优化吞吐，DM 沉淀记忆）。
- 「4.5 个月静默但星数第一」再次验证前一份调研的 churn 警示：星数是存量，推送日期是流量，引用时必须并置。

#### 2.3.3 crystal → Nimbalyst：并行 worktree 会话桌面应用的换代

**来源事实**

- crystal 自述「Run multiple Codex and Claude Code AI sessions in parallel git worktrees……in one desktop app」，README 顶部即迁移声明：Crystal 已弃用，由 [Nimbalyst](https://github.com/Nimbalyst/nimbalyst) 取代（1,649 星，TypeScript，MIT，2026-09-03 仍有推送）。[crystal README](https://github.com/stravu/crystal)
- 仓库元数据（2026-09-05）：crystal 3,115 星，TypeScript，MIT，2026-02-26 后无推送。

**对 DigitalMuseum 的推断/启示**

- 用户线索中的「conductor（Claude Code worktree 管理）」实为闭源 macOS 应用 conductor.build，GitHub 上无官方开源仓库（仅有 9 星的第三方 backend 残迹与 244 星的开源替代 [termic](https://github.com/simion/termic)），故不收录于正文。crystal/Nimbalyst 是该子类在 GitHub 上可核实的代表。
- crystal→Nimbalyst 的「换代而非弃坑」（旧仓 README 置顶迁移指引）是项目死亡管理的好样本，DM 的 archive-v3 备份格式演进同理。

#### 2.3.4 codeg：聚合 15 路 Agent 会话的多 Agent 工作区（含 Pi 与 DeepSeek Harness）

**来源事实**

- 「多 Agent 编码工作区：在一个地方跑所有 AI 编码 Agent 并让它们协作。把每个受支持 Agent CLI 的会话聚合成一个可检索工作区，主 Agent 可在单个任务内向其他类型的子 Agent 委派」；桌面应用 / 独立服务器 / Docker 三形态，附原生 iOS/Android 客户端；15 个内置 Agent：Claude Code、Codex、Gemini、OpenClaw、OpenCode、Cline、Hermes、CodeBuddy、Kimi Code、**Pi**、Grok、Cursor、**DeepSeek Harness**、Qoder、Antigravity。[README](https://github.com/xintaofei/codeg)
- 会话聚合原文：「Pull in the history you already have: past sessions from every installed agent, imported in one click and resumable where you left them……@-mention an old session and the agent you're talking to can read it, even when a different agent wrote it」；token 用量带活动热力图与按文件夹/Agent/模型/会话的分解。[README](https://github.com/xintaofei/codeg)
- 它「installs, pins, and updates most of them for you」（替用户安装与固定 Agent CLI 版本）；文档站 docs.codeg.app。[README](https://github.com/xintaofei/codeg)
- 仓库元数据（2026-09-05）：3,206 星，Rust，Apache-2.0，当日有推送，iOS/Android 客户端亦开源。

**对 DigitalMuseum 的推断/启示**

- codeg 是同时出现 **Pi 与 DeepSeek Harness** 的最高星项目——DM 四产品的严口径组合在它那里得到了生态验证（这两个「小众」harness 被当作一等公民）。
- 它的会话聚合目的是**喂回给 Agent**（@ 引用旧会话让 Codex 接上上周的 Claude 进度），与 DM 的「面向人的档案」正交；与上一份调研里 OpenMemory 的转型方向相同——「跨工具会话搬运」这条线在 2026 年明显变热，DM 应持续以「我们是读取侧的档案馆，不是搬运工」划界。
- 它替用户安装/管理 Agent CLI（写入侧），与 DM 只读边界相反，可作对照例证。

### 2.4 远程监控 / 手机控制

#### 2.4.1 omnara：托管 Agent 平台的开源版（自建 Postgres 状态）

**来源事实**

- 自述「The API for production-grade agents」「open source platform for running managed agents」：agent.yaml 定义指令/模型/工具，`npx omnara` 上传并启动，经仪表盘或 Slack 连接器交互；特性含持久 Agent（状态原子提交到 Postgres、崩溃自动恢复）、沙箱或自有机器、RBAC、Omnara Cloud 或 Apache-2.0 自托管。[README](https://github.com/omnara-ai/omnara)
- 仓库元数据（2026-09-05）：2,818 星，Go，Apache-2.0，当日有推送；仓库描述自称「open-source alternative to Claude Managed Agents」。

**对 DigitalMuseum 的推断/启示**

- omnara 属于「运行时遥控」：会话是它的产品内状态（Postgres），不是本机文件。与 DM 无数据源冲突；作为参照它说明「远程盯 Agent」已是独立品类（同类还有 nexting、open-vibe-island、lark 桥接等，见第 4 章）。
- DM 明确不做云部署与多用户，omnara 的 RBAC/租户复杂度恰是 DM 永远不需要的那类需求，可作「我们为什么不做云」的外部例证。

#### 2.4.2 yepanywhere：复用既有 CLI 会话历史的自托管远程界面

**来源事实**

- 「Claude Code 与 Codex 的完整浏览器界面，从另一台电脑/平板/手机启动并监督运行在你控制的机器上的 Agent」；「Find and resume every Claude Code and Codex session, including those started from CLIs, VS Code, and first-party desktop apps」；自托管、无账号、无数据库，「Uses your existing CLI session history」；支持手机审批、语音输入、文件上传、注意力通知、会话只读分享；直连或端到端加密公共中继；OpenCode、Grok Build、Gemini、**pi** 集成为实验性。[README](https://github.com/kzahel/yepanywhere)
- 仓库元数据（2026-09-05）：521 星，TypeScript，**仓库无 license 文件**，当日有推送。

**对 DigitalMuseum 的推断/启示**

- yepanywhere 的关键姿势与 DM 相同：**不接管会话的产生，只复用 CLI 已经写下的历史**（含从 VS Code/桌面端产生的会话）。这证明「以本机会话文件为唯一事实源」可以支撑一个完整的远程产品，而不需要 wrapper/代理。
- 无 license 文件意味着默认版权保留——任何人不可合法复用其代码，DM 只能参照思路；这也是引用开源项目时必须检查 license 的实例。
- E2E 加密公共中继是「远程访问不出本机数据」的一种妥协设计，DM 无远程需求，仅留档。

### 2.5 会话归档 / 导出 / 捕获

#### 2.5.1 specstory：把会话存进项目目录，云端可选，「Lore」挖技能

**来源事实**

- 「Intent is the new source code——把 AI 开发对话变成可检索、可分享的知识」；工作流：捕获（扩展/CLI 把每次交互自动存到项目内 `.specstory/history/`）→ 处理（`/lore` 把历史挖成「有证据背书的 Agent 技能」）→ 同步（仅登录后）→ 搜索（本地或云端）→ 分享。[README](https://github.com/specstoryai/getspecstory)
- 支持矩阵：Cursor/Copilot IDE 扩展（闭源）、开源 Go CLI（Claude Code、Cursor CLI、Codex、Droid、Gemini、DeepSeek TUI、Antigravity、Muse Code）；「Everything is local-first - your data stays on your machine unless you choose to sync to the cloud」。[README](https://github.com/specstoryai/getspecstory)
- 仓库元数据（2026-09-05）：1,321 星，Go，Apache-2.0，当日有推送；维护方为商业公司 SpecStory（specstory.com）。

**对 DigitalMuseum 的推断/启示**

- specstory 的捕获发生在**写入侧**（wrapper + 项目内目录），一旦某次没走 wrapper 会话就漏档——这正是 DM 选择读取侧（直接读各工具原生落盘）的原因：不改变用户的使用习惯，零漏档成本。两者的取舍值得写进 DM 的架构叙事。
- 「Your sessions are your lore」的口号与 DM「会话是人生档案的燃料」话语同频；但它把会话加工成**给 Agent 的技能**，DM 把会话存证成**给人的档案**，方向相反。
- 闭源扩展 + 开源 CLI 的拆分是商业开源的常见切法，DM 全开源单体无此问题。

#### 2.5.2 entire：把会话索引挂到 git 提交上

**来源事实**

- 「Entire hooks into your Git workflow to capture AI agent sessions as you work. Sessions are indexed alongside commits, creating a searchable record of how code was written in your repo」；卖点是 prompt→change→commit 的可追溯、从已知良好检查点恢复、Agent 上下文不污染分支历史、审计合规支持；官方声明支持 Claude Code、Codex、Gemini、**Pi** 等。[README](https://github.com/entireio/cli)
- 仓库元数据（2026-09-05）：5,064 星，Go，MIT，2026-09-04 有推送。

**对 DigitalMuseum 的推断/启示**

- entire 回答的是「这段代码为什么变成这样」，DM 回答的是「这个人那天做了什么」——同一份转录，一边锚 git 对象（commit），一边锚日历与事件。entire 的「session↔commit 索引」是证据链的另一种锚定法；DM 的 evidence blob + 逐字锚定粒度更细，但「会话必须能挂回一个外部可信坐标」的思路完全同源。
- hooks 捕获属写入侧（需要用户接入 git 工作流），漏装即漏档，取舍同 specstory。

### 2.6 会话 → 文档 / 复盘生成器

#### 2.6.1 claude-code-log：把转录 JSONL 渲染成人读的 HTML/Markdown 与交互时间线

**来源事实**

- 「Python CLI tool that converts Claude Code transcript JSONL files into readable HTML and Markdown formats」；生成极简 HTML 页面按时间序展示用户 prompt 与助手回复；支持整棵 `~/.claude/projects/` 目录处理并生成带链接的项目索引页、逐会话 HTML、会话摘要导航表、token 展示、按消息类型过滤、**可缩放的交互式时间线（按消息时间分组）**、自然语言日期范围过滤；`uvx claude-code-log@latest --open-browser` 一条命令跑全量档案；watch 模式边写边转；另有 TUI 浏览会话并可导出/恢复；Antigravity（alpha）与 Codex（beta）为实验性单会话导出提供者。[README](https://github.com/daaain/claude-code-log)
- 示例输出页由真实开发会话生成、随文档构建再生成。[README](https://github.com/daaain/claude-code-log)
- 仓库元数据（2026-09-05）：1,208 星，Python，MIT，2026-09-01 有推送。

**对 DigitalMuseum 的推断/启示**

- claude-code-log 是**「会话→面向人的静态 HTML」这一工程形态在 GitHub 上最成熟的实现**（1.2k 星、活跃、产出自包含可分享页面），与 DM 的静态导出契约同路。差异同样清晰：它是**转录渲染器**（完整对话、message 粒度、交互靠页面内 JavaScript），DM 是**档案策展**（按天事件、证据链、无脚本单文件、敏感信息扫描后人工确认才落盘）。
- 它的「项目索引页 + 逐会话页 + 会话摘要表」三层信息架构，与 DM 的「档案时间线 → 展览 → 证据抽屉」三层可以互为镜子；其输出未做敏感信息防线，DM 的导出前扫描（PRD §9 机械防线）是显式差异点。
- 只读转录源文件、输出写到独立目录——读写分离与 DM 一致。

---

## 3. 差异化专项：有人在把编码 Agent 会话做成「面向人的档案/时间线/展览」吗？

这是本次调研的核心问题。**结论：没有找到与 DigitalMuseum 同一生态位的项目；存在四个远亲，各自只覆盖 DM 的一个侧面，且体量都小（≤288 星）。** 以下逐一给出证据与差距。

#### 3.1 cc-wrapped：Spotify Wrapped 式年度总结——最接近「展览」，但是一件玩具的完成度

**来源事实**

- 「Generate a personalized Spotify Wrapped-style summary of your Claude Code usage. Your year in code, beautifully visualized.」；特性：会话数、消息数、token、项目数、连续活跃（streaks）、GitHub 风格活动热力图、最常用模型与提供者分解；`npx cc-wrapped`，`--year` 选年份。[README](https://github.com/numman-ali/cc-wrapped)
- 源码直接读取 `~/.claude/history.jsonl` 与 `~/.claude/projects/`（src/collector.ts 中硬编码路径）。[collector.ts](https://github.com/numman-ali/cc-wrapped/blob/main/src/collector.ts)
- 仓库元数据（2026-09-05）：87 星，TypeScript，MIT，2025-12-25 建仓，**最后推送 2025-12-26——一个周末项目，此后休眠约 8 个月**。

**与 DigitalMuseum 的对比/推断**

- 相同点：同样的动机起点（本机会话数据值得被「回顾」而非只被「统计」）、同样的面向人输出（年度总结+热力图+streaks）、同样零模型零云。
- 差距：单工具（仅 Claude Code）、一次性快照（无持续档案库、无幂等同步）、无证据链、无信任分级、无导出契约、已休眠。它验证了「Wrapped 式回顾」有人想做、有人用，但没人把它做成产品。

#### 3.2 clawd-insights：时间线仪表盘 + AI 周报——最接近「档案时间线」，但押在模型上

**来源事实**

- 「A local-first session analysis & review dashboard for your agents……automatically scans the work your local agents——Claude Code, Codex CLI, OpenClaw, tclaude, Cursor and more——have already done, and turns it into a timeline with an AI-generated summary per session……It can also digest every local agent conversation into your weekly work report」；「Analysis data always stays on your machine. Session analysis runs through your own local `claude`/`codex` CLI (or another API backend you configure)」；形态为 macOS 桌面宠物 + 仪表盘；Timeline view 按 date/project/agent 可视化每个会话。[README](https://github.com/yx0716/clawd-insights)
- 仓库元数据（2026-09-05）：42 星，JavaScript，AGPL-3.0，2026-08-26 有推送，2026-04 建仓。

**与 DigitalMuseum 的对比/推断**

- 相同点：**「timeline by date / project / agent」与 DM 的浏览镜头（按项目/按 Agent/按日期）逐字相同**；同样主张本地优先。
- 差距：①会话摘要与周报完全依赖模型调用（本地 CLI 或 API）——违反 DM 的确定性铁律；②转录仍是展示单位，没有事件抽象与信任分级；③AGPL 许可 + macOS 单平台 + 42 星。它证明了 DM 的界面形态有人需要，也证明了「用 AI 总结会话」是这类项目的自然滑坡——DM 不滑坡的原因（真实性契约）正是与它的分界线。

#### 3.3 worklog：证据优先的工作日志——哲学最近，但方向相反（写入侧）

**来源事实**

- 「Worklog keeps one evidence-based record of what you and your agents actually got done」「A material task is not complete until the checkpoint names the outcome and the evidence」；每条记录必须有 test/commit/URL/run ID/工件路径之一作为证据；产出人类可读的 Markdown 账本（按贡献者与稳定 session ID 分组）+ 日/周自包含 HTML 摘要（可按项目/贡献者/机器过滤）+ macOS LaunchAgent 夜间自动生成；「No cloud account. No telemetry. No database. No transcript dump.」；Python 3.10+，**无第三方运行时依赖**；直接支持 Claude Code 与 Codex，通用适配器覆盖 Hermes、OpenClaw、**Pi** 及任何能执行命令的 Agent。[README](https://github.com/cathrynlavery/worklog)
- 仓库元数据（2026-09-05）：28 星，Python，MIT，2026-08-14 建仓，2026-08-19 最后推送。

**与 DigitalMuseum 的对比/推断**

- 相同点惊人地多：证据优先（checkpoint 必须带证据才能成立 ≈ DM 的 claims 必须逐字锚定 evidence）、日/周自包含 HTML 摘要（≈ DM 的静态导出）、无云无遥测无数据库、纯标准库、目录 0700/文件 0600 的本地权限纪律（与 DM 的数据完整性「永不偷懒」清单同魂）。
- 根本差异：**方向相反**。worklog 是写入侧日志——Agent 在做事的当下主动记 checkpoint，没记就丢；DM 是读取侧档案——从已存在的会话转录确定性回溯。worklog 的「No transcript dump」立场甚至与 DM 的「证据文档不整份复制会话」口径隔空呼应。
- 推断：若 DM 用户同时跑 worklog，两者互补不冲突（一个记结论、一个存经历）；worklog 的「证据字段枚举（test/commit/URL/run ID）」对 DM 将来细化 evidence anchor 的类型标注有直接参考价值。

#### 3.4 emulo：把会话挖成「you.md」画像——做的是「人的档案」，但读者是 Agent

**来源事实**

- 「Emulo mines selected evidence from those sessions——Claude Code, Codex, Copilot CLI, OpenCode, and Google Antigravity logs out of the box——into a private working profile your agent reads before every task」；自设「Not memory」一节：「Memory is what you explicitly told the model. Emulo mines what your work already proved about you」；读取原始会话日志而非 CLAUDE.md；分层（work/design/writing/video）；挖掘需模型（托管或本地，选本地则全程不出机器）；MIT、无账号。[README](https://github.com/ohad6k/emulo)
- README 内嵌了一次真实运行：1,656 个会话、约 300 万 token 的用户消息被分块交给 Agent 提取行为模式后合并为 you.md。[README](https://github.com/ohad6k/emulo)
- 仓库元数据（2026-09-05）：288 星，Python，MIT，2026-08-24 有推送。

**与 DigitalMuseum 的对比/推断**

- emulo 是全调研中**唯一自称在做「关于你这个人的记录」的项目**，且它同样把会话日志当作「比你写下的规则更诚实的记录」——这与 DM 的档案哲学同源。但它的产出物给 Agent 读（提升下次协作），依赖模型挖掘（违反 DM 确定性边界），且无证据链（you.md 无法回溯到某次会话的原文）。
- emulo 恰好是 DM 「将来若引入模型」的分岔路预演：同样的输入，AI 加工后的输出只能停在 candidate 层——DM 的真实性契约在这一点上比 emulo 多了整条信任链。可在论述「为什么 DM 的展览文案是确定性叙事底稿」时引为对照。

#### 3.5 专项结论

把「编码 Agent 会话 → 面向人的个人档案/时间线/展览/回忆录」拆成六个要件——多工具聚合、确定性提取、分级信任、证据链可回溯、持续档案库（幂等同步）、面向人的叙事输出——的覆盖情况：

| 要件 | CCHV | cass | claude-code-log | cc-wrapped | clawd-insights | worklog | emulo | **DM** |
|---|---|---|---|---|---|---|---|---|
| 多工具聚合 | ✅ 29 路 | ✅ 26 路 | ⚠️ Claude 为主 | ❌ 仅 Claude | ⚠️ 4-5 路 | ⚠️ 写入侧 | ⚠️ 5 路 | ✅ 4 路（严口径） |
| 确定性提取 | ✅（无模型） | ✅（词法必达） | ✅ | ✅ | ❌（AI 摘要） | ✅ | ❌（模型挖掘） | ✅ |
| 分级信任 | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️（证据门槛） | ❌ | ✅ verified/candidate |
| 证据链回溯 | ❌ | ⚠️（source_path/行号） | ⚠️（源文件对照） | ❌ | ❌ | ✅（checkpoint 证据字段） | ❌ | ✅ blob+anchor |
| 持续档案库 | ⚠️（实时读文件） | ✅（SQLite 真相源） | ❌（每次重渲染） | ❌ | ⚠️ | ✅（账本追加） | ❌ | ✅（source_key 幂等） |
| 面向人的叙事输出 | ❌（转录浏览器） | ❌（检索） | ✅（静态 HTML+时间线） | ✅（年度总结） | ✅（时间线+周报） | ✅（日/周摘要） | ❌（给 Agent 读） | ✅（无脚本展览） |

**没有任何一列全绿；DM 是唯一全绿的一列。** 最接近的三个「面向人」输出（claude-code-log / cc-wrapped / clawd-insights）分别缺档案库与跨工具、缺一切工程深度、缺确定性与证据链。差异化成立，且不是因为没人想到，而是因为这条路线的每个环节（确定性、信任分级、证据、策展）都反「快速做个 AI 总结」的直觉——恰是 DM 的护城河所在。

---

## 4. 已核实但未入正文的项目与线索

以下均于 2026-09-05 经 GitHub API / README 核实。星数为当日快照。

### 4.1 与上一份《Agent Memory 调研》交叉引用（不再展开）

- **[thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)**：93,206 星，JavaScript，Apache-2.0，当日有推送——本主题下星数第一，但属记忆域（捕获会话→AI 压缩→回注），上一份调研未及收录，特此补记：安装器默认引导浏览器登录以开通托管记忆（CMEM Pro observer），可用 `--provider` / `CLAUDE_MEM_ONLINE_OPTIN=false` 跳过（[README](https://github.com/thedotmack/claude-mem)）。它是「会话被拿去喂 Agent」路线的体量天花板，与 DM 的「会话存证给人看」路线相反。
- **[ctxrs/ctx](https://github.com/ctxrs/ctx)**：1,077 星，Rust，Apache-2.0，「instant recall……Git blame, but for agent sessions」；开源本地检索 + 付费 ctx pro（任意代码行回溯产生它的会话转录）；自述与「agent memory」的区别是「无有损压缩步骤」（[README](https://github.com/ctxrs/ctx)）。检索域，与上一份的 memsearch/engram 同位。
- **[vshulcz/deja-vu](https://github.com/vshulcz/deja-vu)**：775 星，Go，MIT，当日有推送。「No LLM, no embeddings, one local Go binary」，回溯式索引 22 个 harness（含 DeepSeek Harness 的引导接入）**安装前**的全部历史；索引进即脱敏（密钥/JWT/私钥剥离）；`deja promote <id> --state rejected` 标记被否决的决策且永不删除（[README](https://github.com/vshulcz/deja-vu)）。它有一处与 DM 展示面重叠：`deja stats --card` 可输出 SVG 统计卡（供 profile README 使用）——本次调研见到的唯一「会话数据→人看的图像」输出，但止于统计卡，非档案叙事。主功能属记忆/检索域，归入交叉引用。
- memsearch（Zilliz）、mem0 官方 OpenMemory（跨 harness 会话搬运 CLI）：上一份调研已详述，本文不重复。

### 4.2 用量/成本类（正文三强之外的已核实项）

- **[junhoyeo/tokscale](https://github.com/junhoyeo/tokscale)**：5,297 星，Rust，MIT，当日有推送；终端 token 追踪 + **全球排行榜（"trillions of tokens tracked"）**——排行榜意味着用量数据上云，本地优先边界外。
- **[graykode/abtop](https://github.com/graykode/abtop)**：3,487 星，Rust，MIT；「Like htop, but for AI coding agents」，实时监控 Claude Code 与 Codex 会话/token/上下文窗/限额/端口。
- **[phuryn/claude-usage](https://github.com/phuryn/claude-usage)**：2,197 星；本地仪表盘，token/成本/会话历史，Pro/Max 订阅进度条。
- **[Javis603/token-monitor](https://github.com/Javis603/token-monitor)**：1,943 星；35+ 工具、本地优先桌面组件、多设备同步。
- **[xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker)**：1,519 星；31 个工具（描述中点名 DeepSeek Harness），「Never reads prompts」。
- **[tddworks/ClaudeBar](https://github.com/tddworks/ClaudeBar)**：1,461 星；macOS 菜单栏监控 Claude/Codex/Antigravity/Gemini 配额。
- **[Iamshankhadeep/ccseva](https://github.com/Iamshankhadeep/ccseva)**：806 星；macOS 菜单栏实时用量。
- **[philipp-spiess/claude-code-costs](https://github.com/philipp-spiess/claude-code-costs)**：204 星，**2025-06-16 后无推送（休眠逾一年）**；用户线索名单成员，核实为弃坑。
- **[Han-1413141/dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter)**：254 星；**DeepSeek Harness 专用**会话成本计插件（会话/日成本、预算、历史、90+ 模型价目、中英双语）——dsh 生态有独立周边工具的直接证据。

### 4.3 查看器/检索类的补充

- **[Leanmcp/superview.sh](https://github.com/Leanmcp/superview.sh)**：2,113 星；仪表盘细看 Claude Code 日志。
- **[kbwo/ccmanager](https://github.com/kbwo/ccmanager)**：1,233 星，TypeScript，MIT，2026-09-02 有推送；「Coding Agent Session Manager for Claude Code / Gemini CLI / Codex CLI / Cursor Agent / Copilot CLI / Cline CLI / OpenCode / Kimi CLI」——用户线索名单成员，定位为会话管理器（TUI）。
- **[marcus/sidecar](https://github.com/marcus/sidecar)**：1,055 星，Go，MIT；CLI Agent 旁路 shell：diff、文件树、**会话历史**与任务管理。
- **[0xSero/ai-data-extraction](https://github.com/0xSero/ai-data-extraction)**：1,272 星，Python，**无 license**；从 cursor/codex/claude-code/windsurf/trae 提取全部对话史（面向 ML 训练数据）；无 license 故不入正文，仅作「会话=训练数据」路线的例证。
- **[bawadou/ai-data-extractor](https://github.com/bawadou/ai-data-extractor)**：553 星；同类多工具聊天史提取器。
- **[ZeroSumQuant/claude-conversation-extractor](https://github.com/ZeroSumQuant/claude-conversation-extractor)**：666 星；从 Claude Code 内部存储提取干净对话日志。
- **[raine/claude-history](https://github.com/raine/claude-history)**：471 星；Claude Code 会话模糊搜索。
- **[eckardt/cchistory](https://github.com/eckardt/cchistory)**：137 星，2026-06-10 有推送；「Like the shell history command but for your Claude Code sessions」——用户线索名单中的 cchistory 即此（另有 [badlogic/cchistory](https://github.com/badlogic/cchistory) 489 星是提取各版本系统提示词的另一个东西，勿混淆）。
- **[nilbuild/claude-run](https://github.com/nilbuild/claude-run)**：670 星；Claude Code 会话历史的 Web UI。
- **[yashagldit/Claude-Code-History-VSCode](https://github.com/yashagldit/Claude-Code-History-VSCode)**：39 星；VS Code 扩展浏览五工具聊天史。

### 4.4 编排/远程类的补充

- **[NanmiCoder/cc-haha](https://github.com/NanmiCoder/cc-haha)**：14,281 星；本地优先跨平台桌面工作区（多 Agent、worktree、diff、技能市场、桌面宠物、微信/飞钉 TG 接入）。
- **[Octane0411/open-vibe-island](https://github.com/Octane0411/open-vibe-island)**：1,983 星；macOS 控制中心，监控会话、批准动作、瞬时跳回。
- **[eneskirca/nodeterm](https://github.com/eneskirca/nodeterm)**：1,737 星；节点画布式 tmux 终端管理器。
- **[awslabs/cli-agent-orchestrator](https://github.com/awslabs/cli-agent-orchestrator)**：1,204 星；AWS 官方的 tmux 隔离多 CLI 编排。
- **[Nexting-ai/nexting](https://github.com/Nexting-ai/nexting)**：1,227 星；手机/PIN/戒指远程控制 Claude Code/Codex/Grok/Cursor。
- **[johannesjo/parallel-code](https://github.com/johannesjo/parallel-code)**：1,003 星；三 CLI 并行 worktree。
- **[Priivacy-ai/spec-kitty](https://github.com/Priivacy-ai/spec-kitty)**：1,595 星；spec 驱动 + 看板 + worktree。
- **[Kc1t/alethe-agents](https://github.com/Kc1t/alethe-agents)**：542 星；本地优先桌面工作区，真 PTY、分屏、持久会话历史。
- **[jamesrochabrun/AgentHub](https://github.com/jamesrochabrun/AgentHub)**：486 星；管理 Claude Code 与 Codex 全部会话、建 worktree、并行终端、diff 预览。
- **[simion/termic](https://github.com/simion/termic)**：244 星；自称开源 Conductor.build 替代（真终端跑真 CLI）。
- **[openwong2kim/wmux](https://github.com/openwong2kim/wmux)**：367 星；Windows/macOS worktree 扇出。
- **[GODGOD126/codex-history-sync-tool](https://github.com/GODGOD126/codex-history-sync-tool)**：497 星；把 Codex Desktop 会话史同步回当前 provider；**[Wangnov/codex-threadripper](https://github.com/Wangnov/codex-threadripper)**：387 星；Codex 线程历史对齐单一 provider 桶——两者是「会话跨端搬运」小生态。

### 4.5 转文档/安全类的补充

- **[vibe-log/vibe-log-cli](https://github.com/vibe-log/vibe-log-cli)**：340 星；记录并分析 Claude Code/Cursor 会话的 CLI。
- **[charlie947/ai-second-brain](https://github.com/charlie947/ai-second-brain)**：161 星；从 ChatGPT/Claude 历史构建可检索的第二大脑（Claude Code skill，云同步）。
- **[Ishannaik/agent-sweep](https://github.com/Ishannaik/agent-sweep)**：76 星，2026-09-01 有推送；**在 Agent 会话史中查找并脱敏密钥**（Claude Code 等）——与 DM 导出前敏感信息扫描（常见密钥/本机路径/邮箱，命中须人工确认）直接同位的第三方实现，值得保持关注其检测规则集。
- **[screenpipe](https://github.com/screenpipe/screenpipe)**：21,413 星；持续本地录屏给 Agent 提供上下文（YC S26）——「本机行为记录」的极端形态，仅作生态注脚。

### 4.6 未能核实/不成立的线索

- **conductor（conductor.build）**：闭源 macOS 应用，GitHub 无官方仓库；开源替代见 termic（244 星）。
- **codeai-history**：GitHub 搜索仅见 0 星无关同名仓库，未找到可核实的对应项目；**不收**。
- **claude-code-logs**：无此名单成员的权威对应物；最接近的既有 daaain/claude-code-log（正文 2.6.1）也有 Leanmcp/superview.sh（2,113 星），后者见 4.3。

---

## 5. 机制横评：对 DigitalMuseum 有直接参考价值的设计

### 5.1 DM 已有同构物的（外部印证）

| 机制 | 外部先例（本调研） | DM 对应物 |
|---|---|---|
| 只读消费既有会话文件 | claude-devtools「Not a Wrapper」+ Docker `:ro`、yepanywhere「uses your existing CLI session history」、ccusage/codeburn/agent-sessions/cass 全家 | 四适配器绝不修改本机目录 |
| 派生资产可重建、唯一真相源 | cass「SQLite 真相源，一切派生（词法/语义/汇总/备份）可重建，无派生资产是权威」 | Evidence Blob（SHA-256 落盘）+ 派生视图 |
| 读数分级/来源标签 | Claude-Code-Usage-Monitor 的 official / local_estimate / experimental / unknown 四级 provenance labels | verified / candidate + 用户裁决优先 |
| 子代理转录不算用户行为 | codeburn「subagent sidechain 排除于主会话统计」 | dsh `delegationDepth != 0` 排除、Codex `thread_source == "user"` |
| 静态自包含 HTML 输出 | claude-code-log（自包含 HTML+项目索引）、worklog（日/周自包含 HTML 摘要） | 无脚本单文件展览导出 |
| 会话必须锚定外部可信坐标 | entire（会话↔commit 索引）、worklog（checkpoint 必须带 test/commit/URL/run ID） | evidence anchor 逐字锚定 |
| 按日聚合 | ccusage daily、monitor 的 project/model/day 仓库、entire 的 commit 归档 | 按天事件 |
| 会话是易失品（30 天清理） | monitor「survives Claude's 30-day cleanup」、CCHV Full Backup | 证据文档 SHA-256 落盘存证 |

### 5.2 DM 可以借鉴、当前未做的

1. **会话格式的确定性验收表**（agent-sessions 的 Session-Bench：20 个 pass/fail 门、每格带证据）：DM 的 47 个后端用例可包装成同型的「四产品会话格式 bench」，作为 S6 基线的对外形态。
2. **数据契约显式化**（cass 的「Search asset contract」章节）：在 docs 中加一条「任何派生视图/导出物可从 uploads/ 的 blob 全量重建」的契约声明。
3. **输出物管道友好**（codeburn overview 自动去色、可粘贴）：静态导出的 HTML 已满足；将来若加 CLI 读数输出（如同步统计），沿用「stdout 只有数据」约定（cass 同款）。
4. **脱敏规则集跟进**（deja-vu 索引期剥离密钥/JWT/私钥；agent-sweep 专做会话密钥清扫）：DM 导出扫描的规则集可与这两个项目的公开规则对照补全（尤其本机路径之外的正则族）。
5. **被否决记录永不删除**（deja-vu `promote --state rejected`）：与 DM「用户 rejected 的同题同日事件保持/降级 candidate」同向，可在异议通道的产品表述中借用「标记而非删除」的话语。
6. **静默失败披露文风**（agent-sessions v5.1.1 逐条自曝三个不可见故障）：DM 的 changelog/大考文档可引入同款「不可见故障清单」段落。

### 5.3 与 DM 边界相斥、明确不照搬的

- **AI 摘要/画像/周报**（clawd-insights、emulo、specstory Lore、claude-mem）：一切「用模型加工会话」的输出在 DM 中只能停留在 candidate + 逐字锚定，永不进 verified。
- **写入被读工具的目录/文件**（CCHV 改 Codex `state_5.sqlite` 与删除会话、specstory 写项目目录、deja-vu 写 harness 配置、codeg 安装管理 Agent CLI）：DM 的只读铁律比以上全部更严格，且不可妥协。
- **云同步/排行榜/托管记忆**（specstory cloud、tokscale 排行榜、omnara cloud、claude-mem observer、vibe-kanban cloud）：DM 无云部署、单用户本地优先。
- **无 license / AGPL / 带 rider 的 MIT**（yepanywhere、ai-data-extraction、claude-squad、clawd-insights、cass、OpenViking 系）：只借鉴思想，不复制代码。

---

## 6. 最终判断

1. **DM 的差异化经得起 GitHub 全量检索的检验**：会话统计（数字）与会话浏览（转录）已是万星级红海，编排器是 28k 星的赛道，但「会话→面向人的档案/时间线/展览」整格只有 <1,500 星的四个远亲（claude-code-log、cc-wrapped、clawd-insights、worklog），且没有任何项目同时具备多工具聚合 × 确定性提取 × 分级信任 × 证据链 × 持续档案库 × 叙事导出。DM 的生态位空着，不是因为没人想要（cc-wrapped 的存在证明有人想要），而是因为这条路每个环节都反「AI 总结一下」的捷径。
2. **DM 的两个数据源判断被生态再确认**：pi 与 DeepSeek Harness 在 codeg、ccusage、agent-sessions、cass、entire、TokenTracker、dsh-cost-meter、deja-vu 的支持清单中反复出现——四产品严口径不是自嗨；同时「30 天清理」恐惧在三个独立项目 README 中出现，DM 的存证动机有社区共鸣。
3. **最值得吸收的是三件确定性工程件**：读数分级标签（monitor 的 provenance labels）、派生资产可重建契约（cass）、会话格式 pass/fail 验收表（agent-sessions 的 Session-Bench）。它们分别对齐 DM 的信任分级、blob+视图架构与 S6 基线重建，吸收成本几乎为零。
4. **最需要警惕的是两个滑坡**：其一是「加个 AI 摘要让展览更好看」——clawd-insights/emulo 演示了那条路的样子，DM 的真实性契约就是防止变成它们；其二是「顺手帮用户改个名/删个会话」——CCHV 的功能完整性诱惑，DM 的只读铁律是刻意选择的不对称。
5. **引用纪律**：本赛道星数与活跃度严重背离（vibe-kanban 28k 星但 4.5 个月无推送；claude-devtools 3.9k 星 4 个月无推送；cc-wrapped 87 星休眠 8 个月），引用任何外部项目时星数必须与推送日期并置，与上一份调研的 letta 星数迁移教训一致。
