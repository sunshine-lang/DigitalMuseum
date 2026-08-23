# 第七阶段技术开发文档｜Codex Session Adapter

> 配套文档：`docs/prd/digital-museum-prd-v0.2.md`（路线图 Stage 7）、`docs/phase-0-stage-6-claude-code-sessions.md`（模式来源）。
> 本文档只覆盖 Phase 0 的第七条纵向切片。不提前实现 ChatGPT/WorkBuddy 适配器、会话语义概括、模型调用。

## 一、阶段目标

- 交付范围：用户粘贴一个项目路径；系统只读扫描 `~/.codex/sessions`（配置 `codex_sessions_root`）下按日期存放的全部 rollout JSONL，按每个会话 `session_meta.payload.cwd` 归属到该项目，过滤后渲染确定性证据文档并按天生成 verified 事件，进入现有 Event Review。
- 阶段产物：`codex-evidence-v1` 确定性适配器、预览/导入 API、首页导入通道、共享渲染模块 `agent_session_evidence.py`（Stage 6 的 Claude 渲染逻辑抽出复用）、7 个 API 测试（全量 93）。
- 验收标准：与 Stage 6 相同（锚点逐字、verified、重复导入聚合、重启恢复、真实数据导入成功、`~/.codex` 只读），另加：**subagent 内部线程必须排除**。
- 明确不做：ChatGPT/WorkBuddy、会话概括（留给模型层且只产 candidate）、assistant 消息摘录、跨项目一次导入。

## 二、设计要点

### 2.1 目录布局与项目归属

Codex 与 Claude 不同：会话不按项目分目录，而是统一存于 `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`，项目归属由每个文件首行 `session_meta.payload.cwd` 决定。因此：

- 输入必须是真实项目目录（不存在 Claude 那种「会话目录直接导入」的变体）；
- 适配器流式扫描全部 rollout 首行做归属过滤（本机 345 文件实测毫秒级），再全量解析命中文件；
- 路径校验与 git/claude 同标准：存在、是目录、`realpath` 后位于允许根之下，fail closed。

### 2.2 确定性读取范围 `codex-evidence-v1`

- 记录级 `timestamp`（ISO 8601，UTC）→ 会话首/末时间、按本机时区归日（与 claude/git 口径一致）；
- `thread_source != "user"` 一律排除：**subagent 线程（本机 317/1091）的 user_message 是系统注入的审计材料，不是用户说的话**；composer_link 等其他来源同样排除；
- `event_msg.payload.type == "user_message"` 且文本不以 `<` 开头（系统注入行）→ 计数与首条真实用户消息原文；
- `event_msg.payload.type == "agent_message"` → 仅计数，不摘录内容；
- 容错：首行非可解析 session_meta、单行损坏、无任何时间戳 → 确定性跳过，不失败整个导入。

### 2.3 证据文档与事件

- 复用 `agent_session_evidence.render_evidence_document`：按天分块、每行可锚定（`source: codex sessions` 头）；
- 事件标题「在 {项目} 与 Codex 协作」，`origin="codex"`，机器读数 → `status="verified"`，Claim 为确定性描述 + `evidence_role="artifact"`；
- 聚合与分级信任：`note-aggregation-v1` + `_resolve_machine_event` 四级落位，origins 白名单加入 `"codex"`。

## 三、API

- `GET /api/v1/codex-sessions/preview?path=...`：只读预览最早/最晚会话日期与数量（含范围外），不落库；
- `POST /api/v1/stages/{stage_id}/codex-sessions`：请求 `{"path": "..."}`，成功 201 同 Git/Claude 结构；
- 错误码族：`codex_path_required`(422)、`codex_path_not_allowed`(403)、`codex_sessions_not_found`(422)、`no_codex_sessions_in_range`(422)、`stage_not_found`(404)；
- `EventOut.origin` 增加 `"codex"`；既有契约不变。

## 四、测试要求（`backend/tests/test_phase0_stage7_codex_sessions.py`）

1. 假会话根（日期目录 + 多 rollout：项目内 2 个、subagent 1 个、其他项目 1 个、无 meta 1 个、范围外 1 个、损坏行）→ 只统计项目内 user 线程；`<environment_context>` 注入行不计入消息数；
2. 锚点逐字回溯（行号与字符偏移）；
3. 重复导入聚合不复制（`origin` 变 `aggregated`、`source_count=2`）；
4. dispute 后重导并入用户判定不复制（分级信任回归）；
5. 路径越界 403 / 不存在 422 / 空路径 422；范围内无会话 422 且无残留；
6. 重启后事件与审阅仍在；
7. 预览返回区间与计数、无 DB 副作用。

## 五、验收界面

- 首页导入区新增「导入 Codex 会话」路径输入与按钮；成功提示「已从项目 X 整理出 N 段经历」；
- 事件卡来源标识「来自 Codex 会话」；文案明确说明子代理线程不计入、只读不改 `~/.codex`；
- 不做视觉重构。

## 六、交接给下一阶段

- 共享渲染模块就绪，Stage 10 的 ChatGPT ZIP / WorkBuddy / Chatbox 按同一模式接入（各写目录定位 + 解析器，复用 `render_evidence_document`）；
- 遗留决策：会话概括是否引入模型产 candidate 通道（PRD v0.2 第 8 节规则）。
