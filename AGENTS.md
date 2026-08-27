# AGENTS.md

面向 AI 协作助手（以及新加入的开发者）的项目约定。开始任何改动前先读完本文。

## 项目是什么

Digital Museum · AI 人生档案馆。开源本地工具（方向见 PRD v0.3，2026-08-25 起当前有效）：目标用户是 AI 编码 Agent 开发者，第一燃料是本机各 Agent 产品的会话转录（Claude Code / Codex / pi / dsh，严口径）；交付终点是静态展览导出（`/exhibition` 一键导出无脚本自包含单文件 HTML），明确不做云部署与多用户。首页 `/` 为极简三步流「同步会话（打开自动增量）→ 浏览经历（档案时间线+异议通道）→ 查回顾（/exhibition 展览）」。照片适配器 `photo-evidence-v1` 已于 2026-08-25 整体删除，存量照片谱系数据经迁移 e5a2c7f91b4d 清理（spec 见 stage-4 文档）；7 套展览换肤与本地分享海报同日删除，站内展览视觉收敛为午夜档案馆一种（与导出文件同色系）。ChatGPT/WorkBuddy 适配器尚未实现。2026-08-25 起笔记上传与 Git 仓库导入已整体删除（ADR-0002 通道清剿），`?all-sources` 开关随之消亡；不要从 git 历史复活旧通道。`/demo` 静态演示已于 2026-08 移除；站内 `/` 与 `/exhibition` 均读取真实档案数据。

文档阅读顺序：`docs/prd/digital-museum-prd-v0.3.md`（当前有效）→ `docs/adr/`（两项架构决策）→ `docs/technical-adaptation.md` → `docs/phase-0-stage-*.md`（阶段史）。PRD v0.1/v0.2 的真实性契约、分级信任与证据链对象模型由 v0.3 沿用继续有效；`docs/references/` 下的三份手册是通用外部方法论参考资料，不是本项目规范。

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
npm run test:backend      # 后端 pytest（47 个用例，必须全绿；含四产品同步幂等、适配器行为与历史迁移回归）
npm run test:local        # 前端构建 + 渲染冒烟 + 静态展览导出单测（macOS 用这个，npm test 需要 GNU timeout）
npm run test:e2e          # Playwright 端到端（需先停止 backend:dev；每用例拉起一次性隔离后端占 8010 + 会话根目录注入，前端 3002）
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

- Phase 0 是本地优先单用户原型：不引入云数据库、不引入模型调用、不把数据默认送云端。D1/Drizzle 链路已在 2026-08 移除；Cloudflare Worker 部署目标已按 PRD v0.2 废弃（v0.3 延续），不要重新引入。将来若引入模型，输出只能产生 candidate 与逐字锚定的草稿，永不产生 verified（真实性契约，PRD v0.3 §8 沿用）。
- 首页的批量选择当前通过前端顺序调用单文件 API 实现；不要把它表述为已完成可恢复的服务端 Import Batch。
- 首页“查看回顾”只是真实 Event 状态的本地草稿预览，不是 Story/Exhibition 生成、导出或分享能力。`/exhibition` 的「导出静态展览（HTML）」是最小静态导出：只含用户勾选展出的事件，证据链细节（锚点、blob 指纹）默认不随导出，产物为无脚本自包含单文件；导出前有敏感信息扫描（常见密钥、本机路径、邮箱），命中必须人工逐项确认后才落盘——这是 PRD §9 的机械防线，不要移除或改为静默放行。展览视觉为单一的午夜档案馆主题。PRD v0.3 §11 的真实数据大考复考记录见 `docs/gate/real-data-exam-2026-08-25-v0.3.md`（人工判定字段待用户填写），在用户判定完成前不要把 v0.3 表述为「已通过大考」。
- 原始证据文档（2026-08-25 起为 Agent 会话转录，笔记管线已删）是不可原地改写的 Evidence Blob：以 SHA-256 内容哈希落盘在 `data/uploads/`。对外只经 `GET /api/v1/blobs/{sha256}` 只读访问：哈希必须匹配 `^[0-9a-f]{64}$`（fail closed 防路径穿越）、文件路径只从 DB 的 `relative_path` 解析、无列举无删除、响应可永久缓存（内容寻址不变）。
- API 错误统一返回 `{"error":{"code","message"}}`，不向页面输出堆栈。
- 笔记解析器 `note-development-v1` 已于 2026-08-25 随通道清剿删除；评测基线包（evaluation/）同批移除，S6 将以会话数据重建基线。
- 适配器 `git-evidence-v1` 与照片适配器 `photo-evidence-v1` 均已删除（2026-08-25 通道清剿）；恢复需求出现时按 stage-3/stage-4 文档另立阶段重启，不从 git 历史复活旧代码。
- 适配器 `claude-code-evidence-v1`（Stage 6）是确定性的：只读 `~/.claude/projects`（配置 `claude_projects_root`）下按 Claude Code 转义规则命名的会话 JSONL；只提取会话时间戳（UTC 按本机时区归日，与 git 适配器口径一致）、用户/助手消息计数与首条真实用户消息原文（跳过 `<` 开头的系统包装行与 tool_result）；**绝不修改 `~/.claude` 下任何内容，证据文档不整份复制会话**；单行损坏确定性跳过；按天生成事件，标题「在 {项目} 与 Claude Code 协作」。
- 四个 Agent 适配器共用 `agent_session_evidence.py` 的扫描骨架与证据文档渲染，并以统一模块界面（`KIND`/`PROCESSOR_VERSION`/`EVIDENCE_SUFFIX`/`AGGREGATION_ORIGINS`/`list_projects`/`import_project`）注册进 `museum_service.AGENT_PRODUCTS`，由 `POST /api/v1/archive/sync` 一键同步；新 Agent 产品照此注册。全部适配器**绝不修改对应产品的本机目录**，cwd 已消失的项目不列不导，单行损坏确定性跳过，只提取时间戳/消息计数/首条真实用户消息，按天生成事件，标题「在 {项目} 与 {产品} 协作」。
- `claude-code-evidence-v1`：只读 `~/.claude/projects`（`claude_projects_root`）转义目录 JSONL；`codex-evidence-v1`：只读 `~/.codex/sessions`（`codex_sessions_root`）日期目录 rollout JSONL，**只统计 `thread_source == "user"`（subagent 审计材料一律排除）**；`pi-agent-evidence-v1`（S4）：只读 `~/.pi/agent/sessions`（`pi_sessions_root`）转义目录 JSONL，项目归属按首行 `cwd`，content 片段取 `{type:"text"}` 文本；`dsh-evidence-v1`（S4）：只读 `~/.dsh/sessions`（`dsh_sessions_root`）的 `session.jsonl.zstd`（zstandard 解压，发现端只惰性解压首行），epoch 毫秒时间戳，**`delegationDepth != 0` 的子代理线程与 `source.kind != "user"` 的注入消息一律排除**。发现面板经 `GET /api/v1/{claude,codex,pi,dsh}-sessions/projects` 只读列举；同步统一走 `POST /archive/sync`（无逐项目导入端点）。
- 分级信任：确定性读数（Git 提交日按 committer date、Claude/Codex 会话时间戳与计数）导入即 `status="verified"`（系统核实），不进人工核对队列，但 UI 必须保留「对这段记录提出异议」入口；推断性标题（如"创建标签"）与用户已 rejected 的同题同日事件一律保持/降级为 `candidate`；用户已审阅过的事件（disputed/unknown/confirmed）重复导入时并入不复制、状态以用户判定为准。不要把确定性"读取"表述成"核实了事实"，也不要把会话时间戳/计数的核实表述成"解读了对话内容"。
- 聚合规则 `agent-session-aggregation-v1` 是确定性的：仅按规范化标题加日期聚合（origin 白名单隔离各 Agent 家族），不做语义聚类；Merge/Split 整理工具已随通道清剿删除。人工展签（exhibit_caption）同批删除，展览文案完全由确定性叙事底稿承担（S5 升级中）。
- 档案库为根（ADR-0001，2026-08-25 起）：occurrence/event 全局归属档案库，不再挂阶段；阶段退化为命名时间窗视图——`GET /stages/{id}/events` 是窗口过滤（无日期事件不隐藏），`DELETE /api/v1/stages/{id}` 只删视图行、绝不动档案数据；`DELETE /api/v1/archive` 清空档案库是唯一的破坏性数据操作（两步确认）。阶段视图 UI（/stages 页）已随 S2 三步流移除，阶段仍是 API 级能力，UI 待将来需要时再做。同步幂等由 `EvidenceOccurrence.source_key`（唯一键，如 `codex:/Users/x/proj`）承担：`POST /api/v1/archive/sync` 一键同步本机全部会话项目——跳过仅在 occurrence 完整（completed 且文档字节相同）时成立，中断/失败的快照在下一轮同步自动重建；内容变化走快照替换（先摘开事件引用再删旧 occurrence）；全局同题同日聚合沿用各 origin 白名单。`claims[].source_media` 与前端照片上墙已随照片管线一并删除（2026-08-25）。
- Archive 备份（API 级，暂无 UI）：`GET /api/v1/archive/export` 把整库打包为 ZIP（archive.json + blobs/ 原文，格式 `archive-v3`；v1/v2 备份已随结构变化作废）；`POST /api/v1/archive/import` 恢复为**全新数据**（所有行换新 id、绝不覆盖既有内容；blob 内容寻址——本地已有同 sha 直接复用不信任 ZIP 字节，需写回时先校验 sha 一致，fail closed 无半成品；恢复行的 source_key 置空以允许重复导入）。
- 样式延续集中式 CSS（`app/globals.css`）。Tailwind 已于 2026-08 全量移除（依赖与 preflight 均已删除，globals.css 顶部内置等价重置），不要再引入。
- `npm run build`（build-verified.sh）需要 GNU timeout，macOS 上用 `npm run build:local`。
- 前端 dev 模式不会内联 `NEXT_PUBLIC_*` 变量，页面始终请求默认的 8010 端口；E2E 因此必须让隔离后端占用 8010。
- 提交前自查：`test:backend`、`test:local`、`typecheck`、`lint` 全部通过；改动用户交互链路时加跑 `test:e2e`。
- Git 提交信息一律用中文（用户约定，2026-08-24 起）。
