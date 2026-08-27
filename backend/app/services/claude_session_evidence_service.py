from __future__ import annotations

from pathlib import Path

from app.core.errors import ApiError
from app.services.agent_session_evidence import (
    AgentEvidence,
    RecordClassification,
    SessionSummary,
    message_text,
    real_user_text,
    render_project_evidence,
    scan_session_file,
)
from app.services.path_policy import require_path_allowed

CLAUDE_PROCESSOR_VERSION = "claude-code-evidence-v1"

# 档案库同步的产品注册面：sync_archive 按此统一驱动各 Agent 适配器。
KIND = "claude"
PROCESSOR_VERSION = CLAUDE_PROCESSOR_VERSION
EVIDENCE_SUFFIX = "-claude-sessions.txt"
AGGREGATION_ORIGINS = ("aggregated", "claude")


def list_projects(projects_root: str) -> list[dict]:
    """只读列举 projects 根下有会话文件的项目目录（名称 + 会话文件数）。

    发现面板专用：不读取任何会话内容（只数 *.jsonl 文件）；import_path 直接
    指向会话目录，由 sync_archive 原样消费（无逐项目导入端点）。
    按会话数降序、同数按名称排序，全部确定性。
    """
    root = Path(projects_root).expanduser()
    if not root.is_dir():
        return []
    projects: list[dict] = []
    for directory in root.iterdir():
        if not directory.is_dir():
            continue
        session_files = list(directory.glob("*.jsonl"))
        if not session_files:
            continue
        projects.append(
            {
                "project": _label_from_munged_name(directory.name),
                "session_count": len(session_files),
                "import_path": str(directory),
            }
        )
    projects.sort(key=lambda item: (-item["session_count"], item["project"]))
    return projects


def import_project(
    path_raw: str,
    *,
    allowed_roots: str,
    root: str,
) -> AgentEvidence:
    """读取项目全部会话并渲染证据文档（文档头时间范围取会话实际首尾日期，
    内容是数据的纯函数）。root 仅保持注册表统一界面，claude 的项目定位
    不需要它。"""
    directory, label, display = _resolve_session_directory(
        path_raw, allowed_roots=allowed_roots
    )
    sessions = _scan_project_sessions(directory)
    return render_project_evidence(
        sessions,
        source_label="claude-code sessions",
        product_name="Claude Code",
        project_label=label,
        project_display=display,
        empty_error_code="no_claude_sessions",
        empty_error_message="这个项目还没有可读取的 Claude Code 会话",
    )


def _resolve_session_directory(
    path_raw: str,
    *,
    allowed_roots: str,
) -> tuple[Path, str, str]:
    """把输入解析为会话项目目录，返回 (目录, 项目标签, 展示路径)。

    输入是 list_projects 给出的会话目录（import_path 直指目录本身）。
    """
    cleaned = (path_raw or "").strip()
    if not cleaned:
        raise ApiError(422, "claude_path_required", "请填写项目路径或 Claude Code 会话目录")

    candidate = Path(cleaned).expanduser()
    if not candidate.is_dir():
        raise ApiError(422, "claude_sessions_not_found", "这个路径下没有找到 Claude Code 会话记录")
    resolved = candidate.resolve()
    require_path_allowed(resolved, allowed_roots, error_code="claude_path_not_allowed")

    if not _is_session_directory(resolved):
        raise ApiError(422, "claude_sessions_not_found", "这个路径下没有找到 Claude Code 会话记录")
    return resolved, _label_from_munged_name(resolved.name), resolved.name


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
    return ("user", real_user_text(message_text(message.get("content"))))



