from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from app.core.errors import ApiError
from app.services.agent_session_evidence import (
    AgentEvidence,
    AgentSessionsPreview,
    SessionSummary,
    parse_session_timestamp,
    real_user_text,
    render_evidence_document,
)
from app.services.path_policy import require_path_allowed

CLAUDE_PROCESSOR_VERSION = "claude-code-evidence-v1"


def preview_claude_sessions(
    path_raw: str,
    *,
    allowed_roots: str,
    projects_root: str,
) -> AgentSessionsPreview:
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
    return AgentSessionsPreview(
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
) -> AgentEvidence:
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
    return render_evidence_document(
        source_label="claude-code sessions",
        project_label=label,
        project_display=display,
        starts_on=starts_on,
        ends_on=ends_on,
        sessions=sessions,
        collaboration_title=f"在 {label} 与 Claude Code 协作",
        claim_noun="Claude Code",
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
    require_path_allowed(
        resolved,
        allowed_roots,
        error_code="claude_path_not_allowed",
        message="这个路径不在允许读取的目录范围内",
    )


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
    started = None
    ended = None
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

            timestamp = parse_session_timestamp(record.get("timestamp"))
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
    return real_user_text(text)
