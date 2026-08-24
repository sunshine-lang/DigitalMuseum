"""展签（exhibit_caption）：展览态的人工策展文案。

契约：
- PATCH /events/{id}/exhibit-caption 设置/清除（空白=清除回落确定性底稿）；
- 只改展示层：不动 status/revision/审计，不参与聚合与审阅；
- EventOut 全量返回 exhibit_caption；重启持久；archive 导出/导入随事件走。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import create_stage, upload_note


def _first_event(client: TestClient, stage_id: str) -> dict:
    events = client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert events
    return events[0]


def test_caption_roundtrip_and_reset(client: TestClient):
    stage_id = create_stage(client, "展签阶段")
    upload_note(client, stage_id, "caption-note.md")
    event = _first_event(client, stage_id)
    assert event["exhibit_caption"] is None

    set_resp = client.patch(
        f"/api/v1/events/{event['id']}/exhibit-caption",
        json={"caption": "  这一天我开始认真对待 AI 协作这件事  "},
    )
    assert set_resp.status_code == 200
    updated = set_resp.json()["data"]
    assert updated["exhibit_caption"] == "这一天我开始认真对待 AI 协作这件事"
    # 展签是纯展示层：状态机与审计不受影响
    assert updated["status"] == event["status"]
    assert updated["revision"] == event["revision"]
    assert updated["latest_review"] == event["latest_review"]

    reset = client.patch(
        f"/api/v1/events/{event['id']}/exhibit-caption", json={"caption": "   "}
    )
    assert reset.status_code == 200
    assert reset.json()["data"]["exhibit_caption"] is None


def test_caption_length_and_not_found(client: TestClient):
    stage_id = create_stage(client, "展签阶段")
    upload_note(client, stage_id, "caption-limit.md")
    event = _first_event(client, stage_id)

    too_long = client.patch(
        f"/api/v1/events/{event['id']}/exhibit-caption",
        json={"caption": "长" * 201},
    )
    assert too_long.status_code == 422
    assert too_long.json()["error"]["code"] == "invalid_caption"

    missing = client.patch(
        "/api/v1/events/nonexistent/exhibit-caption",
        json={"caption": "x"},
    )
    assert missing.status_code == 404


def test_caption_persists_across_restart_and_archives(app_paths):
    database_url, upload_dir = app_paths
    with TestClient(create_app(database_url=database_url, upload_dir=upload_dir)) as client:
        stage_id = create_stage(client, "展签阶段")
        upload_note(client, stage_id, "caption-keep.md")
        event = _first_event(client, stage_id)
        client.patch(
            f"/api/v1/events/{event['id']}/exhibit-caption",
            json={"caption": "展签要跟着档案走"},
        )
        archive = client.get("/api/v1/archive/export").content

    with TestClient(create_app(database_url=database_url, upload_dir=upload_dir)) as client:
        restored = client.get(f"/api/v1/events/{event['id']}").json()["data"]
        assert restored["exhibit_caption"] == "展签要跟着档案走"

        imported = client.post(
            "/api/v1/archive/import",
            files={"file": ("archive.zip", archive, "application/zip")},
        )
        assert imported.status_code == 201
        # 归档恢复的副本必须携带展签
        stages = client.get("/api/v1/stages").json()["data"]
        newest = stages[0]
        imported_events = client.get(
            f"/api/v1/stages/{newest['id']}/events"
        ).json()["data"]
        assert any(
            e["exhibit_caption"] == "展签要跟着档案走" for e in imported_events
        )
