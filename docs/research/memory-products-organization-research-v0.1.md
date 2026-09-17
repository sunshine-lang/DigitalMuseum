# 回忆录 / 数字记忆产品如何整理用户记忆：竞品机制调研 v0.1

> 调研日期与来源访问日期：2026-08-27
> 研究范围：Day One、Journey、Apple Journal、Apple Photos Memories、Google Photos Memories、1 Second Everyday、Storyworth、Remento、Rewind（历史产品）。
> 证据口径：只采用官方产品页、官方帮助中心、官方博客/开发文档和官方样例；不把营销口号当作已经验证的产品效果。
> 本文严格区分：**来源事实**（官方资料明确说明）、**对 DigitalMuseum 的推断**（基于事实做的产品判断）、**不建议照搬**（与本项目真实性/本地优先边界冲突）。

---

## 0. 先给结论

### 0.1 对当前“每张卡都是『在 learn-claude-code 与 Codex 协作』”的判断

这不是单纯的文案问题，而是**把内部档案名称直接当成了用户看到的展示标题**。

当前代码中：

- 后端确定性地生成统一格式的 `collaboration_title`：`在 {project} 与 {product} 协作`（`backend/app/services/agent_session_evidence.py:415`）；
- 浏览页直接把 `event.title` 放进每张卡的 `<h3>`（`app/page.tsx:644`）；
- 展览页同样继续把它作为 `<h3>`，虽然下面已经有差异化叙事（`app/exhibition/page.tsx:508-510`）。

因此，用户第一眼看到的最高视觉层级必然重复。S5 已经补了不同叙事句式，但叙事被压在相同的大标题下面，解决的是“正文同构”，没有解决“卡片身份同构”。

### 0.2 九个样本的共同做法

成熟产品通常不会让一个自动生成的标题承担全部信息，而会拆成五层：

1. **原始素材**：日记、照片、视频、录音、屏幕/音频记录；
2. **记忆单元**：一天、一条日记、一个片段、一段回答、一次录音；
3. **组织镜头**：时间、项目/日记本、人物、地点、标签、主题；
4. **策展单元**：精选回忆、章节、故事、影片、书；
5. **回看与控制**：On This Day、Throwback、收藏、隐藏、删除、重命名、调整顺序、预览后确认。

真正消除单调感的是：**同一份档案可以从不同镜头被看见，卡片内部也有不同信息层级**，而不只是给每张卡换一句“有感情的 AI 标题”。

### 0.3 最适合 DigitalMuseum 的立即方案

在不增加模型、不改变 verified 口径的前提下，可以把卡片改为：

```text
learn-claude-code
“帮我把第 7 课的练习页改成……”
2026-08-24 · Codex · 3 个会话 · 42 条消息
[系统核实] [查看证据] [提出异议]
```

其中：

- **主标题**：项目名（确定性事实）；
- **内容钩子**：首条真实用户消息的逐字摘录，明确加引号，不把它改写成“完成了什么”（来源 artifact）；
- **元数据**：日期、Agent 产品、会话数、消息数（确定性读数）；
- **内部档案名**：`在 {project} 与 {product} 协作` 仍可保留为数据层 canonical title，不再占最高视觉层级；
- **任何语义概括**：若将来引入，只能作为 `candidate display title`，与 verified 事实分层显示，不能覆盖原始标题与证据。

---

## 1. 竞品对比总表

| 产品 | 最小记忆单元 | 主要组织方式 | 如何避免卡片千篇一律 | 用户控制 / 不确定性 | 对本项目最有用的机制 |
|---|---|---|---|---|---|
| Day One | 日记条目 | Timeline / Photos / Map / Calendar、标签、筛选 | 同一条目从时间、照片、地点、日历四种镜头回看 | 标签/筛选、On This Day 可按 journal 控制、E2EE | 不要把所有差异都塞进标题；先做多镜头浏览 |
| Journey | 日记条目 | 时间线、日历、Atlas、媒体、标签、情绪、Throwback | 地点图、媒体墙、情绪趋势、往年回看各自承担不同叙事 | 搜索/筛选、收藏、私密锁、E2EE | 项目视图/时间视图/统计回看并列，而非单一长时间线 |
| Apple Journal | 系统建议的“时刻”→ 用户选择后的日记条目 | 人物、地点、照片、活动、音乐等信号组成建议 | 建议卡用素材组合与上下文，而不是统一句式标题 | 建议在设备端生成；用户选择后 app 才得到高层信息 | “先建议、后授权进入档案”是未来 candidate 机制的好边界 |
| Apple Photos Memories | 一组照片/视频组成的 Memory | 人物、宠物、地点、活动、事件 | 关键照片 + 标题/副标题 + 影片节奏/音乐；可改标题与关键照片 | 增删/重排素材；少展示某人/地点/日期；删除 Memory | canonical 内容与展示包装分离；“少展示”比删除原档案更合适 |
| Google Photos Memories | 自动或手工创建的 Memory/Moment | 旅行、庆祝、日常时刻、人物、日期、视觉模式 | scrapbook 时间线、用户重命名、AI 标题建议、增删素材 | AI 标题明确可能不准确；可编辑/补充提示；人物合并有 Same/Different/Not sure | 把语义标题标成建议，并保留“不确定”入口 |
| 1 Second Everyday | 每天一个或多个 snippet | Journal 日历、Freestyle 项目、月份/年份/季节/Core Memories | 缩略图、一天一秒的节奏、项目名、短 caption，而不是长标题 | Smart Fill 先预览再加入；可换/删；片段可设为 private | 先让用户看候选，再落入精选；用“核心回忆”标记做轻策展 |
| Storyworth | 一道问题对应的一篇故事 | 问题队列→故事→目录/章节→整本书 | 问题本身天然形成差异化入口；故事标题可编辑、章节可重排 | 写完可编辑、预览、校对；故事私密，仅分享名单可见 | 首条用户原话可做“问题入口”，但不能假装成完成结果 |
| Remento | 一次音频/视频回答 | prompt→录音→逐字稿/叙事稿→章节→书 | 每章由问题、照片、书面故事和原声共同构成 | 可选逐字稿或叙事、可编辑；每章可回放原始录音 | 展示稿必须始终能回到原始证据；改写稿与原文不能混成一层 |
| Rewind（历史） | 连续屏幕/音频捕获 | 全量时间记录 + OCR/ASR 搜索 | 主要靠搜索与回到精确时刻，不靠章节标题 | 官方发布口径为录制数据存本机、仅用户可访问 | “可搜索的完整记录”仍不是回忆录；捕获层与策展层必须分开 |

---

## 2. 逐产品证据与判断

### 2.1 Day One：让“镜头”承担差异，不强迫标题承担差异

**来源事实**

- Day One 官方把同一份日记数据提供为 Timeline、Photos、Map、Calendar 四种视图；时间线看条目，照片视图看媒体，地图看地点，日历按日期进入。[官方 Journal Views](https://dayoneapp.com/guides/tips-and-tutorials/journal-views-in-day-one-for-macos/)
- 筛选维度包括照片、音频、视频、地点、收藏、标签、日期、活动、音乐、On This Day 等。[官方 Filters 指南](https://dayoneapp.com/guides/tips-and-tutorials/filters/)
- On This Day 会把同一天在不同年份的条目重新呈现，并允许按 journal 控制是否进入该回看入口。[官方 On This Day 指南](https://dayoneapp.com/guides/tips-and-tutorials/on-this-day-view/)
- 新 journal 默认使用端到端加密；但官方同时提醒，某些文本/JSON 导出并不加密。[官方 E2EE FAQ](https://dayoneapp.com/guides/day-one-sync/end-to-end-encryption-faq/)

**对 DigitalMuseum 的推断**

- 对 Agent 档案来说，“按日”“按项目”“按 Agent 产品”“只看精选展出”可以成为四种浏览镜头。即便事件标题不变，用户也不会只面对一列同构卡片。
- Day One 的启示是：**先丰富信息架构，再考虑生成式标题**。多视图是事实重排，不需要模型，也不会引入事实幻觉。
- 静态展览属于导出物，不能因为主库本地/加密就默认安全；当前导出前敏感信息扫描应该保留。

**不建议照搬**

- 不建议为了像日记产品而恢复已删除的笔记上传、地点或照片管线；当前 PRD 已明确唯一燃料是本机 Agent 会话。
- 不建议把标签自动推断成事实；没有模型时只做确定性维度，未来自动标签也应是 candidate。

### 2.2 Journey：同一档案可有时间、地点、媒体、情绪与回看故事

**来源事实**

- Journey 官方列出 timeline、calendar、map、photo view、标签、情绪、位置、天气、搜索/筛选、Throwback 等能力。[官方“什么是 Journey”](https://support.journey.cloud/en/categories/journey-basics/articles/what-is-journey)
- 官网用 Media、Atlas、Calendar 三个入口表达“Your Life At A Glance”，并提供 Throwback 与 30 天情绪变化回看。[Journey 官网](https://journey.cloud/)
- Throwback 会展示一年或数年前的过去条目。[官方 Throwback 插件页](https://journey.cloud/app/plugins/throwback)

**对 DigitalMuseum 的推断**

- 适合当前数据的等价物不是地图/情绪，而是：**项目地图（项目集合）/ 时间日历 / Agent 媒介墙 / 项目生命周期统计**。
- “回看”应是独立入口，不必把所有事件都改写成故事。比如“这个月的协作高峰”“一年前的今天”都可由时间戳和计数确定性生成。

**不建议照搬**

- 当前没有情绪证据，不应从对话频率、消息长度或首条提示词推断“焦虑、兴奋、低谷”等情绪。
- Journey 的 AI 询问/总结能力不是本阶段的对标重点；DigitalMuseum 的真实性边界更严格。

### 2.3 Apple Journal：系统只提出“值得写的时刻”，由用户决定是否变成日记

**来源事实**

- Apple 的 Journaling Suggestions 会在设备端组合运动、媒体使用、联系人、照片、重要地点和心境等信号，形成“日常时刻/特殊事件”的建议；用户可按类别开关并清除未分享建议。[Apple Journaling Suggestions & Privacy](https://www.apple.com/legal/privacy/data/en/journaling-suggestions/)
- 对第三方 app，建议详情在用户选择之前不会开放；用户选择后，app 才获得该事件的高层信息。[Apple Developer Documentation](https://developer.apple.com/documentation/JournalingSuggestions)
- Journal 条目可包含照片、视频、音频、地点等；建议由设备端生成，用户选择哪些建议进入 Journal；条目可锁定并在 iCloud 中端到端加密。[Apple 官方发布说明](https://www.apple.com/ca/newsroom/2023/12/apple-launches-journal-app-a-new-app-for-reflecting-on-everyday-moments/)

**对 DigitalMuseum 的推断**

- 如果未来做“主题/章节/Skill 机会”，可以借鉴成：系统先给一个 **candidate suggestion**，用户选择后才进入正式回顾或 `User-confirmed` 层。
- Apple 把“素材聚合建议”和“用户写下的条目”分成两层，这与 DigitalMuseum 的 `Inference → User-confirmed` 边界天然兼容。

**不建议照搬**

- 当前 PRD 不允许模型解读对话内容，因此不能直接实现跨人物、地点、心境的“智能时刻”。
- 不要把“用户没有否认”当成“用户确认”；选择/确认必须是显式动作。

### 2.4 Apple Photos Memories：自动聚合可以很大胆，但展示必须允许用户改名、增删和降频

**来源事实**

- Apple Photos 的 Memories 是围绕重要人物、宠物、地点、活动或事件组成的照片/视频集合。[Apple 官方 View Memories](https://support.apple.com/guide/iphone/view-your-memories-iphd4f70e68f/26/ios/26)
- 用户可以更换音乐/视觉风格、编辑标题与副标题、修改关键照片、增删/重排照片、调整影片长度。[Apple 官方 Personalize Memories](https://support.apple.com/guide/iphone/personalize-your-memory-movies-iph1a5832438/26/ios/26)
- 用户可以要求少展示某个人、地点或某一天，也可以删除某个 Memory；这些操作不等于删除原始照片库。[Apple 官方 Share or Delete Memories](https://support.apple.com/guide/iphone/share-or-delete-memories-iph2af67b000/ios)

**对 DigitalMuseum 的推断**

- 最值得借鉴的是**原档案与回忆包装分离**：Event/Occurrence 不动，展览中的标题、顺序、主展位置属于展示层。
- “提出异议”之外可以考虑更轻的“在回顾中少展示此项目/日期”偏好；它影响策展，不否定原始档案事实。
- 关键照片的等价物可由“关键原话/关键数字”承担：同一事件选一条首条用户消息作视觉锚点，而不是继续用通用标题占满卡面。

**不建议照搬**

- Apple 的“重要”是算法判断。DigitalMuseum 不能把消息峰值直接说成“最重要的一天”；最多说“消息数最高的一天”。
- 不应自动把“少展示”改成 rejected/disputed；策展偏好与事实裁决是两套状态。

### 2.5 Google Photos Memories：AI 标题必须明确是建议，并允许“不确定”

**来源事实**

- Google Photos 曾把 Memories 设计成 scrapbook-like timeline，用于旅行、庆祝和日常时刻；用户可从零创建、增删素材、隐藏 Memory、重命名，也可请求 AI 标题建议。[Google Photos 官方博客](https://blog.google/products-and-platforms/products/photos/google-photos-memories-view/)
- Google 帮助中心明确写明：AI 标题建议是实验功能，可能不准确或不合适；用户可以编辑建议、要求更多建议、补充提示和提交错误反馈。[官方标题建议帮助](https://support.google.com/photos/answer/13872269?co=GENIE.Platform%3DAndroid&hl=en)
- 人脸分组建议提供 Same / Different / Not sure，且允许用户移出错误分组；官方也明确分组并不完美。[官方 Face Groups 帮助](https://support.google.com/photos/answer/6128838?co=GENIE.Platform%3DDesktop&hl=en)
- 用户可隐藏人物、宠物和日期，或移除某个 featured memory；照片时间戳也可被用户修正。[官方 Featured Memories 帮助](https://support.google.com/photos/answer/9454489?hl=en-GB_ALL)

**对 DigitalMuseum 的推断**

- 未来的语义标题 UI 应直接写成“标题建议”，并提供“采用 / 修改 / 不确定 / 不要再建议类似标题”，而不是把建议写回 verified 事件标题。
- Google 的“不确定”非常适合本项目：无法判断项目名、主题或合并关系时，不要二选一强迫用户给结论。
- 自动聚合应保留可纠错对象：哪条会话被归入哪个回忆、为何归入，都应能回到证据。

**不建议照搬**

- Google 的人物、地点和视觉语义来自照片模型与云服务；当前 DigitalMuseum 既没有这些信号，也不应因此引入云端照片管线。
- “AI 帮我命名”不能成为修复当前重复标题的第一步；现有确定性数据已经足够重新排版。

### 2.6 1 Second Everyday：用节奏、缩略图和精选状态代替“每条都写成故事”

**来源事实**

- 1SE 的 Journal 是日历型项目，按天放入照片或视频片段；Freestyle 用于旅行、项目或冒险，可自由重排片段。[官方项目类型说明](https://help.1se.co/en/articles/1077034-freestyle-vs-freestyle-collab-vs-journal)
- Smart Fill 会先选出每天的候选片段，用户必须预览，可替换、移除或调整，满意后才加入项目；已有片段不会被覆盖。[官方 Smart Fill 指南](https://help.1se.co/en/articles/5447754-how-to-use-smart-fill)
- 用户可把一个或多个片段标成 Core Memories，再只用这些片段生成回顾；回顾也可按月、年、季节或自定义范围生成。[Core Memories](https://help.1se.co/en/articles/11826711-how-to-use-core-memories)、[选择回顾范围](https://help.1se.co/en/articles/3703781-how-to-choose-the-dates-to-mash)
- snippet 可添加地点、标题或短描述；也可标成 private，从分享影片中排除。[添加标题](https://help.1se.co/en/articles/3417468-how-to-add-a-title-to-your-snippets)、[Private Snippet](https://help.1se.co/en/articles/4707585-how-to-make-a-snippet-private)

**对 DigitalMuseum 的推断**

- 浏览页不需要每张卡都有长叙事；可以像 1SE 一样用“日期节奏 + 原话缩略 + 元数据”建立可扫读性。
- 现有“勾选展出”可明确命名为“加入本次回顾/主展”，让用户理解这是策展选择，不是事实确认。
- 可按月/项目/自定义日期生成不同展览，而不必改变 Event 数据。

**不建议照搬**

- 不要自动从每天多条会话中挑“最佳/核心”而不说明标准。若只按消息数选，应明确叫“消息最多”，不能叫“最重要”。
- private/不展出是展示权限，不应写成 unknown/rejected。

### 2.7 Storyworth：问题驱动比自动总结更容易形成有差异的章节

**来源事实**

- Storyworth 默认每周通过邮件发送一个人生问题，回复邮件或在网页写作后保存为故事；故事默认私密，只向分享名单开放，完成编辑后可印成书。[官方订阅说明](https://help.storyworth.com/what-is-a-storyworth-memoir-subscription)
- 问题队列可浏览分类、搜索、增删、改写、跳过和拖动排序。[官方问题管理](https://help.storyworth.com/en_US/adding-removing-or-customizing-upcoming-questions)
- 故事标题可编辑；故事与照片可拖动重排，顺序会反映到目录。[编辑标题](https://help.storyworth.com/en_US/writing/how-do-i-edit-the-title-of-a-story)、[重排故事](https://help.storyworth.com/en_US/rearranging-stories-and-photos)
- 印刷前流程包含完成/编辑故事、添加照片、安排顺序、预览和检查。[官方 Print-perfect Checklist](https://help.storyworth.com/en_US/printing-books/whats-next-your-print-perfect-checklist)

**对 DigitalMuseum 的推断**

- 当前已经读取“首条真实用户消息”。它天然比统一协作标题更像 Storyworth 的问题入口，可作为逐字引用钩子；例如“我当时先问了什么”。
- 但首条消息只能证明“用户提出了这个请求/问题”，不能证明请求最终完成。因此 UI 应加引号或“从这句话开始”，不能改写成成果标题。
- 展览可把多个日期事件按项目组成章节，项目是确定性集合；章节内部仍按真实日期排列。

**不建议照搬**

- 不要把所有首条提示词直接公开进静态展览；其中可能包含本机路径、密钥、邮箱或私密任务，需要继续经过敏感信息扫描。
- 当前 PRD 已移除人工展签，不应在没有新的产品决策时引入重型逐卡写作流程。

### 2.8 Remento：改写后的故事旁边必须保留原声证据

**来源事实**

- Remento 的流程是：选择/自定义问题→通过邮件或短信录音→生成逐字稿或结构化叙事→用户编辑→每段故事作为一章进入书。[官方 How It Works](https://home.remento.co/how-it-works)
- 每章带 QR code，可回放原始录音；书面故事可选逐字稿或经过整理的叙事，并可在印刷前编辑。[Remento 官网](https://www.remento.co/)、[印刷帮助](https://help.remento.co/en/articles/8365908-how-do-i-order-and-print-my-book)
- 原始录音、书面故事与照片也保存在私密数字档案中，可供受邀家庭成员访问。[官方 How It Works](https://home.remento.co/how-it-works)

**对 DigitalMuseum 的推断**

- Remento 最值得借鉴的不是“AI 润色”，而是**呈现稿永远能回到原始录音**。DigitalMuseum 的任何展览叙事都应能回到 Evidence Blob / anchor。
- 若未来生成语义标题或项目章节导语，数据模型至少要分为：`source fact`、`generated candidate`、`user-confirmed display copy`，不能覆盖同一个字段。
- 当前展览可以把首条用户原话做成可展开的“原声等价物”，与确定性叙事并列。

**不建议照搬**

- Remento 的“结构化叙事”是内容改写。当前 DigitalMuseum 无模型且明确“一切概括、推断不做”，不能把这部分描述为近期可直接复用。
- 即便未来使用模型，也不能因为用户可以编辑就默认生成稿是 verified；未确认前必须是 candidate。

### 2.9 Rewind（历史产品）：完整捕获与可搜索，不等于回忆录

**来源事实**

- Rewind 的官方发布将产品定义为个人生活的搜索引擎：捕获用户看过、说过、听过的内容，用 OCR/ASR 建索引，并可回到精确时刻；录制数据存本机。[Rewind 官方历史发布页](https://proxy.rewind.ai/blog/launching-rewind)

**对 DigitalMuseum 的推断**

- Rewind 说明“采集完整”和“能找回来”是档案层能力，但用户要的回忆录还需要项目集合、关键原话、章节顺序与精选回顾。
- DigitalMuseum 目前不是内容语义搜索产品，也不需要走全屏幕捕获路线；只读 Agent 会话的严口径更可控。

**不建议照搬**

- 不应扩张到全屏幕/全音频持续录制：隐私、数据体量、授权和误采集风险都会改变项目性质。
- “本地存储”不等于绝对隐私；模型调用、导出和分享是不同的数据外流边界。

---

## 3. 竞品机制抽象：记忆从原始素材到回顾的五层模型

| 层级 | 竞品常见对象 | DigitalMuseum 当前可用对象 | 真实性要求 |
|---|---|---|---|
| L0 原始证据 | 日记原文、照片、视频、录音、屏幕记录 | Agent 会话 Evidence Blob / anchor | 不原地改写，内容哈希可追溯 |
| L1 事实单元 | 日记条目、照片、snippet、录音回答 | 某项目某 Agent 在某日的会话聚合；时间戳/计数/首条原话 | 确定性读数可 verified；原话只证明“说过” |
| L2 浏览镜头 | Timeline、Calendar、Map、People、Tags | 按日期、按项目、按 Agent 产品、按是否展出 | 只是事实重排，不产生新事实 |
| L3 策展集合 | Memory、Core Memory、Story、Chapter | 项目章节、用户勾选的展出事件、日期窗口 | “被选中”是策展状态，不是事实状态 |
| L4 叙事/回顾 | 影片、书、On This Day、年度回顾 | 静态展览 HTML、项目里程碑、回看入口 | 确定性句子可直接展示；语义概括必须 candidate/用户确认 |

这个分层可以避免三个常见混淆：

1. **原始记录存在 ≠ 记忆已经被解释**；
2. **进入展览 ≠ 事实得到确认**；
3. **算法确定性 ≠ 语义标签就是事实**。

第三点尤其需要警惕。当前 `app/exhibition/narrative.ts:286-294` 会根据项目数、Agent 数和峰值占比生成“闭关冲刺手”“全线总指挥”等人格化标签。计算过程可以是确定性的，但这些称呼仍然是**解释/修辞**，不是时间戳与计数本身。建议至少标成“趣味解读”或 Inference，不要与“系统核实”使用同一事实视觉等级。

---

## 4. 对当前卡片单调问题的三档方案

### A 档：现在就能做，完全不增加推断（推荐）

#### A1. 拆开 canonical title 与 display hierarchy

- 数据层仍保留：`在 learn-claude-code 与 Codex 协作`；
- UI 主标题改成：`learn-claude-code`；
- Agent 产品移到 chip：`Codex`；
- 日期由外层 day group 统一承担，不在标题重复；
- 首条用户消息以 blockquote/两行截断作内容钩子；
- 会话数、用户消息数、来源数进入元数据行。

这一步只重排已有事实，不需要数据库迁移，也不需要模型。

#### A2. 用四种确定性卡片节奏，而不是四种编造句式

可依据已有字段切换布局，但不改变事实语义：

1. **原话型**：有首条用户消息时，以逐字引用为视觉中心；
2. **读数型**：无可用原话时，以“3 次会话 · 42 条消息”为中心；
3. **项目里程碑型**：项目首日/末日/消息峰值日，以明确的机械标签“首次记录”“最近一次记录”“消息数最高日”展示；
4. **多 Agent 型**：同项目跨产品时，以产品组合和时间跨度为中心。

“消息数最高日”是事实；“最重要的一天”“攻坚日”“完成日”都不是。

#### A3. 增加浏览镜头，不增加新数据源

- 时间：当前按日时间线；
- 项目：项目封面 + 生命周期 + 各日事件；
- Agent：Codex / Claude Code / pi / dsh 馆藏分区；
- 精选：只看已经勾选进入展览的事件。

### B 档：需要产品决策，但仍不需要模型

- 允许用户给“项目章节”改一个展示名，保存为 `User-confirmed display title`；
- 增加“在回顾中少展示此项目/日期”，与 disputed/rejected 分开；
- 增加“核心回忆/主展”标记，复用现有勾选展出能力，但把语义讲清楚；
- 提供“原话 / 读数”显示偏好，避免用户不愿在列表首屏暴露首条提示词。

这些都改变了 v0.3 的“零人工整理”体验，需要先更新 PRD/验收标准再实现。

### C 档：未来模型能力，只能进入 candidate

- 语义标题建议，例如“为第 7 课重做移动端交互”；
- 跨会话主题聚类；
- 人物、目标、成果、转折等章节建议；
- “你可能正在重复一个可沉淀为 Skill 的流程”。

必须满足：

1. 标注“AI 建议/Inference”；
2. 每条建议附逐字 anchor；
3. 用户可采用、修改、拒绝、不确定；
4. 用户采用后记录为 `User-confirmed`，不覆盖原始 verified Event；
5. rejected 的同类建议不应在增量同步后反复出现。

---

## 5. 隐私与不确定性：竞品里最值得保留的反向控制

### 5.1 需要的不是只有“删除”，而是四种不同控制

| 用户意图 | 竞品先例 | DigitalMuseum 应对应的状态 |
|---|---|---|
| 事实不对 | Google 人脸分组 Same/Different/Not sure；现有异议入口 | disputed / unknown / 用户裁决 |
| 事实可能对，但不想回看 | Apple/Google 少展示人物、地点、日期 | presentation preference，不改 Event 事实状态 |
| 只想自己看，不进入输出 | 1SE private snippet | private/excluded-from-export，不等于 rejected |
| 愿意作为本次回顾重点 | 1SE Core Memories、Apple Favorite Memories | selected-for-exhibition / hero，不等于 confirmed |

### 5.2 首条用户消息的隐私风险

首条消息是最能打破单调的现有内容，但也最可能包含：

- 本机绝对路径；
- API key/临时 token；
- 邮箱、客户名、未公开项目名；
- 用户不希望在肩窥场景或静态展览中出现的私密任务。

因此建议：

- 浏览页默认只显示清洗后的短摘录，支持一键隐藏；
- 逐字原文放在本机证据面板；
- 静态展览继续经过敏感信息扫描；
- 任何“清洗”只影响展示副本，不改 Evidence Blob；
- 如果清洗会改变语义，宁可隐藏并显示“原话已隐藏”，不要生成替代内容。

---

## 6. 不建议采用的竞品做法

1. **用 AI 标题直接替换 verified 标题**：Google 自己都把标题建议标成实验性且可能不准确；本项目更不能静默升级为事实。
2. **从消息峰值推断成果/情绪/重要性**：确定性统计只能支持“最多、首次、最近、连续 N 天”，不能支持“攻克、完成、热爱、焦虑、最重要”。
3. **为了多样而随机换句式**：34 张卡 34 种句式不等于 34 段可辨认的记忆；用户识别依赖项目、原话、日期和读数，而不是语言花活。
4. **把策展偏好写进事实状态**：“不想展示”不等于“没有发生”；“主展”也不等于“已确认”。
5. **隐藏原始证据，只保留润色故事**：Remento 的原声回放恰恰说明，生成稿的可信度来自能回到原始记录。
6. **扩大为全量屏幕/音频捕获**：Rewind 路线会改变隐私与产品边界，不适合当前严口径 Agent 会话档案。
7. **把 local-first 表述成零风险**：本机主库、模型调用、导出文件、分享链接是四个不同边界；静态 HTML 仍可能泄露敏感内容。

---

## 7. 推荐的产品语言

为守住事实边界，建议统一以下措辞：

| 数据/状态 | 推荐显示 | 避免显示 |
|---|---|---|
| 项目名 + Agent + 日期 + 计数 | “系统读取”“会话记录”“消息数最高日” | “系统理解了”“完成了”“攻克了” |
| 首条用户消息 | “从这句话开始”“首条用户原话” | 把它改写成成果标题 |
| 模型生成标题 | “标题建议”“AI 整理草稿” | “事件标题”“系统核实” |
| 用户采用生成标题 | “你确认的展示标题” | 反向覆盖原始会话事实 |
| 不想回看 | “在回顾中少展示” | “事实错误” |
| 选择进入展览 | “加入本次回顾”“设为主展” | “确认发生” |

---

## 8. 最终建议

优先做一个**信息层级改造**，不要先做 AI 起名：

1. 把固定格式 `event.title` 降为内部档案名或二级说明；
2. 项目名升为卡片主标题；
3. 首条真实用户消息升为逐字引用钩子；
4. Agent、日期、会话数、消息数进入清晰元数据行；
5. 增加按项目/按时间/按 Agent/只看精选的浏览镜头；
6. “消息峰值、首日、末日、生命周期”只用机械事实措辞；
7. 人格化 archetype、语义标题和主题聚类必须降到 Inference/趣味解读，未来再走 candidate → 用户确认。

这条路线能直接解决当前单调问题，同时不引入新数据源、不调用模型、不破坏 `Fact / Inference / User-confirmed / Unknown` 边界。
