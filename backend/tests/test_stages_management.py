"""阶段视图管理（ADR-0001）：视图 CRUD 与「删视图不删档案」语义。"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select

from app.domain.models import (
    CandidateEvent,
    Claim,
    CoverageItem,
    EvidenceAnchor,
    EvidenceBlob,
    EvidenceOccurrence,
)
from app.main import create_app
from tests.helpers import (
    create_half_year_stage as create_stage,
)
from tests.helpers import seed_codex_project, sync_archive


def test_stage_list_orders_by_created_at_desc_with_confirmed_count(
    sync_client: TestClient, tmp_path: Path
) -> None:
    seed_codex_project(tmp_path, day="2026-05-10")
    sync_archive(sync_client)
    event = sync_client.get("/api/v1/archive/events").json()["data"][0]
    confirmed = sync_client.post(
        f"/api/v1/events/{event['id']}/reviews",
        json={"decision": "confirmed", "note": None, "expected_revision": 0},
    )
    assert confirmed.status_code == 200

    first_stage = create_stage(sync_client, "较早的阶段")
    second_stage = create_stage(sync_client, "较晚的阶段")

    response = sync_client.get("/api/v1/stages")

    assert response.status_code == 200
    stages = response.json()["data"]
    assert [stage["id"] for stage in stages] == [second_stage, first_stage]
    first_summary = stages[1]
    assert first_summary["name"] == "较早的阶段"
    # 两个视图同一时间窗 → 投影同一份档案：经历与确认数一致（视图语义）。
    assert stages[0]["confirmed_count"] == 1
    assert first_summary["confirmed_count"] == 1
    assert first_summary["event_count"] == 1
    assert first_summary["evidence_count"] == 1


def test_rename_stage_updates_name_and_keeps_contract(client: TestClient) -> None:
    stage_id = create_stage(client, "旧名字")

    renamed = client.patch(
        f"/api/v1/stages/{stage_id}",
        json={"name": "  新名字  "},
    )
    assert renamed.status_code == 200
    assert renamed.json()["data"]["name"] == "新名字"
    assert client.get(f"/api/v1/stages/{stage_id}").json()["data"]["name"] == "新名字"

    blank_name = client.patch(f"/api/v1/stages/{stage_id}", json={"name": "   "})
    assert blank_name.status_code == 422
    assert blank_name.json()["error"]["code"] == "invalid_stage_name"

    missing = client.patch(
        "/api/v1/stages/does-not-exist",
        json={"name": "新名字"},
    )
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "stage_not_found"


def test_delete_stage_keeps_archive_rows_and_blobs(
    sync_client: TestClient,
    app_paths: tuple[str, Path],
    tmp_path: Path,
) -> None:
    """视图语义（ADR-0001）：删阶段只删视图行；档案库的 occurrences /
    events / claims / anchors / reviews 与 blob 全部保留。"""
    survivor_stage = create_stage(sync_client, "保留的视图")
    deleted_stage = create_stage(sync_client, "将被删除的视图")
    seed_codex_project(tmp_path, day="2026-05-10")
    sync_archive(sync_client)
    events = sync_client.get("/api/v1/archive/events").json()["data"]
    assert len(events) == 1
    blob_sha = events[0]["claims"][0]["anchors"][0]["blob_sha256"]

    database_url, upload_dir = app_paths
    response = sync_client.delete(f"/api/v1/stages/{deleted_stage}")

    assert response.status_code == 200
    assert response.json()["data"] == {"id": deleted_stage}
    assert sync_client.get(f"/api/v1/stages/{deleted_stage}").status_code == 404
    events_after = sync_client.get(f"/api/v1/stages/{deleted_stage}/events")
    assert events_after.status_code == 404
    assert events_after.json()["error"]["code"] == "stage_not_found"

    # 档案数据一行不少。
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            assert connection.scalar(select(func.count(EvidenceOccurrence.id))) == 1
            assert connection.scalar(select(func.count(CandidateEvent.id))) == 1
            assert connection.scalar(select(func.count(Claim.id))) == 1
            assert connection.scalar(select(func.count(EvidenceAnchor.id))) >= 1
            assert connection.scalar(select(func.count(CoverageItem.id))) == 3
            assert (
                connection.scalar(
                    select(func.count(EvidenceBlob.sha256)).where(
                        EvidenceBlob.sha256 == blob_sha
                    )
                )
                == 1
            )
    finally:
        engine.dispose()

    # 内容寻址的原始文件原地未动。
    assert next((upload_dir / blob_sha[:2]).glob(f"{blob_sha}.*")).is_file()

    # 幸存视图照常投影同一份档案。
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
        )
    ) as restarted:
        stages = restarted.get("/api/v1/stages").json()["data"]
        assert [stage["id"] for stage in stages] == [survivor_stage]
        survivor_events = restarted.get(
            f"/api/v1/stages/{survivor_stage}/events"
        ).json()["data"]
        assert len(survivor_events) == 1


def test_delete_missing_stage_returns_contract_error(client: TestClient) -> None:
    response = client.delete("/api/v1/stages/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "stage_not_found"
