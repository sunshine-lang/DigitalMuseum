# 第二阶段技术开发文档｜多 Note 聚合 + Merge / Split

> 配套文档：`docs/prd/digital-museum-prd-v0.1.md`、`docs/references/AI产品Vibe Coding通用技术栈手册.md`、`docs/technical-adaptation.md`、`docs/phase-0-stage-1-note-event-review.md`。
> 本文档只覆盖 Phase 0 的第二条纵向切片。AI 开发时不得提前实现 Photo、Git、ChatGPT Adapter、真实模型、Story / Exhibition 等后续能力。

## 一、阶段目标

- 交付范围：在同一建馆阶段内，多篇 Note 可以聚合成一个候选事件；用户可以合并多个候选事件、把聚合事件按来源拆回多个候选事件。
- 阶段产物：确定性聚合规则 `note-aggregation-v1`、Merge / Split API、事件血缘与审计记录、验收界面上的合并与拆分交互、自动化测试。
- 验收标准：聚合不改变任何锚点的逐字引用与哈希；合并与拆分后每个候选事件仍然逐字可定位证据；已审阅事件不会被自动混入新主张；结构操作的全部历史留有审计行；重启后状态不变。
- 明确不做：Photo / Git Adapter、OCR、Embedding、模型调用、自动语义聚类、跨阶段聚合、Story / Exhibition、删除档案。
- 主链路片段：`多 Note Import → 确定性聚合 → 多来源候选事件 → Merge / Split（结构操作 + 审计）→ Event Review`。

## 二、技术适配摘要

- 引用《技术适配声明》结论：纵向切片，本地优先，无模型调用。
- 本阶段采用：现有 Python 3.11 + FastAPI + Pydantic + pytest + Next.js 默认栈，全部延续。
- 本阶段启用：SQLite + SQLAlchemy + Alembic（已在 Stage 1 引入，本阶段新增一次 schema 迁移）。
- 本阶段偏离/暂缓：无新增偏离。
- 开发路径：纵向切片（结构操作本身就是 Event Review 核心交互的一部分）。

## 三、技术栈与模型

- 后端：Python 3.11、FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、Uvicorn、pytest + FastAPI TestClient。
- 前端：Next.js 16、React 19、TypeScript、集中式 CSS（延续现状）。
- 模型：无。聚合规则为版本化确定性规则 `note-aggregation-v1`，不推断语义相似性。

## 四、环境与配置

- 无新增配置项；沿用 `DIGITAL_MUSEUM_DATABASE_URL`、`DIGITAL_MUSEUM_UPLOAD_DIR`、`DIGITAL_MUSEUM_MAX_UPLOAD_BYTES`、`NEXT_PUBLIC_DIGITAL_MUSEUM_API_URL`。
- 后端端口 8010，前端 3001；本阶段不需要 API Key。

## 五、项目结构

无新增目录；改动集中在：

- `backend/app/domain/models.py`：事件血缘字段与 Claim 来源字段。
- `backend/app/services/museum_service.py`：聚合、合并、拆分业务。
- `backend/app/api/routes.py`：新增 Merge / Split 路由。
- `backend/alembic/versions/`：新增第三次迁移。
- `backend/tests/test_phase0_stage2_aggregation.py`：本阶段测试。
- `app/page.tsx`、`app/phase0-api.ts`、`app/globals.css`：验收界面交互。

## 六、数据、资产与状态

迁移要点（SQLite batch 重建）：

- `candidate_events`：
  - `occurrence_id` 去掉 unique，改为 nullable（合并产物不再绑定单一来源）；
  - 新增 `origin`：`note | aggregated | merged | split`，默认 `note`；
  - 新增 `aggregation_rule`（如 `note-aggregation-v1`），nullable；
  - 新增 `parent_event_id` 自引用 nullable：被合并的源事件指向合并产物；拆分产物指向被拆分事件。
- `claims`：
  - 新增 `occurrence_id`（NOT NULL，backfill 自原事件的 occurrence_id）：主张永久知道自己来自哪次导入；
  - 新增 `source_title`（NOT NULL，backfill 自原事件标题）与 `source_occurred_on`（nullable，backfill 自原事件日期）：拆分时按来源恢复标题与日期。

状态机扩展：

```text
事件 status：candidate / confirmed / disputed / unknown / rejected（审阅态）
           + merged / split（结构终态，不可再审阅、合并、拆分）

审阅审计 decision：confirmed / disputed / unknown / rejected（人工审阅）
                 + merged / split（结构操作，同样写入 event_reviews，保留 previous_status）
```

确定性聚合规则 `note-aggregation-v1`：

- 规范化标题 = casefold、去首尾空白、内部连续空白折叠为一个空格。
- 同一阶段内，新 Note 的（规范化标题, occurred_on）与某现有事件完全一致，且该事件 `status=candidate`、`revision=0`、`origin ∈ {note, aggregated}` 时，新 Claim 并入该事件（`origin` 置为 `aggregated`）。
- 日期缺失、日期不同、标题不同，或目标事件已被审阅/合并/拆分 → 建立独立新事件。
- 聚合不改变事件 revision（聚合只发生在从未审阅的事件上）。

Merge 规则：

- 源事件必须全部存在、属于同一阶段，且均非 `merged` / `split` 终态。
- 新事件 `origin=merged`、`status=candidate`、`revision=0`；标题取请求标题（可选）或最早创建源事件的标题。
- `occurred_on`：所有源事件日期已知且全部相等 → 保留该日期且 `exact`；否则置空且 `unknown`（不猜区间）。
- 全部 Claim 移入新事件，`epistemic_status` 重置为 `unknown`（新组合未经审阅）；锚点逐字保留。
- 每个源事件：`status=merged`、`revision+1`、写入 `decision=merged` 审计行（含 `previous_status`）、`parent_event_id` 指向新事件。
- 推荐裁决说明：合并已审阅事件会把确认状态重置为候选，这是"组合未经审阅不得视为已确认"的直接后果，界面必须提前告知。

Split 规则：

- 目标事件必须非终态，且其 Claims 按来源 `occurrence_id` 分组后 ≥2 组，否则失败。
- 每组生成一个新事件：`origin=split`、`parent_event_id` 指向被拆分事件、标题与日期取组内 `source_title` / `source_occurred_on`。
- Claims 移入对应新事件并重置为 `unknown`；锚点逐字保留。
- 被拆分事件：`status=split`、`revision+1`、写入 `decision=split` 审计行、Claims 清空（历史见审计与拆分产物）。

原文资产：不变。Evidence Blob 与上传目录逻辑完全复用 Stage 1。

## 七、API / 工具设计

新增（沿用 `{"data": ...}` 信封与 `{"error":{code,message}}` 错误契约）：

- `POST /api/v1/stages/{stage_id}/events/merge`
  - 请求：`{"event_ids": ["...","..."]（2–20 个，去重后 ≥2）, "title": "可选新标题 ≤200"}`
  - 成功 200：`{"data": {"event": EventOut, "sources": [EventOut]}}`
  - 错误：`stage_not_found`(404)、`event_not_found`(404，含跨阶段)、`event_not_mergeable`(409，终态)、`merge_needs_multiple_events`(422)
- `POST /api/v1/events/{event_id}/split`
  - 请求：空 JSON 体
  - 成功 200：`{"data": {"event": EventOut（拆分源，终态）, "events": [EventOut（新事件）]}}`
  - 错误：`event_not_found`(404)、`event_not_splittable`(409，终态)、`nothing_to_split`(409，来源 <2)
- `EventOut` 扩展：`origin`、`source_count`（不同来源 Note 数）；`status` 增加 `merged` / `split`；`latest_review.decision` 增加 `merged` / `split`。
- 既有接口契约不变；`POST /stages/{id}/notes` 返回的 `event` 可能是已存在的聚合事件。
- 本阶段无长耗时任务，不引入 SSE 或队列。

## 八、Prompt 设计

无 Prompt。聚合规则是纯确定性代码，版本号 `note-aggregation-v1` 随 Claim / 事件持久化。

## 九、验收界面

- `/` 工作台在 Stage 1 基础上新增：
  - 事件列表支持勾选多个可合并事件，出现“合并所选事件”操作条，内联二次确认，说明“合并后会重置为候选，需要重新审阅”；
  - 审阅面板展示全部 Claims 与各自锚点、来源 Note 数量与来源类型（聚合 / 合并 / 拆分 / 单篇）；
  - 来源 ≥2 且非终态的事件显示“拆分为独立事件”，内联二次确认。
- 目标终端：桌面浏览器；移动端保证内容可读。`/demo` 不变。

## 十、测试要求

第一层 mock 自动化（`backend/tests/test_phase0_stage2_aggregation.py`，全部走公开 API）：

1. 同标题同日期的两篇 Note 聚合为一个候选事件（claims=2、source_count=2、origin=aggregated、两次导入返回同一 event id、两份原文各自落盘）。
2. 日期不同 / 标题不同 / 日期缺失 → 不聚合，各自独立。
3. 已审阅（confirmed）事件不吸收后续同题同日 Note。
4. 合并两个独立事件：新事件为 fresh candidate（revision=0、claims 重置 unknown、source_count=2），源事件进入 merged 终态并保留 previous_status 审计。
5. 合并已确认事件时 previous_status=confirmed 被如实记录；合并产物日期规则（相同→exact；不同→unknown）。
6. 合并参数错误：单事件 422、跨阶段 404、终态源 409。
7. 拆分聚合事件：按来源恢复两篇 Note 的原始标题与日期，锚点逐字不变，原事件进入 split 终态。
8. 拆分合并产物与“合并后拆回”链路。
9. 拆分参数错误：单来源 409 nothing_to_split、终态 409 event_not_splittable。
10. 结构操作后重启后端，merged / split / 新事件状态全部可恢复。

第二层真实模型冒烟：不适用（本阶段无模型调用，不以确定性聚合冒充语义聚类效果）。

前端：typecheck、lint、构建与渲染冒烟；浏览器人工验收见第十一节。

## 十一、验收清单

- [ ] 新建一个 3–12 个月阶段，导入第一篇带 `title` 和 `date` 的 `.md`。
- [ ] 导入第二篇 `title`、`date` 与第一篇完全相同、正文不同的 Note，页面候选事件数量不增加，打开后能看到两条 Core Claim 和两个不同哈希的锚点，来源显示“聚合自 2 篇 Note”。
- [ ] 导入一篇同标题但 `date` 不同的 Note，候选事件数量 +1（不聚合）。
- [ ] 勾选两个候选事件，点击“合并所选事件”，确认提示后出现一个新候选事件，来源显示“合并产生”，原两个事件显示“已合并”且不能再审阅。
- [ ] 打开合并产物，能看到全部逐字引用、行号与文件哈希；对它执行“确认发生过”后刷新，状态保持。
- [ ] 对聚合或合并产物点击“拆分为独立事件”，确认后出现多个候选事件，标题和日期恢复为各篇 Note 原值，原事件显示“已拆分”。
- [ ] 只有一篇 Note 的事件不出现拆分按钮，直接调用接口会得到可理解的错误。
- [ ] 重启后端（`npm run backend:dev`），刷新页面：合并、拆分与审阅状态全部仍在。
- [ ] `/demo` 仍可打开，且不受本阶段改动影响。

## 十二、风险与待确认项

- 确定性聚合规则只能验证数据链与结构操作，不能证明语义聚类质量；语义聚类属于后续真实模型阶段。
- 合并不会逐事件校验 expected_revision；单用户本地原型下以审计行代替并发防护，多用户前必须补齐。
- 已审阅事件被合并后确认状态重置为候选，属推荐裁决（组合未经审阅不得视为已确认）；如产品经理不接受，需要改为“禁止合并已审阅事件”。
- 必须由产品经理决定的问题：无。

## 十三、交接给下一阶段

- Claim 级 `occurrence_id` / `source_title` / `source_occurred_on` 与事件血缘字段就绪，后续 Git / Photo Adapter 可直接按“新增来源类型的主张”接入同一聚合与审阅框架。
- 下一阶段候选：Git Adapter（确定性最强）、评测 harness（Phase 0 Gate 前置）。
