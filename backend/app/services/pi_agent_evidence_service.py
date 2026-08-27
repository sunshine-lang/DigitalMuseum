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
from pathlib import Path

from app.services.agent_session_evidence import (
    AgentEvidence,
    RecordClassification,
    list_cwd_projects,
    message_text,
    real_user_text,
    render_project_evidence,
    resolve_project_directory,
    scan_project_sessions,
    scan_session_file,
)

PI_PROCESSOR_VERSION = "pi-agent-evidence-v1"

# 档案库同步的产品注册面：sync_archive 按此统一驱动各 Agent 适配器。
KIND = "pi"
PROCESSOR_VERSION = PI_PROCESSOR_VERSION
EVIDENCE_SUFFIX = "-pi-sessions.txt"
AGGREGATION_ORIGINS = ("aggregated", "pi")


def list_projects(sessions_root: str) -> list[dict]:
    """只读列举全部会话文件首行的项目归属（名称 + 会话数），发现面板专用。"""
    return list_cwd_projects(
        sessions_root,
        glob_pattern="*.jsonl",
        read_project_cwd=_read_session_cwd,
        default_project="pi-project",
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
        path_raw, allowed_roots=allowed_roots, kind="pi", product_name="pi"
    )
    sessions = scan_project_sessions(
        root,
        project_root=project_root,
        glob_pattern="*.jsonl",
        read_project_cwd=_read_session_cwd,
        scan_file=lambda path: scan_session_file(path, _classify_record),
    )
    return render_project_evidence(
        sessions,
        source_label="pi agent sessions",
        product_name="pi",
        project_label=label,
        project_display=str(project_root),
        empty_error_code="no_pi_sessions",
        empty_error_message="这个项目还没有可读取的 pi 会话",
    )


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
