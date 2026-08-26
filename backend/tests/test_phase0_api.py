"""阶段视图与事件审阅的 API 契约（S3 起：会话同步为唯一导入通道）。"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import seed_codex_project, sync_archive


def test_stage_requires_a_three_to_twelve_month_range(client: TestClient) -> None:
    too_short = client.post(
        "/api/v1/stages",
        json={
            "name": "过短阶段",
            "starts_on": "2026-01-01",
            "ends_on": "2026-02-01",
        },
    )

    assert too_short.status_code == 422
    assert too_short.json() == {
        "error": {
            "code": "invalid_stage_range",
            "message": "建馆阶段必须在 3 到 12 个月之间",
        }
    }

    blank_name = client.post(
        "/api/v1/stages",
        json={
            "name": "   ",
            "starts_on": "2026-01-01",
            "ends_on": "2026-06-30",
        },
    )
    assert blank_name.status_code == 422
    assert blank_name.json()["error"]["code"] == "invalid_stage_name"


def test_review_uses_revision_guard_and_survives_app_restart(
    sync_client: TestClient,
    app_paths: tuple[str, Path],
    tmp_path: Path,
) -> None:
    seed_codex_project(tmp_path)
    sync_archive(sync_client)
    event_id = sync_client.get("/api/v1/archive/events").json()["data"][0]["id"]

    confirmed = sync_client.post(
        f"/api/v1/events/{event_id}/reviews",
        json={
            "decision": "confirmed",
            "note": "我确认这段协作发生过。",
            "expected_revision": 0,
        },
    )
    assert confirmed.status_code == 200
    confirmed_event = confirmed.json()["data"]
    assert confirmed_event["status"] == "confirmed"
    assert confirmed_event["is_formal"] is True
    assert confirmed_event["revision"] == 1
    assert confirmed_event["claims"][0]["epistemic_status"] == "user_confirmed"

    stale = sync_client.post(
        f"/api/v1/events/{event_id}/reviews",
        json={"decision": "rejected", "expected_revision": 0},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_event_revision"

    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            max_upload_bytes=1024,
        )
    ) as restarted:
        restored = restarted.get(f"/api/v1/events/{event_id}")
        assert restored.status_code == 200
        assert restored.json()["data"]["status"] == "confirmed"
        assert restored.json()["data"]["revision"] == 1
        assert restored.json()["data"]["latest_review"]["note"].startswith("我确认这段协作")


def test_unknown_review_preserves_the_verbatim_claim(
    sync_client: TestClient, tmp_path: Path
) -> None:
    seed_codex_project(tmp_path, first_user="同步一条会话作为测试证据")
    sync_archive(sync_client)
    event = sync_client.get("/api/v1/archive/events").json()["data"][0]

    response = sync_client.post(
        f"/api/v1/events/{event['id']}/reviews",
        json={
            "decision": "unknown",
            "note": "缺少部署记录，先保持不确定。",
            "expected_revision": 0,
        },
    )

    assert response.status_code == 200
    reviewed = response.json()["data"]
    assert reviewed["status"] == "unknown"
    assert reviewed["is_formal"] is False
    assert reviewed["claims"][0]["epistemic_status"] == "unknown"
    assert "同步一条会话作为测试证据" in reviewed["claims"][0]["text"]


def test_unknown_route_uses_the_public_error_contract(client: TestClient) -> None:
    response = client.get("/api/v1/not-a-route")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "route_not_found", "message": "没有找到这个接口"}
    }


def test_stage_view_filters_events_by_window(
    sync_client: TestClient, tmp_path: Path
) -> None:
    from tests.helpers import create_stage

    seed_codex_project(tmp_path, day="2026-05-10")
    sync_archive(sync_client)
    stage_id = create_stage(
        sync_client, "窗口视图", starts_on="2026-01-01", ends_on="2026-06-30"
    )
    events = sync_client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert len(events) == 1
    assert events[0]["occurred_on"] == "2026-05-10"
    assert sync_client.get("/api/v1/archive/events").status_code == 200
