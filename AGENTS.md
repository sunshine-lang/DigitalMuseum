# AGENTS.md

面向 AI 协作助手（以及新加入的开发者）的项目约定。开始任何改动前先读完本文。

## 项目是什么

Digital Museum · AI 人生档案馆。底层仍是 PRD Phase 0 的 Note → Event Review 本地纵向切片；首页 `/` 已改为“导入记录 → 发现经历（含合并/拆分整理）→ 核对关键内容 → 私人回顾草稿”的价值先行 MVP。当前接受整理过的 `.md/.txt` 笔记、本地 Git 仓库（只读提交记录）与 JPEG/PNG 照片（EXIF），不代表已支持 ChatGPT/Codex/WorkBuddy 原生 Session。`/demo` 是早期策展演示，仅保留视觉方向。

文档阅读顺序：`docs/prd/digital-museum-prd-v0.1.md` → `docs/mvp-value-first-ai-records-flow.md` → `docs/technical-adaptation.md` → `docs/phase-0-stage-1-note-event-review.md`。`docs/references/` 下的三份手册是通用外部方法论参考资料，不是本项目规范。

## 目录约定

```text
app/        前端（Next.js App Router + vinext/Vite 构建，部署目标 Cloudflare Worker）
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
npm run test:backend      # 后端 pytest（40 个用例，必须全绿）
npm run test:local        # 前端构建 + 渲染冒烟（macOS 用这个，npm test 需要 GNU timeout）
npm run test:e2e          # Playwright 端到端（需先停止 backend:dev；后端占用 8010、前端 3002，数据隔离在 .e2e/）
npm run typecheck         # tsc --noEmit
npm run lint              # eslint
```

改动后端后额外执行：`cd backend && UV_CACHE_DIR=../.sites-runtime/uv-cache uv run ruff check .`

## 硬性约定

- Phase 0 是本地优先单用户原型：不引入云数据库、不引入模型调用、不把数据默认送云端。D1/Drizzle 链路已在 2026-08 移除，不要重新引入。
- 首页的批量选择当前通过前端顺序调用单文件 API 实现；不要把它表述为已完成可恢复的服务端 Import Batch。
- 首页“查看回顾”只是真实 Event 状态的本地草稿预览，不是 Story/Exhibition 生成、导出或分享能力。
- 原始 Note 是不可原地改写的 Evidence Blob：以 SHA-256 内容哈希落盘在 `data/uploads/`。
- API 错误统一返回 `{"error":{"code","message"}}`，不向页面输出堆栈。
- 解析器 `note-development-v1` 是确定性的：只生成 Candidate，不推断因果与动机，不用确定性结果冒充模型效果。
- 适配器 `git-evidence-v1` 与 `photo-evidence-v1` 同样是确定性的：Git 只读提交/标签并渲染证据文档；照片只读 EXIF（拍摄时间、相机、GPS 原始坐标），不猜日期、不做 OCR/图像识别，Claim 一律 `evidence_role="artifact"` 且必须经人工审阅。
- 聚合规则 `note-aggregation-v1` 同样是确定性的：仅按规范化标题加日期聚合，不做语义聚类；Merge/Split 产物一律重置为 Candidate 并保留逐字锚点与审计行。
- 样式延续集中式 CSS（`app/globals.css`），Tailwind 仅保留依赖，暂不迁移。
- `npm run build`（build-verified.sh）需要 GNU timeout，macOS 上用 `npm run build:local`。
- 前端 dev 模式不会内联 `NEXT_PUBLIC_*` 变量，页面始终请求默认的 8010 端口；E2E 因此必须让隔离后端占用 8010。
- 提交前自查：`test:backend`、`test:local`、`typecheck`、`lint` 全部通过；改动用户交互链路时加跑 `test:e2e`。
