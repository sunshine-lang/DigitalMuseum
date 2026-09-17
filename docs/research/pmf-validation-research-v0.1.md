# Digital Museum PMF 验证调研 v0.1

- 调研/访问日期：2026-09-05
- 研究问题：Digital Museum（AI 人生档案馆）如何找到 product-market fit（PMF）？为达成 PMF 还需要补充哪些内容？
- 方法：四路并行——① 项目文档盘点（PRD v0.3 / 两份 ADR / 大考 gate / README / stage 史 / worklog）；② 同目录既有三份调研（agent-memory / agent-sessions / memory-products）的完整提炼作为去重基线；③ GitHub REST API、HN Algolia API、npm registry API 直连抓取 traction 数据（2026-09-05 快照）；④ PMF 方法论一手来源（Sean Ellis 原文、Superhuman 引擎、Lenny Rachitsky 访谈、lazygit 作者五年复盘等）+ 利基开发工具案例复盘。
- 证据纪律（沿用同目录前三份调研的口径）：
  - 星数必须与推送日期并置——星数是存量、推送是流量。
  - 区分「来源事实」与「对 DM 的推断启示」；推断段落明确标注【推断】。
  - 各类 benchmark 与营销口号一律不当已验证效果引用。
  - **本调研没有做任何用户访谈**——所有需求侧判断均为推断（见 §8 开放问题）。

---

## 0. 结论先行

1. **供给侧生态位空白是事实，需求强度未知是更大的事实。** 会话文档已证明「会话→面向人的档案+证据链+展览」没有竞品全备；本调研补充了反面数据：开发者 Wrapped 型产品在 HN 上八年约 20 次 Show HN 尝试**全部 ≤8 分**，Claude Wrapped 的 npm 月下载从发布月 435 跌到 30（14 倍季节性落差）。生态位空着既可能因为「每个环节都反 AI 总结捷径」（会话文档结论），也可能因为**回顾型需求本身就是年度性、低频、不养产品**。两者都成立，意味着：DM 的 PMF 不能押「一次性回顾时刻」，必须押「档案随日常开发被动变厚 + 年度时刻收割」的双层结构——这正是 PRD v0.3 §3.1 北极星的原始设计，市场数据反而验证了它。
2. **当前最大的 PMF 缺口不在产品功能，而在分发。** 品类之王 ccusage（18,368 星、npm 月下载 381,310）的传播第一因是 `npx` 零安装一键跑；DM 目前只有 git clone + npm ci + uv + 双终端源码运行。同一批数据文件、同一批受众，触达成本差了一个数量级。
3. **「愿意发给朋友」是 DM 自带的第一个 PMF 测试，而且历史上失败过一次。** 2026-08-24 大考五项中唯一未过项就是它（用户原话：证据原文观感差、像浏览博客）；S5 叙事层是回应，但 2026-08-25 复考的五个判定栏至今全部「待用户填写」。**在大考判定完成前谈外部 PMF 验证为时过早——先把自己的 n=1 走完。**
4. **度量体系需要从「门禁」升级到「PMF 仪表盘」。** v0.1 曾有 Private Alpha 数字目标（≥8 位设计伙伴、≥70% 认为准确、≥3 位真实发布链接），v0.2 转向后被 dogfooding gate 取代，v0.3 无任何外部用户目标。外部验证开始前需要先定好测什么（§6）。
5. **变现天花板要诚实：无云、单用户、单机部署 = 可持续的业余项目 + 中低收入回收，不是收入引擎。** lazygit（37k 星、全球星数前 300）作者原话「如果能一挥手拿到全职资金我立刻全职」就是天花板证据。这与 PRD 的本地优先定位自洽，不是缺陷，但应显式承认。

---

## 1. 现状盘点：产品与度量所处的位置（来源事实）

### 1.1 产品位置
- PRD v0.3 路线图 S1–S6 全部收官；四个适配器（claude-code / codex / pi / dsh）经统一骨架注册、`POST /api/v1/archive/sync` 一键同步；后端 pytest 47 用例、e2e 9 用例全绿。
- 真实数据现状：36 段事件、跨度 2026-07-01→08-27（约 2 个月，短于 PRD ≥6 个月口径）、同步 0 失败 0 重复、26/26 单源事件独立复算一致；导出产物已生成（outputs/ 下 17KB 单文件 HTML）。
- **大考五个判定栏全部待用户填写**（docs/gate/real-data-exam-2026-08-25-v0.3.md:25-31），其中第 1 项（跨度 2 个月 vs 口径 6 个月）与第 5 项（愿意发给朋友，需断网双击验证）是关键未决。

### 1.2 度量位置
- 现行成功度量即大考五项（v0.3 §11），全部是 dogfooding 口径；v0.2/v0.3 无外部用户规模目标。
- v0.1 §13.2 的 Private Alpha 目标（≥8 设计伙伴 / ≥75% 独立完成 / ≥70% 保存展览 / ≥50% 建第二主题 / ≥3 位真实发布链接）随 v0.2 转向废弃——**若重启外部验证，这组数字是最现成的起点**。
- v0.1:614 明言「不用 GitHub Star 或社区点赞替代真实用户验证」——与 §4.2 star ≠ PMF 的证据一致，立场正确，保留。

### 1.3 分发位置
- 仅源码分发：git clone + npm ci + npm run backend:sync + 双终端（README:49-81）；package.json `private: true`、version 0.1.0；无 npm 包、无二进制 release、无 Homebrew。
- README 有两张截图（隔离样本数据）、og 图、四类欢迎 Issue 的参与引导；License MIT。

---

## 2. 供给侧已知：三份既有调研的基线（提炼，不重复罗列）

同目录三份调研（2026-08-27 → 09-05）已覆盖：开源记忆基础设施 25 个已核实项目、会话工具约 45 个、消费级记忆产品 9 个。本节只列对本调研结论有直接贡献的条目，明细见原文件。

### 2.1 对 PMF 判断有决定性贡献的四个数据点
1. **市场温度计（会话文档 §0.2）**：编排 28k 星（给 Agent 排班）＞ 用量统计 1.8 万星（花了多少）＞ 查看器 3.9k/2.1k 星（做过什么）＞ **档案/展览 <1,500 星（人生档案）**。「给 Agent 排班的需求量级远大于给会话存档」是文档自己给出的市场规模对比。
2. **claude-mem 93,206 星（会话文档 §4.1 补记）**：本主题星数第一走的是「捕获会话→AI 压缩→回注 Agent」路线，**高于**逐字确定性路线的 MemPalace（58,837 星）。即：把会话喂回 Agent 的市场天花板，高于把会话讲给人听。【推断】DM 刻意选择的严口径注定了市场是「更窄但更空」，靠独特性与口碑而非品类红利。
3. **pi / dsh 的生态依托（会话文档 §6.2）**：两个小众数据源在 8 个独立项目的支持清单反复出现——四产品严口径不是自嗨，但四产品**同时重度使用**的人群规模没有任何数据（三份调研共同的未覆盖项，见 §8）。
4. **「30 天清理」恐惧在三个独立项目 README 出现**（monitor / CCHV / MemPalace）——存证动机有社区共鸣，且 DM 比「备份」走得更远。

### 2.2 既有调研明确留下的待办（直接继承进 §7）
- 未细读线索五个：semantica（11,966 星）、honcho（7,014，AGPL）、memvid（16,469）、Memori（16,405）、byterover-cli（4,954）；TencentDB-Agent-Memory（25,917 星）待深核。
- agent-sweep（76 星，会话史密钥脱敏）的检测规则集值得对照补全 DM 的导出前敏感扫描。
- 产品文档 §4 的 A 档（信息层级改造：项目名做主标题 + 首条用户消息逐字引用做钩子 + 元数据行）与 §5.2（首条用户消息的隐私清洗）——**已有完整方案、待产品决策、零模型零迁移**。
- 产品文档 §3 点名 `app/exhibition/narrative.ts:286-294` 的人格化标签（「闭关冲刺手/全线总指挥」）是解释性修辞，建议至少标为「趣味解读」——未给最终决策。

---

## 3. 市场与 traction 信号（2026-09-05 API 快照，来源事实）

### 3.1 用量分析赛道仍在加速，且传播第一因是 npx
- ccusage：18,368 星 / 818 forks（2025-05-29 建仓）；npm 月下载 2025-09 为 121,948 → 2026-06 为 411,334（约 3.4 倍年增长），最近一月 381,310。HN 成功帖 75 分（2025-07），前两次 Show HN 仅 2-4 分。传播原因（HN 评论一手）：零安装 `npx`、纯本地读文件、订阅额度焦虑（自述「$100/月 Max 计划跑出 $600-800/月用量」）。
- GitHub 搜 "claude code usage" 命中 **5,828 个仓库**。头部：claude-hud 27,830 星（2026-01 建仓，7 个月）、CodexBar 20,938 星、codeburn 10,844 星（Show HN 112 分）、tokscale 5,298 星。
- 【推断】claude-hud 在 HN 仅 2 分、CodexBar 搜不到 HN 帖却拿到 2 万+ 星——量级来自作者自有受众（jarrodwatts 是编程教育者、steipete 是有大量 X 粉丝的 iOS 开发者）。**作者个人号是这个品类最有效的放大器，平台冷启动是次要的。**

### 3.2 开发者 Wrapped：需求每年复发，但从未跑通
- HN Algolia 搜 "github wrapped"：1,763 条命中、约 20 个独立 Show HN 尝试（2018 年起），**全部 ≤8 分**（wrapped.dev 6 分、Rendley 7 分、git-wrapped.com 5 分）。
- Claude Wrapped（@spader，读 stats-cache 上传 Cloudflare 做全球对比）：Show HN 1 分；npm 下载发布月 435 → 2026-08 仅 30/月。Year in Code、GPTRecap 同样 1-3 分。
- 对照：Spotify Wrapped 自身的工程帖在 HN 有 269/196/113 分——**格式本身的关注度远大于任何克隆品**。
- 唯一内置分享/对比机制的是 Claude Wrapped（全球排行榜）与 tokscale（排行榜是 README 卖点）——社交对比比单向回顾更有传播力的旁证。
- 【推断】对 DM：(a) 不要指望回顾时刻自然传播，导出物应内置可分享的对比性内容（全馆统计卡/海报——注意本地分享海报已于 2026-08-25 删除，重新引入需另立阶段评估）；(b) 发布节奏押 12 月，其余时间靠档案积累价值。

### 3.3 量化自我的生死谱
- WakaTime（2013 至今）：自称 500k+ 开发者、100+ 编辑器插件；2017 年 $10k MRR / 约 1% 付费转化；存活配方 = **被动捕获 + 插件生态 + 排行榜 + 慢公司**；现已支持 Claude Code / Codex / Cursor。隐私教训：要求隐藏文件名的用户多到做成正式功能。
- Rewind.ai：2022 发布帖 164 分高光 → 改名 Limitless → 2026-08 HN 被用户以过去时提及 shut down；接棒者 Screenpipe（21,414 星，YC S26，本地开源）。「云端录屏 lifelogging 无每日刚需即死；本地开源+可给 Agent 供上下文的版本接住了需求」——**无云端在迁移潮里是卖点不是负担**。
- 死因共性：主动记录 / 无数据积累 / 无每日刚需。存活共性：数据被动变厚 + 随时可看的仪表。

### 3.4 2026 直接竞品：基建层挤满，叙事层仍空
| 工具 | Stars | 与 DM 的关系 |
|---|---|---|
| winfunc/opcode（原 claudia） | 22,394 | Claude Code GUI + 会话管理，无叙事/证据链概念 |
| claude-devtools | 3,903 | 会话日志浏览器（既有调研已录，4 个月无推送） |
| cass | 1,111 | 统一索引 11+ 产品会话史；HN 仅 3 分，全靠 GitHub 内生发现 |
| codealmanac | 993 | 会话→codebase wiki，2026-07 HN 60 分（本批唯一破圈，因输出日常可复用价值） |
| agent-sessions | 843 | macOS 多产品会话浏览器（既有调研已录） |
| **deja-vu** | **776（2026-07-14 建仓，约 7 周）** | 确定性、无 LLM、单二进制「会话史→agent memory」——增速最猛，理念与 DM 同源 |
| smixs/mentor | 77 | 读本地 Claude+Codex 历史→生成 HTML 报告，**形态最接近导出展览** |
| agentgraphed | 49 | "Local-first history for Claude Code & Codex"，Show HN 4 分 |

【推断】基建/检索层窗口正在快速关闭（deja-vu 七周 776 星），叙事/证据层仍无人——DM 的护城河不在读文件，在读出之后的导出物。

### 3.5 数字遗产：非增长市场，但情绪浓度极高
- HN 该品类最高分是个人博客「Sending emails to my three-year-old」（199 分 / 107 评论）；Everplans 无任何可示用户数；MyTestament.io Show HN 2 分。
- 【推断】DM 的导出 HTML 天然是「时间胶囊」形态，营销叙事可借这 199 分的情绪（给未来的自己/团队留下可验证的协作史），产品不要往遗嘱工具做。

---

## 4. PMF 方法论与案例（一手来源）

### 4.1 框架
- **Sean Ellis 原版**：≥40% 的**活跃用户**（非注册数）表示失去产品会「非常失望」；PMF 前不要忙商业化与增长（Startup Pyramid）。
- **Superhuman 引擎**：四问问卷只发「过去两周活跃 ≥2 次」的用户；只深挖「非常失望」人群的人设与收益；路线图一半放大已爱的点、一半解决拖后腿的点（只做前者分数不动，只做后者被竞品追上）。
- **Lenny Rachitsky 访谈结论**：PMF 是阶梯不是 0/1（一家爱→一家付大钱→多家付→push 变 pull）；**受访创始人没有一个把留存曲线当 PMF 信号**；idea→PMF 中位约 2 年、可用产品→PMF 约 9-18 个月；alpha 应在 1-3 个月内发出；50% 团队时间花在客户身上。
- **低频/回顾型产品修正（对 DM 关键）**：问卷分母收窄到「最近 30 天触发过同步的人」，并补问**问题频率**（「过去一个月你主动回看过几次自己的会话历史？」）作为使用频率对照——回顾频率低但数据积累频率高，两频率要分开测。
- **star ≠ PMF 的硬数据**：lazygit 37k 星 vs 359k 直接下载，magit 6.1k 星却 380 万下载；ccusage 381k 月下载 ≈ 星数 20 倍；行业已默认星与下载并列引用（Mastra Launch HN 同时给 19.4k stars + 300k weekly downloads）。OSS 的 PMF 证据链 = **运行量 × 复跑留存 × 外部贡献者 × 未经请求的生态内容**，星只当传播计数。
- **Time-to-value（MTTHW）**：首跑 ≤5 分钟看到第一块展品；但 Scale Factory 警示只优化 MTTHW 会诱导牺牲安全换易用——**敏感扫描/隐私红线不可用 TTV 换**。

### 4.2 案例复盘
- **ccusage**：三发 Show HN（2-4 分 ×2 → 75 分）；转折 = npx 零安装 + 订阅焦虑真用例 + 扩展成 18 CLI 统一用量层。反面教材：作者只回一句「我是作者」，没接 Simon Willison 的 Deno 只读沙箱话茬——**安全话题是开发者工具评论区主战场，作者必须全程回帖**。
- **WakaTime**：留存本体是被动心跳追踪，wrapped 只当年度节点（12 月预告、1 月发布制造预期性回访）；没做分享卡——留存靠「档案自动变厚」不靠分享。gitrecap 从个人 wrapped 转型团队 standup 报告——转型本身就是「纯 wrapped 留不住」的供词。
- **hyperfine**：作者 2018 首发 126 分、2019 二发 96 分、2024 **他人**重投 241 分——利基 CLI 热度是复利不是闪电，第一次 flop 可以改完再发。
- **fzf**：官方 repo HN 279 分，第三方教程 1102 分——**利基工具最大流量来自用户替你写教程**，README 要给教程作者留钩子（截图、cheatsheet、可复制示例）。
- **lazygit**：r/webdev 与 Facebook 发帖无人问津，HN 随手发却上首页（评论区 git UI vs CLI 圣战吵出热度）；八年后仍有 436 分评测长文。星数第一梯队也养不起全职。

### 4.3 回顾型产品的留存分界
一次性时刻→回访只有两条可靠路径：
1. **数据积累改变下一次产出**：被动同步让明年的报告自动包含今年（DM 首页打开即自动增量同步，结构上已具备）；
2. **把时刻变成传播媒介**：分享带来拉新而非留存（DM 的导出 HTML 是天然媒介，历史上「愿意发给朋友」是唯一未过的门禁项）。
主动「欢迎回来看看」的召回在无云产品里不存在——这不是劣势，是结构优势：回访钩子只能是档案本身变厚 + 年度时刻。

---

## 5. PMF 假设与风险

### 5.1 DM 实际捆绑了两个价值主张，要分开验证
- **假设 A（情绪/叙事价值）**：「原来这一年我和 AI 做了这么多——全部真实发生」+ 值得分享的展览。季节性（12 月主场）、分享驱动、一次性浓度高。
- **假设 B（工具/档案价值）**：证据链存证、可追溯、防 30 天清理、Phase 2 的 skill 挖矿。全年性、被动积累、复访驱动。
- 【推断】市场数据显示 A 单独不成立（八年 20 次尝试全灭），B 单独面对的是 deja-vu/cass 等基建竞品的挤入。DM 的 PMF 最可能形态是 **B 做留存底座 + A 做年度收割与传播**。验证时应分别测：B → 30 天第二次同步率；A → 导出率与分享行为。

### 5.2 五个具体风险
1. **分发摩擦（最高）**：源码安装 vs 品类之王的 npx；受众相同、触达成本差一个数量级。
2. **大考未判定**：自家 n=1 的「愿意发给朋友」历史失败过一次，S5 之后未复测；外部验证前必须先走完。
3. **叙事层引力**：「加个 AI 摘要让展览更好看」的诱惑（会话文档 §6.4 已警告；claude-mem 93k 星证明那条路市场更大）——一旦滑坡，真实性契约与差异化同时消失。
4. **受众规模未知**：四产品严口径人群规模无数据；单产品用户是更大的池子（DM 的 pi/dsh 适配有 8 项目生态依托，但 claude-only 用户才是大盘）。
5. **变现天花板**：无云约束下合理预期是业余项目+中低回收（§0 第 5 条）；若 PMF 探索以收入为目标会系统性误导决策，应先明确目标是「被使用的证明」而非营收。

---

## 6. 度量设计：从门禁到 PMF 仪表盘

- **北极星**：30 天内第二次同步的用户比例（对应假设 B）。
- **辅助**：导出 ≥2 次占比；导出 HTML 的二次打开/分享行为（可在导出确认环节 opt-in 上报）。
- **Sean Ellis 改造版**：只对「完成过一次导出」的人发放；分母 = 最近 30 天有同步；本地工具 40% 很难，**30%+ 且「主要收益」答案收敛**（如「看见了看不见的工作量/身份叙事」）即为强信号。
- **星/下载解耦**：以脚本运行量与复跑率为准，星只当传播计数（v0.1:614 立场正确）。
- **遥测原则（若做，比 Next.js 更保守）**：默认关；用户**完成第一次导出后**一次性 opt-in（价值时刻请求）；只发 5-6 个计数字段（运行次数、事件数区间、导出次数、启用的适配器名、版本、OS）；绝不含路径/项目名/消息内容；字段清单写进 README；尊重 `DO_NOT_TRACK`；发送失败静默。反面前车之鉴：Homebrew 2016 默认开 GA 引爆 359 分社区反噬，2023 被迫迁移。**与「证据不出本机」立场对齐的最低配替代：README 里放手动反馈模板 + Issue 引导，先不做遥测。**

---

## 7. 待补充内容清单（按优先级）

### A. 产品收尾（PRD 范围内，先于一切外部动作）
1. **填写大考五个判定栏**（尤其第 5 项断网双击验证「愿意发给朋友」）——这是第一个 PMF 数据点，且是 S5 叙事层的复测。
2. **S6 评测基线重建**（backend/evaluation/ 已随通道清剿删除，AGENTS.md 承诺以会话数据重建）：参照 agent-sessions 的 Session-Bench 形态做 pass/fail 门。
3. **展示层信息层级 A 档改造**（产品文档 §4 已有完整方案待决策）：项目名做主标题 + 首条用户消息逐字引用做钩子 + 元数据行；零模型零迁移。
4. **首条用户消息的展示侧清洗**（产品文档 §5.2）：可能含路径/密钥/邮箱；清洗只影响展示副本不改 Evidence Blob；宁可隐藏不生成替代内容。
5. 人格化 archetype 标签的处置决策（标「趣味解读」或降级）。
6. 备份 archive-v3 的 UI 入口（低优先，API 已有）。

### B. 分发与首触（最大缺口，决定 PMF 探索能否开始）
7. **一行命令启动**：`npx digital-museum`（或等效单脚本，含 uv 前置检查）。这是品类之王验证过的第一传播因子。注意 package.json 当前 `private: true`。
8. **样例导出 HTML 挂 repo 当 demo**：无脚本自包含单文件意味着「样例即 demo」，是竞品没有的资产；用隔离样本数据生成并走完敏感扫描。
9. **VHS 式 demo GIF + README 即官网**：tape 脚本生成、CI 重建永不过期；给教程作者留钩子（fzf 教训）。
10. **Show HN（工程叙事）**：「deterministic / evidence chain / local-first / no model calls」而非情感叙事——后者八年全灭。作者全程回帖，预答「为什么不用云」；第一次 flop 改完再发（ccusage 三发才中）。
11. **awesome-claude-code 收录**（53,526 星，单一最高浓度入口）：硬规则 ≥14 天持续提交或 ≥100 星、一次一个、issue 表单——**清单是结果不是渠道**，先攒星。
12. **12 月「Year in Collaboration」发布活动**：回顾型内容的主场季；中文侧可同步知乎/即刻讲「数字遗产+确定性证据链」（HN 199 分情绪贴验证过的叙事）。
13. X / B站-知乎 中英双语 build-in-public：claude-hud/CodexBar 数据表明作者自有受众 > 平台冷启动。

### C. 度量与用户侧（外部验证开始时立刻需要）
14. 定 PMF 仪表盘指标（§6）+ 决定遥测最低配（手动反馈模板 vs opt-in 计数）。
15. **5-10 人用户访谈，问题频率优先**：「过去一个月你主动回看过几次自己的会话历史？为什么？」——三份既有调研全部是供给侧，需求侧访谈是最大增量空间（Superhuman 引擎 + Lenny「50% 时间花在客户身上」）。
16. Sean Ellis 改造问卷（完成过一次导出者）。
17. v0.1 §13.2 Private Alpha 目标复活评估（≥8 设计伙伴 / ≥3 位真实发布链接是最现成的外部验收框架）。

### D. 持续跟踪（低成本背景任务）
18. 既有调研五个未读线索（semantica / honcho / memvid / Memori / byterover-cli）+ TencentDB-Agent-Memory 深核。
19. agent-sweep 密钥检测规则集对照补全 DM 导出敏感扫描。
20. claude-mem / OpenMemory（转型会话搬运 CLI）——交集生态位变热闹的信号，每季复查。
21. OpenClaw 装机出现后按同一宪法接入（PRD 既定）。

---

## 8. 开放问题（本调研未回答）

1. **四产品严口径受众的实际规模**：没有任何数据源可回答；只能靠访谈与发布后的真实安装分布。
2. 「愿意发给朋友」在 S5 叙事层之后是否转好——待大考判定。
3. 分享回路的形态：本地分享海报已删、导出 HTML 默认不含证据链细节；若 12 月活动需要「可分享的统计卡」，重新立项的边界（无脚本契约、敏感扫描如何覆盖）待 PRD 决策。
4. 遥测做不做、做到什么程度——与「证据不出本机」立场的张力需要用户裁决（本报告只给两侧方案）。
5. 中文受众 vs 全球受众的优先序（README 当前中英混排、提交信息中文）。
6. 会话文档 §3.5 遗留：「生态位空着是因为反捷径，还是因为需求本身不成产品」——本调研给出的是**两侧证据都有**（cc-wrapped 的存在 + 八年 20 次失败），最终判定要靠 DM 自己的发布数据。

---

## Sources

方法与框架：
- https://www.startup-marketing.com/when-should-a-startup-start-charging/ （Sean Ellis，40% 定义）
- https://www.startup-marketing.com/the-startup-pyramid/
- https://review.firstround.com/how-superhuman-built-an-engine-to-find-product-market-fit/ （Rahul Vohra，2018-11）
- https://www.lennysnewsletter.com/p/finding-product-market-fit （Lenny Rachitsky，2023-09-12）
- https://jesseduffield.com/Lazygit-5-Years-On/ （lazygit 五年复盘）
- https://www.scalefactory.com/blog/2021/03/03/optimising-for-mean-time-to-hello-world-considered-harmful/
- https://nextjs.org/telemetry ；https://docs.brew.sh/Analytics ；https://news.ycombinator.com/item?id=11566720 （遥测正反例）
- https://news.ycombinator.com/showhn.html

市场数据（2026-09-05 快照）：
- https://api.github.com/repos/ryoppippi/ccusage ；https://api.npmjs.org/downloads/point/last-month/ccusage ；https://hn.algolia.com/api/v1/items/44610925
- https://api.github.com/search/repositories?q=claude+code+usage ；q=claude+code+session+history
- https://hn.algolia.com/api/v1/search?query=github+wrapped&tags=story ；query=spotify+wrapped / wakatime / rewind.ai / digital+legacy
- https://api.npmjs.org/downloads/point/2025-12-01:2025-12-31/@spader%2Fclaude-wrapped ；…/last-month/…
- https://wakatime.com/ ；https://wakatime.com/blog/70-wakatime-2025-wrapped ；https://news.ycombinator.com/item?id=15593589 ；item?id=43469783
- https://api.github.com/repos/mediar-ai/screenpipe ；https://api.github.com/repos/ActivityWatch/activitywatch
- https://api.github.com/repos/getAsterisk/claudia （现 winfunc/opcode）；AlmanacCode/codealmanac；sudomichael/agentgraphed
- https://gitrecap.com ；https://yearincode.xyz ；https://spader.zone/wrapped/
- https://github.com/hesreallyhim/awesome-claude-code ；CONTRIBUTING.md
- https://wakatime.com/blog/69-get-ready-for-your-yearly-wrapped-code-stats

变现案例：
- https://dev.aseprite.org/2016/09/01/new-source-code-license/ ；https://github.com/LibreSprite/LibreSprite ；https://git-fork.com/
- https://plugins.jetbrains.com/docs/marketplace/paid-plugins.html ；https://www.remotion.pro/license ；https://www.nabucasa.com/

项目内文档（一手）：
- docs/prd/digital-museum-prd-v0.3.md（及 v0.1/v0.2 沿用条款）；docs/adr/0001、0002
- docs/gate/real-data-exam-2026-08-24.md、real-data-exam-2026-08-25-v0.3.md（含 08-27 机器附录）
- README.md；docs/technical-adaptation.md；docs/optimization/worklog.md
- 同目录：agent-memory-github-projects-research-v0.1.md、agent-sessions-github-projects-research-v0.1.md、memory-products-organization-research-v0.1.md（本报告 §2 为其提炼，明细见原文件）
