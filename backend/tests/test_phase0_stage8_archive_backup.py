from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import create_stage, seed_codex_project, sync_archive


def _seed_and_sync(client: TestClient, tmp_path) -> dict:
    """播种一个会话项目并同步，返回档案里的首个事件。"""
    seed_codex_project(tmp_path)
    sync_archive(client)
    events = client.get("/api/v1/archive/events").json()["data"]
    assert events
    return events[0]


def _export(client: TestClient) -> bytes:
    response = client.get("/api/v1/archive/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers["content-disposition"]
    return response.content


def _import_archive(client: TestClient, archive_bytes: bytes):
    return client.post(
        "/api/v1/archive/import",
        files={"file": ("archive.zip", archive_bytes, "application/zip")},
    )


def test_round_trip_restores_events_and_blobs_into_fresh_archive(
    sync_client: TestClient, tmp_path: Path
) -> None:
    """备份的意义在换机/重建：把整库恢复进一个全新的空档案库。"""
    _stage_id = create_stage(sync_client, "备份阶段")
    event = _seed_and_sync(sync_client, tmp_path)
    event_id = event["id"]
    review = sync_client.post(
        f"/api/v1/events/{event_id}/reviews",
        json={"decision": "confirmed", "note": "确实发生了", "expected_revision": 0},
    )
    assert review.status_code == 200
    blob_sha = event["claims"][0]["anchors"][0]["blob_sha256"]

    archive_bytes = _export(sync_client)

    restored_client = TestClient(
        create_app(
            database_url=f"sqlite:///{tmp_path / 'restore.db'}",
            upload_dir=tmp_path / "restore-uploads",
        )
    )
    with restored_client:
        restored = _import_archive(restored_client, archive_bytes)
        assert restored.status_code == 201, restored.text
        summary = restored.json()["data"]["restored"]
        assert summary["stages"] == 1
        assert summary["events"] == 1
        assert summary["reviews"] == 1
        assert summary["blobs_restored"] == 1

        stages = restored_client.get("/api/v1/stages").json()["data"]
        assert [stage["name"] for stage in stages] == ["备份阶段"]
        restored_events = restored_client.get(
            f"/api/v1/stages/{stages[0]['id']}/events"
        ).json()["data"]
        assert len(restored_events) == 1
        restored_event = restored_events[0]
        assert restored_event["status"] == "confirmed"
        assert restored_event["title"] == event["title"]
        assert restored_event["occurred_on"] == event["occurred_on"]
        assert len(restored_event["claims"]) == len(event["claims"])
        assert len(restored_event["claims"][0]["anchors"]) == len(
            event["claims"][0]["anchors"]
        )
        assert restored_event["latest_review"]["decision"] == "confirmed"

        # 证据文档原文按内容哈希原样回来。
        blob = restored_client.get(f"/api/v1/blobs/{blob_sha}")
        assert blob.status_code == 200
        assert "## day 2026-05-10 (1 sessions)" in blob.text


def test_reimport_reuses_existing_blobs_and_duplicates_stages(
    sync_client: TestClient, tmp_path: Path
) -> None:
    _seed_and_sync(sync_client, tmp_path)
    archive_bytes = _export(sync_client)

    first = _import_archive(sync_client, archive_bytes)
    second = _import_archive(sync_client, archive_bytes)
    assert first.status_code == 201
    assert second.status_code == 201
    summary = second.json()["data"]["restored"]
    assert summary["blobs_reused"] == 1 and summary["blobs_restored"] == 0

    # 语义：恢复是显式操作，重复导入会复制数据（内容寻址的 blob 不重复）。
    events = sync_client.get("/api/v1/archive/events").json()["data"]
    assert len(events) == 3  # 原档案 + 两次恢复副本



def test_tampered_blob_rejected_without_residue(
    sync_client: TestClient, tmp_path: Path
) -> None:
    _seed_and_sync(sync_client, tmp_path)
    archive_bytes = _export(sync_client)

    source = zipfile.ZipFile(io.BytesIO(archive_bytes))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as target:
        for name in source.namelist():
            data = source.read(name)
            if name.startswith("blobs/"):
                data = b"tampered content"
            target.writestr(name, data)

    # 恢复到全新空档案库：本地没有同 sha blob 可复用，必须从 ZIP 写回，
    # 此时逐字节校验内容哈希——不符即 fail closed，不留半成品。
    restored_client = TestClient(
        create_app(
            database_url=f"sqlite:///{tmp_path / 'tamper-restore.db'}",
            upload_dir=tmp_path / "tamper-restore-uploads",
        )
    )
    with restored_client:
        response = _import_archive(restored_client, buffer.getvalue())
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "archive_integrity_error"
        assert restored_client.get("/api/v1/stages").json()["data"] == []


def test_invalid_archives_rejected(client: TestClient) -> None:
    not_zip = _import_archive(client, b"this is not a zip")
    assert not_zip.status_code == 422
    assert not_zip.json()["error"]["code"] == "archive_invalid"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("unrelated.txt", "hello")
    missing_manifest = _import_archive(client, buffer.getvalue())
    assert missing_manifest.status_code == 422
    assert missing_manifest.json()["error"]["code"] == "archive_invalid"

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("archive.json", json.dumps({"version": "archive-v0"}))
    bad_version = _import_archive(client, buffer.getvalue())
    assert bad_version.status_code == 422
    assert bad_version.json()["error"]["code"] == "archive_version_unsupported"


def test_empty_archive_exports_and_reimports_cleanly(client: TestClient) -> None:
    archive_bytes = _export(client)
    manifest = json.loads(zipfile.ZipFile(io.BytesIO(archive_bytes)).read("archive.json"))
    assert manifest["version"] == "archive-v3"
    assert manifest["stages"] == []

    restored = _import_archive(client, archive_bytes)
    assert restored.status_code == 201
    assert client.get("/api/v1/stages").json()["data"] == []


def test_broken_reference_rejected(sync_client: TestClient, tmp_path: Path) -> None:
    _seed_and_sync(sync_client, tmp_path)
    archive_bytes = _export(sync_client)

    manifest = json.loads(zipfile.ZipFile(io.BytesIO(archive_bytes)).read("archive.json"))
    manifest["claims"][0]["event_id"] = "nonexistent-event"
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        source = zipfile.ZipFile(io.BytesIO(archive_bytes))
        for name in source.namelist():
            archive.writestr(
                name,
                json.dumps(manifest) if name == "archive.json" else source.read(name),
            )

    response = _import_archive(sync_client, buffer.getvalue())
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "archive_invalid"
