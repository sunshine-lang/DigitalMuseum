# Digital Museum

> 把散落的数字痕迹，变成你的人生博物馆。

当前首页把已经落地的 Note → Event Review 链路包装为一条价值先行的 MVP 体验：

```text
选择 3–12 个月回顾范围
→ 一次选择多份 Markdown / TXT AI 协作记录
→ 本地保存不可原地改写的原文
→ 先展示带逐字 Evidence Anchor 的经历草稿
→ 同标题同日期的记录自动聚合；可手动合并所选经历、把多来源经历拆回独立候选
→ 只核对仍是 Candidate 的关键内容
→ 实时查看区分“本人确认 / 等待核对”的私人展览草稿
→ 审阅状态持久化并可恢复
```

这不是整个 Phase 0，也不是完整产品。当前“AI 协作记录”支持用户已经整理成 `.md/.txt` 的非敏感测试资料、本地 Git 仓库（只读提交记录）与 Claude Code 会话（只读 `~/.claude/projects`）；照片适配器已暂缓投入（代码保留）。Codex/ChatGPT/WorkBuddy 原生 Session 解析、真实模型、静态展览导出和 Share 尚未实现。首页展览区是读取真实 Event 状态的本地草稿，不是可发布展览。`/demo` 静态演示已于 2026-08 移除。

## 技术适配

- 前端：延续现有 Next.js + TypeScript + vinext 项目。
- 本地后端：Python 3.11、FastAPI、Pydantic。
- 持久化：SQLite + SQLAlchemy + Alembic；原始 Note 以 SHA-256 内容哈希写入本地目录。
- 解析器：确定性 `note-development-v1`，只生成 Candidate，不调用模型、不推断因果和动机。
- 测试：pytest 通过公开 API 验证；TypeScript、ESLint、构建与渲染测试验证前端。

完整取舍见 [PRD](docs/prd/digital-museum-prd-v0.1.md)、[MVP 用户流程](docs/mvp-value-first-ai-records-flow.md)、[技术适配声明](docs/technical-adaptation.md)、[第一阶段技术开发文档](docs/phase-0-stage-1-note-event-review.md) 和 [第二阶段技术开发文档](docs/phase-0-stage-2-aggregation-merge-split.md)。第二阶段的完整能力规划另见 [docs/phase-0-stage-2-multi-note-event-operations.md](docs/phase-0-stage-2-multi-note-event-operations.md)，其中服务端 Import Batch、事件元数据编辑与操作历史 API 尚未实现。

## 项目结构

```text
app/        前端（Next.js App Router）：/ 为价值先行 MVP，/exhibition 为展览草稿
backend/    本地 API：FastAPI + SQLAlchemy + Alembic，分层 api / core / domain / services
data/       运行时数据：SQLite 库与上传原文（Git 忽略）
docs/       项目文档：prd/（PRD 与需求分析）、阶段开发文档、技术适配声明、references/（通用参考手册）
scripts/    Sites 平台构建脚本（面向 Linux 构建环境）
tests/      前端渲染冒烟测试
worker/     Cloudflare Worker 入口（vinext 模板）
```

## 本地启动

需要：

- Node.js 22 LTS
- npm
- Python 3.11
- uv

第一次准备依赖：

```bash
npm ci
npm run backend:sync
```

打开两个终端。

终端 1，启动本地 API：

```bash
npm run backend:dev
```

API 地址：`http://127.0.0.1:8010`；接口文档：`http://127.0.0.1:8010/docs`。

终端 2，启动 Web 工作台：

```bash
npm run dev:phase0
```

浏览器打开 `http://127.0.0.1:3001`。默认使用 3001 是为了避开当前机器上已占用的 3000 端口；原有 `npm run dev` 仍保留。

## 小白验收步骤

1. 打开首页，填写回顾名称、开始日期和结束日期；范围必须在 3–12 个月内。
2. 在“导入记录”一次选择多份 UTF-8 `.md/.txt`；单文件仍不得超过 2 MiB。
3. 确认页面逐份显示成功或失败；某一份失败不会抹掉其他成功文件。
4. 进入“发现经历”，先浏览系统整理出的草稿，再按需打开原文行号和文件指纹；标题和日期都相同的多份记录会自动聚合为一段经历。
5. 勾选两段及以上经历并“合并为一段经历”，确认后新经历回到“等待你核对”，原经历不再出现在列表中。
6. 对来源不少于两份的经历点击“拆回独立经历”，确认后拆分产物恢复各来源记录的标题和日期，并都需要重新核对。
7. 进入“核对关键内容”，使用“是，已经发生”“发生过，但描述要改”“我现在不确定”或“只是讨论 / 不属于我”。
8. 选择“描述要改”时填写说明；选择“我现在不确定”时系统不补写内容。
9. 进入“查看回顾”，确认本人确认与等待核对的内容有明显区别，页面标记为私人草稿。
10. 刷新页面，确认 Stage、Evidence、Event 和 Review 状态仍存在。
11. 粘贴一个本机项目路径（如 `/Users/you/Projects/your-project`）点「读取 Claude Code 会话」，确认生成带“系统核实”标记的按天经历，且 `~/.claude` 没有被修改。

当前原文未加密，只用于非敏感测试素材；不要导入真实隐私资料。

## 自动化验证

后端：

```bash
npm run test:backend
cd backend && UV_CACHE_DIR=../.sites-runtime/uv-cache uv run ruff check .
```

前端：

```bash
npm run typecheck
npm run lint
npm run test:local
```

端到端（Playwright，会自动拉起使用临时数据库的隔离后端和前端）：

```bash
npm run test:e2e
```

运行前必须停止正在运行的后端（`npm run backend:dev`）：E2E 后端需要独占前端默认请求的 8010 端口，前端使用 3002 端口；测试数据不会写入 `data/` 中的真实档案。

`npm test` 保留给带 GNU `timeout` 的 Linux/Sites 构建环境；macOS 本地使用 `npm run test:local`。

本阶段没有模型调用，因此真实模型冒烟为“不适用”，不是“已通过”。以后接入 Reference Provider 时必须增加真实 Key 端到端冒烟，不能用当前确定性测试替代。

## 数据位置与恢复

- SQLite：`data/digital_museum.db`
- 原始 Note：`data/uploads/{hash前两位}/{完整SHA-256}.{扩展名}`
- Schema：由 `backend/alembic/` 管理

`data/` 被 Git 忽略。刷新页面和重启后端不会丢失阶段与审阅结果。首页的“退出当前阶段”只清除浏览器中的当前阶段指针，不删除后端档案；本阶段没有实现删除入口。

## 常见错误

- “无法连接本地后端”：确认 `npm run backend:dev` 正在运行，且终端没有报错。
- “建馆阶段必须在 3 到 12 个月之间”：调整起止日期。
- “只支持 Markdown 或 TXT 文件”：本阶段不接受 PDF、Word、图片和 Session 导出。
- “事件已被其他审阅更新”：刷新后重新查看最新 revision，再提交决定。
- “已合并或已拆分的事件不能再次操作”：这类经历已被新的候选经历替代，请到“发现经历”里核对新产生的经历。

排查时请提供：操作步骤、页面错误文字、浏览器控制台报错和后端终端最后 30 行；不要发送 API Key 或完整敏感文档。
