"""分级信任（切片 F）：确定性证据获得“系统核实”身份，不进人工核对队列。

覆盖契约：
- Git 导入产生 status="verified" 的事件，与 "candidate"（需要人工核对）区分；
- 聚合目标放宽到 verified：重复导入 git 仓库并入既有 verified 事件，
  不复制新事件（防回归重点）；
- verified 事件仍可被 review（异议通道）：覆盖状态、revision 与审计行；
- 笔记事件不受影响，保持 candidate；
- verified 状态重启后持久。
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import create_stage, git, make_git_repo


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    return make_git_repo(
        tmp_path / "trust-repo",
        [
            ("commit 1: build feature", "2026-05-10"),
            ("commit 2: fix bug", "2026-05-10"),
        ],
    )


def _import_note(client: TestClient, stage_id: str, *, title: str, day: str):
    document = f"---\ntitle: {title}\ndate: {day}\n---\n\n这是我自己写下的一段笔记。\n"
    return client.post(
        f"/api/v1/stages/{stage_id}/notes",
        files={"file": (f"{title}.md", document.encode("utf-8"), "text/markdown")},
    )


def _list_events(client: TestClient, stage_id: str) -> list[dict]:
    return client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]


def test_git_events_are_system_verified_not_candidates(
    git_client: TestClient, git_repo: Path
):
    stage_id = create_stage(git_client, "分级信任阶段")
    git_events = git_client.post(
        f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
    ).json()["data"]["events"]
    assert len(git_events) == 1
    assert git_events[0]["status"] == "verified"
    assert git_events[0]["is_formal"] is False

    listed = _list_events(git_client, stage_id)
    assert {event["status"] for event in listed} == {"verified"}
    assert not [event for event in listed if event["status"] == "candidate"]


def test_git_reimport_aggregates_into_existing_verified_event(
    git_client: TestClient, git_repo: Path
):
    stage_id = create_stage(git_client, "分级信任阶段")
    first = git_client.post(
        f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
    )
    assert first.status_code == 201
    original = _list_events(git_client, stage_id)
    assert len(original) == 1

    second = git_client.post(
        f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
    )
    assert second.status_code == 201
    assert second.json()["data"]["events"] == []

    listed = _list_events(git_client, stage_id)
    assert len(listed) == 1
    assert listed[0]["id"] == original[0]["id"]
    assert listed[0]["source_count"] == 2
    assert listed[0]["origin"] == "aggregated"
    assert listed[0]["status"] == "verified"


def test_verified_event_can_be_disputed_then_confirmed_with_audit(
    git_client: TestClient, git_repo: Path
):
    stage_id = create_stage(git_client, "分级信任阶段")
    events = git_client.post(
        f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
    ).json()["data"]["events"]
    event = events[0]
    assert event["status"] == "verified"
    assert event["revision"] == 0

    disputed = git_client.post(
        f"/api/v1/events/{event['id']}/reviews",
        json={
            "decision": "disputed",
            "note": "这天其实没有提交，机器读错了仓库。",
            "expected_revision": 0,
        },
    )
    assert disputed.status_code == 200
    disputed_event = disputed.json()["data"]
    assert disputed_event["status"] == "disputed"
    assert disputed_event["revision"] == 1
    audited = git_client.get(f"/api/v1/events/{event['id']}").json()["data"]
    assert audited["latest_review"]["decision"] == "disputed"
    assert audited["latest_review"]["previous_status"] == "verified"
    assert audited["latest_review"]["revision"] == 1

    confirmed = git_client.post(
        f"/api/v1/events/{event['id']}/reviews",
        json={"decision": "confirmed", "note": None, "expected_revision": 1},
    )
    assert confirmed.status_code == 200
    confirmed_event = confirmed.json()["data"]
    assert confirmed_event["status"] == "confirmed"
    assert confirmed_event["revision"] == 2
    assert confirmed_event["is_formal"] is True


def test_note_events_remain_candidates(client: TestClient):
    stage_id = create_stage(client, "分级信任阶段")
    imported = _import_note(
        client, stage_id, title="亲笔记录的一件事", day="2026-04-11"
    )
    assert imported.status_code == 201
    event = imported.json()["data"]["event"]
    assert event["status"] == "candidate"
    assert event["origin"] == "note"

    listed = _list_events(client, stage_id)
    assert [event["status"] for event in listed] == ["candidate"]


def test_verified_status_persists_across_restart(app_paths, tmp_path: Path, git_repo: Path):
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
        )
    ) as client:
        stage_id = create_stage(client, "分级信任阶段")
        events = client.post(
            f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
        ).json()["data"]["events"]
        assert [event["status"] for event in events] == ["verified"]
        event_id = events[0]["id"]

    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
        )
    ) as restarted:
        event = restarted.get(f"/api/v1/events/{event_id}").json()["data"]
        assert event["status"] == "verified"
        assert event["origin"] == "git"
        assert event["revision"] == 0


def test_disputed_verified_event_absorbs_reimport_without_duplicate(
    git_client: TestClient, git_repo: Path
):
    """对抗性审查修复：用户异议过的日期，重复导入不得复制新的"系统核实"事件。"""
    stage_id = create_stage(git_client, "分级信任阶段")
    first = git_client.post(
        f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
    )
    assert first.status_code == 201
    events = _list_events(git_client, stage_id)
    target = next(
        e for e in events if "提交代码" in e["title"] and e["occurred_on"] == "2026-05-10"
    )

    disputed = git_client.post(
        f"/api/v1/events/{target['id']}/reviews",
        json={"decision": "disputed", "note": "这天其实没提交", "expected_revision": 0},
    )
    assert disputed.status_code == 200

    second = git_client.post(
        f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
    )
    assert second.status_code == 201

    events = _list_events(git_client, stage_id)
    same_day = [e for e in events if "提交代码" in e["title"] and e["occurred_on"] == "2026-05-10"]
    assert len(same_day) == 1  # 不复制
    assert same_day[0]["status"] == "disputed"  # 用户判定优先于机器读数
    assert len(same_day[0]["claims"]) == 2  # 两次导入各并入了 1 条 claim（按天聚合）


def test_rejected_target_downgrades_reimport_to_candidate(
    git_client: TestClient, git_repo: Path
):
    """对抗性审查修复：被用户排除的事件，机器再断言同题同日时降级回人工核对。"""
    stage_id = create_stage(git_client, "分级信任阶段")
    first = git_client.post(
        f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
    )
    assert first.status_code == 201
    target = _list_events(git_client, stage_id)[0]

    rejected = git_client.post(
        f"/api/v1/events/{target['id']}/reviews",
        json={"decision": "rejected", "note": None, "expected_revision": 0},
    )
    assert rejected.status_code == 200

    second = git_client.post(
        f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
    )
    assert second.status_code == 201
    new_event = next(
        event for event in _list_events(git_client, stage_id)
        if event["status"] == "candidate"
    )
    assert new_event["id"] != target["id"]


def test_committer_date_defines_the_commit_day(app_paths, tmp_path: Path):
    """对抗性审查修复：cherry-pick/rebase 后 author date 是写作日，
    「这一天提交了」必须以 committer date（进入仓库的日期）为准。"""
    repo = tmp_path / "rebased-repo"
    repo.mkdir()
    git(repo, "init", "-b", "main")
    (repo / "a.txt").write_text("a", encoding="utf-8")
    git(repo, "add", ".")
    git(
        repo,
        "commit",
        "-m",
        "rebased work",
        date_iso="2026-05-10",
        committer_date_iso="2026-06-20",
    )

    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
        )
    ) as client:
        stage_id = create_stage(client, "分级信任阶段")
        response = client.post(
            f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(repo)}
        )
        assert response.status_code == 201
        events = _list_events(client, stage_id)
        assert [(e["title"], e["occurred_on"]) for e in events] == [
            ("在 rebased-repo 提交代码", "2026-06-20")
        ]
