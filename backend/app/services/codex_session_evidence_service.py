from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.core.errors import ApiError
from app.services.agent_session_evidence import (
    AgentEvidence,
    SessionSummary,
    parse_session_timestamp,
    real_user_text,
    render_project_evidence,
    resolve_project_directory,
)

CODEX_PROCESSOR_VERSION = "codex-evidence-v2"

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
    projects = [
        {
            "project": path.name or "codex-project",
            "session_count": len(groups),
            "import_path": str(path),
        }
        for path, groups in _project_files(sessions_root).items()
    ]
    return sorted(projects, key=lambda project: (-project["session_count"], project["project"]))


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
    groups = _project_files(root).get(project_root, {})
    sessions = [summary for paths in groups.values() if (summary := _scan_sessions(paths))]
    return render_project_evidence(
        sessions,
        source_label="codex sessions",
        product_name="Codex",
        project_label=label,
        project_display=str(project_root),
        empty_error_code="no_codex_sessions",
        empty_error_message="这个项目还没有可读取的 Codex 会话",
    )


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


def _project_files(root: str) -> dict[Path, dict[str, list[Path]]]:
    groups: dict[Path, dict[str, list[Path]]] = defaultdict(lambda: defaultdict(list))
    for path in sorted(Path(root).expanduser().rglob("rollout-*.jsonl")):
        meta = _read_session_meta(path)
        if meta is None or meta.get("thread_source") != "user":
            continue
        cwd = meta.get("cwd")
        if not isinstance(cwd, str) or not cwd.strip():
            continue
        try:
            project = Path(cwd).expanduser().resolve()
        except (OSError, ValueError):
            continue
        if project.is_dir():
            identity = meta.get("id")
            identity = identity if isinstance(identity, str) and identity else path.stem
            groups[project][identity].append(path)
    return groups


# Only completed non-message kinds actually observed in local transcripts.
_NON_MESSAGES = {
    "Reasoning",
    "CommandExecution",
    "McpToolCall",
    "DynamicToolCall",
    "FileChange",
    "WebSearch",
    "SubAgentActivity",
    "ContextCompaction",
    "Extension",
    "ImageView",
    "CollabAgentToolCall",
}


def _unsupported(code: str = "unsupported_codex_message") -> ApiError:
    return ApiError(422, code, "Codex 会话格式或续接记录无法可靠读取，未更新这个项目的档案")


def _history_paths(paths: list[Path]) -> list[tuple[Path, int | None]]:
    """Follow one observed history_base chain, clipping superseded parent tails.

    Resume segment IDs are the final UUID in Codex's rollout filename. Never
    resolve a source-provided path or guess between divergent continuation tips.
    """
    metas = {path: _read_session_meta(path) or {} for path in paths}
    if not any(meta.get("history_base") is not None for meta in metas.values()):
        return [(path, None) for path in paths]
    segments = {}
    for path, meta in metas.items():
        segment = path.stem.rsplit("_", 1)[-1] if "_" in path.stem else meta.get("id")
        if not isinstance(segment, str) or not segment:
            raise _unsupported("incomplete_codex_history")
        if segment in segments:
            raise _unsupported("ambiguous_codex_history")
        segments[segment] = path
    parents = set()
    for meta in metas.values():
        base = meta.get("history_base")
        if base is None:
            continue
        if not isinstance(base, dict) or not isinstance(base.get("thread_id"), str):
            raise _unsupported("incomplete_codex_history")
        parents.add(base["thread_id"])
    tips = set(segments) - parents
    if len(tips) != 1:
        raise _unsupported("ambiguous_codex_history")
    segment = tips.pop()
    result = []
    seen = set()
    limit = None
    while segment is not None:
        if segment in seen or segment not in segments:
            raise _unsupported("incomplete_codex_history")
        seen.add(segment)
        path = segments[segment]
        result.append((path, limit))
        base = metas[path].get("history_base")
        if base is None:
            break
        segment = base["thread_id"]
        limit = base.get("end_ordinal_exclusive")
        if type(limit) is not int or limit < 0:
            raise _unsupported("incomplete_codex_history")
    if len(seen) != len(paths):
        raise _unsupported("ambiguous_codex_history")
    return list(reversed(result))


@dataclass(frozen=True, slots=True)
class _Message:
    role: str
    text: str | None
    timestamp: datetime
    turn: str | None
    priority: int
    identity: str


def _content_text(content: object, *, text_types: set[str]) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        raise _unsupported()
    parts = []
    for part in content:
        if not isinstance(part, dict) or not isinstance(part.get("type"), str):
            raise _unsupported()
        if part.get("type") in text_types:
            if not isinstance(part.get("text"), str):
                raise _unsupported()
            parts.append(part["text"])
        elif part.get("type") not in {"local_image", "image", "input_image"}:
            raise _unsupported()
    return "\n".join(parts)


def _user_text(text: str) -> str | None:
    if text.lstrip().startswith("# AGENTS.md instructions for "):
        return None
    # Observed app wrapper may prepend ambient context to an actual request.
    if text.lstrip().startswith(
        (
            "<in-app-browser-context",
            "# Files mentioned by the user:",
            "# Files pasted by the user:",
            "# Response annotations:",
        )
    ):
        if "## My request:" in text:
            request = text.split("## My request:", 1)[1]
            if request.strip():
                text = request
    return real_user_text(text)


def _message(record: dict, current_turn: str | None) -> _Message | None:
    payload = record.get("payload")
    if not isinstance(payload, dict):
        return None
    timestamp = record.get("timestamp", record.get("time"))
    kind = payload.get("type")
    if record.get("type") in {"event_msg", "response_item"} and not isinstance(kind, str):
        raise _unsupported()
    identity = None
    turn = payload.get("turn_id") or current_turn
    if record.get("type") == "event_msg" and kind == "item_completed":
        item = payload.get("item")
        if not isinstance(item, dict) or not isinstance(item.get("type"), str):
            raise _unsupported()
        if item.get("type") in _NON_MESSAGES:
            return None
        if item.get("type") not in {"UserMessage", "AgentMessage"}:
            raise _unsupported()
        role = "user" if item["type"] == "UserMessage" else "assistant"
        text = _content_text(item.get("content"), text_types={"text", "Text"})
        identity = item.get("id")
        if not isinstance(identity, str) or not identity or not isinstance(turn, str) or not turn:
            raise _unsupported()
        timestamp = payload.get("started_at_ms", timestamp)
        priority = 2
    elif record.get("type") == "event_msg" and kind in {"user_message", "agent_message"}:
        role = "user" if kind == "user_message" else "assistant"
        text = payload.get("message")
        if not isinstance(text, str):
            raise _unsupported()
        priority = 1
    elif record.get("type") == "response_item" and kind == "message":
        role = payload.get("role")
        if not isinstance(role, str):
            raise _unsupported()
        if role in {"system", "developer", "tool"}:
            return None
        if role not in {"user", "assistant"}:
            raise _unsupported()
        text = _content_text(payload.get("content"), text_types={"input_text", "output_text"})
        metadata = payload.get("internal_chat_message_metadata_passthrough")
        if isinstance(metadata, dict):
            turn = metadata.get("turn_id") or turn
        identity = payload.get("id")
        priority = 0
    else:
        if record.get("type") == "response_item" and kind == "agent_message":
            # Observed child-agent delivery (author=/root/child, recipient=/root),
            # not a user-facing assistant reply; may contain encrypted internals.
            return None
        if isinstance(kind, str) and "message" in kind.lower():
            raise _unsupported()
        return None
    text = _user_text(text) if role == "user" else text.strip()
    if not text:
        return None
    if turn is not None and not isinstance(turn, str):
        raise _unsupported()
    if priority == 0 and (not isinstance(turn, str) or not turn):
        # A bare role=user response is not sufficient provenance for a request.
        raise _unsupported()
    parsed = parse_session_timestamp(timestamp)
    if parsed is None:
        raise _unsupported("invalid_codex_message_time")
    # Legacy events have no message ID: exact timestamped record replay only.
    # Same words at another time/ordinal remain separate real messages.
    if not isinstance(identity, str) or not identity:
        identity = hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest()
    return _Message(role, text if role == "user" else None, parsed, turn, priority, identity)


def _scan_sessions(paths: list[Path]) -> SessionSummary | None:
    messages = []
    for path, limit in _history_paths(paths):
        current_turn = None
        with path.open("r", encoding="utf-8", errors="replace") as stream:
            for line in stream:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(record, dict) or not isinstance(record.get("type"), str):
                    continue
                if limit is not None:
                    ordinal = record.get("ordinal")
                    if type(ordinal) is not int:
                        raise _unsupported("incomplete_codex_history")
                    if ordinal >= limit:
                        continue
                payload = record.get("payload")
                if not isinstance(payload, dict):
                    continue
                if record.get("type") in {"event_msg", "turn_context"}:
                    turn = payload.get("turn_id")
                    if isinstance(turn, str) and turn:
                        current_turn = turn
                message = _message(record, current_turn)
                if message is not None:
                    messages.append(message)
    priorities: dict[tuple, int] = {}
    for message in messages:
        key = (message.role, message.turn)
        priorities[key] = max(priorities.get(key, 0), message.priority)
    selected: dict[tuple, _Message] = {}
    for message in messages:
        if message.priority != priorities[(message.role, message.turn)]:
            continue
        key = (message.role, message.identity)
        previous = selected.get(key)
        if previous is not None and previous.text != message.text:
            raise _unsupported("conflicting_codex_message")
        selected.setdefault(key, message)
    ordered = sorted(selected.values(), key=lambda message: message.timestamp)
    if not ordered:
        return None
    users = [message for message in ordered if message.role == "user"]
    return SessionSummary(
        session_id=paths[0].stem,
        started_at=ordered[0].timestamp,
        ended_at=ordered[-1].timestamp,
        user_messages=len(users),
        assistant_messages=len(ordered) - len(users),
        first_user_message=users[0].text if users else None,
    )
