from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def app_paths(tmp_path: Path) -> tuple[str, Path]:
    return f"sqlite:///{tmp_path / 'museum.db'}", tmp_path / "uploads"


@pytest.fixture
def client(app_paths: tuple[str, Path]) -> TestClient:
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            max_upload_bytes=1024,
        )
    ) as test_client:
        yield test_client


def create_stage(client: TestClient) -> str:
    response = client.post(
        "/api/v1/stages",
        json={
            "name": "我的 AI 产品半年",
            "starts_on": "2026-01-01",
            "ends_on": "2026-06-30",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def upload_note(client: TestClient, stage_id: str) -> tuple[dict, bytes]:
    note = (
        "---\n"
        "title: 第一次完成独立产品\n"
        "date: 2026-05-20\n"
        "---\n"
        "\n"
        "今天发布了我的第一个独立产品。\n"
        "\n"
        "我把演示地址发给了三位朋友。\n"
    ).encode()
    response = client.post(
        f"/api/v1/stages/{stage_id}/notes",
        files={"file": ("2026-05-20-launch.md", note, "text/markdown")},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"], note


def test_stage_requires_a_three_to_twelve_month_range(client: TestClient) -> None:
    too_short = client.post(
        "/api/v1/stages",
        json={
            "name": "过短阶段",
            "starts_on": "2026-01-01",
            "ends_on": "2026-02-01",
        },
    )

    assert too_short.status_code == 422
    assert too_short.json() == {
        "error": {
            "code": "invalid_stage_range",
            "message": "建馆阶段必须在 3 到 12 个月之间",
        }
    }

    blank_name = client.post(
        "/api/v1/stages",
        json={
            "name": "   ",
            "starts_on": "2026-01-01",
            "ends_on": "2026-06-30",
        },
    )
    assert blank_name.status_code == 422
    assert blank_name.json()["error"]["code"] == "invalid_stage_name"


def test_note_import_creates_grounded_candidate_and_coverage(
    client: TestClient,
    app_paths: tuple[str, Path],
) -> None:
    stage_id = create_stage(client)
    imported, note = upload_note(client, stage_id)

    event = imported["event"]
    claim = event["claims"][0]
    anchor = claim["anchors"][0]
    expected_hash = hashlib.sha256(note).hexdigest()

    assert event["title"] == "第一次完成独立产品"
    assert event["status"] == "candidate"
    assert event["is_formal"] is False
    assert claim["text"] == "今天发布了我的第一个独立产品。"
    assert claim["epistemic_status"] == "unknown"
    assert claim["evidence_role"] == "user_statement"
    assert anchor == {
        "blob_sha256": expected_hash,
        "quote": "今天发布了我的第一个独立产品。",
        "line_start": 6,
        "line_end": 6,
        "char_start": 43,
        "char_end": 58,
    }

    assert imported["occurrence"]["original_filename"] == "2026-05-20-launch.md"
    assert imported["occurrence"]["blob_sha256"] == expected_hash
    stored_file = app_paths[1] / expected_hash[:2] / f"{expected_hash}.md"
    assert stored_file.read_bytes() == note

    coverage_response = client.get(f"/api/v1/stages/{stage_id}/coverage")
    assert coverage_response.status_code == 200
    coverage = coverage_response.json()["data"]
    assert [item["step"] for item in coverage] == [
        "stored_locally",
        "parsed_locally",
        "candidate_generated",
    ]
    assert all(item["status"] == "completed" for item in coverage)
    assert coverage[-1]["processor_version"] == "note-development-v1"


def test_identical_note_bytes_share_one_content_addressed_file(
    client: TestClient,
    app_paths: tuple[str, Path],
) -> None:
    stage_id = create_stage(client)
    first_import, note = upload_note(client, stage_id)

    duplicate = client.post(
        f"/api/v1/stages/{stage_id}/notes",
        files={"file": ("same-content.txt", note, "text/plain")},
    )

    assert duplicate.status_code == 201
    assert (
        duplicate.json()["data"]["occurrence"]["blob_sha256"]
        == first_import["occurrence"]["blob_sha256"]
    )
    stored_files = [path for path in app_paths[1].rglob("*") if path.is_file()]
    assert len(stored_files) == 1


@pytest.mark.parametrize(
    ("filename", "content", "content_type", "expected_status", "expected_code"),
    [
        ("archive.pdf", b"not really a pdf", "application/pdf", 415, "unsupported_note_type"),
        ("binary.txt", b"hello\x00world", "text/plain", 415, "invalid_note_content"),
        ("large.md", b"a" * 1025, "text/markdown", 413, "note_too_large"),
    ],
)
def test_invalid_notes_fail_closed_without_creating_events(
    client: TestClient,
    filename: str,
    content: bytes,
    content_type: str,
    expected_status: int,
    expected_code: str,
) -> None:
    stage_id = create_stage(client)

    response = client.post(
        f"/api/v1/stages/{stage_id}/notes",
        files={"file": (filename, content, content_type)},
    )

    assert response.status_code == expected_status
    assert response.json()["error"]["code"] == expected_code
    events = client.get(f"/api/v1/stages/{stage_id}/events")
    assert events.status_code == 200
    assert events.json()["data"] == []


def test_review_uses_revision_guard_and_survives_app_restart(
    client: TestClient,
    app_paths: tuple[str, Path],
) -> None:
    stage_id = create_stage(client)
    imported, _ = upload_note(client, stage_id)
    event_id = imported["event"]["id"]

    confirmed = client.post(
        f"/api/v1/events/{event_id}/reviews",
        json={
            "decision": "confirmed",
            "note": "我确认发布发生过，但“第一个”的含义只代表个人独立产品。",
            "expected_revision": 0,
        },
    )
    assert confirmed.status_code == 200
    confirmed_event = confirmed.json()["data"]
    assert confirmed_event["status"] == "confirmed"
    assert confirmed_event["is_formal"] is True
    assert confirmed_event["revision"] == 1
    assert confirmed_event["claims"][0]["epistemic_status"] == "user_confirmed"

    stale = client.post(
        f"/api/v1/events/{event_id}/reviews",
        json={
            "decision": "rejected",
            "expected_revision": 0,
        },
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_event_revision"

    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            max_upload_bytes=1024,
        )
    ) as restarted:
        restored = restarted.get(f"/api/v1/events/{event_id}")
        assert restored.status_code == 200
        assert restored.json()["data"]["status"] == "confirmed"
        assert restored.json()["data"]["revision"] == 1
        assert restored.json()["data"]["latest_review"]["note"].startswith("我确认发布发生过")


def test_unknown_review_preserves_the_verbatim_claim(client: TestClient) -> None:
    stage_id = create_stage(client)
    imported, _ = upload_note(client, stage_id)
    event = imported["event"]

    response = client.post(
        f"/api/v1/events/{event['id']}/reviews",
        json={
            "decision": "unknown",
            "note": "缺少部署记录，先保持不确定。",
            "expected_revision": 0,
        },
    )

    assert response.status_code == 200
    reviewed = response.json()["data"]
    assert reviewed["status"] == "unknown"
    assert reviewed["is_formal"] is False
    assert reviewed["claims"][0]["text"] == "今天发布了我的第一个独立产品。"
    assert reviewed["claims"][0]["epistemic_status"] == "unknown"


def test_unknown_route_uses_the_public_error_contract(client: TestClient) -> None:
    response = client.get("/api/v1/not-a-route")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "route_not_found",
            "message": "没有找到这个接口",
        }
    }
