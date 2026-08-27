"""claude-code-evidence-v1 适配器行为（S3 起经档案库同步链路验证）。

确定性口径：只读 ~/.claude/projects 转义目录下的会话 JSONL；时间戳
（UTC 按本机时区归日）、用户/助手消息计数、首条真实用户消息原文；
系统包装行与 tool_result 不算用户消息；单行损坏跳过；无时间戳文件跳过。
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
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


def _sync(client: TestClient) -> dict:
    response = client.post("/api/v1/archive/sync")
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _archive_events(client: TestClient) -> list[dict]:
    return client.get("/api/v1/archive/events").json()["data"]


def test_sync_creates_verified_daily_events(
    sync_client: TestClient, claude_workspace: tuple[Path, Path]
) -> None:
    _workspace, _sessions_dir = claude_workspace

    summary = _sync(sync_client)
    assert summary["projects_imported"] == 1

    events = _archive_events(sync_client)
    # 全量读取：一年前的会话与当日会话各成一段（同步无窗口边界）。
    assert [event["occurred_on"] for event in events] == ["2025-01-01", "2026-05-10"]
    event = events[1]
    assert event["title"] == "在 MyProject 与 Claude Code 协作"
    assert event["status"] == "verified"
    assert event["origin"] == "claude"
    claim = event["claims"][0]
    assert claim["evidence_role"] == "artifact"
    assert claim["processor_version"] == "claude-code-evidence-v1"
    assert "2 个 Claude Code 会话" in claim["text"]
    assert "3 条用户消息" in claim["text"]
    assert "帮我把这个页面改成响应式布局" in claim["text"]

    # 锚点逐字可回溯：quote 与文档对应行完全一致，行号与字符偏移吻合。
    document = _fetch_document(sync_client, claim["anchors"][0]["blob_sha256"])
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


def test_same_label_projects_same_day_aggregate_into_one_event(
    sync_client: TestClient, tmp_path: Path
) -> None:
    """两个不同路径、同名末段的项目同日会话 → 同题同日聚合为一段。"""
    projects_root = tmp_path / "claude-home" / "projects"
    for parent in ("alpha", "beta"):
        workspace = tmp_path / parent / "MyProject"
        workspace.mkdir(parents=True)
        munged = str(workspace.resolve()).replace("/", "-")
        directory = projects_root / munged
        directory.mkdir(parents=True)
        (directory / "s.jsonl").write_text(SESSION_A + "\n", encoding="utf-8")

    _sync(sync_client)
    events = _archive_events(sync_client)

    assert len(events) == 1
    assert events[0]["origin"] == "aggregated"
    assert events[0]["source_count"] == 2
    assert events[0]["status"] == "verified"


def test_disputed_then_new_session_absorbs_into_user_judgement(
    sync_client: TestClient, claude_workspace: tuple[Path, Path]
) -> None:
    workspace, sessions_dir = claude_workspace
    _sync(sync_client)
    event_id = _archive_events(sync_client)[1]["id"]
    review = sync_client.post(
        f"/api/v1/events/{event_id}/reviews",
        json={"decision": "disputed", "note": "那天其实在改别的", "expected_revision": 0},
    )
    assert review.status_code == 200

    # 追加一个同日新会话后再同步：内容变化换快照，事件并入用户已审阅目标。
    # （05:00Z = 东八区同日 13:00，本地归日仍在 2026-05-10。）
    (sessions_dir / "session-e.jsonl").write_text(
        '{"timestamp":"2026-05-10T05:00:00.000Z","type":"user","message":{"role":"user","content":"下午继续"}}\n',
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
    app_paths, tmp_path: Path, claude_workspace: tuple[Path, Path]
) -> None:
    _workspace, _sessions_dir = claude_workspace
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
            claude_projects_root=str(tmp_path / "claude-home" / "projects"),
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
            claude_projects_root=str(tmp_path / "claude-home" / "projects"),
        )
    ) as client:
        events = _archive_events(client)
        assert [event["status"] for event in events] == ["verified", "confirmed"]
