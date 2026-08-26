/**
 * 展品叙事底稿：把确定性 claim 压成一句适合展览的人话（纯确定性推导，
 * S5 将升级为项目级里程碑叙事）。原文与锚点仍在"展品标签"里供查证。
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

  // 兜底：取第一个完整句（未知来源时的确定性读数）。
  const cleaned = cleanFragment(claim).replace(/^[-*>\s]+/, "");
  const sentence = cleaned.split(/[。！？]/)[0];
  return (sentence.length >= 6 ? sentence : cleaned).slice(0, 72);
}
