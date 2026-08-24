# AGENTS.md

面向 AI 协作助手（以及新加入的开发者）的项目约定。开始任何改动前先读完本文。

## 项目是什么

Digital Museum · AI 人生档案馆。开源本地工具（方向见 PRD v0.2，2026-08-23 起）：目标用户是 AI 编码 Agent 开发者，第一燃料是本机的 Agent 会话记录与 Git、笔记等文本痕迹；交付终点是静态展览导出（Stage 8，未实现），明确不做云部署与多用户。当前首页 `/` 为“导入记录 → 发现经历（含合并/拆分整理）→ 核对关键内容 → 私人回顾草稿”的价值先行 MVP，支持整理过的 `.md/.txt` 笔记、本地 Git 仓库（只读提交记录）、Claude Code 会话（`~/.claude/projects` 只读）、Codex 会话（`~/.codex/sessions` 只读）与 JPEG/PNG 照片（EXIF，已暂缓投入、代码保留）。ChatGPT/WorkBuddy 适配器尚未实现。`/demo` 静态演示已于 2026-08 移除；站内 `/` 与 `/exhibition` 均读取真实档案数据。

文档阅读顺序：`docs/prd/digital-museum-prd-v0.2.md`（当前有效）→ `docs/technical-adaptation.md` → `docs/mvp-value-first-ai-records-flow.md` → `docs/phase-0-stage-1-note-event-review.md` 及后续 `docs/phase-0-stage-*.md`。PRD v0.1 的真实性契约、对象模型与 Event Review 信息层级继续有效；`docs/references/` 下的三份手册是通用外部方法论参考资料，不是本项目规范。

## 目录约定

```text
app/        前端（Next.js App Router + vinext/Vite 构建；无部署目标，本地运行）
backend/    本地 API（Python 3.11 + FastAPI，uv 管理）
data/       运行时数据（Git 忽略，不要提交、不要手工编辑）
docs/       全部项目文档（PRD 在 docs/prd/，参考手册在 docs/references/）
```

后端依赖方向必须单一：`api → services → domain → core`，不允许反向引用。分层为 layer-based，业务域目前只有 note-event 一个；出现第二个业务域之前不要做 feature 模块化拆分。

## 常用命令

```bash
npm run backend:sync      # 安装后端依赖（uv）
npm run backend:dev       # 启动本地 API（127.0.0.1:8010）
npm run dev:phase0        # 启动前端工作台（127.0.0.1:3001）
npm run test:backend      # 后端 pytest（100 个用例，必须全绿；含评测基线护栏）
npm run test:local        # 前端构建 + 渲染冒烟 + 静态展览导出单测（macOS 用这个，npm test 需要 GNU timeout）
npm run test:e2e          # Playwright 端到端（需先停止 backend:dev；后端占用 8010、前端 3002，数据隔离在 .e2e/）
npm run typecheck         # tsc --noEmit
npm run lint              # eslint
```

改动后端后额外执行：`cd backend && UV_CACHE_DIR=../.sites-runtime/uv-cache uv run ruff check .`

## 写代码的懒惰阶梯

参考 ponytail（github.com/dietrichgebert/ponytail）精简。写代码前按序自问，能停在最上层就不往下走：

1. **不做**：没有对应验收标准的功能一律不加（YAGNI）。
2. **复用**：项目里已有类似实现就复用或扩展，不另起炉灶。
3. **标准库**：Python / TypeScript 标准库能解决的不引第三方依赖。
4. **平台原生**：能用框架原生能力（FastAPI、SQLAlchemy、React、CSS）解决的不自己实现。
5. **已有依赖**：已安装的包能满足就不加新依赖；确需新增必须在汇报里说明理由。
6. **少写**：必须写时只写必要的行，不为"以后可能用到"预留抽象或配置项。
7. **最小实现**：确需自定义时，选可通过验收的最小实现。

**永不偷懒的例外**：安全校验、数据完整性（级联/回滚/哈希校验）、错误契约、可访问性——这些只许做对，不许省略。提交前自审 diff 三问：删得掉吗？能复用吗？有更原生的写法吗？

## 硬性约定

- Phase 0 是本地优先单用户原型：不引入云数据库、不引入模型调用、不把数据默认送云端。D1/Drizzle 链路已在 2026-08 移除；Cloudflare Worker 部署目标已按 PRD v0.2 废弃，不要重新引入。将来若引入模型，输出只能产生 candidate 与逐字锚定的草稿，永不产生 verified（PRD v0.2 第 8 节）。
- 首页的批量选择当前通过前端顺序调用单文件 API 实现；不要把它表述为已完成可恢复的服务端 Import Batch。
- 首页“查看回顾”只是真实 Event 状态的本地草稿预览，不是 Story/Exhibition 生成、导出或分享能力。`/exhibition` 的「导出静态展览（HTML）」是最小静态导出：只含用户勾选展出的事件，证据链细节（锚点、blob 指纹）默认不随导出，产物为无脚本自包含单文件；不要把它表述为已完成 Stage 8 的视觉重设计。
- 原始 Note 是不可原地改写的 Evidence Blob：以 SHA-256 内容哈希落盘在 `data/uploads/`。对外只经 `GET /api/v1/blobs/{sha256}` 只读访问：哈希必须匹配 `^[0-9a-f]{64}$`（fail closed 防路径穿越）、文件路径只从 DB 的 `relative_path` 解析、无列举无删除、响应可永久缓存（内容寻址不变）。
- API 错误统一返回 `{"error":{"code","message"}}`，不向页面输出堆栈。
- 解析器 `note-development-v1` 是确定性的：只生成 Candidate，不推断因果与动机，不用确定性结果冒充模型效果。
- 适配器 `git-evidence-v1` 与 `photo-evidence-v1` 同样是确定性的：Git 只读提交/标签并渲染证据文档；照片只读 EXIF（拍摄时间、相机、GPS 原始坐标），不猜日期、不做 OCR/图像识别，Claim 一律 `evidence_role="artifact"`。照片链路已按 PRD v0.2 暂缓投入：代码与测试保留，不做 HEIC/OCR/补录等新投入。
- 适配器 `claude-code-evidence-v1`（Stage 6）是确定性的：只读 `~/.claude/projects`（配置 `claude_projects_root`）下按 Claude Code 转义规则命名的会话 JSONL；只提取会话时间戳（UTC 按本机时区归日，与 git 适配器口径一致）、用户/助手消息计数与首条真实用户消息原文（跳过 `<` 开头的系统包装行与 tool_result）；**绝不修改 `~/.claude` 下任何内容，证据文档不整份复制会话**；单行损坏确定性跳过；按天生成事件，标题「在 {项目} 与 Claude Code 协作」。
- 适配器 `codex-evidence-v1`（Stage 7）同样是确定性的：只读 `~/.codex/sessions`（配置 `codex_sessions_root`）下按日期存放的 rollout JSONL，按每文件首行 `session_meta.payload.cwd` 归属项目；**只统计 `thread_source == "user"` 的会话——subagent 内部线程的 user_message 是系统注入的审计材料，一律排除**；只提取时间戳、`user_message`/`agent_message` 计数与首条真实用户消息原文；**绝不修改 `~/.codex` 任何内容**；其余口径与 claude 适配器一致。两个 Agent 适配器共用 `agent_session_evidence.py` 的证据文档渲染，Stage 10 新适配器照此复用。
- 分级信任：确定性读数（Git 提交日按 committer date、照片 EXIF、Claude/Codex 会话时间戳与计数）导入即 `status="verified"`（系统核实），不进人工核对队列，但 UI 必须保留「对这段记录提出异议」入口；推断性标题（如"创建标签"）与用户已 rejected 的同题同日事件一律保持/降级为 `candidate`；用户已审阅过的事件（disputed/unknown/confirmed）重复导入时并入不复制、状态以用户判定为准。不要把确定性"读取"表述成"核实了事实"，也不要把会话时间戳/计数的核实表述成"解读了对话内容"。
- 聚合规则 `note-aggregation-v1` 同样是确定性的：仅按规范化标题加日期聚合，不做语义聚类；Merge/Split 产物一律重置为 Candidate 并保留逐字锚点与审计行。
- 阶段管理：`DELETE /api/v1/stages/{id}` 级联清空该阶段全部数据，随后回收零引用的 EvidenceBlob（occurrences 与 evidence_anchors 都不再引用）——删行并清理文件；被其他阶段共享（仍有引用）的 blob 必须保留。前端展示原图走 `claims[].source_media`（仅 image/jpeg、image/png），加载失败静默回落 SpecimenArt。
- Archive 备份（API 级，暂无 UI）：`GET /api/v1/archive/export` 把整库打包为 ZIP（archive.json + blobs/ 原文，格式 `archive-v1`）；`POST /api/v1/archive/import` 恢复为**全新数据**（所有行换新 id、绝不覆盖既有内容；blob 内容寻址——本地已有同 sha 直接复用不信任 ZIP 字节，需写回时先校验 sha 一致，fail closed 无半成品；重复导入会复制阶段）。
- 样式延续集中式 CSS（`app/globals.css`）。Tailwind 已于 2026-08 全量移除（依赖与 preflight 均已删除，globals.css 顶部内置等价重置），不要再引入。
- `npm run build`（build-verified.sh）需要 GNU timeout，macOS 上用 `npm run build:local`。
- 前端 dev 模式不会内联 `NEXT_PUBLIC_*` 变量，页面始终请求默认的 8010 端口；E2E 因此必须让隔离后端占用 8010。
- 提交前自查：`test:backend`、`test:local`、`typecheck`、`lint` 全部通过；改动用户交互链路时加跑 `test:e2e`。
