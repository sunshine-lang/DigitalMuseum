from __future__ import annotations

import hashlib
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
from tests.helpers import create_half_year_stage as create_stage
from tests.helpers import upload_note


def test_stage_list_orders_by_created_at_desc_with_confirmed_count(
    client: TestClient,
) -> None:
    first_stage = create_stage(client, "较早的阶段")
    second_stage = create_stage(client, "较晚的阶段")

    upload_note(client, first_stage, "2026-05-20-a.md")
    upload_note(client, first_stage, "2026-05-20-b.md")
    events = client.get(f"/api/v1/stages/{first_stage}/events").json()["data"]
    assert len(events) == 2
    confirmed = client.post(
        f"/api/v1/events/{events[0]['id']}/reviews",
        json={"decision": "confirmed", "note": None, "expected_revision": 0},
    )
    assert confirmed.status_code == 200

    response = client.get("/api/v1/stages")

    assert response.status_code == 200
    stages = response.json()["data"]
    assert [stage["id"] for stage in stages] == [second_stage, first_stage]
    first_summary = stages[1]
    assert first_summary["name"] == "较早的阶段"
    assert first_summary["confirmed_count"] == 1
    assert first_summary["event_count"] == 2
    assert first_summary["evidence_count"] == 2
    # 视图语义（ADR-0001）：两个视图同一时间窗，投影到同一份档案——
    # 确认数一致，而不是各自的私有副本。
    assert stages[0]["confirmed_count"] == 1


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
    client: TestClient,
    app_paths: tuple[str, Path],
) -> None:
    """视图语义（ADR-0001）：删阶段只删视图行；档案库的 occurrences /
    events / claims / anchors / reviews 与 blob 全部保留。"""
    survivor_stage = create_stage(client, "保留的视图")
    deleted_stage = create_stage(client, "将被删除的视图")

    # 同一份内容导入两次（不同视图路径）→ 内容寻址共享 blob、全局聚合进
    # 同一事件。
    note = upload_note(client, deleted_stage, "2026-05-20-delete-me.md")
    upload_note(client, survivor_stage, "2026-05-20-delete-me.md")
    note_hash = hashlib.sha256(note).hexdigest()
    events = client.get(f"/api/v1/stages/{deleted_stage}/events").json()["data"]
    assert len(events) == 1
    assert events[0]["source_count"] == 2

    database_url, upload_dir = app_paths
    response = client.delete(f"/api/v1/stages/{deleted_stage}")

    assert response.status_code == 200
    assert response.json()["data"] == {"id": deleted_stage}
    assert client.get(f"/api/v1/stages/{deleted_stage}").status_code == 404
    events_after = client.get(f"/api/v1/stages/{deleted_stage}/events")
    assert events_after.status_code == 404
    assert events_after.json()["error"]["code"] == "stage_not_found"

    # 档案数据一行不少：两个 occurrence、一个聚合事件、两条 claim 与锚点。
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            assert connection.scalar(select(func.count(EvidenceOccurrence.id))) == 2
            assert connection.scalar(select(func.count(CandidateEvent.id))) == 1
            assert connection.scalar(select(func.count(Claim.id))) == 2
            assert connection.scalar(select(func.count(EvidenceAnchor.id))) == 2
            assert connection.scalar(select(func.count(CoverageItem.id))) == 6
            assert (
                connection.scalar(
                    select(func.count(EvidenceBlob.sha256)).where(
                        EvidenceBlob.sha256 == note_hash
                    )
                )
                == 1
            )
    finally:
        engine.dispose()

    # 内容寻址的原始文件原地未动。
    assert (upload_dir / note_hash[:2] / f"{note_hash}.md").read_bytes() == note

    # 幸存视图照常投影同一份档案。
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            max_upload_bytes=1024,
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


def test_delete_stage_keeps_merge_split_lineage(app_paths):
    """视图删除不破坏档案库的血缘链（split/merged 事件与审计行保留）。"""
    from sqlalchemy import text

    database_url, upload_dir = app_paths
    with TestClient(create_app(database_url=database_url, upload_dir=upload_dir)) as client:
        stage_id = create_stage(client)
        note_a = (
            "---\ntitle: 聚合标题\ndate: 2026-05-10\n---\n\n第一份记录正文。\n"
        ).encode()
        note_b = (
            "---\ntitle: 聚合标题\ndate: 2026-05-10\n---\n\n第二份记录正文。\n"
        ).encode()
        for name, content in [("a.md", note_a), ("b.md", note_b)]:
            response = client.post(
                f"/api/v1/stages/{stage_id}/notes",
                files={"file": (name, content, "text/markdown")},
            )
            assert response.status_code == 201
        events = client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
        assert len(events) == 1  # 同题同日聚合成一个事件

        split = client.post(f"/api/v1/events/{events[0]['id']}/split")
        assert split.status_code == 200  # 2 份来源可拆，产生 split 血缘

        deleted = client.delete(f"/api/v1/stages/{stage_id}")
        assert deleted.status_code == 200

        # 删视图后档案时间线仍然完整：split 源 + 两个产物事件。
        archive_events = client.get("/api/v1/archive/events").json()["data"]
        assert len(archive_events) == 3
        assert {event["status"] for event in archive_events} == {"split", "candidate"}

    engine = create_engine(database_url)
    with engine.connect() as connection:
        for table in [
            "candidate_events",
            "claims",
            "evidence_anchors",
            "event_reviews",
            "evidence_occurrences",
            "coverage_items",
        ]:
            count = connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            assert count > 0, f"{table} 不应有任何行被视图删除清掉"
    engine.dispose()
