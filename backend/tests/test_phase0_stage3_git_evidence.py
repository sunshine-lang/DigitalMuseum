from __future__ import annotations

import hashlib
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.git_evidence_service import import_git_repository
from tests.helpers import (
    STAGE_END,
    STAGE_START,
    create_stage,
    make_git_repo,
)


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    return make_git_repo(
        tmp_path / "demo-repo",
        [
            ("commit 0: old work", "2024-01-01"),
            ("commit 1: build feature", "2026-05-10"),
            ("commit 2: fix bug", "2026-05-10"),
            ("commit 3: write docs", "2026-06-02"),
        ],
        tags=[("v1.0.0", "first release", "2026-06-05")],
    )


def _import_repo(client: TestClient, stage_id: str, repo: Path):
    return client.post(f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(repo)})


def test_git_import_creates_day_and_tag_events(git_client: TestClient, git_repo: Path):
    stage_id = create_stage(git_client, "Git 阶段")
    response = _import_repo(git_client, stage_id, git_repo)
    assert response.status_code == 201
    events = response.json()["data"]["events"]
    assert len(events) == 3

    by_key = {(event["title"], event["occurred_on"]): event for event in events}
    day_event = by_key[("在 demo-repo 提交代码", "2026-05-10")]
    assert day_event["origin"] == "git"
    assert day_event["status"] == "verified"
    claim = day_event["claims"][0]
    assert claim["evidence_role"] == "artifact"
    assert claim["processor_version"] == "git-evidence-v1"
    assert "提交了 2 个变更" in claim["text"]
    assert "commit 1: build feature" in claim["text"]
    assert len(claim["anchors"]) == 3  # 区块标题行 + 2 条提交行

    other_day = by_key[("在 demo-repo 提交代码", "2026-06-02")]
    assert "提交了 1 个变更" in other_day["claims"][0]["text"]

    tag_event = by_key[("在 demo-repo 创建标签 v1.0.0", "2026-06-05")]
    assert tag_event["origin"] == "git"
    # 标签是推断性标题（存在标签 ≠ 发布了版本，轻量标签日期不可靠）：
    # 保持 candidate 由人核对，不享受"系统核实"。
    assert tag_event["status"] == "candidate"
    assert "创建了标签 v1.0.0" in tag_event["claims"][0]["text"]


def test_git_evidence_document_is_verbatim_anchorled(git_client: TestClient, git_repo: Path):
    stage_id = create_stage(git_client, "Git 阶段")
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
    stage_id = create_stage(git_client, "Git 阶段")
    response = _import_repo(git_client, stage_id, git_repo)
    events = response.json()["data"]["events"]
    assert all(event["occurred_on"] >= STAGE_START for event in events)
    assert all(event["occurred_on"] <= STAGE_END for event in events)

    listed = git_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert len(listed) == 3
    assert not any("2024" in (event["occurred_on"] or "") for event in listed)


def test_git_reimport_aggregates_instead_of_duplicating(git_client: TestClient, git_repo: Path):
    stage_id = create_stage(git_client, "Git 阶段")
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
        stage_id = create_stage(client, "Git 阶段")
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


@pytest.mark.parametrize(
    ("scenario", "expected_status", "expected_code"),
    [
        ("disallowed-root", 403, "repo_path_not_allowed"),
        ("not-a-repo", 422, "not_a_git_repository"),
        ("blank-path", 422, "repo_path_required"),
    ],
)
def test_git_import_path_error_contract(
    app_paths,
    tmp_path: Path,
    git_repo: Path,
    scenario: str,
    expected_status: int,
    expected_code: str,
):
    database_url, upload_dir = app_paths
    allowed_roots = tmp_path
    path = str(git_repo)
    if scenario == "disallowed-root":
        allowed_roots = tmp_path / "elsewhere"
        allowed_roots.mkdir()
    elif scenario == "not-a-repo":
        plain_dir = tmp_path / "not-a-repo"
        plain_dir.mkdir()
        path = str(plain_dir)
    else:  # blank-path
        path = "  "
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(allowed_roots),
        )
    ) as client:
        stage_id = create_stage(client, "Git 阶段")
        response = client.post(f"/api/v1/stages/{stage_id}/git-repos", json={"path": path})
        assert response.status_code == expected_status
        assert response.json()["error"]["code"] == expected_code


def test_git_no_activity_in_range_leaves_no_partial_data(git_client: TestClient, tmp_path: Path):
    quiet_repo = make_git_repo(tmp_path / "quiet-repo", [("ancient work", "2020-01-01")])

    stage_id = create_stage(git_client, "Git 阶段")
    response = _import_repo(git_client, stage_id, quiet_repo)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_git_activity_in_range"

    listed = git_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert listed == []
    coverage = git_client.get(f"/api/v1/stages/{stage_id}/coverage").json()["data"]
    assert coverage == []
