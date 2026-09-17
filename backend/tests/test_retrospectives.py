from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.services.retrospective_service import MAX_STORY_BYTES


def story_data() -> dict:
    return {
        "id": "project-story",
        "title": "把一次协作留下来",
        "project_key": "path:/projects/museum",
        "status": "candidate",
        "starts_on": "2026-09-07",
        "ends_on": "2026-09-12",
        "chapters": [{
            "id": "first-choice",
            "title": "先做一个可以回看的版本",
            "paragraphs": ["我提出了一个想法，随后开始本地试做。"],
            "source_ids": ["user-message", "project-document"],
        }],
        "sources": [{
            "id": "user-message",
            "role": "user",
            "text": "我想先看下效果，保留原话。",
            "quote": "我想先看下效果",
            "filename": "session.jsonl",
            "line": 42,
            "timestamp": "2026-09-12T10:00:00+08:00",
        }, {
            "id": "project-document",
            "role": "document",
            "text": "原文引用保留，叙述仍为待确认草稿。",
            "quote": None,
            "filename": "design-qa.md",
            "line": 1,
            "timestamp": "2026-09-12",
        }],
        "open_questions": ["当时的个人感受尚待补充。"],
    }


def write_story(client: TestClient, data: dict, folder: str = "first") -> Path:
    path = client.app.state.settings.retrospectives_dir / folder / "story.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def test_saved_story_is_read_only_project_scoped_and_preserves_text(client: TestClient):
    data = story_data()
    path = write_story(client, data)
    original = path.read_bytes()
    archive_before = client.get("/api/v1/archive/events").json()
    response = client.get("/api/v1/retrospectives", params={"project_key": data["project_key"]})
    assert response.status_code == 200
    assert response.json() == {"data": [{**data, "exhibit": None}]}
    assert client.get("/api/v1/retrospectives", params={"project_key": "other"}).json() == {
        "data": []
    }
    assert path.read_bytes() == original
    assert client.get("/api/v1/archive/events").json() == archive_before


def test_missing_story_root_and_missing_project_query(client: TestClient):
    assert not client.app.state.settings.retrospectives_dir.exists()
    assert client.get("/api/v1/retrospectives", params={"project_key": "museum"}).json() == {
        "data": []
    }
    response = client.get("/api/v1/retrospectives")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_project_query_is_never_used_as_a_file_path(client: TestClient, tmp_path: Path):
    outside = tmp_path / "outside.json"
    outside.write_text("private data", encoding="utf-8")
    write_story(client, story_data())
    for query in (str(outside), "../../outside.json", "file:///etc/passwd"):
        response = client.get("/api/v1/retrospectives", params={"project_key": query})
        assert response.status_code == 200
        assert response.json() == {"data": []}


@pytest.mark.parametrize("defect", [
    "malformed", "quote", "reference", "verified", "confirmed", "duplicate_source",
    "duplicate_chapter", "reversed_dates", "oversize",
])
def test_invalid_drafts_fail_closed(client: TestClient, defect: str):
    data = story_data()
    if defect == "quote":
        data["sources"][0]["quote"] = "这句话不在原文里"
    elif defect == "reference":
        data["chapters"][0]["source_ids"] = ["unknown"]
    elif defect in {"verified", "confirmed"}:
        data["status"] = defect
    elif defect == "duplicate_source":
        data["sources"].append(deepcopy(data["sources"][0]))
    elif defect == "duplicate_chapter":
        data["chapters"].append(deepcopy(data["chapters"][0]))
    elif defect == "reversed_dates":
        data["ends_on"] = "2026-09-01"
    path = write_story(client, data)
    if defect == "malformed":
        path.write_text("{invalid", encoding="utf-8")
    elif defect == "oversize":
        path.write_bytes(b" " * (MAX_STORY_BYTES + 1))
    response = client.get("/api/v1/retrospectives", params={"project_key": data["project_key"]})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_retrospective"
    assert str(path) not in response.text
    assert "private" not in response.text


@pytest.mark.parametrize("target", ["root", "directory", "file"])
def test_story_symlinks_are_rejected(client: TestClient, tmp_path: Path, target: str):
    root = client.app.state.settings.retrospectives_dir
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "story.json").write_text(json.dumps(story_data()), encoding="utf-8")
    if target == "root":
        root.symlink_to(outside, target_is_directory=True)
    else:
        root.mkdir()
        if target == "directory":
            (root / "story").symlink_to(outside, target_is_directory=True)
        else:
            (root / "story").mkdir()
            (root / "story" / "story.json").symlink_to(outside / "story.json")
    response = client.get("/api/v1/retrospectives", params={"project_key": "path:/projects/museum"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_retrospective"


def test_only_one_level_story_files_are_read_and_latest_story_first(client: TestClient):
    first = story_data()
    write_story(client, first)
    second = deepcopy(first)
    second["id"] = "newer-story"
    second["ends_on"] = "2026-09-13"
    write_story(client, second, "second")
    root = client.app.state.settings.retrospectives_dir
    (root / "story.json").write_text("not a story", encoding="utf-8")
    (root / "nested" / "deep").mkdir(parents=True)
    (root / "nested" / "deep" / "story.json").write_text("not a story", encoding="utf-8")
    response = client.get("/api/v1/retrospectives", params={"project_key": first["project_key"]})
    assert response.status_code == 200
    assert [story["id"] for story in response.json()["data"]] == [second["id"], first["id"]]


def exhibit_data() -> dict:
    data = story_data()
    part = {"actor": "user", "text": "先把这件事说明白。", "source_ids": ["user-message"]}
    data["exhibit"] = {
        "title": "把协作过程整理为可阅读的展品",
        "summary": "可以先看做了什么，再查看过程和原话。",
        "starts_on": "2026-09-08", "ends_on": "2026-09-10",
        "source_ids": ["user-message", "project-document"], "artwork": "gathered-pages",
        "goal": deepcopy(part), "process": [deepcopy(part)],
        "result": {
            "actor": "record", "text": "留存的是待确认样稿。",
            "source_ids": ["project-document"],
        },
    }
    return data


@pytest.mark.parametrize("artwork", ["gathered-pages", "everyday-steps", "continuous-light", None])
def test_exhibit_catalog_omits_full_private_sources(client: TestClient, artwork: str | None):
    data = exhibit_data()
    data["exhibit"]["artwork"] = artwork
    write_story(client, data)
    old = story_data()
    old["id"] = "old-without-exhibit"
    write_story(client, old, "old")
    response = client.get("/api/v1/retrospectives/exhibits")
    assert response.status_code == 200
    previews = response.json()["data"]
    assert len(previews) == 1
    assert previews[0]["id"] == data["id"]
    assert previews[0]["project_key"] == data["project_key"]
    assert previews[0]["status"] == "candidate"
    assert previews[0]["artwork"] == artwork
    assert previews[0]["reference_count"] == 2
    assert previews[0]["source_roles"] == ["document", "user"]
    assert data["sources"][0]["text"] not in response.text
    assert "process" not in previews[0]
    full = client.get(
        "/api/v1/retrospectives", params={"project_key": data["project_key"]}
    ).json()["data"]
    assert next(story for story in full if story["id"] == data["id"])["exhibit"] == data["exhibit"]


@pytest.mark.parametrize("defect", [
    "summary_reference", "process_reference", "outside_dates", "art_url", "unknown_art",
])
def test_exhibit_references_dates_and_art_selection_fail_closed(client: TestClient, defect: str):
    data = exhibit_data()
    if defect == "summary_reference":
        data["exhibit"]["source_ids"] = ["missing"]
    elif defect == "process_reference":
        data["exhibit"]["process"][0]["source_ids"] = ["missing"]
    elif defect == "outside_dates":
        data["exhibit"]["starts_on"] = "2026-01-01"
    elif defect == "art_url":
        data["exhibit"]["artwork"] = "https://untrusted.example/private.png"
    else:
        data["exhibit"]["artwork"] = "not-an-approved-artwork"
    write_story(client, data)
    response = client.get("/api/v1/retrospectives/exhibits")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_retrospective"
