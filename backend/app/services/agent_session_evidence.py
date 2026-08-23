"""Agent 会话证据的共享模型与确定性文档渲染。

Claude Code（claude-code-evidence-v1）与 Codex（codex-evidence-v1）适配器
共用：会话按天分块渲染证据文档、逐行锚点、确定性截断。两个适配器只保留
各自的目录定位与会话文件解析规则；未来 Agent Session 适配器（Stage 10）
同样复用本模块。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

# 用户首条消息在证据文档中的确定性截断长度；claim 中再截取更短的前缀。
_MAX_QUOTE_CHARS = 120
_MAX_CLAIM_QUOTE_CHARS = 60


@dataclass(frozen=True, slots=True)
class SessionAnchor:
    quote: str
    line_start: int
    line_end: int
    char_start: int
    char_end: int


@dataclass(frozen=True, slots=True)
class SessionSummary:
    session_id: str
    started_at: datetime
    ended_at: datetime
    user_messages: int
    assistant_messages: int
    first_user_message: str | None


@dataclass(frozen=True, slots=True)
class AgentActivityItem:
    title: str
    occurred_on: date
    claim_text: str
    anchors: tuple[SessionAnchor, ...]
    # 会话时间戳是 Agent 落盘的机器读数，按天事实导入即"系统核实"；
    # 首条消息只是逐字摘录（artifact），不是对会话内容的解读。
    initial_status: str = "verified"


@dataclass(frozen=True, slots=True)
class AgentEvidence:
    project_label: str
    project_display: str
    document: str
    items: tuple[AgentActivityItem, ...]


@dataclass(frozen=True, slots=True)
class AgentSessionsPreview:
    project_label: str
    first_session_on: date
    last_session_on: date
    session_count: int


def parse_session_timestamp(value: object) -> datetime | None:
    """解析 Agent 会话文件里的 ISO 8601 时间戳。

    会话文件里的时间戳是 UTC；按本机时区归日与显示——与 git 适配器读
    committer date 的本地日期口径一致，也是用户真实体验到的日期。
    """
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone()


def real_user_text(text: str | None) -> str | None:
    """清洗用户消息文本；系统包装行（`<` 开头）与空文本不算真实用户消息。"""
    if text is None:
        return None
    cleaned = " ".join(text.split())
    if not cleaned or cleaned.startswith("<"):
        return None
    return cleaned


def truncate_text(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def render_evidence_document(
    *,
    source_label: str,
    project_label: str,
    project_display: str,
    starts_on: date,
    ends_on: date,
    sessions: list[SessionSummary],
    collaboration_title: str,
    claim_noun: str,
) -> AgentEvidence:
    """把按天分组的会话渲染为确定性证据文档与逐日事件条目。"""
    sessions_by_day: dict[date, list[SessionSummary]] = {}
    for session in sessions:
        sessions_by_day.setdefault(session.started_at.date(), []).append(session)
    for day_sessions in sessions_by_day.values():
        day_sessions.sort(key=lambda item: (item.started_at, item.session_id))

    lines: list[str] = [
        f"project: {project_label} ({project_display})",
        f"source: {source_label}",
        f"range: {starts_on}..{ends_on}",
        "",
    ]
    pending: list[tuple[str, date, str, int, int]] = []

    for day in sorted(sessions_by_day):
        day_sessions = sessions_by_day[day]
        header = f"## day {day} ({len(day_sessions)} sessions)"
        block_start = len(lines)
        lines.append(header)
        for session in day_sessions:
            lines.append(
                f"session {session.session_id} "
                f"{session.started_at.strftime('%H:%M')}-{session.ended_at.strftime('%H:%M')} "
                f"user_messages={session.user_messages} "
                f"assistant_messages={session.assistant_messages}"
            )
            if session.first_user_message:
                lines.append(
                    f"> {truncate_text(session.first_user_message, _MAX_QUOTE_CHARS)}"
                )
        block_end = len(lines) - 1

        total_user_messages = sum(item.user_messages for item in day_sessions)
        opening = next(
            (item.first_user_message for item in day_sessions if item.first_user_message),
            None,
        )
        claim_text = (
            f"这一天在项目 {project_label} 进行了 {len(day_sessions)} 个 {claim_noun} 会话、"
            f"共 {total_user_messages} 条用户消息"
        )
        if opening:
            claim_text += (
                f"；最早一个会话从「{truncate_text(opening, _MAX_CLAIM_QUOTE_CHARS)}」开始"
            )
        pending.append(
            (
                collaboration_title,
                day,
                claim_text,
                block_start,
                block_end,
            )
        )

    offsets: list[int] = []
    total = 0
    for line in lines:
        offsets.append(total)
        total += len(line) + 1

    items: list[AgentActivityItem] = []
    for title, occurred_on, claim_text, block_start, block_end in pending:
        anchors = tuple(
            SessionAnchor(
                quote=line_text,
                line_start=index + 1,
                line_end=index + 1,
                char_start=offsets[index],
                char_end=offsets[index] + len(line_text),
            )
            for index, line_text in enumerate(lines)
            if block_start <= index <= block_end
        )
        items.append(
            AgentActivityItem(
                title=title[:200],
                occurred_on=occurred_on,
                claim_text=claim_text,
                anchors=anchors,
                initial_status="verified",
            )
        )

    return AgentEvidence(
        project_label=project_label,
        project_display=project_display,
        document="\n".join(lines),
        items=tuple(items),
    )
