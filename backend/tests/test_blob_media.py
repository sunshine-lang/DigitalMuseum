from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.helpers import create_stage, seed_codex_project, sync_archive


def _archive_event(client: TestClient) -> dict:
    events = client.get("/api/v1/archive/events").json()["data"]
    assert events, "档案里还没有事件"
    return events[0]


def test_blob_endpoint_serves_evidence_document_bytes(
    sync_client: TestClient, tmp_path: Path
):
    seed_codex_project(tmp_path)
    sync_archive(sync_client)
    event = _archive_event(sync_client)
    sha256 = event["claims"][0]["anchors"][0]["blob_sha256"]

    response = sync_client.get(f"/api/v1/blobs/{sha256}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert "## day 2026-05-10 (1 sessions)" in response.text
    # 内容寻址：可永久缓存。
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_blob_endpoint_rejects_unknown_hash_with_404(client: TestClient):
    unknown = "0" * 64

    response = client.get(f"/api/v1/blobs/{unknown}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "blob_not_found"


@pytest.mark.parametrize(
    "invalid_sha",
    ["zz" + "0" * 62, "0" * 63, "0" * 65, "%2e%2e"],
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
    sync_client: TestClient, app_paths: tuple[str, Path], tmp_path: Path
):
    seed_codex_project(tmp_path)
    sync_archive(sync_client)
    event = _archive_event(sync_client)
    sha256 = event["claims"][0]["anchors"][0]["blob_sha256"]
    _database_url, upload_dir = app_paths
    blob_file = next((upload_dir / sha256[:2]).glob(f"{sha256}.*"))
    blob_file.unlink()  # 模拟文件被手动删除：DB 有行、磁盘无文件

    response = sync_client.get(f"/api/v1/blobs/{sha256}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "blob_not_found"


# ---------------------------------------------------------------------------
# 阶段删除的视图语义（ADR-0001）：删视图不删档案
# ---------------------------------------------------------------------------


def test_delete_stage_keeps_archive_blobs(
    sync_client: TestClient, app_paths: tuple[str, Path], tmp_path: Path
):
    _database_url, upload_dir = app_paths
    seed_codex_project(tmp_path)
    sync_archive(sync_client)
    stage_a = create_stage(sync_client, "视图阶段甲")
    stage_b = create_stage(sync_client, "视图阶段乙")
    event = _archive_event(sync_client)
    sha256 = event["claims"][0]["anchors"][0]["blob_sha256"]

    deleted_first = sync_client.delete(f"/api/v1/stages/{stage_a}")
    assert deleted_first.status_code == 200
    # 阶段是视图：删除不触碰档案库的任何证据。
    assert sync_client.get(f"/api/v1/blobs/{sha256}").status_code == 200
    assert (upload_dir / sha256[:2]).is_dir()

    deleted_last = sync_client.delete(f"/api/v1/stages/{stage_b}")
    assert deleted_last.status_code == 200
    # 删光全部视图，档案依旧完整——清空档案库是唯一破坏性操作。
    assert sync_client.get(f"/api/v1/blobs/{sha256}").status_code == 200
    assert next((upload_dir / sha256[:2]).glob(f"{sha256}.*")).is_file()
