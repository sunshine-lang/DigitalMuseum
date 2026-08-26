"""Agent 会话证据的共享模型、扫描骨架与确定性文档渲染。

Claude Code（claude-code-evidence-v1）与 Codex（codex-evidence-v1）适配器
共用：会话 JSONL 的逐行扫描骨架（时间戳 min/max 与计数累加）、按天分块
渲染证据文档、逐行锚点、确定性截断。两个适配器只保留各自的目录定位与
记录分类规则；未来 Agent Session 适配器（Stage 10）同样复用本模块。
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Literal

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


# 单行记录的分类结果：("assistant", None) 计一条助手消息，("user", 文本)
# 在文本为真实用户消息时计一条用户消息；None 表示该行不计入任何计数。
RecordClassification = tuple[Literal["assistant", "user"], str | None]


def parse_session_timestamp(value: object) -> datetime | None:
    """解析 Agent 会话文件里的时间戳：ISO 8601 字符串或 epoch 毫秒数。

    会话文件里的时间戳是 UTC；按本机时区归日与显示——也是用户真实
    体验到的日期。
    """
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # epoch 毫秒（dsh）：13 位数值；秒级（10 位）按 1e3 归一。
        seconds = value / 1000 if value >= 1e12 else value
        try:
            return datetime.fromtimestamp(seconds, tz=UTC).astimezone()
        except (OverflowError, OSError, ValueError):
            return None
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


def scan_session_file(
    path: Path,
    classify_record: Callable[[dict], RecordClassification | None],
) -> SessionSummary | None:
    """打开一个会话 JSONL 文件并按共享骨架扫描（见 scan_session_records）。"""
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        return scan_session_records(handle, session_id=path.stem, classify_record=classify_record)


def scan_session_records(
    records: Iterable[str],
    *,
    session_id: str,
    classify_record: Callable[[dict], RecordClassification | None],
) -> SessionSummary | None:
    """逐行流式扫描 Agent 会话记录的共享骨架：逐行 strip → json.loads/dict
    双守卫 → 记录级时间戳取 min/max → 分类回调累加计数 → 组装
    SessionSummary。单行损坏、非 dict、缺时间戳的行被确定性跳过；全文件
    无时间戳返回 None（跳过该文件）。分类规则由适配器注入，骨架本身不
    持有任何适配器规则。
    """
    started: datetime | None = None
    ended: datetime | None = None
    user_messages = 0
    assistant_messages = 0
    first_user_message: str | None = None

    for raw_line in records:
        stripped = raw_line.strip()
        if not stripped:
            continue
        try:
            record = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if not isinstance(record, dict):
            continue

        timestamp = parse_session_timestamp(
            record.get("timestamp", record.get("time"))
        )
        if timestamp is not None:
            if started is None or timestamp < started:
                started = timestamp
            if ended is None or timestamp > ended:
                ended = timestamp

        classification = classify_record(record)
        if classification is None:
            continue
        kind, text = classification
        if kind == "assistant":
            assistant_messages += 1
        elif text:
            user_messages += 1
            if first_user_message is None:
                first_user_message = text

    if started is None or ended is None:
        return None
    return SessionSummary(
        session_id=session_id,
        started_at=started,
        ended_at=ended,
        user_messages=user_messages,
        assistant_messages=assistant_messages,
        first_user_message=first_user_message,
    )


def message_text(content: object) -> str | None:
    """从 message.content（字符串或 {type:"text"} 片段数组）提取纯文本。"""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return None
    parts = [
        item.get("text")
        for item in content
        if isinstance(item, dict) and item.get("type") == "text"
    ]
    return " ".join(part for part in parts if isinstance(part, str))


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
