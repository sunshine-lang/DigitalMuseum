# 第二阶段技术开发文档｜多 Note 导入与 Event Review 完整操作

> 配套文档：`docs/prd/digital-museum-prd-v0.1.md`、`docs/references/AI产品Vibe Coding通用技术栈手册.md`、`docs/technical-adaptation.md`、`docs/phase-0-stage-1-note-event-review.md`。  
> 文档状态：Ready for implementation。  
> 本文档只覆盖 Phase 0 的第二条纵向切片。开发人员不得顺手实现 Git、Photo、OCR、模型调用、Session、Story、Exhibition 或 Share。

## 零、给执行人员的结论

第一阶段已经跑通“一篇 Note → 一个候选事件 → 一次人工审阅”。第二阶段要把它扩展为：

```text
一次导入多篇 Note
→ 每篇资料都有独立 Coverage
→ 用户查看多个候选事件
→ 修正事件标题/时间
→ 合并重复或属于同一件事的事件
→ 拆分包含多个既有 Claim 的事件
→ 再次人工确认
→ 刷新与重启后仍可恢复完整证据和操作历史
```

本阶段仍然不使用 AI。系统不能自动判断哪些事件应该合并或拆分；只能提供确定性的数据操作和人工验收界面。

开始开发前必须：

1. 完整阅读仓库根目录 `AGENTS.md` 及本文档列出的配套文档。
2. 运行 `git status --short`，记录开始时已有的未提交变更；不得把无关改动收入本阶段提交。
3. 记录起始 commit SHA，在独立短期分支开发；没有明确授权时不得直接推送或合并到 `main`。
4. 先写失败测试，再实现功能；不得删除或降低第一阶段的 12 个后端测试。
5. 如果本文档与 PRD 冲突，以 PRD 为准并停止扩大范围，把冲突交给产品经理确认。

## 一、阶段目标

### 1.1 交付范围

- 在一个已有 Stage 中一次选择并导入多篇 `.md` / `.txt` Note。
- 每个文件独立保存原文、解析、生成候选事件或记录失败原因；一个文件失败不能抹掉其他文件的成功结果。
- 在事件列表中完成筛选、选择和证据查看。
- 用户可以修正事件标题、日期和时间精度；不能直接改写带锚点的 Claim 原文。
- 用户可以合并两个或多个同阶段事件；合并结果必须重新成为 Candidate。
- 用户可以把一个包含至少两个既有 Claim 的事件拆成两个或多个事件；拆分结果必须重新成为 Candidate。
- Merge / Split / Edit 全部保留输入、输出、修订号和时间，不能覆盖或删除历史。
- 所有结构操作使用 revision guard；冲突时整笔事务失败，不能只完成一半。

### 1.2 阶段产物

- 向后兼容的 Alembic 数据迁移。
- 多 Note 批量导入 API、事件修正 API、Merge API、Split API 和操作历史 API。
- 更新后的 Phase 0 Web 验收界面。
- 后端自动化测试、前端类型/构建/交互测试和数据库迁移测试。
- 更新后的 README 启动、限制和验收说明。
- 一份交给验收人的完成报告，格式见第十四节。

### 1.3 完成定义

只有同时满足以下条件，执行人员才可以报告“第二阶段开发完成，等待验收”：

- 第一阶段全部测试继续通过。
- 本文档第十节新增测试通过。
- 本文档第十一节的开发者自验项目全部有证据。
- 旧数据库升级后，第一阶段的 Stage、原文、Claim、Anchor、Review 均未丢失。
- Merge / Split 后，任何输出 Event 的每个 Claim 仍能定位到原 Evidence Blob。
- 被合并或拆分的旧事件只标记为 `superseded`，不物理删除。
- 没有把 Candidate、Inference 或操作结果静默提升为正式事实。
- 没有引入模型、云服务、付费平台或新的外部数据发送。

### 1.4 明确不做

- 不做自动事件聚类、自动 Merge/Split 建议或语义相似度。
- 不做 Core Claim 自由改写；如 Claim 有问题，用户只能标记 `disputed` / `unknown` 并写审阅备注。
- 不做 Git、Photo、HEIC、OCR、Embedding 或向量数据库。
- 不做 ChatGPT、Codex、WorkBuddy Session 导入。
- 不做 Theme、Story、Exhibition、网页生成 Skill 或 Share。
- 不做 macOS 正式客户端、登录、多用户、云数据库、加密、备份和生产部署。
- 不使用真实敏感资料；本地原文仍未加密。

## 二、技术适配摘要

- 继续采用第一阶段的 Python 3.11、FastAPI、Pydantic、SQLAlchemy、Alembic、SQLite、Next.js 和 TypeScript。
- 继续使用纵向切片：数据模型、API 和最小真实交互在同一阶段打通。
- 新增关系型表是因为 Event 与 Claim 将从“一对多”变成“多对多”，Merge/Split 还需要可审计的输入输出关系。
- 批量导入仍为本地确定性短任务：暂不引入 SSE、任务队列或后台 Worker。
- 继续使用本地内容寻址文件；相同字节只保存一份 Evidence Blob，但每次导入保留独立 Evidence Occurrence。
- 本阶段没有模型调用，因此真实模型冒烟为“不适用”，不能写成“已通过”。

## 三、技术栈与模型

### 3.1 继续使用

- 后端：Python 3.11、FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、Uvicorn。
- 数据：SQLite + `data/uploads/` 内容寻址原文。
- 测试：pytest + FastAPI TestClient。
- 前端：Next.js 16、React 19、TypeScript、现有集中式 CSS。

### 3.2 本阶段不新增

- 不新增模型 SDK、Prompt、RAG、Embedding、Chroma 或 pgvector。
- 不新增云数据库、对象存储、登录服务或部署平台。
- 不重新引入已经移除的 D1 / Drizzle 链路。

### 3.3 模型说明

无模型。本阶段继续使用版本化确定性 Note 解析器；如果修改解析规则，必须升级 `processor_version` 并补回归测试，不能沿用旧版本号掩盖行为变化。

## 四、环境与配置

保留第一阶段配置，并新增以下可配置限制：

- `DIGITAL_MUSEUM_MAX_BATCH_FILES`：默认 20。
- `DIGITAL_MUSEUM_MAX_BATCH_BYTES`：默认 20 MiB。
- 单文件 `DIGITAL_MUSEUM_MAX_UPLOAD_BYTES`：继续默认 2 MiB。

限制只是本地 MVP 的临时安全边界，必须集中配置并写入 `.env.example`，不能散落硬编码。批次文件数或总大小超过限制时，整个批次在保存前拒绝；单个文件格式、内容或日期错误时，仅该文件失败，其他文件继续处理。

启动端口保持：

- API：`127.0.0.1:8010`
- Web：`127.0.0.1:3001`

## 五、项目结构与改动边界

沿用现有分层：

```text
backend/app/api       → 只负责 HTTP、校验和错误映射
backend/app/services  → 批量导入与 Event 操作的应用逻辑
backend/app/domain    → 数据模型、受控状态和 Pydantic Schema
backend/app/core      → 配置、数据库、统一错误
backend/alembic       → 可追踪的数据迁移
backend/tests         → 只通过公开 API 验证主要行为
app/                  → Phase 0 验收工作台
```

后端依赖只能是 `api → services → domain → core`。本阶段虽然出现了批量导入和 Event 操作两个用例，但仍属于 note-event 业务域，不做全仓库架构重写。

建议新增或调整的职责文件：

- `backend/app/services/note_batch_service.py`：批次创建、文件逐项处理、批次统计和中断恢复。
- `backend/app/services/event_operation_service.py`：Edit、Merge、Split 的事务规则。
- `backend/app/domain/enums.py`：Event、Batch、Operation 等受控状态，避免字符串散落。
- `backend/app/domain/models.py`：数据库关系。
- `backend/app/domain/schemas.py`：公开请求与响应契约。
- `backend/tests/test_note_batches_api.py`：批量导入测试。
- `backend/tests/test_event_operations_api.py`：Edit、Merge、Split 测试。
- 前端可把当前单页按“导入区、事件列表、事件详情、结构操作”拆成小组件或 hooks，但不做视觉系统重构。

以上文件名允许按现有代码风格微调；职责边界和依赖方向不得改变。

## 六、数据、资产与状态

### 6.1 数据迁移原则

当前结构把 `CandidateEvent` 直接绑到一个 `EvidenceOccurrence`，把 `Claim` 直接绑到一个 Event；它无法表达“多个 Note 合成一个 Event”或“一个多 Claim Event 被拆开”。第二阶段必须先完成数据关系升级。

迁移必须：

1. 使用新的 Alembic revision，不修改已经执行过的第一阶段 migration。
2. 先创建新字段/表并回填，再移除旧约束；不能先删旧关系。
3. 为每个旧 Event 建立与原 Claim 的关联，为每个旧 Claim 回填来源 Occurrence。
4. 升级前后的 Event、Claim、Anchor、Review 数量和 ID 必须一致。
5. 使用第一阶段真实 schema fixture 做 upgrade 测试。
6. 如果 downgrade 无法无损表达 Merge/Split 数据，必须明确拒绝 downgrade 并提示备份，不能静默丢数据。

### 6.2 建议数据结构

#### `import_batches`

- `id`
- `stage_id`
- `status`：`processing | completed | completed_with_errors | interrupted`
- `total_count`
- `succeeded_count`
- `failed_count`
- `total_bytes`
- `created_at`
- `finished_at`

`EvidenceOccurrence` 新增：

- `import_batch_id`：可空；第一阶段单文件导入保持为空。
- `batch_position`：可空；保存原选择顺序。

批次处理过程中每个文件继续使用现有 Occurrence 与 Coverage。服务启动时，遗留的 `processing` 批次标记为 `interrupted`；不得把它们伪装成成功。

#### `claims`

新增：

- `source_occurrence_id`：Claim 最初来自哪次导入，不能为空。

移除旧的 Event 单归属后，Claim 本身作为不可原地改写的、有 Evidence Anchor 的断言存在。

#### `event_claim_links`

- `event_id`
- `claim_id`
- `role`：`core | supporting`
- `position`
- 唯一约束：`event_id + claim_id`

Event 通过关联表拥有 Claim。一个 Claim 可以出现在结构操作产生的历史 Event 与新 Event 中，但它的文字、来源 Occurrence 和 Anchor 不因 Merge/Split 被修改。

#### `event_operations`

- `id`
- `stage_id`
- `operation_type`：`edit | merge | split`
- `payload_json`：经过 Pydantic 校验的操作前后元数据快照；不能放完整原文。
- `created_at`

#### `event_operation_members`

- `operation_id`
- `event_id`
- `direction`：`input | output`
- 唯一约束：`operation_id + event_id + direction`

该表用于回答“这个新事件由哪些旧事件产生”“这个旧事件后来去了哪里”。

#### `candidate_events`

- 移除“一条 Event 只能对应一个 Occurrence”的唯一关系。
- 状态增加 `superseded`。
- 保留 `revision` 作为并发修改保护。

### 6.3 Event 状态规则

```text
candidate → confirmed | disputed | unknown | rejected
confirmed/disputed/unknown/rejected → 新审阅状态
任一非 superseded 状态 → edit → candidate
两个或多个可操作 Event → merge → 输入 superseded + 新输出 candidate
一个至少含两个 Claim 的可操作 Event → split → 输入 superseded + 多个输出 candidate
superseded → 不允许再次审阅、编辑、合并或拆分
```

关键边界：

- `superseded` 只表示事件边界被新的结构替代，不表示原 Evidence 或 Claim 为假。
- Merge/Split 输出即使只包含曾经确认过的 Claim，也必须重新是 `candidate`。
- Edit 只修改标题、日期和时间精度；Claim 逐字文本和 Anchor 不可修改。
- 已确认 Event 被 Edit 后，Event 退回 `candidate`；原 Review 历史保留。
- Merge/Split 不物理删除输入 Event、Claim、Anchor 或 Review。

## 七、API 设计

所有响应继续使用：

```json
{"data": {}}
```

所有错误继续使用：

```json
{"error":{"code":"error_code","message":"给用户看的中文说明"}}
```

每个新接口必须声明 Pydantic 请求/响应模型，不能返回无约束 `dict`。

### 7.1 保持兼容的接口

- `POST /api/v1/stages/{stage_id}/notes`：保持单文件导入行为和返回结构，不做破坏性修改。
- 第一阶段其他 Stage、Coverage、Event、Review 接口继续可用。

### 7.2 批量导入

#### `POST /api/v1/stages/{stage_id}/note-batches`

- 请求：multipart `files`，1–20 个 `.md` / `.txt`。
- 整批前置校验：Stage 存在、文件数量、总字节数。
- 返回状态：201；部分文件失败仍返回 201，由批次状态表达 `completed_with_errors`。
- 返回字段：`batch_id`、批次状态、总数、成功数、失败数、逐文件结果。
- 每个逐文件结果：文件名、状态、Occurrence ID、Event ID（成功时）或统一错误 code/message（失败时）。

#### `GET /api/v1/stages/{stage_id}/note-batches/{batch_id}`

- 用于刷新后恢复批次结果。
- Batch 必须属于路径中的 Stage，否则返回 404，不能跨 Stage 暴露。

批量导入继续复用单文件的安全文件名、扩展名、声明类型、实际内容、UTF-8、控制字符和大小检查。

### 7.3 修正 Event 元数据

#### `PATCH /api/v1/events/{event_id}`

请求字段：

- `title`：可选，去除首尾空白后 1–200 字符。
- `occurred_on`：可选，可设为空。
- `time_precision`：`exact | approximate | unknown`。
- `expected_revision`：必填。
- `note`：可选，最多 2000 字，用于解释修正原因。

规则：

- 至少实际改变一个字段，否则返回 `422 no_event_changes`。
- 日期必须在 Stage 范围内。
- `superseded` Event 返回 `409 event_superseded`。
- revision 不匹配返回 `409 stale_event_revision`。
- 成功后 revision + 1、状态回到 `candidate`，并写入 `event_operations`。

### 7.4 Merge

#### `POST /api/v1/stages/{stage_id}/event-merges`

请求字段：

- `event_ids`：至少 2 个且不能重复。
- `expected_revisions`：覆盖每个输入 Event。
- 新 Event 的 `title`、`occurred_on`、`time_precision`。
- `note`：可选操作说明。

规则：

- 所有输入 Event 必须属于同一 Stage，且不能是 `rejected` 或 `superseded`。
- 使用一个数据库事务校验全部 revision；任一不匹配，整笔失败。
- 新 Event 关联输入 Event 的全部 Claim，按输入顺序和原 position 稳定排序。
- 相同 Claim ID 只关联一次；文字相同但 Claim ID 不同的内容不自动去重。
- 输入 Event 标记 `superseded` 并各自 revision + 1。
- 输出 Event 为 `candidate`、revision 0，必须由用户再次确认。
- 返回 Operation、输入事件摘要和完整输出 Event。

### 7.5 Split

#### `POST /api/v1/events/{event_id}/splits`

请求字段：

- `expected_revision`。
- `outputs`：至少 2 个；每个包含标题、日期、时间精度和 `claim_ids`。
- `note`：可选操作说明。

规则：

- 输入 Event 至少关联两个 Claim，否则返回 `422 event_not_splittable`。
- 每个输出至少分配一个 Claim。
- 输入 Event 的每个 Claim 必须且只能被分配一次；不能静默遗漏，也不能在本阶段复制到多个输出。
- 请求中的 Claim 必须属于输入 Event。
- 输入 Event 不能是 `rejected` 或 `superseded`。
- 成功后输入 Event 标记 `superseded`，输出全部为 `candidate`。
- 任一校验失败时不创建任何输出 Event。

### 7.6 操作历史

#### `GET /api/v1/event-operations/{operation_id}`

- 返回操作类型、时间、经过校验的元数据摘要、输入 Event、输出 Event。
- 不返回完整 Note 原文，只返回用户已经可通过 Event/Anchor 接口查看的结构化引用。

### 7.7 新增错误码最低集合

- `batch_empty`
- `batch_too_many_files`
- `batch_too_large`
- `batch_not_found`
- `no_event_changes`
- `invalid_event_date`
- `event_superseded`
- `events_cross_stage`
- `invalid_merge_event_count`
- `missing_expected_revision`
- `event_not_splittable`
- `invalid_split_claims`
- `operation_not_found`

继续复用 `stale_event_revision`、`stage_not_found`、`event_not_found` 和文件导入错误码。

## 八、Prompt 与 Agent 设计

无 Prompt、无模型、无动态 Agent、无工具自主调用。

确定性代码只负责：

- 按文件逐项执行既有 Note 导入规则。
- 校验用户明确提交的 Edit / Merge / Split 请求。
- 维护 Evidence、Claim、Event 和操作历史的关系。

确定性代码不负责：

- 猜测哪些事件相似。
- 推断时间相邻事件的因果关系。
- 自动补充 Claim。
- 把用户未确认的结构操作提升为正式事实。

## 九、最小验收界面

首页 `/` 继续是 Phase 0 验收工作台，不是正式视觉产品。本阶段至少增加：

### 9.1 导入区

- 文件选择器支持 `multiple`。
- 选择后显示文件数量、总大小、支持/不支持提示。
- 导入后逐文件显示成功或失败；不能只显示一个总成功提示。

### 9.2 事件列表

- 展示标题、日期/时间精度、状态、Claim 数和来源文件数。
- 能区分 `candidate`、已审阅状态和 `superseded`。
- 支持选择多个非 superseded Event 进入 Merge。
- `superseded` 默认折叠，但可查看历史去向。

### 9.3 事件详情

- 显示全部 Claim 和每个 Claim 的 Evidence Anchor。
- 显示原文件名、哈希、行号和逐字引用。
- Edit 只能改标题、日期、时间精度和备注；Claim 原文不可编辑。
- Merge/Split 完成后清楚提示“新事件仍是候选，需要再次确认”。

### 9.4 Split 交互

- 只有至少两个 Claim 的 Event 显示 Split 入口。
- 用户把每个 Claim 分配给一个输出 Event。
- 有 Claim 未分配、重复分配或输出为空时，前端先阻止提交，后端仍必须再次校验。

### 9.5 目标终端

- 主要验收：桌面浏览器。
- 390px 宽度下不得出现整页横向滚动；复杂 Merge/Split 操作允许提示改用桌面完成，但内容必须可读。
- `/demo` 继续保留，不得被改造成第二阶段完成证明。

## 十、工作包与测试要求

执行人员可以由一人按顺序完成，也可以多人分工；共享 schema 和 API 契约必须先冻结。

### WP0：基线与契约保护

交付：

- 记录起始 commit、工作区已有改动和本阶段分支。
- 先为公开 API 写失败测试。
- 生成并审查 Alembic 迁移方案。

验收：没有覆盖用户文件，没有修改旧 migration，没有破坏第一阶段 API。

### WP1：关系模型和迁移

交付：

- `import_batches`、Claim 来源、Event–Claim 多对多关系、Event Operation 审计表。
- 第一阶段数据库升级与回填。
- 受控 Enum/状态，不让状态字符串继续散落。

自动化测试：

- 第一阶段 fixture 升级后 ID、数量、Anchor 和 Review 保持一致。
- 旧 Event 正确关联旧 Claim；旧 Claim 正确关联来源 Occurrence。
- Merge/Split 新拓扑不能被 downgrade 静默丢弃。

### WP2：多 Note 批量导入

交付：批次 API、持久化状态、逐文件 Coverage、刷新恢复和启动中断恢复。

自动化测试：

- 3 个有效文件全部成功，产生 3 个 Occurrence 和 3 个 Candidate Event。
- 2 个有效文件 + 1 个 PDF：批次为 `completed_with_errors`，有效文件成功，PDF 留下失败 Coverage，不产生 Event。
- 相同字节的两个文件共用一个 Blob，但保留两次 Occurrence。
- 超过文件数或总大小时整批拒绝，不能产生半批数据。
- 服务重启后批次和逐文件结果可读取。
- 遗留 `processing` 批次在新进程中成为 `interrupted`，不伪装完成。

### WP3：Edit / Merge / Split 领域操作

交付：领域服务、事务、revision guard、操作历史和公开 API。

自动化测试：

- Edit 修改标题/时间后 revision + 1，Event 回到 `candidate`，Claim/Anchor 未改变。
- 空 Edit、越界日期、stale revision 和 superseded Event 正确拒绝。
- Merge 两个同 Stage Event 后，输入为 `superseded`，输出为 `candidate`，Claim/Anchor 全部保留。
- 跨 Stage、重复 ID、缺 revision、包含 rejected/superseded Event 的 Merge 整笔拒绝。
- Merge 任一 revision 冲突时，所有输入状态和输出数量完全不变。
- 对多 Claim Event 做 Split 后，每个 Claim 恰好进入一个输出，输入为 `superseded`。
- 单 Claim Event、遗漏 Claim、重复 Claim、外部 Claim 和 stale revision 的 Split 整笔拒绝。
- 重启应用后，Event Operation 的输入输出关系仍可读取。

### WP4：验收界面

交付：多文件导入、逐项结果、事件多选、Edit、Merge、Split、操作历史入口。

验证：

- TypeScript 类型检查通过，不用 `any` 绕过新 API 契约。
- 关键页面渲染测试覆盖多文件、superseded 和 Merge/Split 提示。
- 用真实浏览器走通第十一节流程。
- 桌面和 390px 宽度检查；浏览器控制台无新增 error。

### WP5：收尾与交接

交付：

- README 更新。
- 完整测试输出。
- `git diff --check`。
- 独立代码审查，分别检查技术规范和 PRD 完整性。
- 只提交本阶段文件；列出未触碰的并行改动。
- 按第十四节生成完成报告。

### 10.1 全量命令

执行人员交付前至少运行：

```bash
npm run test:backend
npm run typecheck
npm run lint
npm run test:local
cd backend && UV_CACHE_DIR=../.sites-runtime/uv-cache uv run ruff check .
cd backend && UV_CACHE_DIR=../.sites-runtime/uv-cache uv run ruff format --check .
git diff --check
```

不能用“测试环境不方便”作为删除测试或跳过核心路径的理由。确实无法运行的项目必须在完成报告中标记为“未验证”。

## 十一、开发者自验清单

执行人员完成代码后，必须亲手完成以下流程并保存结果：

- [ ] 从第一阶段数据库升级，不清空 `data/`，旧事件和审阅仍可查看。
- [ ] 新建或打开一个 3–12 个月 Stage。
- [ ] 一次选择 4 个文件：3 个有效 Note、1 个不支持文件。
- [ ] 批次显示 3 个成功、1 个失败；失败原因可见且事件数只增加 3。
- [ ] 每个成功事件都能看到原文件名、哈希、行号和逐字引用。
- [ ] 修改一个事件的标题和时间，确认它回到 Candidate，原 Claim 没有被改写。
- [ ] 合并两个事件，旧事件显示为 superseded，新事件包含两个来源的 Claim 和 Anchor。
- [ ] 确认合并后的 Event；刷新页面后确认状态仍存在。
- [ ] 将一个至少包含两个 Claim 的 Event 拆成两个，确保没有 Claim 丢失或重复。
- [ ] 对旧 revision 再次提交操作，页面明确提示数据已变化，不覆盖最新结果。
- [ ] 重启 API，重新打开 Stage，批次、事件、审阅和操作历史仍存在。
- [ ] 390px 宽度下页面内容可读，没有整页横向滚动。
- [ ] `/demo` 仍可打开，但没有被当作本阶段交付。

## 十二、产品经理验收清单

开发人员报告完成后，产品经理不需要看数据库或代码，按以下步骤验收：

- [ ] 按 README 启动后端和网页。
- [ ] 上传多篇测试笔记，确认每个文件都有自己的结果。
- [ ] 故意混入一个 PDF，确认其他笔记不会一起失败。
- [ ] 点开任一事件，确认每句话都能看到来自哪个文件、哪一行。
- [ ] 修改事件标题/时间，确认系统要求重新确认。
- [ ] 合并两个事件，确认新事件没有自动成为事实。
- [ ] 拆分一个多 Claim 事件，确认每条 Claim 都有明确去向。
- [ ] 刷新页面并重启服务，确认结果没有消失。
- [ ] 确认页面没有出现 Git、照片、Session、Story 或展览功能冒充完成。

任一项不符合时，记录页面截图、操作步骤和预期/实际结果，交给验收人员复现；不要只说“有问题”。

## 十三、风险与待确认项

### 13.1 已知风险

- 数据迁移是本阶段最高风险：错误迁移可能让第一阶段的 Claim/Event 关系丢失。
- Merge/Split 会显著增加状态复杂度；必须使用事务和 revision guard，不能靠前端顺序保证正确。
- 批量导入仍是同步请求，适合最多 20 个小型 Note；不代表大规模资料导入能力已经成立。
- 确定性解析器仍可能漏掉 Note 后续段落；本阶段验证人工结构操作，不验证 AI 事件发现质量。
- 原文未加密，只能使用非敏感测试资料。

### 13.2 暂定规则

- 每批最多 20 个文件、总计 20 MiB；通过配置控制，后续可根据真实耗时调整。
- Split 只处理已经拥有至少两个 Claim 的 Event；不允许用户凭空写新 Claim。
- 文字相同但来源不同的 Claim 不自动去重。

这些规则不增加费用、平台或外部发送，不阻塞本阶段开发。如执行人员认为必须改变，应先在文档中写出影响并等待产品经理确认。

### 13.3 当前无须产品经理提供

- 不需要 API Key。
- 不需要云账号。
- 不需要真实个人资料。
- 不需要选择模型或部署平台。

## 十四、完成后如何通知验收

开发人员完成后，把下面内容完整交给产品经理；产品经理再在当前 Codex 对话中通知验收：

```markdown
# 第二阶段完成报告

## 1. 代码范围
- 起始 commit：
- 结束 commit：
- 开发分支：
- 修改文件：
- 未触碰的并行改动：

## 2. 已实现
- 多 Note 批量导入：
- Event Edit：
- Merge：
- Split：
- 操作历史与重启恢复：

## 3. 数据迁移
- Alembic revision：
- 第一阶段 fixture 升级结果：
- 数量/ID/Anchor/Review 对账结果：
- downgrade 边界：

## 4. 验证证据
- npm run test:backend：
- npm run typecheck：
- npm run lint：
- npm run test:local：
- ruff check / format：
- 浏览器人工链路：
- 桌面/390px：
- 控制台错误：

## 5. 未完成或未验证
- 

## 6. 范围声明
- 未实现模型、Git、Photo/OCR、Session、Story、Exhibition、Share。
- 未使用真实敏感资料。
- 未把 mock 或确定性测试表述为真实模型验证。
```

只有拿到以上材料后，验收人员才开始独立复核；开发人员自己的“全部通过”不是最终验收结论。

## 十五、交接给下一阶段

第二阶段通过独立验收后，仓库将具备：

- 多 Note 输入与逐文件 Coverage。
- 可复用的 Event–Claim 多对多关系。
- 可审计的 Edit / Merge / Split 操作。
- 不改写 Evidence 的多事件人工整理能力。

下一阶段建议进入 Work/Git Evidence Adapter：只读解析本地仓库的 Commit、Tag、README 和选定 Diff，并把 Git 证据接入现有 Claim、Anchor、Event Review 与 Coverage 契约。未经第二阶段验收，不得提前开始该 Adapter。
