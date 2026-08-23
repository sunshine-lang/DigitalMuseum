# 夜间自主优化工作日志（2026-08-23）

> 每个切片记录：做了什么、对抗性审查发现与处理、验证结果、下一步。任何后续会话可从本文续作。

## 会话背景

- 触发：一次性定时任务（23:30）。先完成照片切片会话的约定任务，再按 PRD v0.2 方向持续优化。
- 方向决策：见 `docs/optimization/2026-08-23-direction.md`（Stage 7 Codex → Stage 8a 最小静态导出 → 8b 备份）。

## 切片 0：Stage 6 收尾（约定任务）✅

- 完成：E501 修复 + ruff 清零；全量后端回归 86/86；前端「导入 Claude Code 会话」通道（表单/来源 chip/诚实文案）；AGENTS.md 更新到 v0.2（含照片暂缓、Worker 废弃、claude 适配器约定）；README 修正（/demo 已移除的过时引用、支持清单、验收步骤）；PRD v0.2 / stage-6 / technical-adaptation 一并入库。
- 真实数据验收（临时 DB，只读 `~/.claude`）：Note 项目导入出 verified 事件、锚点逐字、重复导入聚合、`~/.claude` 前后 mtime/size 完全未变。
- **对抗性审查发现与处理**：
  1. README 引用已删除的 `/demo`（文档-实现不符）→ 修正三处；
  2. 单日真实数据建阶段会被 3-12 个月校验拒绝 → 验收脚本垫出合法范围（产品行为正确，不改）；
  3. 测试文件 E501 拆行时逐字比对内容不变。
- **E2E 环境阻断（未解决，需补跑）**：本机另一个 ZCode 会话以 ~35s 周期监管 8010 端口（杀掉占用者并重启自己的 uvicorn），Playwright 隔离后端两次均在运行中被杀（失败全是「无法连接本地后端」，非功能问题；两轮合计 5/7 用例通过，失败集互不相同）。不杀对方会话进程（用户其他工作）。**待办：环境安静后运行 `npm run test:e2e` 补验。**
- 提交：`12a27ac`（14 文件，+1256/-52），已推送 github 远端。

## 切片 S7-1：codex-evidence-v1 后端 ✅

- 抽出共享渲染模块 `agent_session_evidence.py`（数据类 + 按天证据文档 + 逐行锚点 + 时间戳/文本清洗），claude 适配器重构为复用它（行为不变，93 测试护航）；
- 新增 `codex_session_evidence_service.py`：按日期目录扫描 rollout、`session_meta.cwd` 归属过滤、**subagent/composer_link 线程排除**、`<` 注入行跳过；
- 接线：config `codex_sessions_root`、schemas（origin + 3 个新模型）、main 覆盖参数、routes 两个端点、museum_service `import_codex_sessions`（origins 白名单加 codex）；
- 测试：`test_phase0_stage7_codex_sessions.py` 7 用例；全量 93/93；ruff 清零。

## 切片 S7-2：Codex 前端通道 + 文档 ✅

- 前端第五通道（表单/chip/信任文案/成功提示）；API 层 `importCodexSessions` + `codexProjectLabel`；
- 文档：`docs/phase-0-stage-7-codex-sessions.md` 新建；AGENTS.md（支持清单、codex 适配器约定、93 用例）；README 同步；
- **对抗性审查发现与处理**：① 首个测试断言写错（B 会话有 2 条用户消息，总数应为 3 不是 2）——实现正确、测试修正；② 共享模块里曾留下无意义占位导入——清理；③ ruff E501/F401 两处即改。
- 真实数据验收（临时 DB，只读 `~/.codex/sessions`）：DigitalMuseum 项目 4 个用户线程 → 2 天 verified 事件（32 个 cwd 命中文件中 subagent 全部正确排除）；锚点逐字；重复导入聚合；`~/.codex` 前后 mtime/size 未变。
- 验证：typecheck ✅ lint ✅ test:local 3/3 ✅ test:backend 93/93 ✅ ruff ✅（E2E 仍被端口监管环境阻断，见切片 0）
- 提交：见 git log（stage-7 分支），已推送。

## 切片 S8a：最小静态展览导出 ✅

- 选展是纯前端状态（默认 confirmed+verified）→ 导出做成 `/exhibition` 开展页「导出静态展览（HTML）」按钮，当前勾选序列化为自包含单文件 HTML（下载到本机）。
- 纯函数 `app/exhibition/export-html.ts`：按月分组、组内按日期排序、未定日期殿后；状态徽标（本人确认/系统核实/等待核对/本人存疑/暂不确定）；全部用户文本 HTML 转义；零脚本零外部资源、viewport 适配 390px；页脚诚实声明（静态快照日期、"系统核实"口径、证据链细节未随导出）。
- 测试：`tests/exhibition-export.test.mts`（node --experimental-strip-types，4 用例：自包含/分组排序/诚实统计/注入转义），挂入 `npm run test:export` 并链入 `test:local`；tsconfig 开 `allowImportingTsExtensions`（noEmit 前提已满足）。Linux `npm test` 不受影响。
- **对抗性审查发现与处理**：① disputed/unknown 事件也可被勾选展出但徽标缺文案 → 补「本人存疑/暂不确定」；② 首次 typecheck TS5097（.ts 扩展导入）→ tsconfig 允许（noEmit 已开）；③ 实际生成样例文件核验统计/徽标/页脚内容正确、无脚本无外链。
- 验证：typecheck ✅ lint ✅ test:local（3+4）✅；样例导出 3.8KB 断网可开（结构性验证；浏览器视觉终验留给 E2E 补跑）。
- 明确不做（留给 Stage 8 正式切片）：视觉重设计、多主题样式、导出内容选项（含证据链开关）、一条 npm 命令行导出。

## 切片 S8b：Archive 备份导出/恢复（API 级）✅

- `GET /api/v1/archive/export`：整库 ZIP（archive.json + blobs/ 原文，格式 `archive-v1`）；`POST /api/v1/archive/import`：恢复为全新数据。
- 关键语义：恢复全部换新 id 不覆盖既有行；blob 内容寻址——本地已有同 sha **直接复用本地副本、不信任 ZIP 字节**，需写回时先校验 sha256 一致才落盘；结构引用断裂/版本不符/坏 ZIP 一律 422 且零残留（依赖会话回滚）。
- **对抗性审查发现与处理**：① 初版测试假设「本地已有 blob 时也校验 ZIP」——审查后认定复用语义才是正确的（内容寻址、篡改字节不会被使用），改测试为「GC 后写回路径必须校验」；② 上传体积在读入内存前先按 file.size 预检。
- 测试：`test_phase0_stage8_archive_backup.py` 6 用例（误删后往返恢复、重复导入语义、篡改拒收、坏包/缺 manifest/版本不符、空库往返、引用断裂拒收）；全量 99/99；ruff 清零。
- 语义注记：重复导入会复制阶段（恢复是显式操作）；UI 入口留给后续切片，当前为 API 级能力。
