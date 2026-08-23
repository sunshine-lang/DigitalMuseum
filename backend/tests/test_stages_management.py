from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select

from app.domain.models import (
    CandidateEvent,
    Claim,
    CoverageItem,
    EventReview,
    EvidenceAnchor,
    EvidenceBlob,
    EvidenceOccurrence,
)
from app.main import create_app


def create_stage(client: TestClient, name: str = "我的 AI 产品半年") -> str:
    response = client.post(
        "/api/v1/stages",
        json={
            "name": name,
            "starts_on": "2026-01-01",
            "ends_on": "2026-06-30",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def upload_note(client: TestClient, stage_id: str, filename: str) -> bytes:
    note = (
        "---\n"
        f"title: {filename} 的记录\n"
        "date: 2026-05-20\n"
        "---\n"
        "\n"
        "今天完成了一段可回溯的整理工作。\n"
    ).encode()
    response = client.post(
        f"/api/v1/stages/{stage_id}/notes",
        files={"file": (filename, note, "text/markdown")},
    )
    assert response.status_code == 201, response.text
    return note


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
    assert stages[0]["confirmed_count"] == 0


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


def test_delete_stage_cascades_rows_but_keeps_blobs(
    client: TestClient,
    app_paths: tuple[str, Path],
) -> None:
    survivor_stage = create_stage(client, "保留的阶段")
    deleted_stage = create_stage(client, "将被删除的阶段")

    note = upload_note(client, deleted_stage, "2026-05-20-delete-me.md")
    survivor_note = upload_note(client, survivor_stage, "2026-05-20-keep.md")
    events = client.get(f"/api/v1/stages/{deleted_stage}/events").json()["data"]
    assert len(events) == 1
    confirmed = client.post(
        f"/api/v1/events/{events[0]['id']}/reviews",
        json={"decision": "confirmed", "note": None, "expected_revision": 0},
    )
    assert confirmed.status_code == 200

    deleted_hash = hashlib.sha256(note).hexdigest()
    survivor_hash = hashlib.sha256(survivor_note).hexdigest()
    database_url, upload_dir = app_paths

    response = client.delete(f"/api/v1/stages/{deleted_stage}")

    assert response.status_code == 200
    assert response.json()["data"] == {"id": deleted_stage}
    assert client.get(f"/api/v1/stages/{deleted_stage}").status_code == 404
    events_after = client.get(f"/api/v1/stages/{deleted_stage}/events")
    assert events_after.status_code == 404
    assert events_after.json()["error"]["code"] == "stage_not_found"
    coverage_after = client.get(f"/api/v1/stages/{deleted_stage}/coverage")
    assert coverage_after.status_code == 404

    # 级联必须真正落到磁盘上的同一数据库：occurrences / coverage / events /
    # claims / anchors / reviews 全部消失，EvidenceBlob 行保留。
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            stage_events = connection.scalars(
                select(CandidateEvent.id).where(CandidateEvent.stage_id == deleted_stage)
            ).all()
            assert stage_events == []
            stage_occurrences = connection.scalars(
                select(EvidenceOccurrence.id).where(
                    EvidenceOccurrence.stage_id == deleted_stage
                )
            ).all()
            assert stage_occurrences == []
            assert connection.scalar(select(func.count(CoverageItem.id))) == 3
            assert connection.scalar(select(func.count(CandidateEvent.id))) == 1
            assert connection.scalar(select(func.count(Claim.id))) == 1
            assert connection.scalar(select(func.count(EvidenceAnchor.id))) == 1
            assert connection.scalar(select(func.count(EventReview.id))) == 0
            assert (
                connection.scalar(
                    select(func.count(EvidenceBlob.sha256)).where(
                        EvidenceBlob.sha256 == deleted_hash
                    )
                )
                == 1
            )
    finally:
        engine.dispose()

    # 内容寻址的原始文件必须仍然存在（Blob 跨阶段共享，不由阶段删除回收）。
    assert (upload_dir / deleted_hash[:2] / f"{deleted_hash}.md").read_bytes() == note
    assert (upload_dir / survivor_hash[:2] / f"{survivor_hash}.md").exists()

    # 新建 app 实例（同库）再验一次级联的持久性，并确认其他阶段不受影响。
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            max_upload_bytes=1024,
        )
    ) as restarted:
        assert restarted.get(f"/api/v1/stages/{deleted_stage}").status_code == 404
        stages = restarted.get("/api/v1/stages").json()["data"]
        assert [stage["id"] for stage in stages] == [survivor_stage]
        survivor_events = restarted.get(
            f"/api/v1/stages/{survivor_stage}/events"
        ).json()["data"]
        assert len(survivor_events) == 1
        assert survivor_events[0]["status"] == "candidate"


def test_delete_missing_stage_returns_contract_error(client: TestClient) -> None:
    response = client.delete("/api/v1/stages/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "stage_not_found"
