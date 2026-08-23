"""分级信任（切片 F）：确定性证据获得“系统核实”身份，不进人工核对队列。

覆盖契约：
- Git / 照片导入产生 status="verified" 的事件，与 "candidate"（需要人工核对）区分；
- 聚合目标放宽到 verified：重复导入 git 仓库 / 同日照片并入既有 verified 事件，
  不复制新事件（防回归重点）；
- verified 事件仍可被 review（异议通道）：覆盖状态、revision 与审计行；
- 笔记事件不受影响，保持 candidate；
- verified 状态重启后持久。
"""

from __future__ import annotations

import os
import subprocess
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from PIL.ExifTags import IFD

from app.main import create_app

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
    repo = tmp_path / "trust-repo"
    repo.mkdir()
    _git(repo, "init", "-b", "main")
    for index, (message, day) in enumerate(
        [
            ("commit 1: build feature", "2026-05-10"),
            ("commit 2: fix bug", "2026-05-10"),
        ]
    ):
        (repo / f"file-{index}.txt").write_text(f"content {index}", encoding="utf-8")
        _git(repo, "add", ".")
        _git(repo, "commit", "-m", message, date_iso=day)
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


@pytest.fixture
def photo_client(app_paths) -> TestClient:
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(database_url=database_url, upload_dir=upload_dir)
    ) as test_client:
        yield test_client


def _jpeg_bytes(
    *,
    taken_at: str = "2026:05:10 14:30:22",
    color: tuple[int, int, int] = (200, 30, 30),
) -> bytes:
    exif = Image.Exif()
    exif.get_ifd(IFD.Exif)[36867] = taken_at
    image = Image.new("RGB", (32, 24), color)
    buffer = BytesIO()
    image.save(buffer, "JPEG", exif=exif)
    return buffer.getvalue()


def _create_stage(client: TestClient, name: str = "分级信任阶段") -> str:
    response = client.post(
        "/api/v1/stages",
        json={"name": name, "starts_on": STAGE_START, "ends_on": STAGE_END},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def _upload_photo(
    client: TestClient,
    stage_id: str,
    *,
    content: bytes,
    filename: str = "IMG_20260510_143022.jpg",
):
    return client.post(
        f"/api/v1/stages/{stage_id}/photos",
        files={"file": (filename, content, "image/jpeg")},
    )


def _import_note(client: TestClient, stage_id: str, *, title: str, day: str):
    document = f"---\ntitle: {title}\ndate: {day}\n---\n\n这是我自己写下的一段笔记。\n"
    return client.post(
        f"/api/v1/stages/{stage_id}/notes",
        files={"file": (f"{title}.md", document.encode("utf-8"), "text/markdown")},
    )


def _list_events(client: TestClient, stage_id: str) -> list[dict]:
    return client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]


def test_git_and_photo_events_are_system_verified_not_candidates(
    git_client: TestClient, git_repo: Path
):
    stage_id = _create_stage(git_client)
    git_events = git_client.post(
        f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
    ).json()["data"]["events"]
    assert len(git_events) == 1
    assert git_events[0]["status"] == "verified"
    assert git_events[0]["is_formal"] is False

    photo = _upload_photo(
        git_client,
        stage_id,
        content=_jpeg_bytes(taken_at="2026:06:02 09:00:00"),
        filename="IMG_20260602_090000.jpg",
    )
    assert photo.status_code == 201
    photo_event = photo.json()["data"]["event"]
    assert photo_event["status"] == "verified"
    assert photo_event["is_formal"] is False

    listed = _list_events(git_client, stage_id)
    assert {event["status"] for event in listed} == {"verified"}
    assert not [event for event in listed if event["status"] == "candidate"]


def test_git_reimport_aggregates_into_existing_verified_event(
    git_client: TestClient, git_repo: Path
):
    stage_id = _create_stage(git_client)
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


def test_same_day_photo_aggregates_into_verified_photo_event(
    photo_client: TestClient,
):
    stage_id = _create_stage(photo_client)
    first = _upload_photo(
        photo_client,
        stage_id,
        content=_jpeg_bytes(taken_at="2026:05:10 14:30:22", color=(200, 30, 30)),
    )
    assert first.status_code == 201
    assert first.json()["data"]["event"]["status"] == "verified"

    second = _upload_photo(
        photo_client,
        stage_id,
        content=_jpeg_bytes(taken_at="2026:05:10 09:15:00", color=(30, 200, 120)),
        filename="IMG_20260510_091500.jpg",
    )
    assert second.status_code == 201
    second_event = second.json()["data"]["event"]
    assert second_event["id"] == first.json()["data"]["event"]["id"]
    assert second_event["source_count"] == 2
    assert second_event["origin"] == "aggregated"
    assert second_event["status"] == "verified"

    assert len(_list_events(photo_client, stage_id)) == 1


def test_verified_event_can_be_disputed_then_confirmed_with_audit(
    photo_client: TestClient,
):
    stage_id = _create_stage(photo_client)
    imported = _upload_photo(photo_client, stage_id, content=_jpeg_bytes())
    assert imported.status_code == 201
    event = imported.json()["data"]["event"]
    assert event["status"] == "verified"
    assert event["revision"] == 0

    disputed = photo_client.post(
        f"/api/v1/events/{event['id']}/reviews",
        json={
            "decision": "disputed",
            "note": "拍摄时间读错了，实际是下午晚些时候。",
            "expected_revision": 0,
        },
    )
    assert disputed.status_code == 200
    disputed_event = disputed.json()["data"]
    assert disputed_event["status"] == "disputed"
    assert disputed_event["revision"] == 1
    audited = photo_client.get(f"/api/v1/events/{event['id']}").json()["data"]
    assert audited["latest_review"]["decision"] == "disputed"
    assert audited["latest_review"]["previous_status"] == "verified"
    assert audited["latest_review"]["revision"] == 1

    confirmed = photo_client.post(
        f"/api/v1/events/{event['id']}/reviews",
        json={"decision": "confirmed", "note": None, "expected_revision": 1},
    )
    assert confirmed.status_code == 200
    confirmed_event = confirmed.json()["data"]
    assert confirmed_event["status"] == "confirmed"
    assert confirmed_event["revision"] == 2
    assert confirmed_event["is_formal"] is True


def test_note_events_remain_candidates(photo_client: TestClient):
    stage_id = _create_stage(photo_client)
    imported = _import_note(
        photo_client, stage_id, title="亲笔记录的一件事", day="2026-04-11"
    )
    assert imported.status_code == 201
    event = imported.json()["data"]["event"]
    assert event["status"] == "candidate"
    assert event["origin"] == "note"

    listed = _list_events(photo_client, stage_id)
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
        stage_id = _create_stage(client)
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
    stage_id = _create_stage(git_client)
    first = git_client.post(
        f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(git_repo)}
    )
    assert first.status_code == 201
    events = _list_events(git_client, stage_id)
    target = next(e for e in events if "提交代码" in e["title"] and e["occurred_on"] == "2026-05-10")

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
    photo_client: TestClient,
):
    """对抗性审查修复：被用户排除的事件，机器再断言同题同日时降级回人工核对。"""
    stage_id = _create_stage(photo_client)
    first = _upload_photo(photo_client, stage_id, content=_jpeg_bytes())
    assert first.status_code == 201
    event = first.json()["data"]["event"]

    rejected = photo_client.post(
        f"/api/v1/events/{event['id']}/reviews",
        json={"decision": "rejected", "note": None, "expected_revision": 0},
    )
    assert rejected.status_code == 200

    again = _upload_photo(photo_client, stage_id, content=_jpeg_bytes())
    assert again.status_code == 201
    new_event = again.json()["data"]["event"]
    assert new_event["id"] != event["id"]
    assert new_event["status"] == "candidate"


def test_committer_date_defines_the_commit_day(app_paths, tmp_path: Path):
    """对抗性审查修复：cherry-pick/rebase 后 author date 是写作日，
    「这一天提交了」必须以 committer date（进入仓库的日期）为准。"""
    repo = tmp_path / "rebased-repo"
    repo.mkdir()
    _git(repo, "init", "-b", "main")
    env_days = {"GIT_AUTHOR_DATE": "2026-05-10T12:00:00", "GIT_COMMITTER_DATE": "2026-06-20T12:00:00"}
    import os as _os

    env = _os.environ.copy()
    env.update(
        {
            "GIT_AUTHOR_NAME": "Tester",
            "GIT_AUTHOR_EMAIL": "tester@example.com",
            "GIT_COMMITTER_NAME": "Tester",
            "GIT_COMMITTER_EMAIL": "tester@example.com",
            **env_days,
        }
    )
    import subprocess as _sp

    (repo / "a.txt").write_text("a", encoding="utf-8")
    _sp.run(["git", "-C", str(repo), "add", "."], check=True, capture_output=True, env=env)
    _sp.run(
        ["git", "-C", str(repo), "commit", "-m", "rebased work"],
        check=True,
        capture_output=True,
        env=env,
    )

    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
        )
    ) as client:
        stage_id = _create_stage(client)
        response = client.post(
            f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(repo)}
        )
        assert response.status_code == 201
        events = _list_events(client, stage_id)
        assert [(e["title"], e["occurred_on"]) for e in events] == [
            ("在 rebased-repo 提交代码", "2026-06-20")
        ]
