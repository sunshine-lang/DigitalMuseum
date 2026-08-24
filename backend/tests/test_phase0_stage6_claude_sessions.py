from __future__ import annotations

from functools import partial
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import create_stage, import_agent_sessions
from tests.helpers import fetch_document as _fetch_document

SESSION_A = "\n".join(
    [
        '{"type":"mode","mode":"normal","sessionId":"session-a"}',
        '{"timestamp":"2026-05-10T09:00:00.000Z","type":"user","message":{"role":"user","content":"帮我把这个页面改成响应式布局"}}',
        '{"timestamp":"2026-05-10T09:05:00.000Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"好的，我来调整断点。"}]}}',
        '{"timestamp":"2026-05-10T09:10:00.000Z","type":"user","message":{"role":"user",'
        '"content":"<local-command-caveat>Caveat: local command output</local-command-caveat>"}}',
        '{"timestamp":"2026-05-10T09:15:00.000Z","type":"user","message":{"role":"user",'
        '"content":[{"type":"tool_result","content":"tool output"}]}}',
        "not-a-json-line",
        '{"timestamp":"2026-05-10T09:20:00.000Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"完成"}]}}',
    ]
)

SESSION_B = "\n".join(
    [
        '{"timestamp":"2026-05-10T14:00:00.000Z","type":"user","message":{"role":"user","content":"继续上午的响应式任务"}}',
        '{"timestamp":"2026-05-10T14:30:00.000Z","type":"user","message":{"role":"user","content":"顺手把文案也改了"}}',
        '{"timestamp":"2026-05-10T14:35:00.000Z","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"已更新"}]}}',
    ]
)

SESSION_OLD = "\n".join(
    [
        '{"timestamp":"2025-01-01T10:00:00.000Z","type":"user","message":{"role":"user","content":"一年前的会话"}}',
    ]
)

SESSION_NO_TIMESTAMP = "\n".join(
    [
        '{"type":"user","message":{"role":"user","content":"没有时间戳的会话"}}',
    ]
)


@pytest.fixture
def claude_workspace(tmp_path: Path) -> tuple[Path, Path]:
    """返回 (真实项目路径, 会话目录)。会话目录按 Claude Code 的转义规则命名。"""
    workspace = tmp_path / "workspace" / "MyProject"
    workspace.mkdir(parents=True)
    munged = str(workspace.resolve()).replace("/", "-")
    sessions_dir = tmp_path / "claude-home" / "projects" / munged
    sessions_dir.mkdir(parents=True)
    (sessions_dir / "session-a.jsonl").write_text(SESSION_A + "\n", encoding="utf-8")
    (sessions_dir / "session-b.jsonl").write_text(SESSION_B + "\n", encoding="utf-8")
    (sessions_dir / "session-old.jsonl").write_text(SESSION_OLD + "\n", encoding="utf-8")
    (sessions_dir / "session-no-ts.jsonl").write_text(SESSION_NO_TIMESTAMP + "\n", encoding="utf-8")
    (sessions_dir / "notes.txt").write_text("not a session", encoding="utf-8")
    return workspace, sessions_dir


@pytest.fixture
def claude_client(app_paths, tmp_path: Path) -> TestClient:
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
            claude_projects_root=str(tmp_path / "claude-home" / "projects"),
        )
    ) as test_client:
        yield test_client


_import = partial(import_agent_sessions, endpoint="claude-sessions")


def test_import_by_real_project_path_creates_verified_daily_event(
    claude_client: TestClient, claude_workspace: tuple[Path, Path]
) -> None:
    workspace, _sessions_dir = claude_workspace
    stage_id = create_stage(claude_client, "Claude 阶段")

    data = _import(claude_client, stage_id, workspace)

    assert data["occurrence"]["status"] == "completed"
    assert data["occurrence"]["original_filename"] == "MyProject-claude-sessions.txt"
    events = data["events"]
    assert len(events) == 1
    event = events[0]
    assert event["title"] == "在 MyProject 与 Claude Code 协作"
    assert event["occurred_on"] == "2026-05-10"
    assert event["status"] == "verified"
    assert event["origin"] == "claude"
    claim = event["claims"][0]
    assert claim["evidence_role"] == "artifact"
    assert claim["processor_version"] == "claude-code-evidence-v1"
    assert "2 个 Claude Code 会话" in claim["text"]
    assert "3 条用户消息" in claim["text"]
    assert "帮我把这个页面改成响应式布局" in claim["text"]

    # 锚点逐字可回溯：quote 与文档对应行完全一致，行号与字符偏移吻合。
    document = _fetch_document(claude_client, data["occurrence"]["blob_sha256"])
    lines = document.split("\n")
    for anchor in claim["anchors"]:
        assert lines[anchor["line_start"] - 1] == anchor["quote"]
        assert document[anchor["char_start"] : anchor["char_end"]] == anchor["quote"]
    assert any(line.startswith("## day 2026-05-10 (2 sessions)") for line in lines)
    assert any(
        "user_messages=1 assistant_messages=2" in line and "session-a" in line
        for line in lines
    )
    assert any(line.startswith("> 帮我把这个页面改成响应式布局") for line in lines)


def test_import_by_direct_session_directory(
    claude_client: TestClient, claude_workspace: tuple[Path, Path]
) -> None:
    _workspace, sessions_dir = claude_workspace
    stage_id = create_stage(claude_client, "Claude 阶段")
    data = _import(claude_client, stage_id, sessions_dir)
    assert data["events"][0]["title"] == "在 MyProject 与 Claude Code 协作"


def test_out_of_range_and_timestampless_sessions_excluded(
    claude_client: TestClient, claude_workspace: tuple[Path, Path]
) -> None:
    workspace, _sessions_dir = claude_workspace
    stage_id = create_stage(claude_client, "Claude 阶段")
    data = _import(claude_client, stage_id, workspace)
    days = [event["occurred_on"] for event in data["events"]]
    assert days == ["2026-05-10"]


def test_reimport_aggregates_without_duplicate(
    claude_client: TestClient, claude_workspace: tuple[Path, Path]
) -> None:
    workspace, _sessions_dir = claude_workspace
    stage_id = create_stage(claude_client, "Claude 阶段")
    _import(claude_client, stage_id, workspace)
    second = _import(claude_client, stage_id, workspace)

    assert second["events"] == []
    response = claude_client.get(f"/api/v1/stages/{stage_id}/events")
    events = response.json()["data"]
    visible = [event for event in events if event["status"] not in ("rejected", "merged", "split")]
    assert len(visible) == 1
    assert visible[0]["origin"] == "aggregated"
    assert visible[0]["source_count"] == 2


def test_disputed_then_reimport_absorbs_into_user_judgement(
    claude_client: TestClient, claude_workspace: tuple[Path, Path]
) -> None:
    workspace, sessions_dir = claude_workspace
    stage_id = create_stage(claude_client, "Claude 阶段")
    data = _import(claude_client, stage_id, workspace)
    event_id = data["events"][0]["id"]
    review = claude_client.post(
        f"/api/v1/events/{event_id}/reviews",
        json={"decision": "disputed", "note": "那天其实在改别的", "expected_revision": 0},
    )
    assert review.status_code == 200

    # 追加一个同日新会话后重导：内容变化 → 新 blob，但事件并入用户已审阅的目标。
    # （05:00Z = 东八区同日 13:00，本地归日仍在 2026-05-10。）
    (sessions_dir / "session-e.jsonl").write_text(
        '{"timestamp":"2026-05-10T05:00:00.000Z","type":"user","message":{"role":"user","content":"下午继续"}}\n',
        encoding="utf-8",
    )
    third = _import(claude_client, stage_id, workspace)
    assert third["events"] == []

    response = claude_client.get(f"/api/v1/stages/{stage_id}/events")
    visible = [
        event
        for event in response.json()["data"]
        if event["status"] not in ("rejected", "merged", "split")
    ]
    assert len(visible) == 1
    assert visible[0]["status"] == "disputed"
    assert len(visible[0]["claims"]) == 2


def test_path_errors(claude_client: TestClient, tmp_path: Path) -> None:
    stage_id = create_stage(claude_client, "Claude 阶段")

    missing = claude_client.post(
        f"/api/v1/stages/{stage_id}/claude-sessions",
        json={"path": str(tmp_path / "no-such-dir")},
    )
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "claude_sessions_not_found"

    not_allowed = claude_client.post(
        f"/api/v1/stages/{stage_id}/claude-sessions",
        json={"path": "/"},
    )
    assert not_allowed.status_code == 403
    assert not_allowed.json()["error"]["code"] == "claude_path_not_allowed"

    empty = claude_client.post(
        f"/api/v1/stages/{stage_id}/claude-sessions",
        json={"path": "  "},
    )
    assert empty.status_code == 422
    assert empty.json()["error"]["code"] == "claude_path_required"


def test_no_sessions_in_range_leaves_no_residue(
    claude_client: TestClient, tmp_path: Path
) -> None:
    stage_id = create_stage(claude_client, "Claude 阶段")
    workspace = tmp_path / "empty-project"
    workspace.mkdir()
    munged = str(workspace.resolve()).replace("/", "-")
    sessions_dir = tmp_path / "claude-home" / "projects" / munged
    sessions_dir.mkdir(parents=True)
    (sessions_dir / "old.jsonl").write_text(SESSION_OLD + "\n", encoding="utf-8")

    response = claude_client.post(
        f"/api/v1/stages/{stage_id}/claude-sessions",
        json={"path": str(workspace)},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_claude_sessions_in_range"

    coverage = claude_client.get(f"/api/v1/stages/{stage_id}/coverage")
    assert coverage.json()["data"] == []


def test_restart_persists_events_and_review(
    app_paths, tmp_path: Path, claude_workspace: tuple[Path, Path]
) -> None:
    workspace, _sessions_dir = claude_workspace
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
            claude_projects_root=str(tmp_path / "claude-home" / "projects"),
        )
    ) as client:
        stage_id = create_stage(client, "Claude 阶段")
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
            claude_projects_root=str(tmp_path / "claude-home" / "projects"),
        )
    ) as client:
        events = client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
        assert len(events) == 1
        assert events[0]["status"] == "confirmed"
        assert events[0]["origin"] == "claude"


def test_preview_reports_range_without_side_effects(
    claude_client: TestClient, claude_workspace: tuple[Path, Path]
) -> None:
    workspace, _sessions_dir = claude_workspace
    response = claude_client.get(
        "/api/v1/claude-sessions/preview",
        params={"path": str(workspace)},
    )
    assert response.status_code == 200
    preview = response.json()["data"]
    assert preview["project_label"] == "MyProject"
    assert preview["first_session_on"] == "2025-01-01"
    assert preview["last_session_on"] == "2026-05-10"
    assert preview["session_count"] == 3

    stages = claude_client.get("/api/v1/stages").json()["data"]
    assert all(stage["evidence_count"] == 0 for stage in stages)
