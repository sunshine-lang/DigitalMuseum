"""pi-agent-evidence-v1：只读 ~/.pi/agent/sessions 的 pi 会话转录。

确定性口径（与 codex 适配器同法）：
- 会话按 转义目录/ISO时间_uuid.jsonl 存放，项目归属由每个文件首行
  `{"type":"session", cwd}` 决定；cwd 已消失的项目不列、不导；
- 只提取时间戳（ISO 8601，按本机时区归日）、用户/助手消息计数与首条
  真实用户消息原文；消息记录 type=="message"，content 片段取
  {type:"text"} 文本，系统包装行（`<` 开头）不算用户消息；
- 单行损坏确定性跳过；**绝不修改 ~/.pi 下任何内容**。
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from app.core.errors import ApiError
from app.services.agent_session_evidence import (
    AgentEvidence,
    RecordClassification,
    SessionSummary,
    message_text,
    real_user_text,
    render_evidence_document,
    scan_session_file,
)
from app.services.path_policy import require_path_allowed

PI_PROCESSOR_VERSION = "pi-agent-evidence-v1"

# 档案库同步的产品注册面：sync_archive 按此统一驱动各 Agent 适配器。
KIND = "pi"
PROCESSOR_VERSION = PI_PROCESSOR_VERSION
EVIDENCE_SUFFIX = "-pi-sessions.txt"
AGGREGATION_ORIGINS = ("aggregated", "pi")


def list_projects(sessions_root: str) -> list[dict]:
    """只读列举全部会话文件首行的项目归属（名称 + 会话数），发现面板专用。"""
    root = Path(sessions_root).expanduser()
    if not root.is_dir():
        return []
    counts: dict[str, int] = {}
    for file_path in sorted(root.rglob("*.jsonl")):
        cwd = _read_session_cwd(file_path)
        if cwd is None:
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
            "project": Path(path).name or "pi-project",
            "session_count": count,
            "import_path": path,
        }
        for path, count in counts.items()
    ]
    projects.sort(key=lambda item: (-item["session_count"], item["project"]))
    return projects


def import_project(
    path_raw: str,
    *,
    starts_on: date | None = None,
    ends_on: date | None = None,
    allowed_roots: str,
    root: str,
) -> AgentEvidence:
    """读取项目会话并渲染证据文档。窗口为 None 时读全部（档案库同步），
    文档头的时间范围改用会话实际的首尾日期，保证内容是数据的纯函数。"""
    project_root, label = _resolve_project(path_raw, allowed_roots=allowed_roots)
    sessions = _project_sessions(project_root, root)
    if starts_on is not None and ends_on is not None:
        sessions = [
            session
            for session in sessions
            if starts_on <= session.started_at.date() <= ends_on
        ]
    if not sessions:
        if starts_on is None or ends_on is None:
            raise ApiError(422, "no_pi_sessions", "这个项目还没有可读取的 pi 会话")
        raise ApiError(
            422, "no_pi_sessions_in_range", "这个项目的 pi 会话都不在当前范围内"
        )
    days = [session.started_at.date() for session in sessions]
    return render_evidence_document(
        source_label="pi agent sessions",
        project_label=label,
        project_display=str(project_root),
        starts_on=starts_on if starts_on is not None else min(days),
        ends_on=ends_on if ends_on is not None else max(days),
        sessions=sessions,
        collaboration_title=f"在 {label} 与 pi 协作",
        claim_noun="pi",
    )


def _resolve_project(path_raw: str, *, allowed_roots: str) -> tuple[Path, str]:
    """pi 会话统一放在转义目录下，项目归属由首行 cwd 决定，输入必须是
    真实项目目录（与 codex 适配器同法）。"""
    cleaned = (path_raw or "").strip()
    if not cleaned:
        raise ApiError(422, "pi_path_required", "请填写要导入的 pi 项目路径")

    candidate = Path(cleaned).expanduser()
    if not candidate.is_dir():
        raise ApiError(422, "pi_sessions_not_found", "这个路径下没有找到 pi 会话记录")
    resolved = candidate.resolve()
    require_path_allowed(resolved, allowed_roots, error_code="pi_path_not_allowed")
    return resolved, resolved.name or "pi-project"


def _project_sessions(project_root: Path, sessions_root: str) -> list[SessionSummary]:
    """扫描根目录下全部 pi 会话文件，返回归属本项目的人机线程。

    确定性过滤规则：首行不是可解析的 session 记录 → 跳过；首行 cwd 解析
    后不等于项目路径 → 跳过；文件内没有任何可读时间戳 → 跳过。
    """
    root = Path(sessions_root).expanduser()
    summaries: list[SessionSummary] = []
    if not root.is_dir():
        return summaries
    for file_path in sorted(root.rglob("*.jsonl")):
        cwd = _read_session_cwd(file_path)
        if cwd is None:
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


def _read_session_cwd(path: Path) -> str | None:
    """只读首行 session 记录；损坏或格式不符返回 None（确定性跳过）。"""
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
    if not isinstance(record, dict) or record.get("type") != "session":
        return None
    cwd = record.get("cwd")
    return cwd if isinstance(cwd, str) and cwd.strip() else None


def _classify_record(record: dict) -> RecordClassification | None:
    """pi 记录分类：type=assistant 侧由 message.role 判定；user 消息取
    content 片段文本（系统包装行不算）。"""
    if record.get("type") != "message":
        return None
    message = record.get("message")
    if not isinstance(message, dict):
        return None
    role = message.get("role")
    if role == "assistant":
        return ("assistant", None)
    if role != "user":
        return None
    return ("user", real_user_text(message_text(message.get("content"))))
