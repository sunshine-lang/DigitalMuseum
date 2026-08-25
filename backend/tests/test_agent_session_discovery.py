"""会话发现面板（GET /{claude,codex}-sessions/projects）：只读列举本机项目。

口径与导入口径一致：Claude 数目录下的 *.jsonl 文件（不读内容）；Codex 只读
每个 rollout 首行，只统计 thread_source=="user"，cwd 已消失的项目不列。
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import create_stage


def _write_claude_session(projects_root: Path, munged: str, filename: str) -> None:
    directory = projects_root / munged
    directory.mkdir(parents=True, exist_ok=True)
    (directory / filename).write_text(
        json.dumps(
            {
                "type": "user",
                "timestamp": "2026-05-10T02:00:00.000Z",
                "message": {"content": "一条消息"},
            }
        )
        + "\n",
        encoding="utf-8",
    )


def _write_codex_rollout(
    sessions_root: Path,
    filename: str,
    cwd: str,
    *,
    thread_source: str = "user",
) -> None:
    path = sessions_root / "2026" / "05" / "10" / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    first = json.dumps(
        {
            "type": "session_meta",
            "payload": {"cwd": cwd, "thread_source": thread_source},
        }
    )
    path.write_text(first + "\n", encoding="utf-8")


def _discovery_client(tmp_path: Path) -> TestClient:
    return TestClient(
        create_app(
            database_url=f"sqlite:///{tmp_path / 'discovery.db'}",
            upload_dir=tmp_path / "uploads",
            allowed_repo_roots=str(tmp_path),
            claude_projects_root=str(tmp_path / "claude-home" / "projects"),
            codex_sessions_root=str(tmp_path / "codex-home" / "sessions"),
        )
    )


def test_claude_discovery_lists_projects_by_session_count(tmp_path: Path):
    projects_root = tmp_path / "claude-home" / "projects"
    _write_claude_session(projects_root, "-Users-you-Projects-alpha", "a.jsonl")
    _write_claude_session(projects_root, "-Users-you-Projects-alpha", "b.jsonl")
    _write_claude_session(projects_root, "-Users-you-Projects-beta", "c.jsonl")
    # 空目录与普通文件都不算项目。
    (projects_root / "-Users-you-Projects-empty").mkdir(parents=True)
    (projects_root / "stray.txt").write_text("x", encoding="utf-8")

    with _discovery_client(tmp_path) as client:
        listed = client.get("/api/v1/claude-sessions/projects").json()["data"]

    assert [(item["project"], item["session_count"]) for item in listed] == [
        ("alpha", 2),
        ("beta", 1),
    ]
    # import_path 直接指向会话目录，可原样走导入端点。
    assert Path(listed[0]["import_path"]).is_dir()
    assert listed[0]["import_path"].endswith("-Users-you-Projects-alpha")


def test_codex_discovery_counts_user_threads_and_skips_dead_cwd(tmp_path: Path):
    sessions_root = tmp_path / "codex-home" / "sessions"
    project = tmp_path / "proj-live"
    project.mkdir()
    _write_codex_rollout(sessions_root, "rollout-a.jsonl", str(project))
    _write_codex_rollout(sessions_root, "rollout-b.jsonl", str(project))
    # subagent 线程不计；cwd 已不存在的不列；损坏首行跳过。
    _write_codex_rollout(
        sessions_root, "rollout-sub.jsonl", str(project), thread_source="subagent"
    )
    _write_codex_rollout(sessions_root, "rollout-dead.jsonl", str(tmp_path / "gone"))
    (sessions_root / "2026" / "05" / "10" / "rollout-broken.jsonl").write_text(
        "not-json\n", encoding="utf-8"
    )

    with _discovery_client(tmp_path) as client:
        listed = client.get("/api/v1/codex-sessions/projects").json()["data"]

    assert [(item["project"], item["session_count"]) for item in listed] == [
        ("proj-live", 2)
    ]
    assert Path(listed[0]["import_path"]).is_dir()


def test_discovery_returns_empty_lists_for_missing_roots(tmp_path: Path):
    with _discovery_client(tmp_path) as client:
        claude = client.get("/api/v1/claude-sessions/projects")
        codex = client.get("/api/v1/codex-sessions/projects")

    assert claude.status_code == 200
    assert claude.json()["data"] == []
    assert codex.status_code == 200
    assert codex.json()["data"] == []


def test_discovered_import_path_round_trips_into_import(tmp_path: Path):
    """发现面板返回的 import_path 必须能原样喂给导入端点（发现→导入闭环）。"""
    projects_root = tmp_path / "claude-home" / "projects"
    _write_claude_session(projects_root, "-Users-you-Projects-alpha", "a.jsonl")

    with _discovery_client(tmp_path) as client:
        stage_id = create_stage(client, "发现导入闭环")
        discovered = client.get("/api/v1/claude-sessions/projects").json()["data"]
        imported = client.post(
            f"/api/v1/stages/{stage_id}/claude-sessions",
            json={"path": discovered[0]["import_path"]},
        )

    assert imported.status_code == 201, imported.text
    assert len(imported.json()["data"]["events"]) == 1
