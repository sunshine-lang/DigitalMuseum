from __future__ import annotations

import json
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

CODEX_PROCESSOR_VERSION = "codex-evidence-v1"


def list_codex_projects(sessions_root: str) -> list[dict]:
    """只读列举全部 rollout 的项目归属（名称 + 真人会话数），发现面板专用。

    只读每个文件的首行 session_meta（不读会话正文）；只统计
    thread_source == "user"（与导入口径一致）；cwd 目录已不存在的不列——
    导入要求项目目录存在，列出来只会点出 422。确定性排序：会话数降序、
    同数按名称。
    """
    root = Path(sessions_root).expanduser()
    if not root.is_dir():
        return []
    counts: dict[str, int] = {}
    for file_path in sorted(root.rglob("rollout-*.jsonl")):
        meta = _read_session_meta(file_path)
        if meta is None or meta.get("thread_source") != "user":
            continue
        cwd = meta.get("cwd")
        if not isinstance(cwd, str) or not cwd.strip():
            continue
        try:
            resolved = Path(cwd).expanduser().resolve()
        except OSError:
            continue
        if not resolved.is_dir():
            continue
        key = str(resolved)
        counts[key] = counts.get(key, 0) + 1
    projects = [
        {
            "project": Path(path).name or "codex-project",
            "session_count": count,
            "import_path": path,
        }
        for path, count in counts.items()
    ]
    projects.sort(key=lambda item: (-item["session_count"], item["project"]))
    return projects


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
    return build_sessions_preview(sessions, project_label=label)


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
    require_path_allowed(resolved, allowed_roots, error_code="codex_path_not_allowed")
    return resolved, resolved.name or "codex-project"


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
        summary = scan_session_file(file_path, _classify_record)
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


def _classify_record(record: dict) -> RecordClassification | None:
    """Codex rollout 记录分类：只统计 event_msg——payload.type=
    agent_message 计一条助手消息，user_message 须为真实文本（系统注入
    行不算）；骨架的确定性跳过语义见 scan_session_file。
    """
    if record.get("type") != "event_msg":
        return None
    payload = record.get("payload")
    if not isinstance(payload, dict):
        return None
    event_type = payload.get("type")
    if event_type == "agent_message":
        return ("assistant", None)
    if event_type != "user_message":
        return None
    raw_message = payload.get("message")
    return ("user", real_user_text(raw_message if isinstance(raw_message, str) else None))
