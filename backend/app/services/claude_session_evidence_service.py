from __future__ import annotations

from datetime import date
from pathlib import Path

from app.core.errors import ApiError
from app.services.agent_session_evidence import (
    AgentEvidence,
    AgentSessionsPreview,
    RecordClassification,
    SessionSummary,
    build_sessions_preview,
    real_user_text,
    render_evidence_document,
    scan_session_file,
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
    if not sessions:
        raise ApiError(422, "no_claude_sessions", "这个项目还没有可读取的 Claude Code 会话")
    return build_sessions_preview(sessions, project_label=label)


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
        if starts_on <= session.started_at.date() <= ends_on
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
    require_path_allowed(resolved, allowed_roots, error_code="claude_path_not_allowed")

    if _is_session_directory(resolved):
        return resolved, _label_from_munged_name(resolved.name), resolved.name

    munged = str(resolved).replace("/", "-")
    projects = Path(projects_root).expanduser()
    session_dir = projects / munged
    if session_dir.is_dir() and _is_session_directory(session_dir):
        require_path_allowed(
            session_dir.resolve(), allowed_roots, error_code="claude_path_not_allowed"
        )
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


def _scan_project_sessions(directory: Path) -> list[SessionSummary]:
    scanned = (
        scan_session_file(file_path, _classify_record)
        for file_path in sorted(directory.glob("*.jsonl"))
    )
    return [summary for summary in scanned if summary is not None]


def _classify_record(record: dict) -> RecordClassification | None:
    """Claude Code 记录分类：type=assistant 计一条助手消息；type=user 从
    message.content 提取真实文本（系统包装行与 tool_result 不算）；
    骨架的确定性跳过语义见 agent_session_evidence.scan_session_file。
    """
    record_type = record.get("type")
    if record_type == "assistant":
        return ("assistant", None)
    if record_type != "user":
        return None
    message = record.get("message")
    if not isinstance(message, dict):
        return None
    return ("user", _user_message_text(message.get("content")))


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
