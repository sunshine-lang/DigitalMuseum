"""本地 Blob 媒体端点与阶段删除时的 Blob 引用回收（对抗性审查遗留项）。"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select

from app.domain.models import EvidenceBlob
from tests.helpers import create_stage, upload_note


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


def test_blob_endpoint_serves_original_note_bytes(client: TestClient):
    stage_id = create_stage(client, "Blob 阶段")
    note = upload_note(client, stage_id, "2026-05-20-note.md")
    sha256 = hashlib.sha256(note).hexdigest()

    response = client.get(f"/api/v1/blobs/{sha256}")

    assert response.status_code == 200
    assert response.content == note
    assert response.headers["content-type"].startswith("text/markdown")
    # 内容寻址：内容永不变，可以永久缓存。
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_blob_endpoint_rejects_unknown_hash_with_404(client: TestClient):
    create_stage(client, "Blob 阶段")

    unknown = client.get("/api/v1/blobs/" + "0" * 64)

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
    client: TestClient, invalid_sha: str
):
    response = client.get(f"/api/v1/blobs/{invalid_sha}")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_blob_id"


def test_blob_endpoint_fails_closed_on_path_traversal(client: TestClient):
    # 带路径分隔符的穿越串会被客户端/路由归一化拦下（404）或进入参数后被
    # hex 校验拒绝（422）；无论哪一层，都不允许命中文件。
    response = client.get("/api/v1/blobs/..%2f..%2fetc%2fpasswd")

    assert response.status_code in (404, 422)
    assert response.json()["error"]["code"] in ("route_not_found", "invalid_blob_id")


def test_blob_endpoint_returns_404_when_file_is_missing(
    client: TestClient, app_paths: tuple[str, Path]
):
    _, upload_dir = app_paths
    stage_id = create_stage(client, "Blob 阶段")
    note = upload_note(client, stage_id, "2026-05-20-note.md")
    sha256 = hashlib.sha256(note).hexdigest()
    blob_file = _blob_file(upload_dir, sha256)
    assert blob_file is not None
    blob_file.unlink()  # 模拟文件被手动删除：DB 有行、磁盘无文件

    response = client.get(f"/api/v1/blobs/{sha256}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "blob_not_found"


# ---------------------------------------------------------------------------
# 阶段删除时的 Blob 引用回收
# ---------------------------------------------------------------------------


def test_delete_stage_keeps_shared_blob_until_last_reference(
    client: TestClient, app_paths: tuple[str, Path]
):
    database_url, upload_dir = app_paths
    stage_a = create_stage(client, "共享阶段甲")
    stage_b = create_stage(client, "共享阶段乙")

    # 两个阶段导入同一份笔记 → 内容寻址共享同一个 blob。
    note = upload_note(client, stage_a, "2026-05-20-shared.md")
    upload_note(client, stage_b, "2026-05-20-shared.md")
    sha256 = hashlib.sha256(note).hexdigest()

    deleted_first = client.delete(f"/api/v1/stages/{stage_a}")
    assert deleted_first.status_code == 200
    # 乙阶段仍引用：blob 行与文件都必须保留。
    assert _blob_row_count(database_url, sha256) == 1
    assert _blob_file(upload_dir, sha256) is not None

    deleted_last = client.delete(f"/api/v1/stages/{stage_b}")
    assert deleted_last.status_code == 200
    # 零引用：行与文件都被回收。
    assert _blob_row_count(database_url, sha256) == 0
    assert _blob_file(upload_dir, sha256) is None
