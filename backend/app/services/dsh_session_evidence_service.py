"""dsh-evidence-v1：只读 ~/.dsh/sessions 的 dsh 会话转录（zstd 压缩）。

确定性口径：
- 会话按 转义目录/session-UUID/session.jsonl.zstd 存放；首行
  `{"type":"session", cwd, delegationDepth}`——**delegationDepth > 0 的
  子代理线程的 user_message 是系统注入的审计材料，一律排除**；
- 时间戳是 epoch 毫秒（time 字段），按本机时区归日；
- 只提取时间戳、用户/助手消息计数与首条真实用户消息原文；
  user/message 记录的 data.source.kind 非 "user" 时视为注入、不计；
- cwd 已消失的项目不列、不导；**绝不修改 ~/.dsh 下任何内容**。
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import zstandard

from app.services.agent_session_evidence import (
    AgentEvidence,
    RecordClassification,
    SessionSummary,
    list_cwd_projects,
    message_text,
    real_user_text,
    render_project_evidence,
    resolve_project_directory,
    scan_project_sessions,
    scan_session_records,
)

DSH_PROCESSOR_VERSION = "dsh-evidence-v1"

# 档案库同步的产品注册面：sync_archive 按此统一驱动各 Agent 适配器。
KIND = "dsh"
PROCESSOR_VERSION = DSH_PROCESSOR_VERSION
EVIDENCE_SUFFIX = "-dsh-sessions.txt"
AGGREGATION_ORIGINS = ("aggregated", "dsh")

_DECOMPRESSOR = zstandard.ZstdDecompressor()


def list_projects(sessions_root: str) -> list[dict]:
    """只读列举全部压缩会话首行的项目归属（名称 + 会话数），发现面板专用。

    只解压每个文件的第一行（流式惰性读取），不读会话正文；delegationDepth
    非 0 的子代理线程不计入（与导入口径一致）。
    """
    return list_cwd_projects(
        sessions_root,
        glob_pattern="session.jsonl.zstd",
        read_project_cwd=_read_project_cwd,
        default_project="dsh-project",
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
        path_raw, allowed_roots=allowed_roots, kind="dsh", product_name="dsh"
    )
    sessions = scan_project_sessions(
        root,
        project_root=project_root,
        glob_pattern="session.jsonl.zstd",
        read_project_cwd=_read_project_cwd,
        scan_file=_scan_zstd_session,
    )
    return render_project_evidence(
        sessions,
        source_label="dsh sessions",
        product_name="dsh",
        project_label=label,
        project_display=str(project_root),
        empty_error_code="no_dsh_sessions",
        empty_error_message="这个项目还没有可读取的 dsh 会话",
    )


def _read_project_cwd(path: Path) -> str | None:
    """首行 session 记录 → 项目归属 cwd；delegationDepth != 0 的子代理
    线程不计入（list 与 import 同口径）。"""
    meta = _read_session_meta(path)
    if meta is None or meta.get("delegationDepth", 0) != 0:
        return None
    cwd = meta.get("cwd")
    return cwd if isinstance(cwd, str) and cwd.strip() else None


def _scan_zstd_session(path: Path) -> SessionSummary | None:
    """整文件解压后走共享扫描骨架；解压失败或损坏确定性跳过。"""
    try:
        text = _DECOMPRESSOR.decompress(path.read_bytes()).decode(
            "utf-8", errors="replace"
        )
    except (OSError, zstandard.ZstdError):
        return None
    return scan_session_records(
        io.StringIO(text),
        session_id=path.parent.name,
        classify_record=_classify_record,
    )


def _read_session_meta(path: Path) -> dict | None:
    """只读首行 session 记录（流式惰性解压到第一个换行；stream_reader
    没有 readline，分块读即可）。"""
    try:
        with path.open("rb") as handle:
            with _DECOMPRESSOR.stream_reader(handle) as stream:
                first = _read_until_newline(stream)
    except (OSError, zstandard.ZstdError):
        return None
    stripped = first.strip()
    if not stripped:
        return None
    try:
        record = json.loads(stripped)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return record if isinstance(record, dict) and record.get("type") == "session" else None


def _read_until_newline(stream, *, limit: int = 65536) -> bytes:
    buffer = bytearray()
    while len(buffer) < limit:
        chunk = stream.read(256)
        if not chunk:
            break
        buffer.extend(chunk)
        if b"\n" in buffer:
            return bytes(buffer.split(b"\n", 1)[0])
    return bytes(buffer)


def _classify_record(record: dict) -> RecordClassification | None:
    """dsh 记录分类：assistant/message 计助手消息；user/message 取 content
    片段文本，且仅当来源是真人（data.source.kind == "user"）时计入。"""
    record_type = record.get("type")
    if record_type == "assistant/message":
        message = record.get("data", {}).get("message")
        if isinstance(message, dict) and message.get("role") == "assistant":
            return ("assistant", None)
        return None
    if record_type != "user/message":
        return None
    data = record.get("data")
    if not isinstance(data, dict):
        return None
    source = data.get("source")
    if isinstance(source, dict) and source.get("kind") not in (None, "user"):
        return None
    return ("user", real_user_text(message_text(data.get("content"))))
