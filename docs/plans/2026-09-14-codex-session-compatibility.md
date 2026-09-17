# Codex 会话读取兼容性 · 2026-09-14

本次只修确定性读取，处理器为 `codex-evidence-v2`。模型整理、完整多轮素材包、本人确认保存仍未实现；三份预存候选故事不能证明这些能力已经完成。

## 复现与根因

旧分类器只接收 `event_msg.user_message / agent_message`。实测另一种转录使用 `event_msg.item_completed`，正文分别在 `UserMessage.content[].text`（`type=text`）与 `AgentMessage.content[].text`（`type=Text`）。旧实现把这些记录全部忽略，仍用元数据时间生成零消息的 verified 统计。

去私密最小 fixture 为 `backend/tests/fixtures/codex-item-completed.jsonl`。经实际 `import_project` 入口，修复前 `test_completed_messages_are_read_instead_of_verified_zero` 期望 1 条用户、1 条助手和首问，实际为 0/0、没有首问；修复后同一测试通过。该 fixture 不包含私人原文、真实路径或真实身份。

## 支持规则

- 发现和导入均只读 `thread_source=user`、cwd 仍存在且归属一致的文件；子代理和 guardian review 不进入档案。发现的会话数按 `session_meta.id` 去重；无 id 的旧文件仍单独计数，不根据相似文本推断同一会话。
- 支持旧事件格式、新 `item_completed` 的 UserMessage/AgentMessage，以及带轮次身份的 `response_item.message`。新格式文本大小写、旧式字符串、已观察的图片内容块均显式处理；图片不会被解释为事件事实。
- 在同一逻辑线程、同轮、同角色内，完成事件优先于旧事件，旧事件优先于 response_item。选定来源后按消息 ID 去重。旧记录无消息 ID 时仅去除包含时间戳/ordinal 的完全相同记录重放；不同时间或不同 ID 下用户重复说同一句话仍分别计数。
- 上述来源优先针对同一轮的镜像记录，不宣称能融合所有来源都只有部分内容的历史。没有可定位轮次的裸 response user 容器会报错，不仅凭 role=user 导入。
- 注入的 AGENTS、XML 环境包装、工具记录与子代理回传不作为真人发言。已观察到的附件/浏览器包装存在非空 `## My request:` 时使用请求正文；用户确实粘贴的非空材料不会因为附加请求栏为空而丢掉。首问仍是折叠空白后的统计摘录，不是供模型使用的原始引用快照。
- 有 history_base 时只接纳根目录内可完整定位的单一续接链，按 `end_ordinal_exclusive` 截取父片段，忽略被续接替代的尾部。缺父段、循环、多分支或无法定位片段时明确失败；不会读取来源提供的任意路径，也不会猜选某个分支。压缩摘要或 replacement_history 不递归计为新发言。
- 新完成事件优先使用 `started_at_ms`，否则使用该记录的 timestamp；旧消息使用记录时间。会话摘要首尾取实际纳入消息的时间并转为本机时区。现有渲染仍以逻辑会话首条纳入消息所在日组织统计，**没有把跨日长会话拆成逐日消息事件**。

## 不可读取时

JSON 损坏行和非对象行继续确定性跳过。可识别为消息但结构、文本类型、轮次或时间无法解释时，该项目返回既有同步结果中的错误码：

`response_item.message` 的角色必须是字符串；system/developer/tool 作为非对话记录跳过，未知或损坏的角色返回 `unsupported_codex_message`。2026-09-14 独立复核补足了该校验：此前列表/对象角色会抛出 TypeError，缺失/未知字符串角色会被静默忽略。四个新增用例先复现失败，再验证错误只影响对应项目并保持旧档案不变。

| 代码 | 含义 |
| --- | --- |
| unsupported_codex_message | 未支持的消息结构或缺乏可定位轮次 |
| invalid_codex_message_time | 消息时间无法读取 |
| conflicting_codex_message | 同一用户消息 ID 的文字冲突 |
| incomplete_codex_history | 续接历史缺失或无法可靠定位 |
| ambiguous_codex_history | 多个可能的续接分支 |
| no_codex_sessions | 没有可纳入的会话消息，不生成零消息 verified 档案 |

首页同步结果将这些错误显示为中文说明。解析错误发生在旧快照替换之前，因此该项目保留已有档案及用户判定，其他项目仍可正常同步。没有改统一 API 错误结构。

## 现有档案与版本

本轮没有对真实档案执行同步、清库、迁移或快照重写。旧 `codex-evidence-v1` claim 继续解析为原项目身份，画廊分组与三份候选故事保持不变。

后续用户主动同步时，新解析后的文档内容变化才触发现有快照替换；相同字节继续跳过，处理器版本本身不强制全库失效。因此未变化的旧 claim 可以保留 v1，新生成的 claim 标记 v2。去重、首尾时间或首问变化可能改变下一次同步的统计；多文件同一线程不再被当作多次独立会话。已有 disputed/unknown/confirmed 等用户判定按原服务规则保留。

跨日逐消息归组以及已经残留在旧日上的事件如何迁移，需另作影响分析；本轮没有借兼容修复重排历史档案。当前库仍是此前保存的快照，不能说它已经被全库纠正。

## 验证与后续素材约束

回归覆盖旧/新/混合来源、同词多次发言、消息 ID 与文件重放、单链续接和父尾截断、历史缺失/分支、系统/工具/子代理过滤、未知结构、实际消息时间、同步失败时保留旧快照与异议。共享逐行扫描没有改动，四产品、备份/导出及项目身份沿用现有回归。真实只读抽样的逐文件统计保存在 Git 忽略的 `outputs/qa/session-compatibility/`，不纳入公开 fixture。

下一阶段的多轮素材接口至少要保留：逻辑线程和消息 ID、角色、原始消息时间、源文件/行位置、完整原文与独立快照、工具调用和执行结果的对应关系、明确的压缩或续接缺口。统计文档中的 120 字首问及 60 字 claim 不能代替这些材料。模型仍只能输出带原文出处的 candidate，用户的价值评价和本人确认必须由用户完成。

Claude 的 API 错误、isMeta 与同 message.id 分块等新增兼容线索未在本轮展开；pi/dsh 也没有增加未观察格式。不要将本次 Codex 兼容范围表述为所有 Agent 版本均已覆盖。
