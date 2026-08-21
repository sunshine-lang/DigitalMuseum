# Digital Museum

> 把散落的数字痕迹，变成你的人生博物馆。

当前交付是 PRD Phase 0 的第一条纵向切片：

```text
创建 3–12 个月阶段
→ 导入 Markdown / TXT Note
→ 本地保存不可原地改写的原文
→ 建立带逐字 Evidence Anchor 的候选 Claim / Event
→ 用户确认、存疑、保持 Unknown 或排除
→ 审阅状态持久化并可恢复
```

这不是整个 Phase 0，也不是完整产品。Photo、Git、真实模型、Merge/Split、ChatGPT/Codex/WorkBuddy Session、Story、Exhibition 和 Share 尚未实现。原有策展体验保留在 `/demo`，只用于说明后续方向，不能作为当前核心链路已经完成的证据。

## 技术适配

- 前端：延续现有 Next.js + TypeScript + vinext 项目。
- 本地后端：Python 3.11、FastAPI、Pydantic。
- 持久化：SQLite + SQLAlchemy + Alembic；原始 Note 以 SHA-256 内容哈希写入本地目录。
- 解析器：确定性 `note-development-v1`，只生成 Candidate，不调用模型、不推断因果和动机。
- 测试：pytest 通过公开 API 验证；TypeScript、ESLint、构建与渲染测试验证前端。

完整取舍见 [技术适配声明](docs/technical-adaptation.md) 和 [第一阶段技术开发文档](docs/phase-0-stage-1-note-event-review.md)。

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

1. 打开首页，输入阶段名称、开始日期和结束日期；范围必须在 3–12 个月内。
2. 上传一个 UTF-8 编码、2 MiB 以内的 `.md` 或 `.txt` 文件。
3. 查看 Processing Coverage：原文保存、本地解析、候选生成都应显示完成。
4. 打开候选事件，核对 Core Claim、逐字引用、原文行号和文件哈希。
5. 确认页面仍标记“候选事件”，没有自动当成正式事实。
6. 选择“确认发生过”“标记存疑”“证据不足”或“排除事件”，刷新页面后决定仍应存在。
7. 上传 `.pdf` 或包含二进制内容的 `.txt`，页面应明确拒绝，事件数量不增加。
8. 访问 `/demo`，确认原策展演示仍可打开，但它不代表 Phase 0 已验收。

当前原文未加密，只用于非敏感测试素材；不要导入真实隐私资料。

## 自动化验证

后端：

```bash
npm run test:backend
cd backend && UV_CACHE_DIR=../.sites-runtime/uv-cache uv run ruff check app tests
```

前端：

```bash
npm run typecheck
npm run lint
npm run test:local
```

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

排查时请提供：操作步骤、页面错误文字、浏览器控制台报错和后端终端最后 30 行；不要发送 API Key 或完整敏感文档。
