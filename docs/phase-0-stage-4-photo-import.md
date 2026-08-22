# 第四阶段技术开发文档｜Photo 照片导入

> 配套文档：`docs/prd/digital-museum-prd-v0.1.md`、`docs/technical-adaptation.md`、`docs/phase-0-stage-1-note-event-review.md`、`docs/phase-0-stage-2-aggregation-merge-split.md`、`docs/phase-0-stage-3-git-evidence-adapter.md`。
> 本文档只覆盖 Phase 0 的第四条纵向切片。开发时不得提前实现 OCR、场景/人脸识别、HEIC、模型调用、Story/Share。

## 一、阶段目标

- 交付范围：用户在页面上选择本地照片文件（JPEG/PNG）；系统读取其 EXIF 元数据（拍摄时间、相机、GPS 坐标），把原始图片按内容哈希落盘为 Evidence Blob，并渲染一份确定性元数据证据文档，再生成候选事件进入现有 Event Review 流程。
- 阶段产物：`photo-evidence-v1` 确定性适配器、照片导入 API、验收界面入口、自动化测试。
- 验收标准：每个 Claim 的锚点 quote 逐字出现在元数据证据文档的对应行；拍摄日期都来自 EXIF 且在建馆阶段范围内；重复导入同一张照片聚合而不是复制事件；重启后状态可恢复；无法确定拍摄时间的照片被明确拒绝而不是猜测日期。
- 明确不做：OCR、语义识别（风景/人物/物体）、HEIC/HEIF、缩略图与图片展示、反向地理编码（不联网，GPS 只保留原始坐标）、文件修改时间推断拍摄日期、模型调用。
- 主链路片段：`本地照片文件 → 内容寻址 Blob + EXIF 元数据证据文档 → 按天候选事件 → Event Review`。

## 二、设计要点

### 2.1 双 Blob 策略（图片 + 元数据文档）

照片是二进制，不能像笔记那样直接逐字锚定。适配器沿用 Git 切片的"确定性证据文档"模式，拆成两个内容寻址 Blob：

1. **图片 Blob**：原始图片字节按 SHA-256 落盘（`data/uploads/`），不可原地改写，挂在 EvidenceOccurrence 上，是这段证据的原始本体，供后续展览阶段使用。
2. **元数据证据文档**：由 EXIF 确定性渲染的 UTF-8 文本（`.txt`），Claim 的锚点指向这份文档：

```text
photo: IMG_20260510_143022.jpg
sha256: 3f9a…（图片内容哈希）
bytes: 2411834
format: JPEG
dimensions: 4032x3024
taken_at: 2026:05:10 14:30:22 (EXIF DateTimeOriginal)
camera: Acme Phone 15
location: 31.2261,121.4737
```

- 同一张图片 + 同一文件名 → 文档逐字节相同，天然去重；`camera`/`location` 行仅在 EXIF 提供且可解析时出现。
- 文档每一行都是锚点：`quote` 逐字取自该行，`line_start/line_end` 指向行号，`char_start/char_end` 为行内偏移。

### 2.2 确定性规则 `photo-evidence-v1`

- 格式：仅接受 JPEG（`.jpg/.jpeg`）与 PNG（`.png`）；用 Pillow 解码校验，实际格式由文件内容判定，损坏文件 → 415。
- 拍摄时间：优先 EXIF `DateTimeOriginal`，回退 `DateTime`；解析失败或缺失 → 422 拒绝。**不做任何日期猜测**（不使用文件修改时间）。
- 事件：每张照片一个候选事件，标题固定 `拍摄照片`，日期为 EXIF 拍摄日；Claim 文本为确定性描述（`拍摄了照片 {文件名}（{日期 时间}，相机 {型号}，位置 {坐标}）`，缺失部分省略）。
- 事件 `origin="photo"`，`status="candidate"`，必须经人工审阅；Claim `evidence_role="artifact"`（机器产物）。
- 范围校验：拍摄日期必须在 `[starts_on, ends_on]` 内，否则 422，不产生半成品数据。
- 聚合：沿用 `note-aggregation-v1` 的（规范化标题, 日期）规则，`origin` 白名单加入 `photo`；同一天再导入照片 → 并入既有 `拍摄照片` 候选事件，`source_count` 增长。
- GPS：仅把 EXIF GPS 度分秒换算为十进制坐标（保留 4 位小数），不做反向地理编码、不联网。

### 2.3 上传限制（fail closed）

- 新配置 `DIGITAL_MUSEUM_MAX_PHOTO_BYTES`（默认 25 MiB），与笔记的 `MAX_UPLOAD_BYTES` 分开；超限 → 413。
- 后缀白名单 + 声明媒体类型校验（`image/jpeg`、`image/png`、`application/octet-stream`）；文件名安全规则与笔记一致。
- 图片解码或 EXIF 读取抛错 → 415 `invalid_photo_content`；缺拍摄时间 → 422 `photo_missing_timestamp`；两者都会把本次导入标记为 failed 并保留 Coverage 记录，不留半成品事件。

## 三、API

- `POST /api/v1/stages/{stage_id}/photos`
  - 请求：multipart `file`（JPEG/PNG）。
  - 成功 201：`{"data": {"occurrence": OccurrenceOut, "event": EventOut, "coverage": [CoverageOut]}}`
  - 错误：`unsupported_photo_type`(415)、`invalid_photo_media_type`(415)、`photo_too_large`(413)、`invalid_photo_content`(415)、`photo_missing_timestamp`(422)、`photo_outside_stage`(422)、`stage_not_found`(404)。
- 既有接口契约不变；`EventOut.origin` 增加 `"photo"`。
- 首页照片批量选择同样通过前端顺序调用单文件 API 实现，不声称已完成服务端 Import Batch。

## 四、测试要求（`backend/tests/test_phase0_stage4_photo_evidence.py`，全部走公开 API）

1. 带 EXIF（时间/相机/GPS）的 JPEG 导入 → 生成 `拍摄照片` 候选事件；锚点 quote 逐字等于元数据文档对应行；图片 Blob 与文档 Blob 均按哈希落盘。
2. 同一天第二张照片 → 聚合进同一事件（`source_count` 增长，`origin` 变 `aggregated`），不同天独立成事件。
3. 无 EXIF 的 PNG → 422 `photo_missing_timestamp`，事件列表为空，Coverage 留下 failed 记录。
4. 拍摄日期在阶段范围外 → 422 `photo_outside_stage`，无半成品数据。
5. 后缀不支持 → 415；超过照片上限 → 413；内容损坏 → 415 `invalid_photo_content`。
6. 生成事件可用现有 review API 确认为 `confirmed`；重启（新建 app 实例同库）后事件与审阅仍在。
7. 同一照片重复导入 → 元数据文档哈希稳定（确定性），事件不重复。

## 五、验收界面

- 首页导入区新增"导入照片"拖放区（`.jpg/.jpeg/.png`，多选）与"开始整理这些照片"按钮；成功后提示导入张数并刷新事件，失败显示统一错误与逐份结果。
- 事件卡来源标识新增"来自照片"；其余复用现有发现/核对/展览链路，不做视觉重构。

## 六、交接给下一阶段

- 证据来源类型机制扩展为 note / git / photo 三类；下一个适配器（如 ChatGPT Export）可按"确定性证据文档 + 锚点 + 候选事件"同一模式接入。
- 图片 Blob 已按内容哈希入库，后续展览/Story 阶段可直接引用，不需要重新导入。
- 下一阶段候选：评测 harness（Phase 0 Gate 前置）、服务端批量导入收尾、HEIC 与 OCR（需先明确确定性边界）。
