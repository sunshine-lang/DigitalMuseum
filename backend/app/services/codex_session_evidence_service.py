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

CODEX_PROCESSOR_VERSION = "codex-evidence-v1"


def preview_codex_sessions(
    path_raw: str,
    *,
    allowed_roots: str,
    sessions_root: str,
) -> AgentSessionsPreview:
    """只读预览：该项目全部 Codex 会话的最早/最晚开始日期与数量，不落库。"""
    project_root, label = _resolve_project(path_raw, allowed_roots=allowed_roots)
    sessions = _project_sessions(project_root, sessions_root)
    if not sessions:
        raise ApiError(422, "no_codex_sessions", "这个项目还没有可读取的 Codex 会话")
    days = [session.started_at.date() for session in sessions]
    return AgentSessionsPreview(
        project_label=label,
        first_session_on=min(days),
        last_session_on=max(days),
        session_count=len(sessions),
    )


def import_codex_sessions(
    path_raw: str,
    *,
    starts_on: date,
    ends_on: date,
    allowed_roots: str,
    sessions_root: str,
) -> AgentEvidence:
    project_root, label = _resolve_project(path_raw, allowed_roots=allowed_roots)
    sessions = [
        session
        for session in _project_sessions(project_root, sessions_root)
        if starts_on <= session.started_at.date() <= ends_on
    ]
    if not sessions:
        raise ApiError(
            422,
            "no_codex_sessions_in_range",
            "这个项目的 Codex 会话都不在当前建馆阶段内",
        )
    return render_evidence_document(
        source_label="codex sessions",
        project_label=label,
        project_display=str(project_root),
        starts_on=starts_on,
        ends_on=ends_on,
        sessions=sessions,
        collaboration_title=f"在 {label} 与 Codex 协作",
        claim_noun="Codex",
    )


def _resolve_project(path_raw: str, *, allowed_roots: str) -> tuple[Path, str]:
    """Codex 会话按日期统一存放（~/.codex/sessions/YYYY/MM/DD），项目归属由
    每个会话 session_meta 的 cwd 决定，因此输入必须是真实项目目录。"""
    cleaned = (path_raw or "").strip()
    if not cleaned:
        raise ApiError(422, "codex_path_required", "请填写要导入的 Codex 项目路径")

    candidate = Path(cleaned).expanduser()
    if not candidate.is_dir():
        raise ApiError(422, "codex_sessions_not_found", "这个路径下没有找到 Codex 会话记录")
    resolved = candidate.resolve()
    _require_allowed(resolved, allowed_roots)
    return resolved, resolved.name or "codex-project"


def _require_allowed(resolved: Path, allowed_roots: str) -> None:
    require_path_allowed(
        resolved,
        allowed_roots,
        error_code="codex_path_not_allowed",
        message="这个路径不在允许读取的目录范围内",
    )


def _project_sessions(project_root: Path, sessions_root: str) -> list[SessionSummary]:
    """扫描会话根目录下全部 rollout 文件，返回属于该项目的人机线程。

    确定性过滤规则：
    - 首行不是可解析的 session_meta → 跳过该文件；
    - thread_source != "user"（subagent 内部线程、composer_link 等）→ 跳过：
      subagent 的 user_message 是系统注入的审计材料，不是用户说的话；
    - session_meta.cwd 解析后不等于项目路径 → 跳过；
    - 文件内没有任何可读时间戳 → 跳过。
    """
    root = Path(sessions_root).expanduser()
    summaries: list[SessionSummary] = []
    if not root.is_dir():
        return summaries
    for file_path in sorted(root.rglob("rollout-*.jsonl")):
        meta = _read_session_meta(file_path)
        if meta is None:
            continue
        if meta.get("thread_source") != "user":
            continue
        cwd = meta.get("cwd")
        if not isinstance(cwd, str) or not cwd:
            continue
        try:
            if Path(cwd).expanduser().resolve() != project_root:
                continue
        except OSError:
            continue
        summary = _scan_session_file(file_path)
        if summary is not None:
            summaries.append(summary)
    return summaries


def _read_session_meta(path: Path) -> dict | None:
    """只读首行 session_meta；损坏或格式不符返回 None（确定性跳过）。"""
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            first = handle.readline()
    except OSError:
        return None
    stripped = first.strip()
    if not stripped:
        return None
    try:
        record = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    if not isinstance(record, dict) or record.get("type") != "session_meta":
        return None
    payload = record.get("payload")
    return payload if isinstance(payload, dict) else None


def _scan_session_file(path: Path) -> SessionSummary | None:
    """逐行流式解析一个 Codex rollout JSONL。

    只提取记录级时间戳（min/max）、user_message 计数与首条真实用户消息、
    agent_message 计数。单行解析失败或缺时间戳的行被跳过（确定性）。
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

            if record.get("type") != "event_msg":
                continue
            payload = record.get("payload")
            if not isinstance(payload, dict):
                continue
            event_type = payload.get("type")
            if event_type == "agent_message":
                assistant_messages += 1
            elif event_type == "user_message":
                raw_message = payload.get("message")
                text = real_user_text(raw_message if isinstance(raw_message, str) else None)
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
