# 直接竞品核验与可借鉴完成度参照调研 v0.1

- 调研/访问日期：2026-09-06
- 研究问题：① 截至 2026-09-06，有没有人在做 Digital Museum（DM）这件事——把 AI 编码 Agent 会话变成**面向人的档案/叙事/展览**？② 哪些**已经做完、工程成熟**的项目可以按组件直接借鉴？
- 方法：三路并行——① 对短名单竞品逐个经 GitHub REST API / npm registry / HN Algolia 当日实测核验（星数、最近推送、实际输出形态、六要件对照），并增量搜索 2026-08 之后的新入场者；② 商业消费市场（聊天记录→纪念品、AI 回忆录、中文生态）的需求验证证据；③ 按 DM 的五个组件（单文件 HTML 工艺 / 敏感扫描规则 / 转录渲染 / Wrapped 设计 / 发布物料）找成熟参照。
- 去重基线：同目录 agent-memory / agent-sessions / memory-products 三份调研 + pmf-validation（2026-09-05）已覆盖约 70 个项目，本报告只做增量与深核，不重复铺量。
- 证据纪律（沿用同目录口径）：星数与推送日期并置；来源事实与【推断】分开标注；营销口号不当已验证效果引用。

---

## 0. 结论先行

1. **截至 2026-09-06，公开生态中没有任何项目在做 DM 的完整组合。** 连核心三件套「确定性提取 + 证据链 + 面向人展览」同时满足的项目都不存在。DM 的六要件矩阵仍无对应物。
2. **最重要的新发现：shatzibitten/codepend（2026-08-18，4★，npm 月下载 572）**——确定性✅、三工具聚合（Claude+Codex+Cursor）✅、面向人的故事化单文件 HTML✅、引用「原始瞬间」◐、默认脱敏。它是目前**最接近 DM 的项目**（下载/星数比异常健康，说明有真实使用），离 DM 差 3.5 步：幂等档案库、哈希锚定证据链、信任分级、策展升级。**这是 DM 唯一需要盯防的对象。**
3. **Anthropic 官方已下场「回望 AI 使用史」但把 DM 的位置留空了**：2026-07-09 上线 reflect 反思仪表盘（Verge 戏称 Claude Wrapped），但①只覆盖 Claude 聊天云端数据，**官方文档明确排除 Claude Code 活动**；②承认「偶发不准确」无核对机制；③社区给 anthropics/claude-code 提的 year-in-review 请求（issue #15367）被官方 close as not planned。官方入场验证了品类，官方不做 = DM 的结构性空位。
4. **「把对话变成纪念品」是被多国市场十年验证的付费品类**（Storyworth $59-199/年订阅、zapptales €34.9+、Chatbooks 融资 $21.9M、淘宝聊天书 ¥88-358 稳定销量）——但**全部付费先例的对话对象是人**；「与 AI 的对话」尚无付费纪念品先例，只有反复自建 wrapped 工具的长尾尝试（HN 两年 ≥8 个，全部个位数星）。
5. **中文世界最大的需求信号在微信侧**：WeChatMsg/留痕 42,032★、WeFlow 14,154★（活跃）、EchoTrace 3,796★（停更但 README 是一篇需求宣言）、ChatLab 7,317★（活跃）——「本地处理聊天数据生成回顾」在中文用户中被反复验证接受。它们与 DM 数据源/人群不同不构成竞争，但证明了同一情感需求的最大样本。
6. **可借鉴的成熟件全都在、且几乎全是 MIT/Apache**：gitleaks（29,127★，222 条规则五元组，规则文本可直接抄）、claude-code-log（1,209★，五级信息密度+`<details>` 折叠）、speedscope（6,740★，file:// 自包含发布管线）、Telegram 官方导出（无 JS 聊天排版的工业天花板，~1000 条/文件分块）、star-history（分享卡+双主题嵌入）、VHS（确定性 demo GIF）。明细见 §4。

---

## 1. 直接竞品判定（六要件对照，2026-09-06 当日实测）

六要件：①多工具会话聚合 ②确定性提取（无 LLM）③分级信任/来源标签 ④证据链（原文锚点回溯）⑤持续档案库（增量幂等）⑥面向人的叙事/展览输出。

| 项目 | ① | ② | ③ | ④ | ⑤ | ⑥ | 状态（星/最近推送） | 本质差异一句话 |
|---|---|---|---|---|---|---|---|---|
| **codepend**（8 月新） | ✅ Claude+Codex+Cursor | ✅ 纯统计 | ✗ | ◐ 摘录引用无哈希 | ◐ 扫描缓存非档案库 | ✅ 单文件 HTML 相册+故事页 | 4★ / 2026-08-18；npm 月下载 572 | **最接近 DM**：有故事感但骨相是 Wrapped 数据卡 |
| mentor | ✅ Claude+Codex | ◐ 计数确定、叙事由 LLM 写 | ✗ | ◐ LLM 挑选的 evidence 引用 | ✗ 一次性报告 | ✅ 自包含 report.html | 77★ / 08-08（静默 4 周） | 它是「教练」不是档案：告诉你哪里低效、给 CLAUDE.md 补丁 |
| claude-code-log | ◐ Claude 为主 | ✅ | ✗ | ◐ 全文可读 | ◐ watch 模式 | ◐ 可读但零策展零聚合 | 1,209★ / 09-01（活跃，v1.6.0） | 转录阅读器，工业级但无事件化 |
| deja-vu | ✅✅ 23 个 harness | ✅ | ✗ | ✗ | ✅ 持续索引+SSH 同步 | ✗ 召回喂回 agent | 780★ / **09-06 当日仍在推送**（30 天 100 commits） | **方向相反**：记忆给 agent 消费，明确不做人的呈现 |
| agentgraphed | ✅ | ✅ | ✗ | ✗ | ✅ SQLite 留存 | ✗ 仪表盘+续聊 | 49★ / 07-02（静默 2 月） | 有档案库骨架，止步于查找与续用 |
| codealmanac | ◐ | ✗ agent 写 wiki | ✗ | ✗ | ✅ 5h 定时 | ✗ wiki 供 agent 检索 | 993★ / 07-25（静默 6 周，YC S26） | 生命周期反了：消费会话产代码库知识 |
| clawd-insights | ✅ | ✗ 周报由本地 LLM 生成 | ✗ | ✗ | ◐ | ◐ 仪表盘非展览 | 42★ / 08-26（活跃，AGPL） | 记录-回放仪表盘，叙事是模型周报 |
| emulo | ✅ | ✗ | ◐ 空方法学 | ◐ | ✗ | ✗ you.md 给 agent 读 | 288★ / 08-24（活跃，MIT） | 挖会话为改造 agent 行为 |
| cc-wrapped | ✗ 仅 Claude | ✅ | ✗ | ✗ | ✗ | ◐ PNG 数据卡 | 87★ / 2025-12-26（休眠 8.5 月，npm 月下载 23） | 纯年度数据卡，已死 |
| opcode（原 claudia） | ◐ | ✅ | ✗ | ✗ | ◐ | ✗ | 22,393★ / **2025-10-16（休眠 11 个月）** | 22k 星化石，从无档案/叙事意图 |
| **Anthropic reflect**（官方） | ✗ Claude 聊天云端 | ✗ | ✗ | ✗ 明确只高层级引用 | ✅ 云端持续 | ◐ 仪表盘+反思问答 | 2026-07-09 上线，beta | 平台方做云端行为塑造，非本地档案与导出 |

**判定**：六要件全绿的一列仍不存在；「确定性+证据链+面向人」三件套同时成立的也没有。生态 2026-08 明显升温（至少 6 个新入场者），但全部落在两个已有象限：**给 agent 喂记忆**（deja-vu/emulo/codealmanac）或 **Wrapped 式一次性数据卡**（codepend/cc-wrapped 系）。「持续档案库+分级信任+证据锚定+策展叙事」象限仍空。

### 1.1 其他 8 月新入场者（简记）
- coding-wrapped（5★，08-13）：像素风仪表盘+「你做了/agent 做了/你的风格」洞察卡，有「成为什么样的 builder」叙事苗头，但是 agent 技能包不是档案系统。
- ai798-Lab/jing·镜（1★，08-05）：每月一次「谥号」式人物志，叙事最浓但全由 LLM 书写——是判词不是档案，证据链是修辞不是锚点。
- BigKunLun/AI-Coding-Insights（5★，08-18，中文）：「使唤 AI 还是共创」画像测试，LLM 分析，报告活一次。
- ChrystianSchutz/ThreadShelf（5★，08-22）：跨 ChatGPT/Claude/Gemini 等聊天侧（非编码 Agent）归档检索，embedding 搜索。
- 另有 agent-retro、opencode-wrapped、ccvault 等线索级新项目。

### 1.2 高势能项目近一月动态
- **deja-vu**：9 月连发 v0.19.0→v0.19.3+nightly，30 天 100 commits 全部用于给更多 harness（VS Code Copilot Chat、Cline、pi、dsh）布线召回通道——无任何面向人的路线迹象。增长引擎是 2026-07-15 HN 帖（131 分）。【推断】其定位（召回基础设施）使其不会做展览，与 DM 平行不竞争，但其适配器覆盖面（23 harness）值得跟踪其格式解析件。
- **claude-code-log**：反常活跃，v1.6.0（08-31）加 watch 模式、archive search server、Codex 全模态渲染——在向「会话档案阅读器」稳态演进，仍无聚合/叙事层。
- **opcode**：确认深度休眠（最后 commit 2025-10-16），22k 星是存量不是流量。
- **codealmanac**：静默 6 周，版本 bump 未发 release。【推断】YC 公司重心可能转移，未证实。

---

## 2. 商业消费类比与需求验证

### 2.1 「人际对话→纪念品」是已验证的付费市场（事实）
| 产品 | 形态 | 定价 | Traction |
|---|---|---|---|
| Storyworth | 每周邮件提问→年末精装书 | $59/$109/$199 年付 | 老牌品类龙头，持续运营 |
| Chatbooks | 照片/短信→订阅相册书 | $10 起，订阅 $15-45/月 | 融资 $21.9M，App Store 4.7（2.2k 评分） |
| zapptales（德） | WhatsApp/Telegram→实体书 | PDF €16.9 起，实体 €34.9+ | 运营中，多语言；德国本地印刷 |
| MySocialBook | 社交/聊天记录→书 | $12-15 起 | Trustpilot 4.7（约 2,485 条评价） |
| Remento | 亲人语音→Speech-To-Story→书 | $99 | 融资 $3M |
| 淘宝定制聊天书 | 微信/QQ 聊天→纪念册 | ¥88-358 | 2026-08 榜单仍有 47 个商品，单品已售 100+ 件 |
| （免费参照）网易云年度报告 | 平台官方回顾 H5 | 免费 | 2017 起每年刷屏；2025 年用户因统计口径质疑上新闻——**用户在乎回顾数据准不准** |

**边界（推断）**：全部付费先例的对话对象都是人（伴侣/家人）；购买动机是礼物场景+亲密关系+实体物。「与 AI 协作的对话」目前只催生了免费/开源工具。DM 免费开源进入不与任何付费玩家正面冲突；实体印制链（拿导出 HTML 找商家印书）未来可接按需印刷，完全互补。

### 2.2 AI 回忆录产品：市场存在、信任缺口也存在（事实）
- Autobiographer（iOS，$16/月或 $99/年）：AI 语音访谈生成回忆录；App Store 4.1 但仅 52 个评分（traction 弱）；幻觉处理 = 人工「确认准确或编辑」摘要，无逐字锚定。
- Memoirist.ai、Memoir.bot、StoriedLife 等全家桶（$49 买断～$129.95/年）：均无公开准确性机制。
- **Anthropic 官方每月回顾**：官方 FAQ 承认「比例或叙述摘要中可能会出现偶发的不准确」，仅点踩反馈；明确排除 Claude Code 与 Cowork 活动。
- 【推断】这批产品证明「自动生成人生叙事」有付费意愿，但信任处理最高只到「人工确认」——DM 的「确定性读数+Evidence Blob 锚定」是独一档立场，是**反面教材+差异化叙事素材**，不是竞品（客群不同）。

### 2.3 中文社区信号（按强弱）
- **强**：微信聊天记录回顾是中文世界最大的「对话数据→回顾」需求池——WeChatMsg/留痕 42,032★、WeFlow 14,154★（活跃）、EchoTrace 3,796★（停更，README 是「我们总是在向前走，却很少有机会回头看看」的需求宣言）、ChatLab 7,317★（本地优先，吃八种导出，阮一峰周刊推荐）。
- **中强**：Agent 会话回顾是开发者重复性自发行为——HN 两年 ≥8 个独立 wrapped 尝试（全部个位数星）+ Reddit r/ClaudeAI 多个「我给 Claude 做了 Wrapped」帖。单项目都不成气候，正说明缺一个做对的常驻工具。
- **强**：厂商验证+留空——Anthropic 官方入场回顾功能但排除 Claude Code，且 close 了社区的 year-in-review 请求。
- **弱**：中文 Claude Code 讨论集中在「怎么用」（得物/53AI/个人博客），未见「留存协作历史」讨论——中文 Agent 开发者侧的档案叙事还是空白话题（也是首发机会）。
- 不可核验：即刻（内容不被搜索引擎收录）、Gitee（无显著发现）。

---

## 3. （并入 §1/§2）

## 4. 组件级可借鉴清单（已做完的成熟项目）

### A. 无脚本/单文件 HTML 生成工艺 —— 最佳参照：speedscope（工艺）+ Telegram 导出（排版）
| 项目 | 成熟度 | 具体抄什么 | 许可证 |
|---|---|---|---|
| speedscope | 6,740★，v1.25.0，MIT | `generateIndexHtml()` 构建注入管线（esbuild metafile 收集后模板注入，非字符串拼接）；`servingProtocol: 'file'` 显式区分（file:// 下禁 module script 的坑）；prepack/prepare-zip 发布流水线；release.txt 记录构建 commit | MIT 可抄代码 |
| **Telegram 官方导出** | 10 亿级用户产品的官方产物 | 每分块文件自包含、CSS 全内联；**~1000 条消息/文件**的分块工业标准；`.from_name`/`.text`/`.date` 语义 DOM + title 悬浮；索引页→子目录结构 | 格式可借鉴 |
| go tool cover / pytest-html | Go 官方 / 779★，MPL-2.0 | 单文件 MB 级 HTML 报告的日常先例；pytest-html `--self-contained-html` 的「图片不内联且主动告警」取舍文档 | BSD / MPL（文件级 copyleft，抄思路） |
| pico / simple.css / water / mvp / sakura | 4.4k-16.8k★，全 MIT | classless 语义化排版基线、`:root` CSS 变量分主题、`prefers-color-scheme`、打印媒体查询 | MIT |
| pagedjs | 1,492★，MIT | `@page` 边距盒、页码计数器、孤行寡行——DM 展厅分页叙事的 CSS 技法目录 | MIT |
| You-Dont-Need-JavaScript | 20,571★ | `:target`/`:checked` 纯 CSS 交互目录（无 JS 抽屉/手风琴） | 示例各异，借鉴 |

体积结论：无项目公开单文件体积预算文档，但 go cover/pytest-html 在 MB 级是日常；DM 几十张卡+引文（纯文本无 base64）落在先例区间，瓶颈是 DOM 渲染非体积。可抄手法：CSS 只写一次置顶+每卡文本截断上限+引文长度上限。

### B. 敏感信息扫描规则集 —— 最佳参照：gitleaks（+ agent-sweep 补会话特有模式）
| 项目 | 成熟度 | 具体抄什么 | 许可证 |
|---|---|---|---|
| **gitleaks** | 29,127★，v8.30.1，MIT | **222 条规则五元组**（id/description/regex/entropy/keywords）；keywords 预筛+全局与规则级双层 allowlist+stopwords；`.gitleaksignore` 指纹文件（`commit:file:rule:line`）=「人工确认后放行」的持久化形态；baseline 机制（旧 finding 不重复报）；配置可 extend | **MIT，规则文本可直接抄** |
| detect-secrets（Yelp） | 4,631★，Apache-2.0 | baseline 三态工作流 scan→audit（人工逐条标真假阳性）→hook 只拦新增——与 DM「命中必须人工逐项确认后才落盘」几乎同构 | Apache-2.0 可抄 |
| agent-sweep | 77★，MIT，活跃 | 同域（扫 `.claude`/`.codex` 史）：207 条正则 = 20 手写 + 187 条映射自 gitleaks，**有 CI 跟踪与上游规则的漂移检测**；会话特有模式（BIP-39 助记词+校验和防误报、curl 凭据形态）；redact 的字节级安全工程 | MIT 可抄 |
| Presidio | 10,758★，MIT | **邮箱/电话/人名 PII recognizer**（正则+校验函数+置信度分级）——gitleaks 无邮箱/路径规则（实测确认），DM 邮箱扫描的最成熟来源 | MIT |
| truffleHog | 27,697★ | 验证式扫描（命中→联网验证 key 有效性）；「检测器声明所需权限」的元数据设计 | **AGPL-3.0，禁抄代码** |

注意：本机路径（`/Users/`、`/home/`、`~`）在任何扫描器中都无现成规则，需自写；邮箱降误报用 Presidio 式校验器（TLD 白名单+排除 noreply/example.com）。

### C. 会话转录→HTML 渲染 —— 最佳参照：claude-code-log
| 项目 | 成熟度 | 具体抄什么 | 许可证 |
|---|---|---|---|
| **claude-code-log** | 1,209★，MIT，周级活跃 | **`--detail full/high/low/minimal/user-only` 五级信息密度 + `--compact` 折叠重复段**（DM 证据引文分级可直接照搬概念）；服务端 markdown 渲染+代码高亮（无 JS 渲染侧参考）；**`<details>` 原生折叠**（DM 无 JS 证据抽屉可用）；项目→索引→会话导航结构 | MIT 可抄 |
| simonw/claude-code-transcripts | 1,683★，Apache-2.0 | `index.html` = prompts+commits 时间线（与 DM 档案时间线同构的现成实现）；多页分页；`--gist` 一键分享 | Apache-2.0 |
| DiscordChatExporter | 11,946★，MIT | 聊天 HTML 模板：双主题、按日期分组、角色引用样式、**媒体 base64 内嵌单文件**的体积策略（将来嵌证据缩略图时参照） | MIT |
| Telegram 导出 | 工业级 | 角色气泡视觉、日期分隔行、print 友好排版 | 格式借鉴 |

### D. Wrapped/年报设计 —— 最佳参照：star-history（代码）+ GitRecap（指标规格）
| 项目 | 成熟度 | 具体抄什么 | 许可证 |
|---|---|---|---|
| star-history | 9,453★，MIT | 分享图端点+`sealed_token` 防滥用；**README `<picture>`+`prefers-color-scheme` 双主题嵌入范式**（DM 海报/分享卡双色方案直接抄） | MIT 可抄 |
| GitRecap（现团队 SaaS） | 官网实测 | 指标菜单全部是**确定性 git 读数**：commits/PRs/Velocity 环比/PR cycle time 四分解/贡献者负载——映射到会话域：会话数/消息数/活跃天数/top 项目/连续周，全部是 DM 适配器已产出的 verified 读数，不触契约 | 闭源仅借鉴 |
| Spotify Wrapped 工程博客 | 官方一手 | 全年持续采集 vs 一次性生成——转译：叙事读数在同步时落库（DM 已如此），导出只聚合不重算 | 文章 |

### E. 发布物料 —— VHS（20,819★，MIT）
tape 脚本最佳实践：`Require` 前置依赖 fail fast、`Hide/Show` 隐藏安装噪音、显式 `Sleep` 控节奏、`Set FontSize/Width/Height` 固定渲染参数、`vhs record` 生成 tape、`vhs publish` 托管嵌入链接。

---

## 5. 对 DM 的行动启示

1. **盯防 codepend**：它是唯一「确定性+多工具+面向人故事页」的活项目；若它补上档案库与证据锚定就是 DM。低成本跟踪（watch 仓库/npm 下载），不必反应过度（4★单人项目）。
2. **把 Anthropic reflect 当定位支点**：README/发布叙事可直接引用「官方回顾明确不含 Claude Code、官方承认偶发不准确、社区请求被 close」三个事实——DM = Claude Code 侧的、本地的、可复算的补集。
3. **借鉴件落地顺序建议**（与 pmf-validation §7 的 B 档分发改造并行）：① 导出敏感扫描规则集对照 gitleaks 222 条+agent-sweep 会话模式+Presidio 校验器做一次补全（这是 PRD §9 机械防线的强化，永不该省的例外）；② 证据抽屉排版参照 Telegram 角色气泡+claude-code-log `<details>` 折叠；③ 若做分享卡，抄 star-history 双主题嵌入。
4. **中文首发机会**：中文 Agent 开发者侧没人讨论「留存协作历史」，而微信侧 4.2 万星的留痕证明中文用户对「本地处理对话→回顾」的接受度——中文叙事（数字遗产+确定性证据链）可讲给两个受众听。
5. **指标叙事的白嫖清单**：GitRecap 的确定性指标菜单映射到会话域（会话数/消息数/活跃天数/top 项目/连续周），全部是已有 verified 读数的聚合，为 12 月「Year in Collaboration」预研。

## 6. 开放问题

1. codepend 作者的路线图意图未知（单人 v0.1.5，无公开 roadmap）——只能观察。
2. Anthropic reflect 未来是否扩展到 Claude Code 数据：官方 close 了 issue 但无承诺；若官方做云端版，DM 的「本地+导出+证据链」仍是差异位，但叙事要改写。需季度复查。
3. 心书·微信书（weixinshu.com）价格未核到（动态加载），不影响结论。
4. 即刻站内需求信号不可搜索引擎核验，若走中文发布需 App 内人工搜一次。
5. 淘宝聊天书服务的「AI 聊天」变体尚无人做——若 DM 导出物接按需印刷是全新组合，属未来决策。

---

## Sources

竞品核验（GitHub API 当日实测）：github.com/shatzibitten/codepend · smixs/mentor · vshulcz/deja-vu · daaain/claude-code-log · sudomichael/agentgraphed · AlmanacCode/codealmanac · yx0716/clawd-insights · ohad6k/emulo · numman-ali/cc-wrapped · winfunc/opcode · isaadgulzar/year-in-code · senlindesign/coding-wrapped · ai798-Lab/jing · BigKunLun/AI-Coding-Insights · ChrystianSchutz/ThreadShelf · giannimassi/agent-retro · moddi3/opencode-wrapped · Ethan-YS/ccvault；npm registry 下载量（cc-wrapped/claude-code-log/codepend/agentgraphed）；HN Algolia（deja-vu 131 分帖 2026-07-15 等）；theverge.com/ai-artificial-intelligence/963105/anthropic-claude-wrapped；support.claude.com/articles/15672559（官方回顾 FAQ）；github.com/anthropics/claude-code/issues/15367（close as not planned）。

商业类比：chatbooks.com/pricing + apps.apple.com（2.2k 评分）+ Tracxn（$21.9M）；mysocialbook.com + trustpilot.com/review/mysocialbook.com（2,485 条）；zapptales.com（€16.9/€34.9/€37.9）；help.storyworth.com（$59/$109/$199）；help.remento.co + Wikipedia/Tracxn（$3M）；1se.co；taobao.com 榜单（47 商品）；weixinshu.com + 36kr 项目页。

中文信号（GitHub API 核验）：LC044/WeChatMsg（42,032★）· hicccc77/WeFlow（14,154★，活跃）· ycccccccy/echotrace（3,796★，停更宣言）· ChatLab/ChatLab（7,317★，活跃）+ ruanyf/weekly issue 8511；ccusage/ccusage（18,386★）。

组件参照：github.com/jlfwong/speedscope（scripts/esbuild-shared.ts、prepack.sh 实读）· gitleaks/gitleaks（config/gitleaks.toml 222 规则实测）· Yelp/detect-secrets · Ishannaik/agent-sweep · data-privacy-stack/presidio · trufflesecurity/trufflehog（AGPL 标注）· daaain/claude-code-log · simonw/claude-code-transcripts · Tyrrrz/DiscordChatExporter · hfaran/slack-export-viewer · star-history/star-history · charmbracelet/vhs · picocss.com/simplecss.org/watercss.kognise.dev/andybrewer.github.io/mvp/oxal.org（CSS 基线）· pagedjs.org · core.telegram.org/import-export（+ 1000 条/文件社区实测）· go.dev/cmd/cover · pytest-html.readthedocs.io · gitrecap.com · githubunwrapped.com · engineering.atspotify.com（Wrapped 2020）。
