from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

NOTE_CONTENT = "# 2026-05-10 调通归档链路\n\n今天把备份导出与恢复跑通。\n"


def _create_stage(client: TestClient) -> str:
    response = client.post(
        "/api/v1/stages",
        json={"name": "备份阶段", "starts_on": "2026-03-01", "ends_on": "2026-08-31"},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def _import_note(client: TestClient, stage_id: str) -> dict:
    response = client.post(
        f"/api/v1/stages/{stage_id}/notes",
        files={"file": ("note.md", NOTE_CONTENT.encode("utf-8"), "text/markdown")},
    )
    assert response.status_code == 201
    return response.json()["data"]


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


def test_round_trip_restores_deleted_stage_events_and_blobs(client: TestClient) -> None:
    stage_id = _create_stage(client)
    note = _import_note(client, stage_id)
    event_id = note["event"]["id"]
    review = client.post(
        f"/api/v1/events/{event_id}/reviews",
        json={"decision": "confirmed", "note": "确实发生了", "expected_revision": 0},
    )
    assert review.status_code == 200
    blob_sha = note["occurrence"]["blob_sha256"]

    archive_bytes = _export(client)

    # 误删：级联清空阶段并回收 blob（正常业务行为，备份的存在意义）。
    deleted = client.delete(f"/api/v1/stages/{stage_id}")
    assert deleted.status_code == 200
    assert client.get(f"/api/v1/stages/{stage_id}/events").status_code == 404
    assert client.get(f"/api/v1/blobs/{blob_sha}").status_code == 404

    restored = _import_archive(client, archive_bytes)
    assert restored.status_code == 201, restored.text
    summary = restored.json()["data"]["restored"]
    assert summary["stages"] == 1
    assert summary["events"] == 1
    assert summary["reviews"] == 1
    assert summary["blobs_restored"] == 1

    stages = client.get("/api/v1/stages").json()["data"]
    assert len(stages) == 1
    assert stages[0]["name"] == "备份阶段"
    events = client.get(f"/api/v1/stages/{stages[0]['id']}/events").json()["data"]
    assert len(events) == 1
    event = events[0]
    assert event["status"] == "confirmed"
    assert event["title"] == note["event"]["title"]
    assert event["occurred_on"] == note["event"]["occurred_on"]
    assert len(event["claims"]) == len(note["event"]["claims"])
    assert len(event["claims"][0]["anchors"]) == len(
        note["event"]["claims"][0]["anchors"]
    )
    assert event["latest_review"]["decision"] == "confirmed"

    # 原文按内容哈希原样回来。
    blob = client.get(f"/api/v1/blobs/{blob_sha}")
    assert blob.status_code == 200
    assert blob.content == NOTE_CONTENT.encode("utf-8")


def test_reimport_reuses_existing_blobs_and_duplicates_stages(client: TestClient) -> None:
    stage_id = _create_stage(client)
    _import_note(client, stage_id)
    archive_bytes = _export(client)

    first = _import_archive(client, archive_bytes)
    assert first.status_code == 201
    second = _import_archive(client, archive_bytes)
    assert second.status_code == 201
    summary = second.json()["data"]["restored"]
    assert summary["blobs_reused"] == 1 and summary["blobs_restored"] == 0

    # 语义：恢复是显式操作，重复导入会复制阶段（内容寻址的 blob 不重复）。
    stages = client.get("/api/v1/stages").json()["data"]
    assert len(stages) == 3  # 原阶段 + 两次恢复


def test_tampered_blob_rejected_without_residue(client: TestClient) -> None:
    stage_id = _create_stage(client)
    _import_note(client, stage_id)
    archive_bytes = _export(client)

    # 删除阶段使 blob 被回收，恢复时必须从 ZIP 写回 → 此时校验内容哈希。
    # （本地已有同 sha blob 时会直接复用本地副本、不信任 ZIP 字节，另行覆盖。）
    assert client.delete(f"/api/v1/stages/{stage_id}").status_code == 200

    source = zipfile.ZipFile(io.BytesIO(archive_bytes))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as target:
        for name in source.namelist():
            data = source.read(name)
            if name.startswith("blobs/"):
                data = b"tampered content"
            target.writestr(name, data)

    response = _import_archive(client, buffer.getvalue())
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "archive_integrity_error"

    # fail closed：没有任何半成品残留。
    stages = client.get("/api/v1/stages").json()["data"]
    assert stages == []


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
    assert manifest["version"] == "archive-v1"
    assert manifest["stages"] == []

    restored = _import_archive(client, archive_bytes)
    assert restored.status_code == 201
    assert client.get("/api/v1/stages").json()["data"] == []


def test_broken_reference_rejected(client: TestClient, tmp_path: Path) -> None:
    stage_id = _create_stage(client)
    _import_note(client, stage_id)
    archive_bytes = _export(client)

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

    response = _import_archive(client, buffer.getvalue())
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "archive_invalid"
