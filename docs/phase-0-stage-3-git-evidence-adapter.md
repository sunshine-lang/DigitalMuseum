# 第三阶段技术开发文档｜Work/Git Evidence Adapter

> 配套文档：`docs/prd/digital-museum-prd-v0.1.md`、`docs/technical-adaptation.md`、`docs/phase-0-stage-1-note-event-review.md`、`docs/phase-0-stage-2-aggregation-merge-split.md`。
> 本文档只覆盖 Phase 0 的第三条纵向切片。开发时不得提前实现 Photo/OCR、模型调用、ChatGPT Adapter、Story/Share。

## 一、阶段目标

- 交付范围：用户在页面上填写一个本地 Git 仓库路径；系统只读解析该仓库在当前建馆阶段日期范围内的提交（Commit）与标签（Tag），生成确定性证据文档并落盘为 Evidence Blob，再按天聚合为候选事件，进入现有 Event Review 流程。
- 阶段产物：`git-evidence-v1` 确定性适配器、Git 导入 API、验收界面入口、自动化测试。
- 验收标准：每次导入产生的每个 Claim 都能定位到证据文档中的具体行；提交日期都在阶段范围内；不修改用户仓库的任何内容；重复导入同一仓库聚合而不是复制事件；重启后状态可恢复。
- 明确不做：Photo、OCR、diff 内容解析、多分支合并历史（只读当前 HEAD）、语义聚类、模型调用、跨阶段导入。
- 主链路片段：`本地仓库路径 → 只读 git 读取 → 确定性证据文档（Blob）→ 按天候选事件 → Event Review`。

## 二、设计要点

### 2.1 证据文档（Evidence Document）

Git 历史不是文件，不能直接当 Note 上传。适配器把阶段范围内的 Git 活动渲染为一份**确定性文本文档**（UTF-8，`.txt`），按内容哈希落盘到 `data/uploads/`，成为普通 Evidence Blob：

```text
repo: DigitalMuseum (main)
range: 2026-03-01..2026-08-31

## day 2026-08-18 (3 commits)
1bb99ae Finalize accessible Digital Museum product demo
...

## tag v1.0.0 (2026-08-20)
```

- 同一仓库 + 同一阶段范围 + 同一 HEAD 历史渲染结果逐字节相同，天然去重（同 Blob 复用）。
- 每个 Commit 行、Tag 行都是潜在锚点：`quote` 逐字取自文档，`line_start/line_end` 指向该行。

### 2.2 确定性规则 `git-evidence-v1`

- 读取范围：当前分支（HEAD）的 `git log --date=short`，按提交日期过滤在 `[starts_on, ends_on]` 内；Tag 用 `for-each-ref refs/tags` 的 creatordate 过滤。
- 按天分组：同一天 ≥1 个提交 → 一个候选事件，标题 `在 {repo} 提交代码`，日期为该天；Claim 文本为确定性描述（`这一天在仓库 X（branch 分支）提交了 N 个变更：…`，subject 逐字引用，最多 5 条后以"等"省略）；每个提交行一个锚点。
- 每个 Tag → 一个候选事件，标题 `在 {repo} 发布版本 {tag}`，日期为 Tag 日期。
- 事件 `origin="git"`，`status="candidate"`，必须经人工审阅；Claim `evidence_role="artifact"`（机器产物，区别于笔记的 `user_statement`）。
- 聚合：沿用 `note-aggregation-v1` 的（规范化标题, 日期）规则，`origin` 白名单加入 `git`；重复导入同一仓库同一天 → 并入既有候选事件，不复制。

### 2.3 路径安全（fail closed）

- 新配置 `DIGITAL_MUSEUM_ALLOWED_REPO_ROOTS`：逗号分隔的允许根目录，支持 `~`；默认 `~`（本地单用户原型，用户自己的机器和后端）。
- 校验：路径必须存在、是目录、`realpath` 后必须位于某个允许根之下；`git rev-parse --is-inside-work-tree` 必须成功。全部 subprocess 调用使用参数列表、禁止 shell、设超时。
- 只执行只读子命令：`rev-parse`、`log`、`for-each-ref`。绝不执行写操作。

## 三、API

- `POST /api/v1/stages/{stage_id}/git-repos`
  - 请求：`{"path": "/Users/you/Projects/some-repo"}`
  - 成功 201：`{"data": {"occurrence": OccurrenceOut, "events": [EventOut], "coverage": [CoverageOut]}}`
  - 错误：`repo_path_required`(422)、`repo_path_not_allowed`(403)、`not_a_git_repository`(422)、`no_git_activity_in_range`(422)、`git_command_failed`(422)、`stage_not_found`(404)。
- 既有接口契约不变；`EventOut.origin` 增加 `"git"`；`ClaimOut.evidence_role` 增加 `"artifact"`。

## 四、测试要求（`backend/tests/test_phase0_stage3_git_evidence.py`，全部走公开 API）

1. 临时仓库（fixture 用 `git init` + 环境变量指定作者日期制造跨日期提交与 Tag）在范围内导入 → 按天生成候选事件 + Tag 事件；每个 Claim 的锚点 quote 逐字出现在证据文档对应行；blob 已按哈希落盘。
2. 范围外的提交与 Tag 不产生事件。
3. 重复导入同一仓库 → 聚合（事件数不翻倍，`source_count` 增长，`origin` 变 `aggregated`）。
4. 路径在允许根之外 → 403 `repo_path_not_allowed`；非 Git 目录 → 422；空路径 → 422。
5. 范围内无任何活动 → 422 `no_git_activity_in_range`，不产生半成品数据。
6. 生成事件可用现有 review API 确认为 `confirmed`；重启（新建 app 实例同库）后事件与审阅仍在。
7. git 子命令失败（如损坏仓库）→ 422 `git_command_failed`，不留半成品。

## 五、验收界面

- 首页导入区新增"导入本地 Git 仓库"路径输入与按钮；成功后提示"从仓库 X 整理出 N 段经历"并刷新事件；失败显示统一错误。
- 事件卡来源标识新增"来自 Git 仓库"；其余复用现有发现/核对/展览链路，不做视觉重构。

## 六、交接给下一阶段

- 证据来源类型机制（note / git）就绪，Photo Adapter 可按同一模式（确定性证据文档 + 锚点 + 候选事件）接入。
- 下一阶段候选：Photo Adapter、评测 harness（Phase 0 Gate 前置）、服务端批量导入收尾。
