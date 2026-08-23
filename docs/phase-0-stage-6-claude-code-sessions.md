# 第六阶段技术开发文档｜Claude Code Session Adapter

> 配套文档：`docs/prd/digital-museum-prd-v0.2.md`、`docs/technical-adaptation.md`、`docs/phase-0-stage-3-git-evidence-adapter.md`（模式来源）。
> 本文档只覆盖 Phase 0 的第六条纵向切片。开发时不得提前实现 Codex/WorkBuddy/ChatGPT 适配器、静态展览导出、模型调用。

## 一、阶段目标

- 交付范围：用户粘贴一个项目路径（或 `~/.claude/projects` 下的会话目录）；系统只读解析该项目在当前建馆阶段范围内的 Claude Code 会话 JSONL，渲染确定性证据文档并落盘为 Evidence Blob，按天聚合为事件，进入现有 Event Review 流程。
- 阶段产物：`claude-code-evidence-v1` 确定性适配器、导入/预览 API、首页导入通道入口、自动化测试。
- 验收标准：每个 Claim 可定位证据文档具体行；会话日期来自会话文件内的时间戳（机器读数）→ verified；用户首条消息逐字摘录并锚定；不修改 `~/.claude` 任何内容；重复导入聚合不复制；重启后状态可恢复；维护者真实 `~/.claude/projects` 导入成功。
- 明确不做：Codex/WorkBuddy/ChatGPT、会话语义概括（"这次会话在做什么"留给将来的模型层且只产 candidate）、assistant 消息内容摘录、跨项目一次导入、照片。
- 主链路片段：`项目路径 → 定位会话目录 → 只读 JSONL 解析 → 确定性证据文档（Blob）→ 按天事件 → Event Review`。

## 二、设计要点

### 2.1 会话目录定位

Claude Code 将每个项目的会话存于 `~/.claude/projects/<转义路径>/<sessionId>.jsonl`，转义规则为把工作目录的 `/` 替换为 `-`（如 `/Users/you/Documents/DigitalMuseum` → `-Users-you-Documents-DigitalMuseum`）。适配器接受两种输入：

1. 真实项目路径（推荐，与 Git 导入同体验）：在默认根（配置 `claude_projects_root`，默认 `~/.claude/projects`）下查找对应转义目录；
2. 直接给出会话项目目录路径。

路径校验与 `git-evidence-v1` 同标准：存在、是目录、`realpath` 后位于允许根（`allowed_repo_roots`）之下，fail closed。

### 2.2 确定性读取范围 `claude-code-evidence-v1`

每个 JSONL 会话文件逐行流式解析，只提取：

- 记录级 `timestamp`（ISO 8601）：会话首/末时间戳，**会话归属于首条时间戳的日期**（跨零点会话归开始日，v1 限制）；
- `type=="user"` 且 `message.content` 为文本的消息：计数与**首条真实用户消息**（跳过 `<` 开头的系统包装行，如 `local-command-caveat`、`command-name`）；
- `type=="assistant"` 消息：仅计数，不摘录内容。

容错规则：单行 JSON 解析失败或缺少时间戳 → 跳过该行；整个文件无任何可读时间戳 → 跳过该文件；不因个别损坏行失败整个导入。所有跳过都是确定性的（同样输入同样跳过）。

### 2.3 证据文档（Evidence Document）

每个项目导入渲染一份确定性文本文档（UTF-8，`.txt`），按内容哈希落盘。同项目 + 同阶段范围 + 同会话文件内容 → 逐字节相同，天然去重：

```text
project: DigitalMuseum (/Users/you/Documents/DigitalMuseum)
source: claude-code sessions
range: 2026-05-01..2026-08-31

## day 2026-08-20 (2 sessions)
session 86a3cbe3 14:32-15:04 user_messages=7 assistant_messages=9
> 帮我把这个页面改成响应式布局…
...
```

- 用户首条消息摘录逐字取自会话文件，超长按 120 字符确定性截断并以 `…` 结尾；
- 每行都是潜在锚点：`quote` 逐字、`line_start/line_end/char_start/char_end` 指向该行。

### 2.4 事件与分级信任

- 按天分组：同日 ≥1 个会话 → 一个事件，标题 `在 {project} 与 Claude Code 协作`，日期为该天，`origin="claude"`，`status="verified"`（会话时间戳是机器确定性读数；保留异议入口）；
- Claim 文本为确定性描述（`这一天在项目 X 进行了 N 个 Claude Code 会话、共 M 条用户消息，第一条是「…」`），`evidence_role="artifact"`，锚点指向该天全部行；
- 聚合：沿用 `note-aggregation-v1`（规范化标题, 日期）与 `_resolve_machine_event` 四级落位（并入/吸收保用户判定/rejected 降级/新建），`origins` 白名单加入 `"claude"`。

## 三、API

- `POST /api/v1/stages/{stage_id}/claude-sessions`
  - 请求：`{"path": "/Users/you/Documents/DigitalMuseum"}`（也接受会话目录路径）
  - 成功 201：`{"data": {"occurrence", "events", "coverage"}}`（同 Git 导入结构）
  - 错误：`claude_path_required`(422)、`claude_path_not_allowed`(403)、`claude_sessions_not_found`(422)、`no_claude_sessions_in_range`(422)、`stage_not_found`(404)
- `GET /api/v1/claude-sessions/preview?path=...`：只读预览最早/最晚会话日期与总数，不落库（与 git-repos/preview 同模式，供建馆预填）。
- `EventOut.origin` 增加 `"claude"`；既有契约不变。

## 四、测试要求（`backend/tests/test_phase0_stage6_claude_sessions.py`，全部走公开 API）

1. fixture 构造假 projects 根（转义目录名 + 多个 JSONL，含范围内/范围外/无时间戳/损坏行）：按真实项目路径导入 → 按天 verified 事件；锚点逐字；blob 落盘。
2. 范围外会话与无时间戳文件不产生事件；损坏行被跳过且不影响其余导入。
3. 重复导入同一项目 → 聚合（事件数不翻倍，`origin` 变 `aggregated`）。
4. 路径越界 → 403；不存在 → 422；范围内无会话 → 422 `no_claude_sessions_in_range` 且无半成品数据。
5. 事件可 review 为 confirmed；dispute 后重复导入并入不复制（分级信任回归）。
6. 重启（新建 app 同库）后事件与审阅仍在。
7. 预览端点返回日期区间与计数，且无 DB 副作用。

## 五、验收界面

- 首页导入区新增「导入 Claude Code 会话」路径输入与按钮（默认提示 `~/.claude/projects` 下的项目或直接填项目路径）；成功后提示「从项目 X 整理出 N 段经历」并刷新事件。
- 事件卡来源标识「来自 Claude Code 会话」；证据说明沿用诚实文案风格（系统只读取时间戳/计数/你的消息原文，没有解读对话内容）。
- 不做视觉重构（视觉投入在 Stage 8）。

## 六、交接给下一阶段

- Agent Session 适配器模式（目录定位 → JSONL 流式确定性解析 → 证据文档 → 按天事件）就绪，Codex（Stage 7）按同一模式接入；
- 遗留给 Stage 7 决策：会话概括是否引入"模型产 candidate"通道（PRD v0.2 第 8 节规则）。
