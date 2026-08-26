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
from datetime import date
from pathlib import Path

import zstandard

from app.core.errors import ApiError
from app.services.agent_session_evidence import (
    AgentEvidence,
    RecordClassification,
    SessionSummary,
    message_text,
    real_user_text,
    render_evidence_document,
    scan_session_records,
)
from app.services.path_policy import require_path_allowed

DSH_PROCESSOR_VERSION = "dsh-evidence-v1"

# 档案库同步的产品注册面：sync_archive 按此统一驱动各 Agent 适配器。
KIND = "dsh"
PROCESSOR_VERSION = DSH_PROCESSOR_VERSION
EVIDENCE_SUFFIX = "-dsh-sessions.txt"
AGGREGATION_ORIGINS = ("aggregated", "dsh")

_DECOMPRESSOR = zstandard.ZstdDecompressor()


def list_projects(sessions_root: str) -> list[dict]:
    """只读列举全部压缩会话首行的项目归属（名称 + 会话数），发现面板专用。

    只解压每个文件的第一行（流式惰性读取），不读会话正文。
    """
    root = Path(sessions_root).expanduser()
    if not root.is_dir():
        return []
    counts: dict[str, int] = {}
    for file_path in sorted(root.rglob("session.jsonl.zstd")):
        meta = _read_session_meta(file_path)
        if meta is None or meta.get("delegationDepth", 0) != 0:
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
            "project": Path(path).name or "dsh-project",
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
            raise ApiError(422, "no_dsh_sessions", "这个项目还没有可读取的 dsh 会话")
        raise ApiError(
            422, "no_dsh_sessions_in_range", "这个项目的 dsh 会话都不在当前范围内"
        )
    days = [session.started_at.date() for session in sessions]
    return render_evidence_document(
        source_label="dsh sessions",
        project_label=label,
        project_display=str(project_root),
        starts_on=starts_on if starts_on is not None else min(days),
        ends_on=ends_on if ends_on is not None else max(days),
        sessions=sessions,
        collaboration_title=f"在 {label} 与 dsh 协作",
        claim_noun="dsh",
    )


def _resolve_project(path_raw: str, *, allowed_roots: str) -> tuple[Path, str]:
    """dsh 会话按项目转义目录存放，项目归属由首行 cwd 决定，输入必须是
    真实项目目录（与 codex 适配器同法）。"""
    cleaned = (path_raw or "").strip()
    if not cleaned:
        raise ApiError(422, "dsh_path_required", "请填写要导入的 dsh 项目路径")

    candidate = Path(cleaned).expanduser()
    if not candidate.is_dir():
        raise ApiError(422, "dsh_sessions_not_found", "这个路径下没有找到 dsh 会话记录")
    resolved = candidate.resolve()
    require_path_allowed(resolved, allowed_roots, error_code="dsh_path_not_allowed")
    return resolved, resolved.name or "dsh-project"


def _project_sessions(project_root: Path, sessions_root: str) -> list[SessionSummary]:
    """扫描根目录下全部压缩会话，返回归属本项目的人机线程。

    确定性过滤规则：首行不是可解析的 session 记录 → 跳过；
    delegationDepth != 0（子代理线程）→ 跳过；首行 cwd 解析后不等于项目
    路径 → 跳过；解压失败或损坏 → 跳过；无可读时间戳 → 跳过。
    """
    root = Path(sessions_root).expanduser()
    summaries: list[SessionSummary] = []
    if not root.is_dir():
        return summaries
    for file_path in sorted(root.rglob("session.jsonl.zstd")):
        meta = _read_session_meta(file_path)
        if meta is None or meta.get("delegationDepth", 0) != 0:
            continue
        cwd = meta.get("cwd")
        if not isinstance(cwd, str) or not cwd:
            continue
        try:
            if Path(cwd).expanduser().resolve() != project_root:
                continue
        except OSError:
            continue
        try:
            text = _DECOMPRESSOR.decompress(file_path.read_bytes()).decode(
                "utf-8", errors="replace"
            )
        except (OSError, zstandard.ZstdError):
            continue
        summary = scan_session_records(
            io.StringIO(text).readlines(),
            session_id=file_path.parent.name,
            classify_record=_classify_record,
        )
        if summary is not None:
            summaries.append(summary)
    return summaries


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
