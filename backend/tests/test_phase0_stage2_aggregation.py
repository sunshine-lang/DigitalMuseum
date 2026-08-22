from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def create_stage(client: TestClient) -> str:
    response = client.post(
        "/api/v1/stages",
        json={
            "name": "我的 AI 产品半年",
            "starts_on": "2026-01-01",
            "ends_on": "2026-06-30",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def note_bytes(title: str, occurred_on: str, body: str) -> bytes:
    return (f"---\ntitle: {title}\ndate: {occurred_on}\n---\n\n{body}\n").encode()


def upload_note(
    client: TestClient,
    stage_id: str,
    filename: str,
    content: bytes,
) -> dict:
    response = client.post(
        f"/api/v1/stages/{stage_id}/notes",
        files={"file": (filename, content, "text/markdown")},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def get_event(client: TestClient, event_id: str) -> dict:
    response = client.get(f"/api/v1/events/{event_id}")
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_same_title_and_date_notes_aggregate_into_one_candidate(
    client: TestClient,
) -> None:
    stage_id = create_stage(client)
    first = upload_note(
        client,
        stage_id,
        "launch-a.md",
        note_bytes("第一次完成独立产品", "2026-05-20", "今天发布了我的第一个独立产品。"),
    )
    second = upload_note(
        client,
        stage_id,
        "launch-b.md",
        note_bytes("第一次完成独立产品", "2026-05-20", "晚上和朋友庆祝了发布。"),
    )

    assert second["event"]["id"] == first["event"]["id"]
    event = get_event(client, first["event"]["id"])
    assert event["origin"] == "aggregated"
    assert event["source_count"] == 2
    assert event["status"] == "candidate"
    assert [claim["text"] for claim in event["claims"]] == [
        "今天发布了我的第一个独立产品。",
        "晚上和朋友庆祝了发布。",
    ]
    hashes = {claim["anchors"][0]["blob_sha256"] for claim in event["claims"]}
    assert len(hashes) == 2
    events = client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert len(events) == 1


def test_notes_without_matching_title_or_date_stay_separate(client: TestClient) -> None:
    stage_id = create_stage(client)
    upload_note(
        client,
        stage_id,
        "a.md",
        note_bytes("第一次完成独立产品", "2026-05-20", "今天发布了我的第一个独立产品。"),
    )
    different_title = upload_note(
        client,
        stage_id,
        "b.md",
        note_bytes("复盘发布周", "2026-05-20", "这一周节奏很紧。"),
    )
    different_date = upload_note(
        client,
        stage_id,
        "c.md",
        note_bytes("第一次完成独立产品", "2026-05-21", "第二天收到了反馈。"),
    )
    no_date = upload_note(
        client,
        stage_id,
        "d.md",
        "---\ntitle: 第一次完成独立产品\n---\n\n没有日期的补充笔记。\n".encode(),
    )

    event_ids = {
        different_title["event"]["id"],
        different_date["event"]["id"],
        no_date["event"]["id"],
    }
    assert len(event_ids) == 3
    events = client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert len(events) == 4
    assert all(event["origin"] == "note" for event in events)


def test_reviewed_events_do_not_absorb_new_claims(client: TestClient) -> None:
    stage_id = create_stage(client)
    imported = upload_note(
        client,
        stage_id,
        "launch.md",
        note_bytes("第一次完成独立产品", "2026-05-20", "今天发布了我的第一个独立产品。"),
    )
    event_id = imported["event"]["id"]
    confirmed = client.post(
        f"/api/v1/events/{event_id}/reviews",
        json={"decision": "confirmed", "note": None, "expected_revision": 0},
    )
    assert confirmed.status_code == 200

    followup = upload_note(
        client,
        stage_id,
        "launch-2.md",
        note_bytes("第一次完成独立产品", "2026-05-20", "晚上和朋友庆祝了发布。"),
    )

    assert followup["event"]["id"] != event_id
    assert followup["event"]["origin"] == "note"
    assert get_event(client, event_id)["status"] == "confirmed"


def test_merge_creates_fresh_candidate_and_records_source_history(
    client: TestClient,
) -> None:
    stage_id = create_stage(client)
    first = upload_note(
        client,
        stage_id,
        "a.md",
        note_bytes("发布产品", "2026-05-20", "今天发布了产品。"),
    )
    second = upload_note(
        client,
        stage_id,
        "b.md",
        note_bytes("复盘发布", "2026-05-21", "发布第二天写了复盘。"),
    )

    merged_response = client.post(
        f"/api/v1/stages/{stage_id}/events/merge",
        json={"event_ids": [first["event"]["id"], second["event"]["id"]]},
    )
    assert merged_response.status_code == 200, merged_response.text
    merged = merged_response.json()["data"]

    new_event = merged["event"]
    assert new_event["status"] == "candidate"
    assert new_event["revision"] == 0
    assert new_event["origin"] == "merged"
    assert new_event["source_count"] == 2
    assert new_event["occurred_on"] is None
    assert new_event["time_precision"] == "unknown"
    assert new_event["title"] == "发布产品"
    assert all(claim["epistemic_status"] == "unknown" for claim in new_event["claims"])
    assert len(new_event["claims"]) == 2

    assert [source["status"] for source in merged["sources"]] == ["merged", "merged"]
    for source in merged["sources"]:
        assert source["claims"] == []
        assert source["latest_review"]["decision"] == "merged"
        assert source["latest_review"]["previous_status"] == "candidate"

    events = client.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
    assert len(events) == 3


def test_merge_reviewed_event_resets_to_candidate_and_keeps_audit(
    client: TestClient,
) -> None:
    stage_id = create_stage(client)
    first = upload_note(
        client,
        stage_id,
        "a.md",
        note_bytes("发布产品", "2026-05-20", "今天发布了产品。"),
    )
    second = upload_note(
        client,
        stage_id,
        "b.md",
        note_bytes("复盘发布", "2026-05-20", "发布当天写了复盘。"),
    )
    confirmed = client.post(
        f"/api/v1/events/{first['event']['id']}/reviews",
        json={"decision": "confirmed", "note": None, "expected_revision": 0},
    )
    assert confirmed.status_code == 200

    merged = client.post(
        f"/api/v1/stages/{stage_id}/events/merge",
        json={
            "event_ids": [first["event"]["id"], second["event"]["id"]],
            "title": "发布与复盘",
        },
    )

    assert merged.status_code == 200
    data = merged.json()["data"]
    assert data["event"]["title"] == "发布与复盘"
    assert data["event"]["occurred_on"] == "2026-05-20"
    assert data["event"]["time_precision"] == "exact"
    reviewed_source = next(
        source for source in data["sources"] if source["id"] == first["event"]["id"]
    )
    assert reviewed_source["latest_review"]["previous_status"] == "confirmed"
    assert reviewed_source["status"] == "merged"
    assert data["event"]["is_formal"] is False


def test_merge_rejects_invalid_inputs(client: TestClient) -> None:
    stage_id = create_stage(client)
    imported = upload_note(
        client,
        stage_id,
        "a.md",
        note_bytes("发布产品", "2026-05-20", "今天发布了产品。"),
    )
    event_id = imported["event"]["id"]

    single = client.post(
        f"/api/v1/stages/{stage_id}/events/merge",
        json={"event_ids": [event_id, event_id]},
    )
    assert single.status_code == 422
    assert single.json()["error"]["code"] == "merge_needs_multiple_events"

    missing_stage = client.post(
        "/api/v1/stages/not-a-stage/events/merge",
        json={"event_ids": [event_id, "another"]},
    )
    assert missing_stage.status_code == 404
    assert missing_stage.json()["error"]["code"] == "stage_not_found"

    unknown_event = client.post(
        f"/api/v1/stages/{stage_id}/events/merge",
        json={"event_ids": [event_id, "does-not-exist"]},
    )
    assert unknown_event.status_code == 404
    assert unknown_event.json()["error"]["code"] == "event_not_found"

    other_stage = create_stage(client)
    cross_stage = client.post(
        f"/api/v1/stages/{other_stage}/events/merge",
        json={"event_ids": [event_id, "does-not-exist"]},
    )
    assert cross_stage.status_code == 404
    assert cross_stage.json()["error"]["code"] == "event_not_found"

    companion = upload_note(
        client,
        stage_id,
        "b.md",
        note_bytes("复盘发布", "2026-05-21", "发布第二天写了复盘。"),
    )
    blank_title = client.post(
        f"/api/v1/stages/{stage_id}/events/merge",
        json={"event_ids": [event_id, companion["event"]["id"]], "title": "   "},
    )
    assert blank_title.status_code == 422
    assert blank_title.json()["error"]["code"] == "invalid_merge_title"


def test_split_regroups_aggregated_event_by_source(client: TestClient) -> None:
    stage_id = create_stage(client)
    first = upload_note(
        client,
        stage_id,
        "launch-a.md",
        note_bytes("第一次完成独立产品", "2026-05-20", "今天发布了我的第一个独立产品。"),
    )
    second = upload_note(
        client,
        stage_id,
        "launch-b.md",
        note_bytes("第一次完成独立产品", "2026-05-20", "晚上和朋友庆祝了发布。"),
    )
    assert second["event"]["id"] == first["event"]["id"]
    aggregated_id = first["event"]["id"]
    original_first = get_event(client, aggregated_id)
    original_anchor = original_first["claims"][0]["anchors"][0]

    split_response = client.post(f"/api/v1/events/{aggregated_id}/split")

    assert split_response.status_code == 200, split_response.text
    split = split_response.json()["data"]
    assert split["event"]["status"] == "split"
    assert split["event"]["claims"] == []
    assert split["event"]["latest_review"]["decision"] == "split"
    assert split["event"]["latest_review"]["previous_status"] == "candidate"

    children = split["events"]
    assert len(children) == 2
    restored = {child["title"]: child for child in children}
    assert set(restored) == {"第一次完成独立产品"}
    dates = {child["occurred_on"] for child in children}
    assert dates == {"2026-05-20"}
    assert all(child["origin"] == "split" for child in children)
    assert all(child["status"] == "candidate" for child in children)
    assert all(child["source_count"] == 1 for child in children)

    quotes = sorted(claim["anchors"][0]["quote"] for child in children for claim in child["claims"])
    assert quotes == ["今天发布了我的第一个独立产品。", "晚上和朋友庆祝了发布。"]
    restored_anchor = next(
        claim["anchors"][0]
        for child in children
        for claim in child["claims"]
        if claim["anchors"][0]["quote"] == original_anchor["quote"]
    )
    assert restored_anchor == original_anchor


def test_merge_then_split_restores_per_note_events(client: TestClient) -> None:
    stage_id = create_stage(client)
    first = upload_note(
        client,
        stage_id,
        "a.md",
        note_bytes("发布产品", "2026-05-20", "今天发布了产品。"),
    )
    second = upload_note(
        client,
        stage_id,
        "b.md",
        note_bytes("复盘发布", "2026-05-21", "发布第二天写了复盘。"),
    )
    merged = client.post(
        f"/api/v1/stages/{stage_id}/events/merge",
        json={"event_ids": [first["event"]["id"], second["event"]["id"]]},
    )
    merged_id = merged.json()["data"]["event"]["id"]

    split = client.post(f"/api/v1/events/{merged_id}/split")

    assert split.status_code == 200
    children = split.json()["data"]["events"]
    assert {child["title"] for child in children} == {"发布产品", "复盘发布"}
    assert {child["occurred_on"] for child in children} == {"2026-05-20", "2026-05-21"}
    assert get_event(client, merged_id)["status"] == "split"


def test_split_rejects_single_source_and_terminal_events(client: TestClient) -> None:
    stage_id = create_stage(client)
    imported = upload_note(
        client,
        stage_id,
        "a.md",
        note_bytes("发布产品", "2026-05-20", "今天发布了产品。"),
    )
    event_id = imported["event"]["id"]

    single_source = client.post(f"/api/v1/events/{event_id}/split")
    assert single_source.status_code == 409
    assert single_source.json()["error"]["code"] == "nothing_to_split"

    second = upload_note(
        client,
        stage_id,
        "b.md",
        note_bytes("复盘发布", "2026-05-21", "发布第二天写了复盘。"),
    )
    merged = client.post(
        f"/api/v1/stages/{stage_id}/events/merge",
        json={"event_ids": [event_id, second["event"]["id"]]},
    )
    assert merged.status_code == 200, merged.text
    merged_id = merged.json()["data"]["event"]["id"]

    review_merged = client.post(
        f"/api/v1/events/{merged_id}/reviews",
        json={"decision": "confirmed", "note": None, "expected_revision": 0},
    )
    assert review_merged.status_code == 200
    split_merged = client.post(f"/api/v1/events/{merged_id}/split")
    assert split_merged.status_code == 200
    terminal_id = merged_id
    child_id = split_merged.json()["data"]["events"][0]["id"]

    split_again = client.post(f"/api/v1/events/{terminal_id}/split")
    assert split_again.status_code == 409
    assert split_again.json()["error"]["code"] == "event_not_splittable"

    review_terminal = client.post(
        f"/api/v1/events/{terminal_id}/reviews",
        json={"decision": "confirmed", "note": None, "expected_revision": 2},
    )
    assert review_terminal.status_code == 409
    assert review_terminal.json()["error"]["code"] == "event_not_reviewable"

    merge_terminal = client.post(
        f"/api/v1/stages/{stage_id}/events/merge",
        json={"event_ids": [terminal_id, child_id]},
    )
    assert merge_terminal.status_code == 409
    assert merge_terminal.json()["error"]["code"] == "event_not_mergeable"


def test_structural_states_survive_app_restart(
    client: TestClient,
    app_paths: tuple[str, Path],
) -> None:
    stage_id = create_stage(client)
    first = upload_note(
        client,
        stage_id,
        "a.md",
        note_bytes("发布产品", "2026-05-20", "今天发布了产品。"),
    )
    second = upload_note(
        client,
        stage_id,
        "b.md",
        note_bytes("复盘发布", "2026-05-21", "发布第二天写了复盘。"),
    )
    merged = client.post(
        f"/api/v1/stages/{stage_id}/events/merge",
        json={"event_ids": [first["event"]["id"], second["event"]["id"]]},
    )
    merged_id = merged.json()["data"]["event"]["id"]
    confirmed = client.post(
        f"/api/v1/events/{merged_id}/reviews",
        json={"decision": "confirmed", "note": None, "expected_revision": 0},
    )
    assert confirmed.status_code == 200

    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            max_upload_bytes=1024,
        )
    ) as restarted:
        restored_merged = get_event(restarted, merged_id)
        assert restored_merged["status"] == "confirmed"
        assert restored_merged["origin"] == "merged"
        assert restored_merged["source_count"] == 2
        restored_source = get_event(restarted, first["event"]["id"])
        assert restored_source["status"] == "merged"
        assert restored_source["latest_review"]["decision"] == "merged"
        events = restarted.get(f"/api/v1/stages/{stage_id}/events").json()["data"]
        assert len(events) == 3
