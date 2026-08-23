from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from app.core.errors import ApiError

CLAUDE_PROCESSOR_VERSION = "claude-code-evidence-v1"

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
class ClaudeActivityItem:
    title: str
    occurred_on: date
    claim_text: str
    anchors: tuple[SessionAnchor, ...]
    # 会话时间戳是 Claude Code 落盘的机器读数，按天事实导入即"系统核实"；
    # 首条消息只是逐字摘录（artifact），不是对会话内容的解读。
    initial_status: str = "verified"


@dataclass(frozen=True, slots=True)
class ClaudeEvidence:
    project_label: str
    project_display: str
    document: str
    items: tuple[ClaudeActivityItem, ...]


@dataclass(frozen=True, slots=True)
class ClaudeSessionsPreview:
    project_label: str
    first_session_on: date
    last_session_on: date
    session_count: int


def preview_claude_sessions(
    path_raw: str,
    *,
    allowed_roots: str,
    projects_root: str,
) -> ClaudeSessionsPreview:
    """只读预览：该项目全部会话的最早/最晚开始日期与数量，不落库、不做阶段过滤。

    与导入链路共用目录定位与解析规则，仅用于建馆前帮用户预填表单。
    """
    directory, label, _display = _resolve_session_directory(
        path_raw, allowed_roots=allowed_roots, projects_root=projects_root
    )
    sessions = _scan_project_sessions(directory)
    dated = [session for session in sessions if session is not None]
    if not dated:
        raise ApiError(422, "no_claude_sessions", "这个项目还没有可读取的 Claude Code 会话")
    days = [session.started_at.date() for session in dated]
    return ClaudeSessionsPreview(
        project_label=label,
        first_session_on=min(days),
        last_session_on=max(days),
        session_count=len(dated),
    )


def import_claude_sessions(
    path_raw: str,
    *,
    starts_on: date,
    ends_on: date,
    allowed_roots: str,
    projects_root: str,
) -> ClaudeEvidence:
    directory, label, display = _resolve_session_directory(
        path_raw, allowed_roots=allowed_roots, projects_root=projects_root
    )
    sessions = [
        session
        for session in _scan_project_sessions(directory)
        if session is not None and starts_on <= session.started_at.date() <= ends_on
    ]
    if not sessions:
        raise ApiError(
            422,
            "no_claude_sessions_in_range",
            "这个项目的 Claude Code 会话都不在当前建馆阶段内",
        )
    return _render_evidence_document(
        project_label=label,
        project_display=display,
        starts_on=starts_on,
        ends_on=ends_on,
        sessions=sessions,
    )


def _resolve_session_directory(
    path_raw: str,
    *,
    allowed_roots: str,
    projects_root: str,
) -> tuple[Path, str, str]:
    """把用户输入解析为会话项目目录，返回 (目录, 项目标签, 展示路径)。

    接受两种输入：
    1. 真实项目路径（推荐）：按 Claude Code 的目录转义规则（"/" → "-"）
       在默认 projects 根下查找对应会话目录，标签取路径末段；
    2. 直接给出会话项目目录：标签取转义名的末段。
    """
    cleaned = (path_raw or "").strip()
    if not cleaned:
        raise ApiError(422, "claude_path_required", "请填写项目路径或 Claude Code 会话目录")

    candidate = Path(cleaned).expanduser()
    if not candidate.is_dir():
        raise ApiError(422, "claude_sessions_not_found", "这个路径下没有找到 Claude Code 会话记录")
    resolved = candidate.resolve()
    _require_allowed(resolved, allowed_roots)

    if _is_session_directory(resolved):
        return resolved, _label_from_munged_name(resolved.name), resolved.name

    munged = str(resolved).replace("/", "-")
    projects = Path(projects_root).expanduser()
    session_dir = projects / munged
    if session_dir.is_dir() and _is_session_directory(session_dir):
        _require_allowed(session_dir.resolve(), allowed_roots)
        return session_dir.resolve(), resolved.name, str(resolved)

    raise ApiError(
        422,
        "claude_sessions_not_found",
        "这个路径下没有找到 Claude Code 会话记录（已查找 ~/.claude/projects 下的对应目录）",
    )


def _is_session_directory(directory: Path) -> bool:
    return any(directory.glob("*.jsonl"))


def _label_from_munged_name(name: str) -> str:
    # 转义名把 "/" 记成 "-"，无法还原原始分隔；取末段作为项目标签，
    # 需要更准确标签时应输入真实项目路径。
    return name.lstrip("-").split("-")[-1] or "claude-project"


def _require_allowed(resolved: Path, allowed_roots: str) -> None:
    roots = [
        Path(root.strip()).expanduser().resolve()
        for root in allowed_roots.split(",")
        if root.strip()
    ]
    if not any(resolved == root or root in resolved.parents for root in roots):
        raise ApiError(403, "claude_path_not_allowed", "这个路径不在允许读取的目录范围内")


def _scan_project_sessions(directory: Path) -> list[SessionSummary | None]:
    summaries: list[SessionSummary | None] = []
    for file_path in sorted(directory.glob("*.jsonl")):
        summaries.append(_scan_session_file(file_path))
    return summaries


def _scan_session_file(path: Path) -> SessionSummary | None:
    """逐行流式解析一个会话 JSONL。

    只提取时间戳、user/assistant 计数与首条真实用户消息；单行解析失败
    或缺少时间戳的行被跳过；整个文件没有任何时间戳则返回 None（跳过
    该文件）。所有跳过规则都是确定性的。
    """
    started: datetime | None = None
    ended: datetime | None = None
    user_messages = 0
    assistant_messages = 0
    first_user_message: str | None = None

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for raw_line in handle:
            stripped = raw_line.strip()
            if not stripped:
                continue
            try:
                record = json.loads(stripped)
            except json.JSONDecodeError:
                continue
            if not isinstance(record, dict):
                continue

            timestamp = _parse_timestamp(record.get("timestamp"))
            if timestamp is not None:
                if started is None or timestamp < started:
                    started = timestamp
                if ended is None or timestamp > ended:
                    ended = timestamp

            record_type = record.get("type")
            if record_type == "assistant":
                assistant_messages += 1
            elif record_type == "user":
                message = record.get("message")
                if isinstance(message, dict):
                    text = _user_message_text(message.get("content"))
                    if text:
                        user_messages += 1
                        if first_user_message is None:
                            first_user_message = text

    if started is None or ended is None:
        return None
    return SessionSummary(
        session_id=path.stem,
        started_at=started,
        ended_at=ended,
        user_messages=user_messages,
        assistant_messages=assistant_messages,
        first_user_message=first_user_message,
    )


def _parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    # 会话文件里的时间戳是 UTC；按本机时区归日与显示——与 git 适配器读
    # committer date 的本地日期口径一致，也是用户真实体验到的日期。
    return parsed.astimezone()


def _user_message_text(content: object) -> str | None:
    """提取用户消息中的真实文本；系统包装行（`<` 开头）与工具结果不算。"""
    text: str | None = None
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        parts = [
            item.get("text")
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        text = " ".join(part for part in parts if isinstance(part, str))
    if text is None:
        return None
    cleaned = " ".join(text.split())
    if not cleaned or cleaned.startswith("<"):
        return None
    return cleaned


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def _render_evidence_document(
    *,
    project_label: str,
    project_display: str,
    starts_on: date,
    ends_on: date,
    sessions: list[SessionSummary],
) -> ClaudeEvidence:
    sessions_by_day: dict[date, list[SessionSummary]] = {}
    for session in sessions:
        sessions_by_day.setdefault(session.started_at.date(), []).append(session)
    for day_sessions in sessions_by_day.values():
        day_sessions.sort(key=lambda item: (item.started_at, item.session_id))

    lines: list[str] = [
        f"project: {project_label} ({project_display})",
        "source: claude-code sessions",
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
                lines.append(f"> {_truncate(session.first_user_message, _MAX_QUOTE_CHARS)}")
        block_end = len(lines) - 1

        total_user_messages = sum(item.user_messages for item in day_sessions)
        opening = next(
            (item.first_user_message for item in day_sessions if item.first_user_message),
            None,
        )
        claim_text = (
            f"这一天在项目 {project_label} 进行了 {len(day_sessions)} 个 Claude Code 会话、"
            f"共 {total_user_messages} 条用户消息"
        )
        if opening:
            claim_text += f"；最早一个会话从「{_truncate(opening, _MAX_CLAIM_QUOTE_CHARS)}」开始"
        pending.append(
            (
                f"在 {project_label} 与 Claude Code 协作",
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

    items: list[ClaudeActivityItem] = []
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
            ClaudeActivityItem(
                title=title[:200],
                occurred_on=occurred_on,
                claim_text=claim_text,
                anchors=anchors,
                initial_status="verified",
            )
        )

    return ClaudeEvidence(
        project_label=project_label,
        project_display=project_display,
        document="\n".join(lines),
        items=tuple(items),
    )
