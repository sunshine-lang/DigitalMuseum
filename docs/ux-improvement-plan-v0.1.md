# UX 改进实施方案 v0.1

> 依据：`docs/dogfooding-2026-08-23.md` 真实试用记录、2026-08-23 UX 审计（对话内）、`docs/frontend-design-research-v0.1.md`、`docs/github-reference-projects-research-v0.1.md`。
> 原则：延续 Phase 0 约束（本地优先、无模型调用、集中式 CSS、每切片可独立验收合入）。本文档是实施蓝图，三条 P0 切片按仓库既有纵向切片节奏逐条交付。

## 总览与排期

| 切片 | 内容 | 优先级 | 规模 |
|---|---|---|---|
| A · 我的回顾 | 阶段列表/重命名/删除 + 失联恢复 | P0 | 后端小 + 一个新页面 |
| B · 照片上墙 | 本地 Blob 媒体端点 + 展览/工作台展示真实照片 | P0 | 后端小 + 前端中 |
| C · 冷启动快速路径 | 从 Git 仓库开始 + 日期控件 + 双路径建馆 | P0 | 后端小 + 前端小 |
| D · 发现页规模化 | 搜索/筛选/月份锚点 + 合并交互升级 | P1 | 前端为主 |
| E · 情绪与打磨 | 分享卡、滚动叙事、术语、移动端、字体自托管 | P2 | 按需拆条 |

---

## 切片 A · 我的回顾（阶段管理）

### 问题
单 localStorage 指针指路：切换阶段后旧阶段无入口；清浏览器数据即"失联"（数据库完好但 UI 不可达）；无删除/重命名，运维只能动 SQLite（本次清测试数据即如此）。

### 后端（3 个接口，无迁移）

| 接口 | 行为 | 错误 |
|---|---|---|
| `GET /api/v1/stages` | 返回全部阶段（按 created_at 倒序），每项含 id/name/starts_on/ends_on/created_at/evidence_count/event_count/confirmed_count | — |
| `PATCH /api/v1/stages/{id}` | 重命名（name 非空 ≤120，strip） | 404 stage_not_found、422 invalid_stage_name |
| `DELETE /api/v1/stages/{id}` | 删除阶段，FK 级联清空其 occurrences/coverage/events/claims/anchors/reviews；**Blob 不删**（内容寻址、跨阶段共享，回收另立任务） | 404 stage_not_found |

confirmed_count 新增聚合（status="confirmed" 且非 structural）。

### 前端

- 新路由 `/stages`（`app/stages/page.tsx`），沿用 `mvp-*` 集中式样式：
  - 卡片列表：阶段名、时间范围、三统计（记录/经历/已确认）、进入按钮；
  - 操作：进入（写 localStorage 指针 → 跳 `/`）、重命名（行内编辑）、删除（两步确认，明示"将永久删除 N 段经历、M 份记录；原始文件按内容寻址保留"）；
  - 空态：引导回首页建馆。
- 首页 StageGate 改造：表单上方新增"继续已有的回顾"区（GET /stages 最近 3 条 + "查看全部"）；"切换回顾范围"按钮改跳 `/stages`。
- `phase0-api.ts` 新增 `listStages/renameStage/deleteStage`。

### 测试与验收
- 后端：列表倒序与统计正确；重命名空名 422；删除后 events/coverage 为空、blob 文件仍在、其他阶段不受影响；三个接口 404 契约。
- E2E 新场景：建两个阶段 → /stages 切换互进 → 重命名 → 删除其一 → 另一阶段数据完整、展览可开。
- 验收线：清空 localStorage 后，从 /stages 一步找回档案；全程 UI 可完成阶段生命周期管理。

---

## 切片 B · 照片上墙（真实照片展示）

### 问题
照片是产品中最视觉的证据，但展览里被渲染为抽象版画；用户导入照片的动机就是"看到它"。

### 后端（1 个端点 + 1 个字段）

- `GET /api/v1/blobs/{sha256}`：按哈希从 upload_dir 读文件返回。
  - 校验：sha256 必须 ^[0-9a-f]{64}$（防路径穿越，fail closed 422 invalid_blob_id）；DB 无记录或文件缺失 → 404 blob_not_found；
  - 响应：FileResponse，media_type 取自 EvidenceBlob 行；`Cache-Control: public, max-age=31536000, immutable`（内容寻址，内容永不变）；
  - 只读不删；无目录列举。写入 AGENTS 安全注意项。
- `ClaimOut` 增加可空字段 `source_media: {sha256, media_type} | null`：取 claim.occurrence 的 blob，仅当 media_type 为 image/jpeg|image/png 时返回（照片事件 occurrence.blob 即原图；笔记/Git 为 null）。

### 前端

- 展览：`.expo-art` 内若事件首个 claim 有 `source_media` → 渲染 `<img src="{API}/api/v1/blobs/{sha}">`（object-fit: cover 满框），叠加保留标本刻线与编号/钢印层（照片 + 版式刻线 = 装裱感）；无媒体事件维持 SpecimenArt。
- 工作台证据侧栏：有 source_media 的 claim 显示 96px 缩略图（核对时刻"这就是那张照片"），点击新窗口打开原图。
- 图片加载失败（文件被手动删除）→ onerror 静默回落 SpecimenArt。

### 测试与验收
- 后端：上传照片 → EventOut.claims[0].source_media 正确；GET blob 返回字节与 content-type；非法哈希 422；未知哈希 404；笔记事件 source_media 为 null。
- E2E：照片导入后展览展品为真实图片（断言 img src 含 blob 端点）。
- 验收线：从导入照片到展览看到照片，全程零文字成本。

---

## 切片 C · 冷启动快速路径

### 问题
首屏先要"起名 + 手填日期"才见价值；日期文本框格式易错；Git 导入是最零门槛的入口却排在表单之后。

### 方案（用户保持控制权，不做全自动）

- 新端点 `GET /api/v1/git-repos/preview?path=...`：只读仓库，返回 `{repo_name, first_commit_on, last_commit_on, commit_count}`（沿用 allowed_repo_roots 校验与只读子命令）。
- StageGate 双路径布局：
  1. **"从一个 Git 仓库开始"**（主路径）：输入路径 → preview → 自动把日期区间填成 [first_commit_on 向前放宽到 ≥3 个月, last_commit_on]（满足 3–12 月约束），阶段名预填仓库名 → 用户确认/微调后保存；
  2. **"手动选择时间范围"**（现有表单收起为次路径）。
- 日期改 `<input type="date">` + 客户端 3–12 个月即时校验提示（服务端校验保留）。
- Git 输入框记录最近 3 个成功路径（localStorage），下拉快速复选。

### 测试与验收
- 后端：preview 正确返回首末提交与数量；范围外路径沿用 403/422 契约；空仓库 → 422 no_commits。
- E2E：从首页贴仓库路径到看到事件，全程不手填任何日期。
- 验收线：新用户 ≤3 次输入（路径 + 确认 + 名字可默认）见到第一段经历。

---

## 切片 D · 发现页规模化（P1 批）

1. **导航**：标题搜索框（客户端过滤）+ 状态筛选（待核对/已确认/不确定/已排除）+ 月份锚点条（复用 expo-timeline 六边形语言）；"时间还不明确"分组默认折叠、显示计数。
2. **合并交互**：选中 ≥1 即出现常驻"合并所选 (N)"条（≥2 可执行）；实现拖拽合并（拖起半透明、松手弹确认，checkbox 保留为键盘/触控替代——无障碍要求）。
3. **证据瀑布**（Splink 模式）：合并确认弹层左右并排两事件的锚点原文（逐行对齐），冲突与相同一目了然。
4. **导入期望前置**：照片入口常显"需自带拍摄时间（EXIF）"；Git 输入框 placeholder 示例 + 失败原因速查。

## 切片 E · 情绪与打磨（P2 备选池）

1. **分享卡**（Wrapped 模式）：尾声"生成海报"→ Canvas 合成本地 PNG（阶段名 + 三大数字 + 一幅版画），仅本地下载，不联网——Phase 0 合规的分享感。
2. **漫步模式**（Scrollama）：展览可选"漫步"切换：左侧 sticky 超大章节标题、右侧展品随滚动步进 crossfade（每页 pin ≤1 处，减动效兜底）。
3. **术语替换**：工作台侧栏"锚点→原文位置、文件指纹→档案编号、候选事件→草稿经历"（展览侧已完成）。
4. **移动端工作台**：Playwright 增加 iPhone 视口 project，四步流程过一遍并修窄屏问题。
5. **字体自托管**：woff2 落 `public/fonts/` + @font-face，摆脱 Google Fonts CDN（本地优先一致性，离线可用的完整视觉）。

## 风险与边界

- 删除阶段不可恢复 → 两步确认 + 影响计数明示；Blob 留存策略写入 AGENTS。
- Blob 端点暴露本地文件 → 仅限库内已登记哈希、严格 hex 校验、无列举；单用户本机原型可接受，写入 AGENTS 安全条目。
- preview/字段扩展均不破坏既有 API 契约（只增不改）；E2E 全量回归每切片必跑。
