"""项目视图以真实路径归组，保留旧 Claude 与恢复档案的身份边界。"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from tests.helpers import fetch_document, seed_codex_project, sync_archive


def _claude_session(
    directory: Path, name: str, *, cwd: str | None, day: str = "2026-05-10"
) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    record = {
        "type": "user",
        "timestamp": f"{day}T12:00:00.000Z",
        "message": {"role": "user", "content": "看看这个项目"},
    }
    if cwd is not None:
        record["cwd"] = cwd
    path = directory / name
    path.write_text(json.dumps(record, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def _events(client: TestClient) -> list[dict]:
    response = client.get("/api/v1/archive/events")
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_same_real_project_across_agents_has_one_key(
    sync_client: TestClient, tmp_path: Path
) -> None:
    project = seed_codex_project(tmp_path, project="MyProject")
    claude_dir = tmp_path / "claude-home" / "projects" / str(project).replace("/", "-")
    session_path = _claude_session(claude_dir, "a.jsonl", cwd=str(project))
    original_session = session_path.read_bytes()
    pi_dir = tmp_path / "pi-home" / "sessions" / "-independent-storage-name"
    pi_dir.mkdir(parents=True)
    (pi_dir / "p.jsonl").write_text(
        json.dumps({"type": "session", "cwd": str(project)}) + "\n"
        + json.dumps({
            "type": "message", "timestamp": "2026-05-10T12:00:00.000Z",
            "message": {"role": "user", "content": [{"type": "text", "text": "看看项目"}]},
        }) + "\n",
        encoding="utf-8",
    )

    sync_archive(sync_client)
    events = _events(sync_client)
    assert len(events) == 3
    assert {event["project_key"] for event in events} == {f"path:{project.resolve()}"}
    assert {event["project_path"] for event in events} == {str(project.resolve())}
    assert {event["project_label"] for event in events} == {"MyProject"}
    assert sorted(event["agent_products"] for event in events) == [["claude"], ["codex"], ["pi"]]
    assert session_path.read_bytes() == original_session

    claude = next(event for event in events if event["origin"] == "claude")
    claim = claude["claims"][0]
    document = fetch_document(sync_client, claim["anchors"][0]["blob_sha256"])
    path_anchor = next(anchor for anchor in claim["anchors"] if anchor["line_start"] == 4)
    assert path_anchor["quote"] == f"project_path: {json.dumps(str(project.resolve()))}"
    assert document[path_anchor["char_start"]:path_anchor["char_end"]] == path_anchor["quote"]
    assert sync_archive(sync_client)["projects_skipped"] == 3


def test_same_name_different_directories_remain_distinct(
    sync_client: TestClient, tmp_path: Path
) -> None:
    first = seed_codex_project(tmp_path, project="alpha/MyProject", day="2026-05-10")
    second = seed_codex_project(tmp_path, project="beta/MyProject", day="2026-05-11")
    sync_archive(sync_client)
    events = _events(sync_client)
    assert len(events) == 2
    assert {event["project_label"] for event in events} == {"MyProject"}
    assert {event["project_key"] for event in events} == {
        f"path:{first.resolve()}", f"path:{second.resolve()}"
    }


def test_snapshot_orphan_claims_keep_project_from_immutable_header(
    sync_client: TestClient, tmp_path: Path
) -> None:
    project = seed_codex_project(tmp_path, project="项目 (草稿)")
    sync_archive(sync_client)
    initial = _events(sync_client)[0]
    seed_codex_project(tmp_path, project="项目 (草稿)", first_user="继续修改这个项目")
    sync_archive(sync_client)
    updated = _events(sync_client)[0]
    assert updated["id"] == initial["id"]
    # 既有迁移可能留下旧 occurrence 的 claim；本次只读归组保留它们。
    assert len(updated["claims"]) == 2
    assert updated["project_key"] == f"path:{project.resolve()}"
    assert updated["project_path"] == str(project.resolve())
    assert updated["project_label"] == "项目 (草稿)"


def test_legacy_claude_group_never_decodes_escaped_name(
    sync_client: TestClient, tmp_path: Path
) -> None:
    project = seed_codex_project(tmp_path, project="MyProject")
    directory = tmp_path / "claude-home" / "projects" / str(project).replace("/", "-")
    _claude_session(directory, "first.jsonl", cwd=None)
    _claude_session(directory, "second.jsonl", cwd=None, day="2026-05-11")
    sync_archive(sync_client)
    events = _events(sync_client)
    claude = [event for event in events if event["origin"] == "claude"]
    assert len(claude) == 2
    assert {event["project_key"] for event in claude} == {f"claude-session:{directory.resolve()}"}
    assert all(event["project_path"] is None for event in claude)
    assert next(event for event in events if event["origin"] == "codex")["project_key"] not in {
        event["project_key"] for event in claude
    }


def test_claude_requires_cwd_in_every_included_session(
    sync_client: TestClient, tmp_path: Path
) -> None:
    project = seed_codex_project(tmp_path, project="MyProject")
    directory = tmp_path / "claude-home" / "projects" / str(project).replace("/", "-")
    _claude_session(directory, "known.jsonl", cwd=str(project))
    unknown = _claude_session(directory, "unknown.jsonl", cwd=None)
    sync_archive(sync_client)
    claude = next(event for event in _events(sync_client) if event["agent_products"] == ["claude"])
    assert claude["project_key"] == f"claude-session:{directory.resolve()}"
    assert claude["project_path"] is None

    # 不同会话路径互相矛盾时仍不能选用其中一条。
    _claude_session(directory, unknown.name, cwd=str(tmp_path / "another-project"))
    sync_archive(sync_client)
    claude = next(event for event in _events(sync_client) if event["agent_products"] == ["claude"])
    assert claude["project_path"] is None

    # 新快照补齐真实 cwd；历史孤儿 claim 缺路径时仍不能把整段冒认成已知项目。
    _claude_session(directory, unknown.name, cwd=str(project))
    sync_archive(sync_client)
    claude = next(event for event in _events(sync_client) if event["agent_products"] == ["claude"])
    assert claude["project_key"] is None
    assert claude["project_path"] is None
    assert claude["source_count"] == 2
    assert any(
        anchor["quote"] == f"project_path: {json.dumps(str(project.resolve()))}"
        for claim in claude["claims"] for anchor in claim["anchors"]
    )


def test_claude_multiple_cwds_inside_one_session_stay_unresolved(
    sync_client: TestClient, tmp_path: Path
) -> None:
    project = seed_codex_project(tmp_path, project="MyProject")
    directory = tmp_path / "claude-home" / "projects" / str(project).replace("/", "-")
    path = _claude_session(directory, "mixed.jsonl", cwd=str(project))
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps({"type": "system", "cwd": str(tmp_path / "other")}) + "\n")
    sync_archive(sync_client)
    claude = next(event for event in _events(sync_client) if event["origin"] == "claude")
    assert claude["project_path"] is None
