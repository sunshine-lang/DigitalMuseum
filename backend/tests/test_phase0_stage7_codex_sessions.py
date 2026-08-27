"""codex-evidence-v1 适配器行为（S3 起经档案库同步链路验证）。

确定性口径：只读 ~/.codex/sessions 日期目录下的 rollout JSONL；项目归属
由首行 session_meta.cwd 决定；只统计 thread_source=="user"（subagent 内部
线程的 user_message 是系统注入审计材料，一律排除）；cwd 已消失的项目
不进发现与同步；无 meta 的文件跳过。
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import fetch_document as _fetch_document


def _rollout_line(timestamp: str, record_type: str, payload: dict) -> str:
    return json.dumps({"timestamp": timestamp, "type": record_type, "payload": payload})


def _session_meta(cwd: str, thread_source: str = "user") -> dict:
    return {
        "session_id": "meta-session",
        "id": "meta-id",
        "timestamp": "2026-05-10T02:00:00.000Z",
        "cwd": cwd,
        "originator": "codex-tui",
        "thread_source": thread_source,
    }


SESSION_A_LINES = [
    _rollout_line(
        "2026-05-10T02:00:00.000Z", "session_meta", _session_meta("{PROJECT}")
    ),
    _rollout_line(
        "2026-05-10T02:01:00.000Z",
        "event_msg",
        {"type": "user_message", "message": "帮我给这个仓库加上 CI"},
    ),
    _rollout_line(
        "2026-05-10T02:05:00.000Z",
        "event_msg",
        {"type": "agent_message", "message": "好的，我来写工作流文件。"},
    ),
    _rollout_line(
        "2026-05-10T02:06:00.000Z",
        "event_msg",
        {"type": "user_message", "message": "<environment_context>系统注入</environment_context>"},
    ),
    "not-a-json-line",
    _rollout_line(
        "2026-05-10T02:10:00.000Z",
        "event_msg",
        {"type": "agent_message", "message": "完成"},
    ),
]

SESSION_B_LINES = [
    _rollout_line(
        "2026-05-10T06:00:00.000Z", "session_meta", _session_meta("{PROJECT}")
    ),
    _rollout_line(
        "2026-05-10T06:01:00.000Z",
        "event_msg",
        {"type": "user_message", "message": "继续上午的 CI 任务"},
    ),
    _rollout_line(
        "2026-05-10T06:05:00.000Z",
        "event_msg",
        {"type": "user_message", "message": "顺手把测试也补上"},
    ),
]

SUBAGENT_LINES = [
    _rollout_line(
        "2026-05-10T03:00:00.000Z",
        "session_meta",
        _session_meta("{PROJECT}", thread_source="subagent"),
    ),
    # subagent 的 user_message 是系统注入的审计材料，不是用户说的话——必须整体排除。
    _rollout_line(
        "2026-05-10T03:01:00.000Z",
        "event_msg",
        {"type": "user_message", "message": "The following is the Codex agent history..."},
    ),
]

OTHER_PROJECT_LINES = [
    # cwd 已消失的项目：发现端不列（断言其不进档案）。
    _rollout_line(
        "2026-05-10T04:00:00.000Z",
        "session_meta",
        _session_meta("/Users/you/Projects/OtherProject"),
    ),
    _rollout_line(
        "2026-05-10T04:01:00.000Z",
        "event_msg",
        {"type": "user_message", "message": "别的项目的会话"},
    ),
]

OLD_SESSION_LINES = [
    _rollout_line(
        "2025-01-01T03:00:00.000Z", "session_meta", _session_meta("{PROJECT}")
    ),
    _rollout_line(
        "2025-01-01T03:01:00.000Z",
        "event_msg",
        {"type": "user_message", "message": "一年前的会话"},
    ),
]

NO_META_LINES = [
    _rollout_line(
        "2026-05-10T05:00:00.000Z",
        "event_msg",
        {"type": "user_message", "message": "没有 session_meta 的文件"},
    ),
]


@pytest.fixture
def codex_workspace(tmp_path: Path) -> tuple[Path, Path]:
    """返回 (项目路径, 会话根目录)。会话按 Codex 的日期目录结构存放。"""
    workspace = tmp_path / "workspace" / "MyProject"
    workspace.mkdir(parents=True)
    sessions_root = tmp_path / "codex-home" / "sessions"
    day_dir = sessions_root / "2026" / "05" / "10"
    day_dir.mkdir(parents=True)

    def write(name: str, lines: list[str]) -> None:
        content = "\n".join(line.replace("{PROJECT}", str(workspace)) for line in lines)
        (day_dir / name).write_text(content + "\n", encoding="utf-8")

    write("rollout-2026-05-10T02-00-00-a.jsonl", SESSION_A_LINES)
    write("rollout-2026-05-10T06-00-00-b.jsonl", SESSION_B_LINES)
    write("rollout-2026-05-10T03-00-00-sub.jsonl", SUBAGENT_LINES)
    write("rollout-2026-05-10T04-00-00-other.jsonl", OTHER_PROJECT_LINES)
    (sessions_root / "2025" / "01" / "01").mkdir(parents=True)
    (
        sessions_root / "2025" / "01" / "01" / "rollout-2025-01-01T03-00-00-old.jsonl"
    ).write_text(
        "\n".join(line.replace("{PROJECT}", str(workspace)) for line in OLD_SESSION_LINES)
        + "\n",
        encoding="utf-8",
    )
    write("rollout-2026-05-10T05-00-00-nometa.jsonl", NO_META_LINES)
    return workspace, sessions_root


def _sync(client: TestClient) -> dict:
    response = client.post("/api/v1/archive/sync")
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _archive_events(client: TestClient) -> list[dict]:
    return client.get("/api/v1/archive/events").json()["data"]


def test_sync_creates_verified_daily_events_excluding_subagent(
    sync_client: TestClient, codex_workspace: tuple[Path, Path]
) -> None:
    _workspace, _sessions_root = codex_workspace

    summary = _sync(sync_client)
    # cwd 已消失的 OtherProject 不在发现列表；本项目一个项目导入。
    assert summary["projects_imported"] == 1
    assert [item["project"] for item in summary["products"]] == ["MyProject"]

    events = _archive_events(sync_client)
    # 全量读取：一年前的会话与当日会话各成一段（同步无窗口边界）。
    assert [event["occurred_on"] for event in events] == ["2025-01-01", "2026-05-10"]
    event = events[1]
    assert event["title"] == "在 MyProject 与 Codex 协作"
    assert event["status"] == "verified"
    assert event["origin"] == "codex"
    claim = event["claims"][0]
    assert claim["evidence_role"] == "artifact"
    assert claim["processor_version"] == "codex-evidence-v1"
    # subagent 与其他项目的会话被排除：只有 2 个会话、3 条真实用户消息
    #（SESSION_A 的 <environment_context> 注入行不计入）。
    assert "2 个 Codex 会话" in claim["text"]
    assert "3 条用户消息" in claim["text"]
    assert "帮我给这个仓库加上 CI" in claim["text"]

    document = _fetch_document(sync_client, claim["anchors"][0]["blob_sha256"])
    lines = document.split("\n")
    for anchor in claim["anchors"]:
        assert lines[anchor["line_start"] - 1] == anchor["quote"]
        assert document[anchor["char_start"] : anchor["char_end"]] == anchor["quote"]
    assert any(line.startswith("## day 2026-05-10 (2 sessions)") for line in lines)
    assert "sub" not in document and "OtherProject" not in document
    assert any(line.startswith("> 帮我给这个仓库加上 CI") for line in lines)


def test_same_label_projects_same_day_aggregate_into_one_event(
    sync_client: TestClient, tmp_path: Path
) -> None:
    """两个不同路径、同名末段的项目同日会话 → 同题同日聚合为一段。"""
    sessions_root = tmp_path / "codex-home" / "sessions"
    day_dir = sessions_root / "2026" / "05" / "10"
    day_dir.mkdir(parents=True)
    for parent in ("alpha", "beta"):
        project = tmp_path / parent / "MyProject"
        project.mkdir(parents=True)
        (day_dir / f"rollout-{parent}.jsonl").write_text(
            _rollout_line(
                "2026-05-10T02:00:00.000Z", "session_meta", _session_meta(str(project))
            )
            + "\n"
            + _rollout_line(
                "2026-05-10T02:01:00.000Z",
                "event_msg",
                {"type": "user_message", "message": "同一个名字的项目"},
            )
            + "\n",
            encoding="utf-8",
        )

    _sync(sync_client)
    events = _archive_events(sync_client)

    assert len(events) == 1
    assert events[0]["origin"] == "aggregated"
    assert events[0]["source_count"] == 2
    assert events[0]["status"] == "verified"


def test_disputed_then_new_session_absorbs_into_user_judgement(
    sync_client: TestClient, codex_workspace: tuple[Path, Path]
) -> None:
    workspace, sessions_root = codex_workspace
    _sync(sync_client)
    event_id = _archive_events(sync_client)[1]["id"]
    review = sync_client.post(
        f"/api/v1/events/{event_id}/reviews",
        json={"decision": "disputed", "note": "那天在休假", "expected_revision": 0},
    )
    assert review.status_code == 200

    day_dir = sessions_root / "2026" / "05" / "10"
    (day_dir / "rollout-2026-05-10T07-30-00-c.jsonl").write_text(
        "\n".join(
            line.replace("{PROJECT}", str(workspace))
            for line in [
                _rollout_line(
                    "2026-05-10T07:30:00.000Z", "session_meta", _session_meta("{PROJECT}")
                ),
                _rollout_line(
                    "2026-05-10T07:31:00.000Z",
                    "event_msg",
                    {"type": "user_message", "message": "晚上继续"},
                ),
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    summary = _sync(sync_client)
    assert summary["projects_imported"] == 1  # 快照替换，不是跳过

    events = _archive_events(sync_client)
    assert len(events) == 2
    target = next(event for event in events if event["occurred_on"] == "2026-05-10")
    assert target["status"] == "disputed"
    assert target["id"] == event_id


def test_restart_persists_events_and_review(
    app_paths, tmp_path: Path, codex_workspace: tuple[Path, Path]
) -> None:
    _workspace, _sessions_root = codex_workspace
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
            codex_sessions_root=str(tmp_path / "codex-home" / "sessions"),
        )
    ) as client:
        _sync(client)
        event_id = _archive_events(client)[1]["id"]
        confirmed = client.post(
            f"/api/v1/events/{event_id}/reviews",
            json={"decision": "confirmed", "expected_revision": 0},
        )
        assert confirmed.status_code == 200

    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
            codex_sessions_root=str(tmp_path / "codex-home" / "sessions"),
        )
    ) as client:
        events = _archive_events(client)
        assert [event["status"] for event in events] == ["verified", "confirmed"]
