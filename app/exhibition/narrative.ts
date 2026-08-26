/**
 * 展品叙事底稿（S5）：确定性项目级里程碑叙事。
 *
 * 每张卡片的文案由它在项目生命周期中的位置决定——首日 / 最密集日 /
 * 收尾日 / 日常推进，三种日常节奏轮换；所有数字（活跃天数、消息量、
 * 峰值、跨度）都从事件自带的确定性读数推导，不引入模型与推断。
 * 原文与锚点仍在"展品标签"里供查证。
 */

export type NarrativeEvent = {
  title?: string;
  occurred_on?: string | null;
  origin: string;
  claims: { text: string }[];
};

/** 项目里程碑：同一项目全部事件（跨产品）聚合出的确定性统计。 */
export type ProjectMilestone = {
  project: string;
  agents: string[];
  activeDays: number;
  spanDays: number;
  totalMessages: number;
  peakDay: string | null;
  peakMessages: number;
  isPeakDay: boolean;
  isFirstDay: boolean;
  isLastDay: boolean;
  dayIndex: number;
  firstTopic: string;
};

const AGENT_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  pi: "pi",
  dsh: "dsh",
};

/** claim 中由后端逐字截断的首条用户消息摘录（「」内），主展引言用。 */
export function openingQuoteOf(event: NarrativeEvent): string {
  return topicOf(event.claims[0]?.text ?? "");
}

/** 展签媒介行：来源产品 → 馆藏措辞（真实展签的 medium + credit line）。 */
export function mediumLineOf(origin: string, sourceCount: number): string {
  const medium = AGENT_LABELS[origin] ? `${AGENT_LABELS[origin]} 会话` : "合并整理档案";
  return `${medium} · ${sourceCount} 份原始记录 · 本机馆藏`;
}

export function cleanFragment(text: string): string {
  return text
    .replace(/\[@[^\]]*\]\(plugin:\/\/[^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\(https?:[^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/https?:\/\/\S+/g, (url) => {
      const host = url.replace(/^https?:\/\//, "").split("/")[0];
      return host || "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** 标题「在 {项目} 与 {产品} 协作」→ 项目名；解析不出时退回整个标题。 */
function projectOfTitle(title: string | undefined): string {
  if (!title) return "未命名项目";
  const match = title.match(/^在 (.+) 与 (Claude Code|Codex|pi|dsh) 协作$/);
  return match ? match[1] : title;
}

/** claim 里的确定性计数：「进行了 N 个 X 会话、共 M 条用户消息」。 */
function sessionCountOf(claim: string): number {
  return Number(claim.match(/进行了 (\d+) 个/)?.[1] ?? 0);
}

function messageCountOf(claim: string): number {
  return Number(claim.match(/共 (\d+) 条/)?.[1] ?? 0);
}

function topicOf(claim: string): string {
  const match = claim.match(/「([^」]{2,60})」/);
  return match ? cleanFragment(match[1]) : "";
}

function daysBetween(first: string, last: string): number {
  const a = Date.parse(`${first}T00:00:00Z`);
  const b = Date.parse(`${last}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** 事件 → 里程碑上下文的映射键（buildProjectMilestones 的逆查询用）。 */
export function milestoneKeyFor(event: NarrativeEvent): string {
  // 同批事件可能同日多卡：以标题+日期+首条 claim 为键足够区分展位。
  return `${event.title ?? ""}|${event.occurred_on ?? ""}|${event.claims[0]?.text ?? ""}`;
}

function soloMilestone(project: string): ProjectMilestone {
  return {
    project,
    agents: [],
    activeDays: 1,
    spanDays: 0,
    totalMessages: 0,
    peakDay: null,
    peakMessages: 0,
    isPeakDay: false,
    isFirstDay: false,
    isLastDay: false,
    dayIndex: 1,
    firstTopic: "",
  };
}

/**
 * 为一批展出事件构建每个事件的项目里程碑上下文。
 * 同一项目（标题同名）的全部事件按日期聚合；跨产品的协作共用一组里程碑。
 */
export function buildProjectMilestones(
  events: NarrativeEvent[],
): Map<string, ProjectMilestone> {
  const groups = new Map<string, NarrativeEvent[]>();
  for (const event of events) {
    const project = projectOfTitle(event.title);
    groups.set(project, [...(groups.get(project) ?? []), event]);
  }

  const milestones = new Map<string, ProjectMilestone>();
  for (const [project, group] of groups) {
    const dated = group
      .filter((event): event is NarrativeEvent & { occurred_on: string } =>
        Boolean(event.occurred_on))
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
    const undated = group.filter((event) => !event.occurred_on);
    if (dated.length === 0) {
      for (const event of undated) {
        milestones.set(milestoneKeyFor(event), soloMilestone(project));
      }
      continue;
    }

    const perDayMessages = new Map<string, number>();
    for (const event of dated) {
      const day = event.occurred_on;
      perDayMessages.set(
        day,
        (perDayMessages.get(day) ?? 0) + messageCountOf(event.claims[0]?.text ?? ""),
      );
    }
    const days = [...perDayMessages.keys()];
    const peakDay = days.reduce(
      (peak, day) =>
        (perDayMessages.get(day) ?? 0) > (perDayMessages.get(peak) ?? 0) ? day : peak,
      days[0],
    );
    const peakMessages = perDayMessages.get(peakDay) ?? 0;
    const totalMessages = [...perDayMessages.values()].reduce((sum, n) => sum + n, 0);
    const agents = [
      ...new Set(dated.map((event) => AGENT_LABELS[event.origin] ?? event.origin)),
    ];
    const firstDay = dated[0].occurred_on;
    const lastDay = dated[dated.length - 1].occurred_on;
    const spanDays = daysBetween(firstDay, lastDay);
    const firstTopic =
      dated
        .map((event) => topicOf(event.claims[0]?.text ?? ""))
        .find((topic) => topic.length > 0) ?? "";

    const dayList = [...new Set(dated.map((event) => event.occurred_on))].sort();
    const dayRank = new Map(dayList.map((day, index) => [day, index + 1]));

    for (const event of dated) {
      const day = event.occurred_on;
      milestones.set(milestoneKeyFor(event), {
        project,
        agents,
        activeDays: dayList.length,
        spanDays,
        totalMessages,
        peakDay,
        peakMessages,
        isPeakDay: dayList.length > 1 && day === peakDay,
        isFirstDay: day === firstDay && dayList.length > 1,
        isLastDay: day === lastDay && dayList.length > 1 && day !== firstDay,
        dayIndex: dayRank.get(day) ?? 1,
        firstTopic,
      });
    }
    for (const event of undated) {
      milestones.set(milestoneKeyFor(event), soloMilestone(project));
    }
  }
  return milestones;
}

export function exhibitNarrative(
  event: NarrativeEvent,
  milestone?: ProjectMilestone,
): string {
  const claim = event.claims[0]?.text ?? "";
  const topic = topicOf(claim);
  const sessions = sessionCountOf(claim);
  const messages = messageCountOf(claim);
  const agent = AGENT_LABELS[event.origin] ?? event.origin;
  const stats = [
    sessions > 1 ? `${sessions} 个会话` : "",
    messages > 0 ? `${messages} 条你来我往的消息` : "",
  ]
    .filter(Boolean)
    .join("、");

  if (!milestone || milestone.activeDays <= 1) {
    // 单日项目：一段即兴的协作。产品名/主题/项目名逐级加入，
    // 保证同统计的不同项目卡片不同构。
    if (topic)
      return `与 ${agent} 的一次即兴协作，从「${topic}」开始${stats ? `：${stats}` : ""}`;
    const place = milestone?.project && milestone.project !== "未命名项目"
      ? `（${milestone.project}）`
      : "";
    return stats
      ? `与 ${agent} 的一次即兴协作${place}：${stats}`
      : cleanFragment(claim).slice(0, 72);
  }

  const agentPhrase =
    milestone.agents.length > 1 ? milestone.agents.join(" 与 ") : agent;
  const span = milestone.spanDays;

  if (milestone.isFirstDay) {
    const ahead = milestone.activeDays - 1;
    const follow =
      ahead > 0 ? `；此后 ${span} 天里，你们还会一起工作 ${ahead} 个活跃日` : "";
    return `这个项目与 ${agentPhrase} 的第一次交手${topic ? `，从「${topic}」开始` : ""}${follow}。`;
  }

  if (milestone.isPeakDay) {
    const share =
      milestone.totalMessages > 0
        ? Math.round((milestone.peakMessages / milestone.totalMessages) * 100)
        : 0;
    const shareText = share >= 20 ? `——占了整个项目消息量的 ${share}%` : "";
    const topicText = topic ? `这一天的主战场是「${topic}」` : "";
    return `与 ${agentPhrase} 最密集的一天${stats ? `：${stats}` : ""}${shareText}${topicText ? `，${topicText}` : ""}。`;
  }

  if (milestone.isLastDay) {
    const walk = milestone.firstTopic
      ? `从「${milestone.firstTopic}」一路走到这里`
      : "";
    const ending = topic ? `以「${topic}」作结` : "";
    const tail = [walk, ending, stats]
      .filter(Boolean)
      .map((part, index) => (index === 0 ? part : part))
      .join("，");
    return `${span} 天协作的收尾${tail ? `：${tail}。` : "。"}`;
  }

  // 日常推进：三种节奏按活跃日序号轮换，保持整馆卡片句式有变化。
  const rhythm = (milestone.dayIndex - 2) % 3;
  if (rhythm === 0) {
    return `持续协作的第 ${milestone.dayIndex} 个活跃日${stats ? `：${stats}` : ""}${topic ? `，这天的主题是「${topic}」` : ""}。`;
  }
  if (rhythm === 1) {
    return `${topic ? `又一次从「${topic}」聊起` : "又一次坐下来一起推进"}${stats ? `，${stats}` : ""}——项目过半，节奏稳定。`;
  }
  return `第 ${milestone.dayIndex} 个活跃日${topic ? `，围绕「${topic}」` : ""}${stats ? `，${stats}` : ""}；距这个项目与 ${agentPhrase} 的第一次合作已过去 ${span} 天中的大部分时间。`;
}
