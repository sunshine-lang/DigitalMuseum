# 第五阶段技术开发文档｜评测基线（Evaluation Baseline）

> 配套文档：`docs/prd/digital-museum-prd-v0.1.md`（第 12/13 章）、`docs/dogfooding-2026-08-23.md`。
> 本文档覆盖 Phase 0 路线图的「Evaluation harness」项：为确定性管线建立可复跑的自动化基线，作为 Held-out Gate 与后续引入模型能力（Phase 0.5+）前的防退化护栏。

## 一、阶段目标

- 交付范围：一套持有评测数据集（held-out，不与开发测试共享用例）、一个评测 runner（走公开 API）、六项自动化指标、JSON 报告导出（PRD「指标导出」）、基线护栏测试。
- 验收标准：`npm run test:backend` 中基线测试全绿；`cd backend && uv run python -m evaluation` 生成报告且 `passed=true`；两次运行指标完全一致（确定性）。
- 明确不做：模型效果评测（Phase 0 无模型调用）、人工指标自动化（Acceptance / Correction Load / Valuable Rediscovery 属于 Held-out Gate 的人工部分）。

## 二、评测集（`backend/evaluation/dataset/`）

- `notes/*.md`：6 份手写笔记——含同日不同标题（不聚合）、同日同标题两份（应聚合）、无日期 + 开头引用块（验证 `note-development-v2` 的主张提取，摘录必须是正文而非引用块）。
- `manifest.json`：ground truth——git 仓库提交/标签规格（含一个阶段外的旧提交，应被排除）、照片 EXIF 规格、应被拒绝的输入（无 EXIF PNG → `photo_missing_timestamp`；阶段外笔记 → `note_outside_stage`）、10 条期望事件（标题 + 日期 + 来源数 + 关键主张内容）。
- git 仓库与照片由 `builder.py` 在临时目录内确定性生成（与 Stage 3/4 测试同法）；笔记以真实文件形式提交，保持"手写数据集"的属性。
- `dataset_digest()`：对笔记 + manifest 取 SHA-256 指纹写入报告，基线数据被改动时可直接对账。

## 三、指标（对齐 PRD 12.1 / 13.1）

| 指标 | 定义 | 基线阈值 |
|---|---|---|
| claim_grounding_rate | 全部事件 × 全部 Claim × 全部锚点：quote 逐字等于证据文档对应行、且字符区间一致（PRD「Core Claim Grounding = 100%」的自动化形式） | 1.0 |
| key_event_recall | manifest 期望事件中被系统建立（规范化标题 + 日期匹配，主张内容包含关键字）的比例 | 1.0 |
| spurious_event_count | 系统产出但不在期望清单中的候选事件数（Unsupported Assertion 的确定性代理） | 0 |
| aggregation_correctness | 期望聚合的事件实际 `source_count` 相符的比例 | 1.0 |
| rejection_correctness | 应拒绝输入返回预期状态码 + 错误码、且不产生事件的比例 | 1.0 |
| restart_persistence | 确认审阅后重启（新建 app 实例同库）状态仍为 confirmed | true |

## 四、运行方式

```bash
npm run test:backend                                   # 含 tests/test_phase0_stage5_evaluation.py（阈值 + 确定性两个用例）
cd backend && uv run python -m evaluation              # 独立跑一次，报告写入 data/evaluation/phase0-baseline.json
cd backend && uv run python -m evaluation --output X   # 自定义报告路径
```

- runner 全程走公开 HTTP API（TestClient），不直接调用服务层；报告含 processor_versions（note-development-v2 / git-evidence-v1 / photo-evidence-v1 / note-aggregation-v1），任何指标退化都会让 `passed=false` 并列出失败项。
- 规则：改动解析/聚合行为或评测集都必须让基线重新全绿；processor 版本号与行为变化同步。

## 五、Held-out Gate（人工部分，待用户执行）

自动化基线只覆盖确定性部分。Phase 0 Gate 的人工清单：

1. 用一份不用于开发的真实资料集（建议 20–50 份笔记 + 1 个真实仓库 + 若干照片）建新阶段；
2. 记录 Key Event Recall：事前列出 10 件关键事件，看系统建立了几件；
3. 记录 Event Acceptance Rate 与修正负担（每 10 个确认事件花掉的修改时间）；
4. 记录 Valuable Rediscovery：系统发现、你未事前列出、确认真实有价值的事件；
5. P0 检查：是否出现任何"无依据却以确定事实表达"的事故（必须为 0）。

## 六、交接给下一阶段

- 基线就绪后，Phase 0 剩余：Held-out Gate 人工评测（用户）、服务端批量导入收尾；通过后进入 Phase 0.5（ChatGPT Export Adapter）。
- Phase 0.5 的每次解析改动都应先跑本基线 + 扩充评测集（新增 chat 来源的期望事件），Recall 提升不得以 spurious > 0 或 grounding < 1.0 为代价（对齐 PRD 13.2）。
- dogfooding 待办（照片锚点卡片折叠、重复导入 Git 的"聚合自 N 份"语义、无日期事件分组）在进入 Phase 0.5 前按优先级处理。
