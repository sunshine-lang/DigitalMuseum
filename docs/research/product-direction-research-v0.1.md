# 产品方向调研：会话档案产品怎么做 v0.1

- 调研/访问日期：2026-09-07
- 研究问题：Digital Museum 这个方向，产品具体应该怎么长？功能往哪做、节奏怎么排？
- 方法：三路并行——① 需求侧：英文社区（Reddit/HN/博客/issue）对会话历史的真实诉求（jobs-to-be-done）+ 中文留痕生态（42k star）用户用它干什么；② 回访设计：七个「被动积累+低频收割」产品（WakaTime/Photos Memories/1SE/Day One/Chatbooks/Storyworth/GitHub 热力图）的机制卡片 + 无云本地工具的回访先例（Anki/habitctl/org-habit）；③ 功能菜单：相邻工具受欢迎功能的确定性平移清单 + 「年度协作报告」的页面结构设计。
- 证据纪律：沿用同目录口径，星数与日期并置、事实与【推断】分开、一手优先。Reddit 正文不可直抓的条目均标注为快照证据。

---

## 0. 结论先行

**产品思路一句话：做成「三个时间尺度」的循环——每天自动攒（已有）、每周/每月给小回报（缺）、每年办一次大展（已有雏形）。**

1. 需求侧三条最强主线里，**「回顾/年报/展示」与展览导出形态天然咬合**且被三路独立验证（Anthropic 官方 reflect 访谈实录、中文留痕生态 42k star 的旗舰功能就是年度报告、英文 VP 强制 Claude Code 周报的制度实录）；「检索找回」需求最大但供给也最多（10+ 工具、官方在补课）、窗口在收窄；「用量成本」已被 ccusage 饱和供给。**差异化位置就在回顾/展示+证据链，不在检索和用量。**
2. 回访设计的最被验证组合（跨 13 年、多产品独立收敛）：**日常「积累条」+ 保守默认的周期小收割 + 年度仪式**。三个设计铁律：要积累感不要连续压力（GitHub 2016 官方删 streak 计数、保留热力图的理由原文："focuses on the work you're doing rather than the duration of your activity"）；留存钩子永不设墙（WakaTime/Day One 同构）；默认保守、可跳过、跳过不清零（1SE 十四天不用自动停提醒、Chatbooks credits）。
3. 无云限制有成熟先例可变优势：Anki 的「缺席可视化」（积压曲线是界面元素）、habitctl/org-habit 的「回访面寄生在用户每天本来要开的界面」、WakaTime 状态栏。对应 DM 的落地：**首页近 30 天格子条（要图不要计数）+ 打开即同步（已有）+ 月度静态页收割（静默生成、打开才见）**。
4. 年报「Year in Collaboration」的 10 页结构已可直接实施（§4），全部用已有确定性读数，无脚本单文件契约不破；打印即 PDF（`break-after: page`）免费得到可打印版。
5. PRD Phase 2 的 skill 挖矿拿到了正确产品形态的参照：SpecStory /lore 的 **Mine→Prove→Forge** 三步（「候选由你实际跑过的东西背书」「人工签收后才写入」）与「模型永不出 verified」契约完全同构——DM 的确定性频次统计就是 Mine 层。

---

## 1. 需求侧：用户拿会话历史干什么（JTBD 清单）

按证据强度排序（star 数均为 2026-09-07 GitHub API 实测）：

| # | 诉求 | 强度证据 | 与 DM 的关系 |
|---|---|---|---|
| 1 | 跨项目/跨时间检索（「上周二那次重构」） | 自建工具潮 10+；claude-code-history-viewer 2,139★；商业品（LLMnesia/Contextify）；原话："finding past sessions is terrible... you're out of luck" | 需求真实但供给最多；官方 --resume 在补课。【推断】纯检索窗口收窄，不建议当主轴；档案库天然含检索地基（FTS5 阶梯见记忆基建调研） |
| 2 | 用量/成本对账 | ccusage 18,404★ | 已饱和，非差异化方向；且 token 口径超出档案馆只读边界 |
| 3 | **「我干了什么」回顾报告** | Anthropic 官方 reflect（2026-07，访谈验证并产品化）；HN 实录「VP 强制全员装 Claude Code 并写周报+token 排行榜」；Claude Wrapped 独立复现 | **DM 的主战场**；官方只做云端聊天侧且排除 Claude Code（见竞品调研 §2.3） |
| 4 | 找回丢失会话 | Reddit 最高频帖类 | 官方已部分满足；DM 的持续档案库是结构解 |
| 5 | 团队知识/站会/交接 | Dexicon 已有付费客户；gitglimpse 无 LLM 站会笔记；HANDOFF.md 惯例 | 违背单用户边界不追；但「周报底稿」可确定性做（gitglimpse 先例） |
| 6 | 跨 Agent 统一历史 | Contextify（"rate limit 用完就切另一个工具"是常态混用） | DM 四适配器的前提被需求侧确认 |
| 7 | 简历/作品集证据 | HN 求职帖已把 Claude Code/Codex 写进技能栏；反信号「vibe coding 上简历被嘲」 | 【推断】可导出展览=可展示的证据物，与「AI 协作宣称需要背书」咬合，小众但独特 |

### 留痕生态（中文最大已验证需求池）
- WeChatMsg 42,037★（停更，旗舰功能年度报告移交继任项目 TrailSnap）、WeFlow 14,170★（遭 DMCA）、chatlog 9,190★、ChatLab 7,320★、echotrace 3,796★。
- 用户用途排序（证据：README 结构/后继项目公约数/roadmap）：**①年度报告（全生态旗舰）②数据导出备份 ③统计可视化与词云 ④记录还原浏览 ⑤AI 深度分析（导流 ChatLab）⑥「数据主权/情感留存」叙事内核**。
- AnnualReport 模板（LC044，363★）实测 10 页结构：欢迎→总览数字→时段分布→词云→情绪→月度好友→好友→年度好友→结语卡；双人版含日历热力页。
- 平移映射（【推断】）：好友榜→项目榜/Agent 产品榜、时段分布→会话热力图、词云→高频指令短语榜（n-gram，标准库可做，避免 jieba 依赖）、「我的数据我做主」→会话转录所有权叙事直接复用。情绪分析需模型，只能进 candidate 层。

## 2. 回访设计：机制卡片精要

| 产品 | 节奏 | 可抄的机制 | 关键取舍 |
|---|---|---|---|
| WakaTime（13 年，50 万用户） | 状态栏实时→周报→付费日报→年度 Wrapped | **被动采集+状态栏常驻读数**（回访面寄生在每天必开的编辑器）；「存永远免费、看历史付费」 | 留存钩子永不设付费墙；无 streak 功能 |
| GitHub 热力图 | 每日一格全年可见 | 积累的图 | **2016 官方删除 streak 计数**："focuses on the work... rather than the duration"——要积累感不要连续压力 |
| Apple/Google Photos | 每天重组 Memories，通知克制且全量可关 | 供给侧每天换、通知侧少而可关；过滤痛苦记忆 | 防刺痛设计 |
| 1SE | 每日提醒（窗内随机）→月度剪辑→年度电影 | **拍完即静默；14 天不用自动停提醒**；日历格子让攒可见 | 把「断签惩罚」换成「又攒下一格」 |
| Day One | 提醒+prompt+streak+On This Day | streak 断了可**回填复活** | 习惯层全免费 |
| Chatbooks | 月度照片书订阅 | **跳月不清零**（credits） | 年度纪念品→月度期待 |
| Storyworth | 每周一问→年末成书 | 默认压到最低频 "to avoid overwhelming people"；**印书由用户手动触发** | 与 DM「导出需勾选确认」同构 |

**无云本地工具的回访先例**：Anki（积压曲线=缺席有形状）、habitctl（终端 streak 图，豁免是一等公民）、org-habit（织进 agenda）、WakaTime 状态栏。共同原语：**常驻读数（ambient surface）+ 缺席可视化 + 收割 CLI 化**。macOS launchd + terminal-notifier 可做无服务器的本地月度提醒（公知机制，未逐字核验）。

**最被验证的组合**：GitHub 式积累条（日常）+ Storyworth/Google 式保守小收割（周/月）+ WakaTime 式年度仪式（年）。年度层永远寄生在「随时可看的仪表」之上，不独立存在——与 PMF 调研「Wrapped 八年 20 次全灭」的结论互为印证。

## 3. 功能菜单（确定性可平移，按建议优先级）

| 功能 | 来源与证据 | 确定性 | 优先级建议 |
|---|---|---|---|
| 首页近 30 天格子条（要图不要计数） | GitHub 热力图 13 年原语 | ✅ 纯展示 | **高**（便宜、天天可见） |
| 周/月聚合视图 + `--json` | ccusage 四报告形态 | ✅ | 高（周报底稿=gitglimpse 先例） |
| 证据抽屉 detail 分级（full→user-only） | claude-code-log 五级 1,209★ | ✅ 渲染策略 | 高（直接强化 S5 抽屉） |
| 月度回顾静态页（静默生成，打开才见） | Storyworth 保守默认+1SE 静默 | ✅ 复用导出管线 | 中高 |
| 年度报告 10 页（§4） | GitHub Unwrapped+AnnualReport 形态 | ✅ | 高（12 月主场） |
| 高频指令短语榜（n-gram）→ skill 候选入口 | 留痕词云文化+SpecStory /lore 的 Mine 层 | ✅ 频次统计 | 中高（PRD Phase 2 的确定性前身） |
| 热力图（24h×12 月）、深夜占比 | AnnualReport/EchoTrace | ✅ CSS grid | 中 |
| 分享票根/徽章（静态 SVG） | make-a-wrapped（Last.fm 生态收录）、streak-stats 7,126★ | ✅ 静态产物 | 中（分享海报已删，重启需另立阶段评估） |
| streak 读数 | streak-stats 文化 | ⚠️ 可做但**不建议显式计数**（GitHub 删除先例），用格子图表达 | 低 |
| 语义检索/AI 摘要/情绪 | ccsearch/ChatLab | ❌ 模型层，将来只能 candidate | — |
| 团队共享/云端对比/成本核算 | Dexicon/Claude Wrapped/ccusage | ❌ 违背边界 | — |

确定性趣味读数菜单（Last.fm 榜单文化同构）：最长寿项目、凌晨最晚一条消息原文、协作元年至今第 N 天、「协作人格」（规则透明+页脚注明非 AI 解读）。

## 4. 年报「Year in Collaboration」10 页结构

| 页 | 内容 | 用哪些已有读数 |
|---|---|---|
| 1 开馆 | 「你与 AI 协作的第 N 天」+年份 | 日期跨度 |
| 2 总览大数字 | 天数/事件/会话/消息/项目/产品数 | 全部已有 |
| 3 协作热力 | 24h×12 月网格+深夜占比 | 会话时间戳 |
| 4 最活跃的一天 | 当天事件+**首条用户消息原文**（带证据锚） | 按天事件 |
| 5 项目榜 | Top5+最长寿项目 | source_key+日期 |
| 6 Agent 家族分布 | 四产品份额展柜 | origin 白名单 |
| 7 年度第一条消息 | 逐字 epigraph+哈希（最「档案馆」的一页） | 首条真实用户消息 |
| 8 连续协作 | 用脊线/格子表达，不显式计数 | 按天事件 |
| 9 脊线编年 | 365 天微缩时间线收尾（复用 S5 视觉） | 全年事件 |
| 10 馆藏票根 | 单屏分享卡+`@media print` 一页纸 | 全部 |

无脚本可行性：scroll-snap 翻页、`radio/:checked` 选项卡、CSS grid 热力图、动画只用 transform/opacity+reduced-motion（沿用 S5 约定）；**打印即 PDF**（`break-after: page`）；首条消息上墙扩大泄露面——敏感扫描规则必须覆盖（联动 gitleaks/agent-sweep 规则补全，见竞品调研 §4-B）；分享卡默认不含本机路径；页脚放「读数口径」脚注（verified 读数 vs 规则分类）。

## 5. 产品路线建议（与 PMF 调研 §7 合并后的顺序）

1. **大考判定走完**（不变的第一步，含断网双击验证导出物）。
2. **积累可见**：首页 30 天格子条——数据已有、纯展示、一次切片可完成；这是「档案变厚」从看不见到看得见的最小改造。
3. **分发修复**（PMF 报告 B 档）：npx 一键启动+样例导出 HTML 挂 repo+VHS demo。
4. **周报底稿 + detail 分级**：确定性周报（「本周在 X 项目与 Claude Code 协作 N 天」）与证据抽屉分级，同批落地。
5. **12 月年报**：按 §4 结构实施，作为年度主发布；打印即 PDF 免费送。
6. **skill 挖矿 Phase 2**：高频指令短语榜做入口，/lore 的「候选+证据档案+人工签收」做交互范式。
7. 持续：敏感扫描规则对照 gitleaks/agent-sweep 补全（首条消息上墙前完成）。

## 6. 开放问题

1. 「协作人格」页做不做（规则透明也仍有人格化风险，与 narrative.ts archetype 处置决策联动）。
2. 分享票根重启的边界（无脚本契约内可做静态 SVG，但海报功能当年删除的理由是否仍然成立）。
3. 周报形态：CLI stdout 表格（管道友好）vs 静态页 vs 两者。
4. 月度回顾页的存放与索引（本地文件系统约定）。
5. 简历/作品集场景是否值得单独叙事（面向求职的开发者子人群）。

## Sources

需求侧：HN item 48545313（Token Analyzer）、46859110（VP 周报实录）、48777790（Contextify）、46782835（Dexicon）、47927788（gitglimpse 无 LLM 站会）、49538874/49252734（求职帖）、43555955（vibe coding 反信号）；anthropic.com/news/reflect-with-claude；github.com/jhlee0409/claude-code-history-viewer（2,139★）、madzarm/ccsearch、sinzin91/search-sessions、kamranahmedse/claude-run、anthropics/claude-code issue #28180；Reddit 快照 1l89pgp/1tis1bd/1th38n9/1tjzzoo；留痕生态 LC044/WeChatMsg（42,037★）、LC044/AnnualReport（10 页结构读自源码）、hicccc77/WeFlow（14,170★，DMCA）、sjzar/chatlog、ChatLab/ChatLab、ycccccccy/echotrace。

回访设计：wakatime.com（pricing/goals/faq/about/blog 29）、vscode-wakatime README（状态栏）；freecodecamp.org（GitHub 2016 删 streak+官方引语）；tidbits.com（Featured Photos/锁屏频率）、theverge.com（通知关闭）、androidcentral.com（Google 频率可调）；help.1se.co（随机窗/拍后静默/14 天衰减）；dayoneapp.com（streak 回填/plans）；help.chatbooks.com（Monthbooks/credits/手动印制）；welcome.storyworth.com（周问/不自动印书）；docs.ankiweb.net/stats（Future Due）；github.com/blinry/habitctl；orgmode.org/manual/Tracking-your-habits。

功能与年报：github.com/ccusage/ccusage（18,404★）、daaain/claude-code-log（detail 五级）、specstory.com/lore+getspecstory（1,325★）、entireio/cli（5,072★，Thoughtworks Radar）、vshulcz/deja-vu（785★）、remotion-dev/github-unwrapped（Main.tsx 场景序）、DevMatei/make-a-wrapped（ListenBrainz 收录）、DenverCoder1/github-readme-streak-stats（7,126★）、anuraghazra/github-readme-stats（79,851★）、kinduff/year-in-pixels；未能核验仅存线索：Spotify Wrapped 官方页、网易云年报、skyline.github.com、yearcompass.com。
