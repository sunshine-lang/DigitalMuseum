# 优化方向决策文档（2026-08-23 夜间自主会话）

> 依据：PRD v0.2 路线图、`docs/phase-0-stage-6-claude-code-sessions.md` 模式、本机真实数据侦察。
> 本文回答一个问题：今晚的持续优化额度应该投到哪里，为什么。

## 一、第一性原理分析

产品的核心价值主张：**帮 AI 时代开发者把散落在隐藏目录里的协作痕迹，变成可信的、可回溯的人生经历。** 拆到最小单元：

1. **燃料覆盖**：有多少种真实痕迹能进来？（适配器广度）
2. **可信度**：进来的每一条都能逐字回溯、确定性核实、用户可异议？（真实性契约——已由 86 个测试护栏锁定）
3. **终点价值**：整理完之后，用户得到什么可留存、可分享的东西？（静态展览导出）
4. **可恢复性**：误操作/事故不会毁掉档案。（备份）

当前状态：引擎（Evidence → Claim → Event → Review）已被 4 个适配器复用验证；**燃料覆盖到 Claude Code 但缺 Codex**（维护者本机 345 个会话文件、773 个真实 user 线程）；**终点价值为零**（一切止步于本地草稿预览）；**可恢复性有已知缺口**（阶段删除是级联清空，无备份出口，PRD 开放问题 #4）。

## 二、候选方向与取舍

| 候选 | 价值 | 风险/成本 | 判定 |
|---|---|---|---|
| A. Stage 7 Codex 适配器 | 补全两大编码 Agent 燃料；维护者真实数据立即可验收；与 claude-code-evidence-v1 同模式，风险低 | 中（新格式侦察已完成：session_meta/thread_source/user_message；需排除 317 个 subagent 内部线程） | **首选** |
| B. Stage 8 静态展览导出（最小功能版） | 第二价值时刻（US-09）；产品门面 | 高（视觉方向是 PRD 开放问题 #1；容易做出半吊子视觉） | **次选**（做功能切片，不做视觉重设计） |
| C. Archive 备份导出 | 防误删（PRD #4 建议 Stage 8 前） | 低 | 第三（小切片） |
| D. 会话语义概括（模型层） | 高但违反当前宪法（不引入模型调用） | — | 不做（PRD 明确暂缓） |

**决策：A → B(功能切片) → C，按此顺序交付独立切片。** 理由：A 的确定性最高且立即产生真实用户价值（dogfooding gate 前置）；B 在 A 之后做最小自包含导出，视觉重设计留给专门的 Stage 8；C 作为保护性小切片收尾。

## 三、Stage 7 设计要点（codex-evidence-v1，确定性）

- **侦察结论**（本机 345 文件全量扫描）：目录 `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`；记录级 `timestamp`（UTC）；`session_meta.payload` 含 `cwd`、`thread_source`（user=773 / subagent=317 / composer_link=1）、`id`；`event_msg.payload.type` 含 `user_message`（文本在 `message` 字段）与 `agent_message`。
- **subagent 线程必须排除**：其 `user_message` 是系统注入的审计材料（"The following is the Codex agent history…"），不是用户说的话。只取 `thread_source == "user"`；user 线程实测 278 条消息 0 条 `<` 开头，保留 Claude 同款 `<` 跳过规则作保险。
- **定位规则**：输入项目路径（与 Claude/Git 通道同体验）→ 扫描 codex 根下全部 rollout，按 `resolve(cwd) == resolve(输入路径)` 过滤；fail-closed 路径校验同 git/claude。
- **读取范围**（全部确定性）：每会话首/末时间戳（按本机时区归日）、`user_message` 计数与首条真实用户消息原文（跳过 `<` 开头）、`agent_message` 计数。**不修改 `~/.codex` 任何内容，不摘录 assistant 消息，不整份复制会话。**
- **证据文档与事件**：与 claude-code-evidence-v1 同构（按天分块、每行可锚定）；事件标题「在 {项目} 与 Codex 协作」，`origin="codex"`，机器读数 → `verified`；聚合走 `note-aggregation-v1` 与 `_resolve_machine_event` 四级落位，origins 白名单加 `"codex"`。
- **API**：`GET /codex-sessions/preview?path=`、`POST /stages/{id}/codex-sessions`，错误码族同 claude（`codex_path_required` / `codex_path_not_allowed` / `codex_sessions_not_found` / `no_codex_sessions_in_range`）。
- **前端**：导入区第五通道（同一模式），来源 chip「来自 Codex 会话」，诚实文案与 claude 对齐。

## 四、切片拆分与验收

| 切片 | 内容 | 验收 |
|---|---|---|
| S7-1 | 后端适配器 + API + 测试 | pytest 新增用例全绿（含 subagent 排除、越界 403、重复导入聚合、重启恢复、preview 无副作用） |
| S7-2 | 前端通道 + 文档（AGENTS.md/README/stage-7 文档） | typecheck/lint/test:local 全绿；真实 `~/.codex/sessions` 只读验收（临时 DB） |
| S8a | 最小静态展览导出（自包含 HTML，隐私默认不含证据链细节） | 一条命令导出、断网双击可看、390px 可读 |
| S8b | Archive 备份导出 | 导出/恢复往返一致 |

每个切片：实现 → 对抗性自审 → 全量自查命令 → 全绿提交推送（只 add 本切片文件）。
