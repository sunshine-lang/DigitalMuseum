# 技术适配声明

> 依据：`digital-museum-prd-v0.1.md` 与《AI 产品 Vibe Coding 通用技术栈手册》。
> 适用范围：Phase 0 的第一条纵向切片（Note → Event Review）。

## 1. 产品形态判断

- 产品类型与核心任务：本地优先的个人数字档案研究原型；从用户主动导入的资料中建立可追溯候选事件，并由用户确认真实性边界。
- 核心交互：分阶段确认。导入和解析之后，用户必须查看证据锚点，再确认、存疑、排除或标记证据不足。
- 开发路径：纵向切片。Event Review 是核心价值的一部分，必须同时提供最小后端能力和最小真实界面。
- 当前阶段范围：创建一个 3–12 个月阶段；导入 Markdown/TXT Note；本地保存原文；形成带锚点的候选 Claim/Event；完成可恢复的单事件审阅。

## 2. 采用的默认方案

- Python 3.11 + FastAPI + Pydantic：承载可复用领域规则、输入输出校验和 `/api/v1` 接口。
- pytest：通过公开 API 验证主链路、错误路径与恢复行为。
- Next.js + TypeScript：延续现有 Web 项目，新增 Phase 0 最小验收界面。
- Git：每个可验证里程碑提交，保留现有演示和用户未提交文件。

## 3. 触发的按需模块

- SQLite + SQLAlchemy + Alembic：Evidence、Claim、Event、Review 和 Coverage 存在多实体关系，并要求审阅状态在进程重启后恢复；本阶段引入。
- 本地文件目录：原始 Note 是不可原地改写的 Evidence Blob；本阶段以内容哈希命名保存。
- 文件上传：由 Note 导入需求触发；只允许 `.md`、`.txt`，设置大小、二进制内容和安全文件名边界。

## 4. 偏离或暂缓的默认方案

- 正式 macOS 馆主端：本阶段使用已有 Next.js Web 界面作为最小验收终端；原因是当前先验证 Event Review，不提前承担桌面打包和系统权限成本。Phase 0 Gate 通过、进入 Private Alpha 时重新评估。
- Tailwind CSS：现有项目已经使用集中式 CSS；本阶段延续现状，避免为样式工具迁移扩大改动面。不会影响 Phase 0 验收。
- 云端模型与真实模型冒烟：PRD 指定本阶段使用确定性 Development Provider/Test Double；因此没有模型调用契约，不需要 API Key，也不把确定性解析冒充真实模型效果。接入 Reference Provider 时再执行双层模型验收。
- Photo、Git、OCR、Embedding、Story、Exhibition、Share、ChatGPT/Codex/WorkBuddy Session：不属于本纵向切片，暂缓。
- D1：现有项目的 D1 只是可选模板；Phase 0 是本地优先单用户原型，使用本地 SQLite，避免证据默认进入云端。

## 5. 强制底线检查

- 密钥与隐私：通过。本阶段不使用模型 Key；原始 Note 只写入本地受控目录，日志不记录正文。
- 数据与任务可恢复：计划通过 SQLite、内容寻址原文和审阅审计记录实现；进程重启测试必须通过。
- 输入输出校验：计划通过 Pydantic、扩展名/大小/二进制检查和统一错误结构实现。
- 错误与日志边界：计划统一返回 `{"error":{"code","message"}}`，不向页面输出堆栈。
- 测试与真实模型验收：公开 API 做 mock/确定性自动化测试；本阶段无真实模型调用，记录为“不适用”，而不是“已通过真实模型验证”。

## 6. 需要产品经理决定的问题

无。本切片不新增外部平台、云端费用、数据迁移或公开上线范围。
