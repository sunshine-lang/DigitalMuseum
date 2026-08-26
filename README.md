# Digital Museum

> 把散落的 Agent 会话，变成一份看得懂的成长回顾。

开源本地工具：一键同步本机各 Agent 产品（Claude Code、Codex、pi、dsh）的会话转录，建立确定性档案并解析为「系统核实」的经历；浏览档案时间线、对存疑记录提出异议，最后把选定的时间跨度导出为一份无脚本自包含的静态展览网页——离线可看、可发朋友。

```text
打开应用 → 自动增量同步本机会话（或一键全量）
→ 档案时间线（按日分组 · 系统核实 · 逐字锚定的证据可展开）
→ /exhibition 开展（项目级里程碑叙事，每张展卡句式不同）
→ 导出静态展览（HTML，导出前敏感信息扫描）
```

档案库为根（ADR-0001）：数据全局归属唯一的档案库，同步幂等并入、删视图不删数据；「清空档案库」是唯一的破坏性操作。笔记上传、Git 仓库导入、合并/拆分整理与人工展签已按 ADR-0002 整体删除——第一燃料只有会话转录（严口径：对话主体 + 时间戳 + 项目归属）。全部解析确定性、零模型调用；适配器绝不修改 `~/.claude`、`~/.codex`、`~/.pi`、`~/.dsh` 下的任何内容。

## 本地启动

需要：Node.js 22 LTS、npm、Python 3.11、uv。

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

浏览器打开 `http://127.0.0.1:3001`——打开即自动同步本机会话，档案有内容会直接落在时间线。

## 小白验收步骤

1. 打开首页：应用自动增量同步；若档案为空，点「同步本机全部会话」。
2. 落在「档案时间线」：每段经历带「系统核实」状态与来源标签（Claude Code / Codex / pi / dsh）。
3. 点开任意一段经历：右侧显示它为什么成立（证据摘要、原文摘录、行号与文件指纹），全部逐字可回溯。
4. 对与事实不符的经历点「对这段记录提出异议」，选「发生过，但描述要改」并写一句说明——你的判定优先于机器读数。
5. 回到「同步会话」查看发现面板（各产品有会话的项目清单）与上次同步统计；「清空档案库」需两步确认。
6. 进入「查回顾」开展：封面标题、时间跨度与原始记录数全部由档案数据推导；展卡叙事是项目级里程碑（首日交手 / 最密集的一天 / 收尾 / 日常节奏）。
7. 点吸顶栏「导出展览（HTML）」：敏感信息扫描（密钥、本机路径、邮箱）命中时必须逐项确认才会落盘；产物是无脚本自包含单文件。
8. 刷新页面：档案、异议判定与展览选择全部保持。

档案只保存在本机、不联网；会话原文永不整份复制（证据文档只含确定性读数与首条消息摘录）。

## 自动化验证

```bash
npm run test:backend   # 后端 pytest（47 用例：四产品同步幂等、适配器行为、历史迁移回归）
npm run typecheck && npm run lint
npm run test:local     # 前端构建 + 渲染冒烟 + 导出单测（macOS 用这个）
npm run test:e2e       # Playwright：每用例一次性隔离后端 + 会话根注入，六景全链
```

运行 e2e 前必须停止正在运行的后端（`npm run backend:dev`）：隔离后端需独占前端默认请求的 8010 端口。改动后端另跑：`cd backend && UV_CACHE_DIR=../.sites-runtime/uv-cache uv run ruff check .`。

本阶段没有模型调用，因此真实模型冒烟为「不适用」，不是「已通过」。以后接入模型时输出只能产生 candidate 与逐字锚定的草稿，永不产生 verified（真实性契约）。

## 项目结构

```text
app/        前端（Next.js App Router）：/ 为同步→浏览三步流，/exhibition 为展览与导出
backend/    本地 API：FastAPI + SQLAlchemy + Alembic；services/ 下四个 Agent 适配器共用扫描骨架与产品注册表
data/       运行时数据：SQLite 档案库与内容寻址原文（Git 忽略）
docs/       项目文档：prd/（当前 PRD v0.3）、adr/、gate/、阶段开发文档、references/
scripts/    Sites 平台构建脚本（面向 Linux 构建环境）
tests/      前端渲染冒烟、导出单测与 Playwright e2e
```

完整取舍见 [PRD v0.3](docs/prd/digital-museum-prd-v0.3.md)、[ADR-0001 档案库为根](docs/adr/0001-archive-root-stage-as-view.md)、[ADR-0002 单燃料极简](docs/adr/0002-single-fuel-agent-sessions.md) 与各阶段开发文档。
