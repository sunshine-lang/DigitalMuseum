/**
 * 展品叙事底稿：把确定性 claim 压成一句适合展览的人话。
 * 确定性天花板明确——真正满意的展签交给用户改写（exhibit_caption），
 * 这里只负责"不丢人"的默认值。原文与锚点仍在"展品标签"里供查证。
 */

export type NarrativeEvent = {
  origin: string;
  claims: { text: string }[];
};

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

export function exhibitNarrative(event: NarrativeEvent): string {
  const claim = event.claims[0]?.text ?? "";
  const topicMatch = claim.match(/「([^」]{2,60})」/);
  const topic = topicMatch ? cleanFragment(topicMatch[1]) : "";

  if (event.origin === "claude" || event.origin === "codex") {
    const agent = event.origin === "claude" ? "Claude Code" : "Codex";
    const sessionCount = Number(claim.match(/进行了 (\d+) 个/)?.[1] ?? 0);
    const messageCount = Number(claim.match(/共 (\d+) 条/)?.[1] ?? 0);
    const stats = [
      sessionCount > 1 ? `${sessionCount} 个会话` : "",
      messageCount > 0 ? `${messageCount} 条你来我往的消息` : "",
    ].filter(Boolean).join("、");
    if (topic)
      return stats ? `${stats}，从「${topic}」开始` : `与 ${agent} 的对话，从「${topic}」开始`;
    return stats ? `这一天你与 ${agent} 有${stats}` : cleanFragment(claim).slice(0, 72);
  }

  if (event.origin === "git") {
    const commitCount = Number(claim.match(/提交了 (\d+) 个变更/)?.[1] ?? 0);
    const repo = claim.match(/仓库 ([^（]+?)（/)?.[1] ?? "";
    const first = claim.match(/变更：([^；。]{4,40})/)?.[1] ?? "";
    const parts = [
      repo ? `在 ${repo.trim()}` : "",
      commitCount > 0 ? `提交了 ${commitCount} 次` : "",
    ].filter(Boolean).join("");
    const tail = first ? `：${first.trim()}…` : "";
    return `${parts}${tail}` || cleanFragment(claim).slice(0, 72);
  }

  // 笔记：取第一个完整句
  const cleaned = cleanFragment(claim).replace(/^[-*>\s]+/, "");
  const sentence = cleaned.split(/[。！？]/)[0];
  return (sentence.length >= 6 ? sentence : cleaned).slice(0, 72);
}
