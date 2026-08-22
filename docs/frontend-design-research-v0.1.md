# Digital Museum 前端展现形式调研与设计简报 v0.1

> 调研日期：2026-08-22。本文件是给 AI 编码工具（Cursor / v0 / Lovable / Bolt 等）和人工实现参考的设计简报，汇总自：现有前端代码分析、四 个设计资源网站（styles.refero.design / uiverse.io / motionsites.ai / dribbble.com）、本地 `ui-ux-pro-max` 设计知识库检索。
> 姊妹文档：`docs/github-reference-projects-research-v0.1.md`（开源项目与架构调研，含 Splink 证据瀑布、Scrollama 滚动叙事、ExhibitBuilder 展览数据模型等）。

---

## 1. 产品是什么（给工具的背景）

**把过去 3–12 个月散落的数字痕迹（Markdown/TXT 笔记，后续加照片、Git、AI 对话导出），整理成一段段「有证据出处、经用户亲自核对」的人生经历，最后策展成一份私人成长回顾（展览）。**

核心差异化：AI 只提草稿，每段经历附原文锚点，「发生过」必须由用户确认；不确定的诚实保持不确定。产品有两个价值时刻：
1. **核对时刻**：「这件事确实发生过，它没替我编故事」（信任）；
2. **策展时刻**：「原来我的这一阶段可以这样被看见」（情绪）。

前端所有设计决策都服务于这两个时刻。

## 2. 前端现状与技术约束

**现状**（`app/page.tsx`，单页四步流程）：导入记录 → 发现经历 → 核对关键内容 → 查看回顾。已有：状态标签（candidate/confirmed/…）、证据面板（原文摘录 + 行号 + 哈希锚点）、合并/拆分操作、展览时间线。整体气质偏「工作台/表单」，缺博物馆感与情绪设计。

**硬约束（实现时必须遵守）**：
- 集中式 CSS（`app/globals.css`），**不迁移 Tailwind**（依赖保留但不用其类名）；
- Next.js App Router + vinext/Vite 构建，React 19，部署目标 Cloudflare Worker；
- 动效克制：「克制的策展人声部」是产品文案原则，也是动效准则——每视图最多 1–2 个关键动效；
- 无障碍底线：对比度 4.5:1、键盘可导航、`prefers-reduced-motion` 兜底、触控目标 ≥44px。

## 3. 设计方向总纲

1. **双世界感**：工作态页面（导入/发现/核对）用浅色纸感；展览态页面（回顾/展览）用暗色画廊（OLED 深底 + 少量射灯感 glow）。用配色告诉用户「你在整理」还是「你在看展」。
2. **双色语义系统（全站视觉契约）**：「AI 整理的」= 墨蓝虚线/半透明；「你确认的」= 暖金/实心 + 印章。一次建立全站复用，本身就是产品核心区别（AI 说 vs 用户确认）的可视化教育。
3. **状态三档视觉重量**：confirmed 实心有印章 / candidate 半透明「尚未显影」/ unknown 虚线边框留白——替代彩色小标签，一眼扫出哪些稳了。
4. **Unknown 的美学**：不确定不做成灰色警告，而是留白美学——半透明卡片 + 一句「这段回忆还在等它的主人」。诚实对待不确定是产品差异化，UI 要让它好看而非像缺陷。
5. **档案编号语言**：sha256 前 8 位做成档案标签、卡片纸纹微阴影、流程编号（01/02/03）强化成展厅编号。

## 4. 设计 Token 建议

**字体三栈**（源自 ui-ux-pro-max 检索，Best For 明确含 digital exhibitions）：

| 层 | 字体 | 用途 |
|---|---|---|
| Display | Playfair Display 900（紧字距） | 展览封面 hero、大标题 |
| Body | Source Serif 4 300–600 | 正文（全衬线、书卷感） |
| Mono | JetBrains Mono 400–500（大写字距拉开） | 展签编号、日期、哈希指纹、标签 |
| 中文 | Noto Serif SC（标题）+ Noto Sans SC（正文） | 中文界面主体，英文标签保持 mono |

原则：工作页可适度用无衬线提高效率，展览页「无 UI 无衬线、100% 衬线/mono」。

```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains-Mono:wght@400;500&family=Playfair-Display:ital,wght@0,400;0,700;0,900;1,400&family=Source-Serif-4:ital,wght@0,300;0,400;0,600;1,300&family=Noto-Serif-SC:wght@400;600;900&family=Noto+Sans-SC:wght@300;400;500&display=swap');
```

**配色（画廊黑白，工作态）**：

```css
:root {
  --color-primary: #18181B;        /* 画廊黑 */
  --color-background: #FAFAFA;
  --color-card: #FFFFFF;
  --color-muted: #E8ECF0;
  --color-muted-foreground: #475569;
  --color-border: #E4E4E7;
  --color-destructive: #DC2626;
  --color-accent-ai: /* 墨蓝，AI 整理态，虚线/半透明用法 */;
  --color-accent-user: /* 暖金，用户确认态，实心/印章用法 */;
}
```

**展览态（暗色画廊）**：底 `#121212`（OLED 深灰，避免纯黑大面积）、卡面 `#1C1C1E`、文字 `#E8E6E1`（暖白）、minimal glow（`text-shadow: 0 0 10px` 级别，仅展品标题）、暖金 accent 延续。

**间距**：4/8 系统（4 的倍数节奏：8/16/24/32/48/64）；桌面容器 max-width 一致；正文行高 1.5–1.75、行长 60–75 字符。

**图标**：Phosphor（`@phosphor-icons/react`）为主，备选 Heroicons；统一线性/笔画粗细；现有代码中 `✓`/`!` 文本字符替换为 SVG。图标旁有可见文字时 `aria-hidden="true"`。

## 5. 分页面方案（按用户旅程四时刻）

### 5.1 导入页——「档案馆在为你工作」

- 大拖拽上传区替换 file input（uiverse 搜 `file upload` / `upload card` 抄 CSS 版）；
- 「正在逐份整理」用环形/纸张翻页感 loader（uiverse `loader` 类，忌廉价 spinner）；
- 处理态配极微妙粒子/浮尘背景（motionsites Animated Backgrounds 暗房浮尘类，仅处理态显示）；
- 完成时文件行逐个落位成卡片（Stagger List 动效，见 §6）。

### 5.2 发现页——「先看草稿，一眼分轻重」

- 卡片 hover 抬升 + 纸纹微阴影；展签雏形：编号（No.03）+ 日期 mono + 来源数；
- **状态三档视觉重量**（§3.3）落地：替换现有彩色 status chip 为视觉重量方案（颜色语义保留作辅助，不做唯一指示）；
- **拖拽合并**：拖一张卡片到另一张上 = 提议合并（拖起时两卡半透明，松手弹确认条）；保留 checkbox 作键盘替代（无障碍要求：拖拽必须有键盘/单指针替代）；
- 横向迷你时间轴做月份导航锚。

### 5.3 核对页——第一价值时刻，投入优先级最高

- **证据原文高亮**：点锚点（行号/指纹）→ 原文面板滚动定位并高亮那几行。这是信任感的核心交互，无需任何素材库，纯实现；
- **键盘批审**：是/改/不确定/不属于 四选绑快捷键（如 1/2/3/4 或 E/X/U/R），做完决定卡片滑走、下一张滑入（邮件分诊式）；
- 四选按钮改成大号卡片式单选（hover 有反馈，选中态明显）；
- **确认瞬间**：卡片从半透明「显影」为实心 + 「已入馆」印章动效（scale+rotate 落章，≤300ms）；
- 全部核对完出现小结统计页（「这段时间被确认为 N 段真实经历」）再进展览。

### 5.4 回顾/展览页——第二价值时刻，博物馆感主场

- **展签系统**：白底小卡、编号、日期、来源数；confirmed 盖「已入馆」钢印（暗色页用暖金描边章）；纯 CSS 可完成；
- **展览海报封面**：stage 名 Playfair/Noto Serif 大字 + 日期范围 + 三统计数字；背景深色 + 缓慢位移的展品剪影（参考 motionsites 的 Interactive Discovery / 3D Story / Luxury Hero prompt，**生成后删 70% 效果只留背景缓动 + 大字浮现**）；
- **滚动叙事**：左栏章节文字滚动、右栏 sticky 展品随步骤 crossfade + 轻微 parallax（Scrollama 或 GSAP pin+scrub，见 §6）；
- **阶段带（eras）**：时间轴上给「3–5 月学习期」这类阶段打标签带；
- **大数字页**：Wrap-up 统计数字滚动上升（12 段经历 · 30 份记录 · 最活跃月份）。

## 6. 动效规范与六个预设

**总原则**（可直接当动效规范用）：
- 只动 `transform` / `opacity`，不动画 width/height/top/left；
- 列表入场 stagger 每项 30–50ms；每视图最多 1–2 个关键动效；
- 退出比进入快（约 60–70% 时长）；动画可打断、不阻塞输入；
- 全部动效在 `prefers-reduced-motion: reduce` 时跳过并直接渲染最终态；
- 图标动画、状态转换（hover/active/expanded）用平滑过渡不要跳变。

**六个预设**（Subtle 级三个纯 CSS transition 可实现，Complex 两个需 GSAP 3.13+，SplitText/Flip 已免费）：

| # | 预设 | 用在哪 | 关键参数 | 纯CSS可行 |
|---|---|---|---|---|
| 1 | Stagger List (Subtle) | 发现页卡片入场、导入行落位 | `opacity:0→1, y:8, 0.3s, stagger 0.03, power1.out`；长列表每项 0.02–0.04s | ✅ |
| 2 | Scroll Reveal (Subtle) | 展览时间线条目 | `y:12, 0.35s, power1.out`；位移 8–16px「是 fade 不是 slide」 | ✅ |
| 3 | Page Transition (Subtle) | 四步流程切换 | 200ms crossfade，不阻塞导航 | ✅ |
| 4 | SplitText (Complex) | 展览封面大字逐字浮现 | 只用于 ≤8 词标题；卸载 `split.revert()` 恢复无障碍文本 | ❌ GSAP |
| 5 | Pin + scrub (Complex) | 展览章节滚动叙事 | `scrollTrigger:{pin:true, scrub:1}`；**每页最多 pin 1–2 处**；图片/字体加载后 `ScrollTrigger.refresh()` | ❌ GSAP |
| 6 | Overlay 幕布转场 | 「进入展览」仪式感 | overlay `yPercent` 幕布掠过 0.4s；别绑死数据加载，加 max-wait | ✅（简化版） |

GSAP 示例（预设 1）：`gsap.from('.mvp-experience-card', { opacity: 0, y: 8, duration: 0.3, stagger: 0.03, ease: 'power1.out' })`——React 中用 `@gsap/react` 的 `useGSAP(fn, { scope: containerRef })` 自动清理；选择器用稳定 class 而非数组索引，避免重渲染断靶。

## 7. 资源网站使用指南

| 资源 | 定位 | 本项目用法 | 搜索关键词 |
|---|---|---|---|
| [styles.refero.design](https://styles.refero.design/) | 2000+ 知名产品可机读设计系统（DESIGN.md），可喂 AI 编码工具 | 挑一套浅色纸感 + 一套深色，合成自己的 DESIGN.md | `editorial` `paper` `archive` `gallery` |
| [uiverse.io](https://uiverse.io/) | 开源 copy-paste 组件（cards/loaders/buttons/inputs/toggles） | 文件上传、loader、单选按钮、卡片底子；**拷 CSS 版本改写进 globals.css，勿引 Tailwind 类名** | `file upload` `loader` `card` `radio` |
| [motionsites.ai](https://motionsites.ai/) | 动效/3D 页面 prompt 库 + Animated Backgrounds | 只用于三个「时刻」：等待背景、展览封面、滚动叙事；生成后做减法 | 分类筛 Hero / Carousel / 3D Story；背景库挑暗色粒子/浮尘 |
| [dribbble.com](https://dribbble.com/) | 设计师作品搜索 | 每页改造前搜对标存图定「目标感觉」 | `digital museum UI` `archive interface` `timeline design` `year in review` `editorial timeline` `gallery dark ui` `memory app` `journal app ui` `spotify wrapped` |
| 本地 skill `ui-ux-pro-max` | 可检索设计知识库（风格/配色/字体/UX 准则/GSAP 预设），CLI 查询 | 生成并持久化自己的设计系统；实现前查 UX 准则 | 见下方命令 |

**ui-ux-pro-max 常用命令**：

```bash
# 生成并持久化设计系统到项目（--motion 3 = 克制动效档，符合策展人声部）
python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "personal archive museum editorial" \
  --design-system --persist -p "DigitalMuseum" --output-dir . --motion 3
# 产出 design-system/digitalmuseum/MASTER.md，可加 --page "review" 生成页面级覆盖

# 按需补充检索
python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "scroll reveal stagger" --domain gsap
python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "error summary validation" --domain ux
python3 ~/.agents/skills/ui-ux-pro-max/scripts/search.py "decorative icon aria hidden" --domain icons
```

## 8. 优先级与落地路径

1. **P0 设计基建**：定 token（§4）+ 跑 `--persist` 生成 MASTER.md → 半天，之后所有页面有统一语言；
2. **P0 核对页**（第一价值时刻）：证据原文高亮 → 键盘批审 + 滑卡 → 显影/印章动效 → 完成小结页；
3. **P1 展览页**（第二价值时刻）：展签系统 → 海报封面 → 滚动叙事（引 GSAP 决策点）→ 大数字页；
4. **P1 全站语义**：状态三档视觉重量 + 双色契约，一次建立全站受益；
5. **P2 动效补完**：导入落位动画、流程 crossfade、幕布转场。

**实现顺序口诀**：先定语言（token）→ 再做信任交互（证据高亮+批审）→ 再做情绪时刻（显影/展览）→ 最后补动效。

## 9. 给其他工具的一段式 Brief（可直接粘贴）

> 我在做「Digital Museum · AI 人生档案馆」：用户导入 Markdown/TXT 记录 → 系统整理成带证据锚点的候选经历 → 用户核对真伪 → 生成私人回顾展览。技术栈 Next.js App Router + React 19 + 集中式 CSS（globals.css，**不用 Tailwind 类名**）。设计方向：工作页面浅色纸感（画廊黑白 #18181B/#FAFAFA，纸纹卡片、编号展签），展览页面暗色画廊（#121212 底、暖金 accent、射灯 glow）。字体 Playfair Display 900/Source Serif 4/JetBrains Mono + 中文 Noto Serif SC/Noto Sans SC。核心视觉契约：「AI 整理的」墨蓝半透明虚线 vs「你确认的」暖金实心印章；不确定 = 留白美学不是灰色警告。动效克制（每视图 1–2 个，只动 transform/opacity，stagger 0.03s，reduced-motion 兜底）。当前最优先改造：核对页——证据原文滚动高亮 + 四选键盘批审 + 确认后卡片「显影」+「已入馆」印章动效。

---

*调研来源：styles.refero.design / uiverse.io / motionsites.ai / dribbble.com 实地抓取（2026-08-22）+ 本地 ui-ux-pro-max 知识库检索（design-system / gsap / style / typography 域）。*
