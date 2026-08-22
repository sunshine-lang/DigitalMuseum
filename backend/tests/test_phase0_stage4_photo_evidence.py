from __future__ import annotations

import hashlib
from datetime import date
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from PIL.ExifTags import IFD

from app.main import create_app
from app.services.photo_evidence_service import analyze_photo

STAGE_START = "2026-03-01"
STAGE_END = "2026-08-31"


def _to_dms(value: float) -> tuple[int, int, float]:
    degrees = int(value)
    minutes_float = (value - degrees) * 60
    minutes = int(minutes_float)
    seconds = round((minutes_float - minutes) * 60, 4)
    return degrees, minutes, seconds


def _jpeg_bytes(
    *,
    taken_at: str = "2026:05:10 14:30:22",
    make: str | None = None,
    model: str | None = None,
    gps: tuple[float, float] | None = None,
    color: tuple[int, int, int] = (200, 30, 30),
) -> bytes:
    exif = Image.Exif()
    if make is not None:
        exif[271] = make
    if model is not None:
        exif[272] = model
    if taken_at is not None:
        exif.get_ifd(IFD.Exif)[36867] = taken_at
    if gps is not None:
        latitude, longitude = gps
        gps_ifd = exif.get_ifd(IFD.GPSInfo)
        gps_ifd[1] = "N"
        gps_ifd[2] = _to_dms(latitude)
        gps_ifd[3] = "E"
        gps_ifd[4] = _to_dms(longitude)
    image = Image.new("RGB", (32, 24), color)
    buffer = BytesIO()
    image.save(buffer, "JPEG", exif=exif)
    return buffer.getvalue()


@pytest.fixture
def photo_client(app_paths) -> TestClient:
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
        )
    ) as test_client:
        yield test_client


def _create_stage(client: TestClient) -> str:
    response = client.post(
        "/api/v1/stages",
        json={"name": "照片阶段", "starts_on": STAGE_START, "ends_on": STAGE_END},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def _upload_photo(
    client: TestClient,
    stage_id: str,
    *,
    content: bytes,
    filename: str = "IMG_20260510_143022.jpg",
    media_type: str = "image/jpeg",
):
    return client.post(
        f"/api/v1/stages/{stage_id}/photos",
        files={"file": (filename, content, media_type)},
    )


def _blob_path(upload_dir: Path, sha256: str) -> Path:
    candidates = list(upload_dir.glob(f"{sha256[:2]}/{sha256}.*"))
    assert candidates, f"blob {sha256} 没有落盘"
    return candidates[0]


def test_photo_import_creates_candidate_event_with_anchors(
    photo_client: TestClient, app_paths
):
    _, upload_dir = app_paths
    stage_id = _create_stage(photo_client)
    content = _jpeg_bytes(make="Acme", model="Phone 15", gps=(31.2261, 121.4737))

    response = _upload_photo(photo_client, stage_id, content=content)
    assert response.status_code == 201
    payload = response.json()["data"]
    occurrence = payload["occurrence"]
    event = payload["event"]

    assert occurrence["blob_sha256"] == hashlib.sha256(content).hexdigest()
    assert occurrence["status"] == "completed"
    assert event["origin"] == "photo"
    assert event["title"] == "拍摄照片"
    assert event["occurred_on"] == "2026-05-10"
    assert event["time_precision"] == "exact"
    assert event["status"] == "candidate"

    claim = event["claims"][0]
    assert claim["evidence_role"] == "artifact"
    assert claim["processor_version"] == "photo-evidence-v1"
    assert "IMG_20260510_143022.jpg" in claim["text"]
    assert "2026-05-10 14:30" in claim["text"]
    assert "Acme Phone 15" in claim["text"]
    assert claim["anchors"]

    anchor_blob_sha = claim["anchors"][0]["blob_sha256"]
    assert anchor_blob_sha != occurrence["blob_sha256"]
    descriptor_path = _blob_path(upload_dir, anchor_blob_sha)
    descriptor_lines = descriptor_path.read_text(encoding="utf-8").split("\n")
    for anchor in claim["anchors"]:
        assert descriptor_lines[anchor["line_start"] - 1] == anchor["quote"]
    assert any(line.startswith("location: 31.2261,121.4737") for line in descriptor_lines)

    image_path = _blob_path(upload_dir, occurrence["blob_sha256"])
    assert image_path.read_bytes() == content

    coverage = payload["coverage"]
    assert [item["step"] for item in coverage] == [
        "stored_locally",
        "parsed_locally",
        "candidate_generated",
    ]
    assert all(item["status"] == "completed" for item in coverage)


def test_photo_same_day_aggregates_and_descriptor_is_deterministic(
    photo_client: TestClient,
):
    stage_id = _create_stage(photo_client)
    first = _upload_photo(
        photo_client,
        stage_id,
        content=_jpeg_bytes(taken_at="2026:05:10 14:30:22", color=(200, 30, 30)),
    )
    assert first.status_code == 201
    first_event = first.json()["data"]["event"]

    second = _upload_photo(
        photo_client,
        stage_id,
        content=_jpeg_bytes(taken_at="2026:05:10 09:15:00", color=(30, 200, 120)),
        filename="IMG_20260510_091500.jpg",
    )
    assert second.status_code == 201
    second_event = second.json()["data"]["event"]
    assert second_event["id"] == first_event["id"]
    assert second_event["origin"] == "aggregated"
    assert second_event["source_count"] == 2
    assert len(second_event["claims"]) == 2

    third = _upload_photo(
        photo_client,
        stage_id,
        content=_jpeg_bytes(taken_at="2026:06:02 18:40:00", color=(30, 120, 200)),
        filename="IMG_20260602_184000.jpg",
    )
    assert third.status_code == 201
    third_event = third.json()["data"]["event"]
    assert third_event["occurred_on"] == "2026-06-02"

    listed = photo_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert len(listed) == 2

    repeat = _upload_photo(
        photo_client,
        stage_id,
        content=_jpeg_bytes(taken_at="2026:05:10 14:30:22", color=(200, 30, 30)),
    )
    assert repeat.status_code == 201
    repeat_event = repeat.json()["data"]["event"]
    assert repeat_event["source_count"] == 3
    listed = photo_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert len(listed) == 2


def test_photo_descriptor_hash_is_stable(photo_client: TestClient):
    stage_id = _create_stage(photo_client)
    content = _jpeg_bytes(make="Acme", model="Phone 15")

    first = _upload_photo(photo_client, stage_id, content=content)
    assert first.status_code == 201

    evidence = analyze_photo(
        content,
        filename="IMG_20260510_143022.jpg",
        starts_on=date.fromisoformat(STAGE_START),
        ends_on=date.fromisoformat(STAGE_END),
    )
    expected_hash = hashlib.sha256(evidence.descriptor.encode("utf-8")).hexdigest()
    anchors = first.json()["data"]["event"]["claims"][0]["anchors"]
    assert {anchor["blob_sha256"] for anchor in anchors} == {expected_hash}


def test_photo_without_exif_timestamp_is_rejected(photo_client: TestClient):
    stage_id = _create_stage(photo_client)
    buffer = BytesIO()
    Image.new("RGB", (32, 24), (10, 10, 10)).save(buffer, "PNG")
    png_bytes = buffer.getvalue()

    response = _upload_photo(
        photo_client,
        stage_id,
        content=png_bytes,
        filename="screenshot.png",
        media_type="image/png",
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "photo_missing_timestamp"

    listed = photo_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert listed == []
    coverage = photo_client.get(f"/api/v1/stages/{stage_id}/coverage").json()["data"]
    assert [item["status"] for item in coverage] == ["completed", "failed"]
    assert coverage[1]["error_code"] == "photo_missing_timestamp"


def test_photo_outside_stage_range_is_rejected(photo_client: TestClient):
    stage_id = _create_stage(photo_client)
    response = _upload_photo(
        photo_client,
        stage_id,
        content=_jpeg_bytes(taken_at="2024:01:15 08:00:00"),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "photo_outside_stage"
    listed = photo_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert listed == []


def test_photo_unsupported_suffix_and_oversize_are_rejected(app_paths):
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            max_photo_bytes=512,
        )
    ) as client:
        stage_id = _create_stage(client)

        gif = client.post(
            f"/api/v1/stages/{stage_id}/photos",
            files={"file": ("animation.gif", b"GIF89a.....", "image/gif")},
        )
        assert gif.status_code == 415
        assert gif.json()["error"]["code"] == "unsupported_photo_type"

        oversized = _upload_photo(client, stage_id, content=b"\x00" * 2048)
        assert oversized.status_code == 413
        assert oversized.json()["error"]["code"] == "photo_too_large"

        listed = client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
        assert listed == []


def test_photo_corrupt_content_is_rejected(photo_client: TestClient):
    stage_id = _create_stage(photo_client)
    response = _upload_photo(
        photo_client,
        stage_id,
        content=b"definitely not an image " * 8,
    )
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "invalid_photo_content"
    listed = photo_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert listed == []


def test_photo_review_persists_across_restart(app_paths):
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(database_url=database_url, upload_dir=upload_dir)
    ) as client:
        stage_id = _create_stage(client)
        imported = _upload_photo(client, stage_id, content=_jpeg_bytes())
        assert imported.status_code == 201
        event = imported.json()["data"]["event"]

        reviewed = client.post(
            f"/api/v1/events/{event['id']}/reviews",
            json={"decision": "confirmed", "note": None, "expected_revision": 0},
        )
        assert reviewed.status_code == 200

    with TestClient(
        create_app(database_url=database_url, upload_dir=upload_dir)
    ) as client:
        event = client.get(f"/api/v1/events/{event['id']}").json()["data"]
        assert event["status"] == "confirmed"
        assert event["origin"] == "photo"


def test_photo_aggregated_event_can_split_by_source(photo_client: TestClient):
    stage_id = _create_stage(photo_client)
    first = _upload_photo(
        photo_client,
        stage_id,
        content=_jpeg_bytes(taken_at="2026:05:10 14:30:22", color=(200, 30, 30)),
    )
    second = _upload_photo(
        photo_client,
        stage_id,
        content=_jpeg_bytes(taken_at="2026:05:10 09:15:00", color=(30, 200, 120)),
        filename="IMG_20260510_091500.jpg",
    )
    assert first.status_code == 201
    assert second.status_code == 201

    split = photo_client.post(f"/api/v1/events/{first.json()['data']['event']['id']}/split")
    assert split.status_code == 200
    children = split.json()["data"]["events"]
    assert len(children) == 2
    assert {child["origin"] for child in children} == {"split"}
    assert {child["occurred_on"] for child in children} == {"2026-05-10"}
    assert all(child["title"].startswith("照片 IMG_20260510") for child in children)
