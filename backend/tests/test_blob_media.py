"""切片 B · 照片上墙：本地 Blob 媒体端点、claim.source_media 契约与阶段删除时的
Blob 引用回收（对抗性审查遗留项）。"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select

from app.domain.models import EvidenceBlob
from app.main import create_app
from tests.helpers import (
    create_stage,
    jpeg_bytes,
    make_git_repo,
    upload_note,
    upload_photo,
)


def _blob_row_count(database_url: str, sha256: str) -> int:
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            return (
                connection.scalar(
                    select(func.count(EvidenceBlob.sha256)).where(
                        EvidenceBlob.sha256 == sha256
                    )
                )
                or 0
            )
    finally:
        engine.dispose()


def _blob_file(upload_dir: Path, sha256: str) -> Path | None:
    candidates = list(upload_dir.glob(f"{sha256[:2]}/{sha256}.*"))
    return candidates[0] if candidates else None


# ---------------------------------------------------------------------------
# GET /api/v1/blobs/{sha256}
# ---------------------------------------------------------------------------


def test_blob_endpoint_serves_original_photo_bytes(
    photo_client: TestClient,
):
    stage_id = create_stage(photo_client, "照片阶段")
    content = jpeg_bytes()
    imported = upload_photo(photo_client, stage_id, content=content)
    assert imported.status_code == 201
    sha256 = imported.json()["data"]["occurrence"]["blob_sha256"]

    response = photo_client.get(f"/api/v1/blobs/{sha256}")

    assert response.status_code == 200
    assert response.content == content
    assert response.headers["content-type"] == "image/jpeg"
    # 内容寻址：内容永不变，可以永久缓存。
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_blob_endpoint_rejects_unknown_hash_with_404(photo_client: TestClient):
    create_stage(photo_client, "照片阶段")

    unknown = photo_client.get("/api/v1/blobs/" + "0" * 64)

    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "blob_not_found"


@pytest.mark.parametrize(
    "invalid_sha",
    [
        "A" * 64,  # 大写十六进制
        "0" * 63,  # 长度不足
        "0" * 65,  # 长度超限
        "zz" + "0" * 62,  # 非十六进制字符
        "%2e%2e",  # 解码后是 ".."（进入路由参数）
    ],
)
def test_blob_endpoint_fail_closes_invalid_hashes(
    photo_client: TestClient, invalid_sha: str
):
    response = photo_client.get(f"/api/v1/blobs/{invalid_sha}")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_blob_id"


def test_blob_endpoint_fails_closed_on_path_traversal(photo_client: TestClient):
    # 带路径分隔符的穿越串会被客户端/路由归一化拦下（404）或进入参数后被
    # hex 校验拒绝（422）；无论哪一层，都不允许命中文件。
    response = photo_client.get("/api/v1/blobs/..%2f..%2fetc%2fpasswd")

    assert response.status_code in (404, 422)
    assert response.json()["error"]["code"] in ("route_not_found", "invalid_blob_id")


def test_blob_endpoint_returns_404_when_file_is_missing(
    photo_client: TestClient, app_paths: tuple[str, Path]
):
    _, upload_dir = app_paths
    stage_id = create_stage(photo_client, "照片阶段")
    content = jpeg_bytes()
    imported = upload_photo(photo_client, stage_id, content=content)
    assert imported.status_code == 201
    sha256 = hashlib.sha256(content).hexdigest()
    blob_file = _blob_file(upload_dir, sha256)
    assert blob_file is not None
    blob_file.unlink()  # 模拟文件被手动删除：DB 有行、磁盘无文件

    response = photo_client.get(f"/api/v1/blobs/{sha256}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "blob_not_found"


# ---------------------------------------------------------------------------
# ClaimOut.source_media
# ---------------------------------------------------------------------------


def test_photo_event_claims_expose_source_media(photo_client: TestClient):
    stage_id = create_stage(photo_client, "照片阶段")
    first = jpeg_bytes(taken_at="2026:05:10 14:30:22", color=(200, 30, 30))
    second = jpeg_bytes(taken_at="2026:05:10 09:15:00", color=(30, 200, 120))
    imported_first = upload_photo(photo_client, stage_id, content=first)
    imported_second = upload_photo(
        photo_client,
        stage_id,
        content=second,
        filename="IMG_20260510_091500.jpg",
    )
    assert imported_first.status_code == 201
    assert imported_second.status_code == 201

    # 写路径：同日聚合进同一事件，两条 claim 各自指向自己的原图。
    event = imported_second.json()["data"]["event"]
    assert len(event["claims"]) == 2
    assert event["claims"][0]["source_media"] == {
        "sha256": hashlib.sha256(first).hexdigest(),
        "media_type": "image/jpeg",
    }
    assert event["claims"][1]["source_media"] == {
        "sha256": hashlib.sha256(second).hexdigest(),
        "media_type": "image/jpeg",
    }

    # 读路径（列表端点）与写路径一致。
    listed = photo_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert listed[0]["claims"][0]["source_media"] == {
        "sha256": hashlib.sha256(first).hexdigest(),
        "media_type": "image/jpeg",
    }


def test_note_and_git_events_have_null_source_media(app_paths, tmp_path: Path):
    database_url, upload_dir = app_paths
    repo = make_git_repo(tmp_path / "blob-media-repo", [("commit 1: build feature", "2026-05-10")])
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
        )
    ) as client:
        stage_id = create_stage(client, "照片阶段")

        upload_note(client, stage_id, "2026-05-20-note.md")
        git_import = client.post(
            f"/api/v1/stages/{stage_id}/git-repos", json={"path": str(repo)}
        )
        assert git_import.status_code == 201

        events = client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
        origins = {event["origin"] for event in events}
        assert "git" in origins
        # 笔记与 Git 导入都没有可展示原图：全部 claim 的 source_media 为 null。
        for event in events:
            assert all(claim["source_media"] is None for claim in event["claims"])


# ---------------------------------------------------------------------------
# 阶段删除时的 Blob 引用回收
# ---------------------------------------------------------------------------


def test_delete_stage_keeps_shared_blob_until_last_reference(
    photo_client: TestClient, app_paths: tuple[str, Path]
):
    database_url, upload_dir = app_paths
    stage_a = create_stage(photo_client, "共享阶段甲")
    stage_b = create_stage(photo_client, "共享阶段乙")

    # 两个阶段导入同一份笔记 → 内容寻址共享同一个 blob。
    note = upload_note(photo_client, stage_a, "2026-05-20-shared.md")
    upload_note(photo_client, stage_b, "2026-05-20-shared.md")
    sha256 = hashlib.sha256(note).hexdigest()

    deleted_first = photo_client.delete(f"/api/v1/stages/{stage_a}")
    assert deleted_first.status_code == 200
    # 乙阶段仍引用：blob 行与文件都必须保留。
    assert _blob_row_count(database_url, sha256) == 1
    assert _blob_file(upload_dir, sha256) is not None

    deleted_last = photo_client.delete(f"/api/v1/stages/{stage_b}")
    assert deleted_last.status_code == 200
    # 零引用：行与文件都被回收。
    assert _blob_row_count(database_url, sha256) == 0
    assert _blob_file(upload_dir, sha256) is None


def test_delete_stage_reclaims_photo_image_and_descriptor_blobs(
    photo_client: TestClient, app_paths: tuple[str, Path]
):
    database_url, upload_dir = app_paths
    stage_id = create_stage(photo_client, "照片阶段")
    content = jpeg_bytes()
    imported = upload_photo(photo_client, stage_id, content=content)
    assert imported.status_code == 201
    event = imported.json()["data"]["event"]
    image_sha = hashlib.sha256(content).hexdigest()
    descriptor_sha = event["claims"][0]["anchors"][0]["blob_sha256"]
    assert descriptor_sha != image_sha
    assert _blob_file(upload_dir, image_sha) is not None
    assert _blob_file(upload_dir, descriptor_sha) is not None

    deleted = photo_client.delete(f"/api/v1/stages/{stage_id}")
    assert deleted.status_code == 200

    # 照片原图（occurrence 引用）与元数据文档（anchors 引用）一并回收。
    assert _blob_row_count(database_url, image_sha) == 0
    assert _blob_row_count(database_url, descriptor_sha) == 0
    assert _blob_file(upload_dir, image_sha) is None
    assert _blob_file(upload_dir, descriptor_sha) is None
