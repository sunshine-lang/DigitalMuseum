from __future__ import annotations

import json
from pathlib import Path

from app.services.agent_session_evidence import (
    AgentEvidence,
    RecordClassification,
    list_cwd_projects,
    real_user_text,
    render_project_evidence,
    resolve_project_directory,
    scan_project_sessions,
    scan_session_file,
)

CODEX_PROCESSOR_VERSION = "codex-evidence-v1"

# 档案库同步的产品注册面：sync_archive 按此统一驱动各 Agent 适配器。
KIND = "codex"
PROCESSOR_VERSION = CODEX_PROCESSOR_VERSION
EVIDENCE_SUFFIX = "-codex-sessions.txt"
AGGREGATION_ORIGINS = ("aggregated", "codex")


def list_projects(sessions_root: str) -> list[dict]:
    """只读列举全部 rollout 的项目归属（名称 + 真人会话数），发现面板专用。

    只统计 thread_source == "user"（与导入口径一致，subagent 审计材料排除）；
    cwd 目录已消失的项目不列。
    """
    return list_cwd_projects(
        sessions_root,
        glob_pattern="rollout-*.jsonl",
        read_project_cwd=_read_project_cwd,
        default_project="codex-project",
    )


def import_project(
    path_raw: str,
    *,
    allowed_roots: str,
    root: str,
) -> AgentEvidence:
    """读取项目全部会话并渲染证据文档（文档头时间范围取会话实际首尾日期，
    内容是数据的纯函数）。"""
    project_root, label = resolve_project_directory(
        path_raw, allowed_roots=allowed_roots, kind="codex", product_name="Codex"
    )
    sessions = scan_project_sessions(
        root,
        project_root=project_root,
        glob_pattern="rollout-*.jsonl",
        read_project_cwd=_read_project_cwd,
        scan_file=lambda path: scan_session_file(path, _classify_record),
    )
    return render_project_evidence(
        sessions,
        source_label="codex sessions",
        product_name="Codex",
        project_label=label,
        project_display=str(project_root),
        empty_error_code="no_codex_sessions",
        empty_error_message="这个项目还没有可读取的 Codex 会话",
    )


def _read_project_cwd(path: Path) -> str | None:
    """首行 session_meta → 项目归属 cwd；仅 thread_source == "user" 的
    人机线程计入（list 与 import 同口径）。"""
    meta = _read_session_meta(path)
    if meta is None or meta.get("thread_source") != "user":
        return None
    cwd = meta.get("cwd")
    return cwd if isinstance(cwd, str) and cwd.strip() else None


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
