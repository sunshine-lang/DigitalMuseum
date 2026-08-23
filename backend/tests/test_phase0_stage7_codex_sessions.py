from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

STAGE_START = "2026-03-01"
STAGE_END = "2026-08-31"


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


@pytest.fixture
def codex_client(app_paths, tmp_path: Path) -> TestClient:
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
            codex_sessions_root=str(tmp_path / "codex-home" / "sessions"),
        )
    ) as test_client:
        yield test_client


def _create_stage(client: TestClient) -> str:
    response = client.post(
        "/api/v1/stages",
        json={"name": "Codex 阶段", "starts_on": STAGE_START, "ends_on": STAGE_END},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def _import(client: TestClient, stage_id: str, path: Path | str) -> dict:
    response = client.post(
        f"/api/v1/stages/{stage_id}/codex-sessions",
        json={"path": str(path)},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _fetch_document(client: TestClient, sha256: str) -> str:
    response = client.get(f"/api/v1/blobs/{sha256}")
    assert response.status_code == 200
    return response.text


def test_import_creates_verified_daily_event_excluding_subagent(
    codex_client: TestClient, codex_workspace: tuple[Path, Path]
) -> None:
    workspace, _sessions_root = codex_workspace
    stage_id = _create_stage(codex_client)

    data = _import(codex_client, stage_id, workspace)

    assert data["occurrence"]["status"] == "completed"
    assert data["occurrence"]["original_filename"] == "MyProject-codex-sessions.txt"
    events = data["events"]
    assert len(events) == 1
    event = events[0]
    assert event["title"] == "在 MyProject 与 Codex 协作"
    assert event["occurred_on"] == "2026-05-10"
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

    document = _fetch_document(codex_client, data["occurrence"]["blob_sha256"])
    lines = document.split("\n")
    for anchor in claim["anchors"]:
        assert lines[anchor["line_start"] - 1] == anchor["quote"]
        assert document[anchor["char_start"] : anchor["char_end"]] == anchor["quote"]
    assert any(line.startswith("## day 2026-05-10 (2 sessions)") for line in lines)
    assert "sub" not in document and "OtherProject" not in document
    assert any(line.startswith("> 帮我给这个仓库加上 CI") for line in lines)


def test_reimport_aggregates_without_duplicate(
    codex_client: TestClient, codex_workspace: tuple[Path, Path]
) -> None:
    workspace, _sessions_root = codex_workspace
    stage_id = _create_stage(codex_client)
    _import(codex_client, stage_id, workspace)
    second = _import(codex_client, stage_id, workspace)

    assert second["events"] == []
    response = codex_client.get(f"/api/v1/stages/{stage_id}/events")
    events = response.json()["data"]
    visible = [
        event for event in events if event["status"] not in ("rejected", "merged", "split")
    ]
    assert len(visible) == 1
    assert visible[0]["origin"] == "aggregated"
    assert visible[0]["source_count"] == 2


def test_disputed_then_reimport_absorbs_into_user_judgement(
    codex_client: TestClient, codex_workspace: tuple[Path, Path]
) -> None:
    workspace, sessions_root = codex_workspace
    stage_id = _create_stage(codex_client)
    data = _import(codex_client, stage_id, workspace)
    event_id = data["events"][0]["id"]
    review = codex_client.post(
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
    third = _import(codex_client, stage_id, workspace)
    assert third["events"] == []

    response = codex_client.get(f"/api/v1/stages/{stage_id}/events")
    visible = [
        event
        for event in response.json()["data"]
        if event["status"] not in ("rejected", "merged", "split")
    ]
    assert len(visible) == 1
    assert visible[0]["status"] == "disputed"
    assert len(visible[0]["claims"]) == 2


def test_path_errors(codex_client: TestClient, tmp_path: Path) -> None:
    stage_id = _create_stage(codex_client)

    missing = codex_client.post(
        f"/api/v1/stages/{stage_id}/codex-sessions",
        json={"path": str(tmp_path / "no-such-dir")},
    )
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "codex_sessions_not_found"

    not_allowed = codex_client.post(
        f"/api/v1/stages/{stage_id}/codex-sessions",
        json={"path": "/"},
    )
    assert not_allowed.status_code == 403
    assert not_allowed.json()["error"]["code"] == "codex_path_not_allowed"

    empty = codex_client.post(
        f"/api/v1/stages/{stage_id}/codex-sessions",
        json={"path": "  "},
    )
    assert empty.status_code == 422
    assert empty.json()["error"]["code"] == "codex_path_required"


def test_no_sessions_in_range_leaves_no_residue(
    codex_client: TestClient, tmp_path: Path
) -> None:
    stage_id = _create_stage(codex_client)
    workspace = tmp_path / "empty-project"
    workspace.mkdir()
    sessions_root = tmp_path / "codex-home" / "sessions"
    sessions_root.mkdir(parents=True)

    response = codex_client.post(
        f"/api/v1/stages/{stage_id}/codex-sessions",
        json={"path": str(workspace)},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_codex_sessions_in_range"

    coverage = codex_client.get(f"/api/v1/stages/{stage_id}/coverage")
    assert coverage.json()["data"] == []


def test_restart_persists_events_and_review(
    app_paths, tmp_path: Path, codex_workspace: tuple[Path, Path]
) -> None:
    workspace, _sessions_root = codex_workspace
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
            codex_sessions_root=str(tmp_path / "codex-home" / "sessions"),
        )
    ) as client:
        stage_id = _create_stage(client)
        data = _import(client, stage_id, workspace)
        event_id = data["events"][0]["id"]
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
        events = client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
        assert len(events) == 1
        assert events[0]["status"] == "confirmed"
        assert events[0]["origin"] == "codex"


def test_preview_reports_range_without_side_effects(
    codex_client: TestClient, codex_workspace: tuple[Path, Path]
) -> None:
    workspace, _sessions_root = codex_workspace
    response = codex_client.get(
        "/api/v1/codex-sessions/preview",
        params={"path": str(workspace)},
    )
    assert response.status_code == 200
    preview = response.json()["data"]
    assert preview["project_label"] == "MyProject"
    assert preview["first_session_on"] == "2025-01-01"
    assert preview["last_session_on"] == "2026-05-10"
    # subagent / 其他项目 / 无 meta 的文件都不算：范围内会话只有 2 个，旧会话 1 个。
    assert preview["session_count"] == 3

    stages = codex_client.get("/api/v1/stages").json()["data"]
    assert all(stage["evidence_count"] == 0 for stage in stages)
