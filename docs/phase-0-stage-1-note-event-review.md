# 第一阶段技术开发文档｜Note → Event Review 纵向切片

> 配套文档：`digital-museum-prd-v0.1.md`、《AI 产品 Vibe Coding 通用技术栈手册》、`docs/technical-adaptation.md`。
> 本文档只覆盖 Phase 0 的第一条可验收链路，不代表整个 Phase 0 Gate 已完成。

## 一、阶段目标

- 交付范围：用户创建阶段，导入一个 Markdown/TXT Note，看到处理 Coverage、候选事件、Core Claim 和逐字可定位的 Evidence Anchor，并提交审阅结论。
- 阶段产物：本地 API、SQLite 数据、内容寻址原文、最小 Web 验收界面、自动化测试和审阅审计记录。
- 验收标准：正式 Core Claim 的锚点字段完整；未审阅候选不会成为正式 Event；审阅状态刷新和后端重启后仍存在；不支持/损坏的文件不会产生半成品事件。
- 明确不做：Photo、Git、OCR、云端语义分析、真实用户 Gate、Merge/Split、ChatGPT/Codex/WorkBuddy Session、Story、Exhibition、Share。
- 主链路：`Create Stage → Import Note → Evidence/Anchor → Candidate Claim/Event → Event Review → Persisted Decision`。

## 二、技术适配摘要

- 采用：Python 3.11、FastAPI、Pydantic、pytest、现有 Next.js + TypeScript。
- 启用：SQLite、SQLAlchemy、Alembic、本地上传目录。
- 暂缓：macOS App、云端模型、D1、向量检索和正式策展界面。
- 开发路径：纵向切片，因为“看证据后做确认”本身就是待验证产品能力。

## 三、技术栈与模型

- 后端：Python 3.11、FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、Uvicorn。
- 测试：pytest + FastAPI TestClient。
- 前端：现有 Next.js 16、React 19、TypeScript。
- 模型：无。本阶段使用版本化的确定性 Note 解析器 `note-development-v1`；其输出只能进入 Candidate。

## 四、环境与配置

- `DIGITAL_MUSEUM_DATABASE_URL`：默认 `sqlite:///./data/digital_museum.db`。
- `DIGITAL_MUSEUM_UPLOAD_DIR`：默认 `./data/uploads`。
- `DIGITAL_MUSEUM_MAX_UPLOAD_BYTES`：默认 2 MiB。
- `NEXT_PUBLIC_DIGITAL_MUSEUM_API_URL`：默认 `http://127.0.0.1:8010`。
- 后端端口：8010。3000 和 8000 已有本机进程占用，本阶段不覆盖它们。
- 本阶段不需要 API Key。

## 五、项目结构

```text
backend/
  app/
    api/          # /api/v1 路由
    core/         # 配置、数据库、统一错误
    domain/       # 枚举和 API Schema
    services/     # Note 解析、Evidence/Event/Review 业务
  alembic/        # SQLite schema 迁移
  tests/          # 只通过公开 API 验证行为
data/uploads/     # 本地原文，Git 忽略
app/              # Phase 0 最小验收界面；原演示保留在 /demo
```

## 六、数据、资产与状态

- `stages`：阶段名称、起止日期、创建时间。
- `evidence_blobs`：SHA-256、受控相对路径、字节数、内容类型；相同字节只保存一次。
- `evidence_occurrences`：所属阶段、原始文件名、导入时间、处理状态。
- `claims`：原文摘录形成的候选主张、认识状态、解析器版本。
- `evidence_anchors`：行号、字符偏移、逐字引用、Evidence Blob 哈希。
- `candidate_events`：标题、时间精度、状态、修订号。
- `event_reviews`：每次人工决定、备注、时间和审阅前后状态；历史不覆盖。
- `coverage_items`：每次导入的本地保存、解析和候选生成状态及失败原因。

事件状态：

```text
candidate → confirmed
candidate → disputed
candidate → unknown
candidate → rejected
任一已审阅状态 → 新的审阅状态（revision + 1，旧记录保留）
```

`rejected` 表示事件边界被排除，不自动表示原始 Note 是假的。`unknown` 表示证据不足，不触发补写。

## 七、API / 工具设计

- `POST /api/v1/stages`：创建阶段；校验名称和起止日期。
- `GET /api/v1/stages/{stage_id}`：读取阶段及统计。
- `POST /api/v1/stages/{stage_id}/notes`：上传 `.md`/`.txt`；成功返回 Coverage、Candidate Event 和锚点；超限/二进制/格式错误返回统一错误。
- `GET /api/v1/stages/{stage_id}/coverage`：查看每个输入的保存、解析、候选生成状态。
- `GET /api/v1/stages/{stage_id}/events`：查看候选和已审阅事件。
- `GET /api/v1/events/{event_id}`：查看 Claim 和 Evidence Anchor。
- `POST /api/v1/events/{event_id}/reviews`：提交 `confirmed | disputed | unknown | rejected`；使用 `expected_revision` 防止覆盖另一个审阅。

错误结构：

```json
{"error":{"code":"unsupported_note_type","message":"只支持 Markdown 或 TXT 文件"}}
```

本阶段没有长耗时模型任务，不引入 SSE 或任务队列。

## 八、Prompt 设计

无 Prompt。确定性解析器只读取 YAML Frontmatter 中的 `title`/`date`、首个 Markdown 标题和首段正文；不推断因果、动机、完成状态或人生意义。

## 九、验收界面

- `/`：Phase 0 工作台，完成阶段创建、Note 导入、Coverage 查看、证据锚点查看和审阅。
- `/demo`：保留既有策展演示，明确标注为后续体验，不作为 Phase 0 完成证据。
- 目标终端：桌面浏览器；移动端保证内容可读，但不声明为正式移动产品。

## 十、测试要求

- 创建合法阶段；结束日期早于开始日期时拒绝。
- 上传 Note 后返回逐字可定位 Anchor，并保持原文哈希一致。
- `.pdf`、二进制、超限输入 fail closed，且不生成 Candidate Event。
- 未审阅事件保持 `candidate`；确认后 Claim 变为 `user_confirmed`。
- `unknown` 保留证据不足，不生成补写内容。
- 错误的 `expected_revision` 返回 409，不覆盖既有决定。
- 新建应用实例指向同一 SQLite 后，审阅决定仍可读取。
- 前端类型检查、ESLint、构建和关键页面 HTML 验证通过。
- 真实模型冒烟：不适用；本阶段没有模型调用。

## 十一、验收清单

- [ ] 打开首页，新建一个 3–12 个月的阶段。
- [ ] 上传一个不超过 2 MiB 的 `.md` 或 `.txt` 笔记。
- [ ] 页面显示原文件名、处理完成状态和一个候选事件。
- [ ] 打开候选事件，能看到原文逐字引用、行号和文件哈希。
- [ ] 在确认前，页面明确显示“候选，不是正式事件”。
- [ ] 选择“确认”“存疑”“证据不足”或“排除”之一，刷新页面后决定仍存在。
- [ ] 上传 `.pdf` 或二进制文件时，页面给出可理解错误，事件列表不增加。
- [ ] 重新启动后端后，重新打开同一阶段，资料和审阅状态仍存在。
- [ ] `/demo` 仍可打开，但不会被误标为本阶段真实产出。

## 十二、风险与待确认项

- 确定性 Note 解析器只能验证数据链和审阅体验，不能证明 AI 事件发现质量。
- 单个 Note 生成单个候选事件只是 tracer bullet，不是最终聚类规则。
- 当前原文未加密，不允许导入真实敏感资料；Production Archive、加密和备份不在本阶段。
- 必须由产品经理决定的问题：无。

## 十三、交接给下一阶段

完成后可复用 Stage、Evidence Blob/Occurrence、Anchor、Claim、Candidate Event、Review、Coverage 和 API 错误契约；下一条 Phase 0 切片可在不改变原文可信边界的前提下加入多 Note 聚合、Merge/Split 或 Photo/Git Adapter。
