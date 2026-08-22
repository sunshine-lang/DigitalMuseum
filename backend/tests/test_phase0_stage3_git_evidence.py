from __future__ import annotations

import hashlib
import os
import subprocess
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.git_evidence_service import import_git_repository

STAGE_START = "2026-03-01"
STAGE_END = "2026-08-31"


def _git(repo: Path, *args: str, date_iso: str | None = None) -> None:
    env = os.environ.copy()
    env.update(
        {
            "GIT_AUTHOR_NAME": "Tester",
            "GIT_AUTHOR_EMAIL": "tester@example.com",
            "GIT_COMMITTER_NAME": "Tester",
            "GIT_COMMITTER_EMAIL": "tester@example.com",
        }
    )
    if date_iso is not None:
        env["GIT_AUTHOR_DATE"] = f"{date_iso}T12:00:00"
        env["GIT_COMMITTER_DATE"] = f"{date_iso}T12:00:00"
    subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        env=env,
    )


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "demo-repo"
    repo.mkdir()
    _git(repo, "init", "-b", "main")
    commits: list[tuple[str, str]] = [
        ("commit 0: old work", "2024-01-01"),
        ("commit 1: build feature", "2026-05-10"),
        ("commit 2: fix bug", "2026-05-10"),
        ("commit 3: write docs", "2026-06-02"),
    ]
    for index, (message, day) in enumerate(commits):
        (repo / f"file-{index}.txt").write_text(f"content {index}", encoding="utf-8")
        _git(repo, "add", ".")
        _git(repo, "commit", "-m", message, date_iso=day)
    _git(repo, "tag", "-a", "v1.0.0", "-m", "first release", date_iso="2026-06-05")
    return repo


@pytest.fixture
def git_client(app_paths, tmp_path: Path) -> TestClient:
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
        )
    ) as test_client:
        yield test_client


def _create_stage(client: TestClient) -> str:
    response = client.post(
        "/api/v1/stages",
        json={"name": "Git 阶段", "starts_on": STAGE_START, "ends_on": STAGE_END},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def _import_repo(client: TestClient, stage_id: str, repo: Path):
    return client.post(f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(repo)})


def test_git_import_creates_day_and_tag_events(git_client: TestClient, git_repo: Path):
    stage_id = _create_stage(git_client)
    response = _import_repo(git_client, stage_id, git_repo)
    assert response.status_code == 201
    events = response.json()["data"]["events"]
    assert len(events) == 3

    by_key = {(event["title"], event["occurred_on"]): event for event in events}
    day_event = by_key[("在 demo-repo 提交代码", "2026-05-10")]
    assert day_event["origin"] == "git"
    assert day_event["status"] == "candidate"
    claim = day_event["claims"][0]
    assert claim["evidence_role"] == "artifact"
    assert claim["processor_version"] == "git-evidence-v1"
    assert "提交了 2 个变更" in claim["text"]
    assert "commit 1: build feature" in claim["text"]
    assert len(claim["anchors"]) == 3  # 区块标题行 + 2 条提交行

    other_day = by_key[("在 demo-repo 提交代码", "2026-06-02")]
    assert "提交了 1 个变更" in other_day["claims"][0]["text"]

    tag_event = by_key[("在 demo-repo 发布版本 v1.0.0", "2026-06-05")]
    assert tag_event["origin"] == "git"
    assert "创建了标签 v1.0.0" in tag_event["claims"][0]["text"]


def test_git_evidence_document_is_verbatim_anchorled(git_client: TestClient, git_repo: Path):
    stage_id = _create_stage(git_client)
    response = _import_repo(git_client, stage_id, git_repo)
    assert response.status_code == 201
    payload = response.json()["data"]
    occurrence = payload["occurrence"]

    evidence = import_git_repository(
        str(git_repo),
        starts_on=date.fromisoformat(STAGE_START),
        ends_on=date.fromisoformat(STAGE_END),
        allowed_roots=str(git_repo.parent),
    )
    expected_hash = hashlib.sha256(evidence.document.encode("utf-8")).hexdigest()
    assert occurrence["blob_sha256"] == expected_hash

    document_lines = evidence.document.split("\n")
    for event in payload["events"]:
        for claim in event["claims"]:
            for anchor in claim["anchors"]:
                assert document_lines[anchor["line_start"] - 1] == anchor["quote"]
                assert anchor["quote"] in evidence.document


def test_git_import_excludes_out_of_range_activity(git_client: TestClient, git_repo: Path):
    stage_id = _create_stage(git_client)
    response = _import_repo(git_client, stage_id, git_repo)
    events = response.json()["data"]["events"]
    assert all(event["occurred_on"] >= STAGE_START for event in events)
    assert all(event["occurred_on"] <= STAGE_END for event in events)

    listed = git_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert len(listed) == 3
    assert not any("2024" in (event["occurred_on"] or "") for event in listed)


def test_git_reimport_aggregates_instead_of_duplicating(git_client: TestClient, git_repo: Path):
    stage_id = _create_stage(git_client)
    assert _import_repo(git_client, stage_id, git_repo).status_code == 201
    second = _import_repo(git_client, stage_id, git_repo)
    assert second.status_code == 201
    assert second.json()["data"]["events"] == []

    listed = git_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert len(listed) == 3
    for event in listed:
        assert event["source_count"] == 2
        assert event["origin"] == "aggregated"


def test_git_review_persists_across_restart(app_paths, tmp_path: Path, git_repo: Path):
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
        )
    ) as client:
        stage_id = _create_stage(client)
        events = _import_repo(client, stage_id, git_repo).json()["data"]["events"]
        target = next(event for event in events if "提交代码" in event["title"])
        reviewed = client.post(
            f"/api/v1/events/{target['id']}/reviews",
            json={"decision": "confirmed", "note": None, "expected_revision": 0},
        )
        assert reviewed.status_code == 200

    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
        )
    ) as client:
        event = client.get(f"/api/v1/events/{target['id']}").json()["data"]
        assert event["status"] == "confirmed"


def test_git_path_outside_allowed_roots_is_rejected(app_paths, tmp_path: Path, git_repo: Path):
    database_url, upload_dir = app_paths
    other_root = tmp_path / "elsewhere"
    other_root.mkdir()
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(other_root),
        )
    ) as client:
        stage_id = _create_stage(client)
        response = _import_repo(client, stage_id, git_repo)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "repo_path_not_allowed"


def test_git_path_that_is_not_a_repository(git_client: TestClient, tmp_path: Path):
    plain_dir = tmp_path / "not-a-repo"
    plain_dir.mkdir()
    stage_id = _create_stage(git_client)
    response = _import_repo(git_client, stage_id, plain_dir)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "not_a_git_repository"


def test_git_empty_path_is_rejected(git_client: TestClient):
    stage_id = _create_stage(git_client)
    response = git_client.post(f"/api/v1/stages/{stage_id}/git-repos", json={"path": "  "})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "repo_path_required"


def test_git_no_activity_in_range_leaves_no_partial_data(git_client: TestClient, tmp_path: Path):
    quiet_repo = tmp_path / "quiet-repo"
    quiet_repo.mkdir()
    _git(quiet_repo, "init", "-b", "main")
    (quiet_repo / "only.txt").write_text("old", encoding="utf-8")
    _git(quiet_repo, "add", ".")
    _git(quiet_repo, "commit", "-m", "ancient work", date_iso="2020-01-01")

    stage_id = _create_stage(git_client)
    response = _import_repo(git_client, stage_id, quiet_repo)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_git_activity_in_range"

    listed = git_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert listed == []
    coverage = git_client.get(f"/api/v1/stages/{stage_id}/coverage").json()["data"]
    assert coverage == []
