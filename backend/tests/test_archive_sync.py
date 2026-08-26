"""档案库一键同步（POST /api/v1/archive/sync，ADR-0001）。

source_key 内容寻址的幂等 upsert：
- 全量导入 → 事件 verified、按发生日排序；
- 内容不变 → 跳过（不新增 occurrence/claim）；
- 内容有变化 → 替换项目快照，事件并入、用户审阅判定保持。
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.main import create_app

# 正午 UTC：在任何时区归日都不会跨日。
_TS = "2026-05-10T12:00:00.000Z"


def _write_claude_session(
    projects_root: Path,
    munged: str,
    filename: str,
    *,
    timestamp: str = _TS,
    message: str = "一条消息",
) -> None:
    directory = projects_root / munged
    directory.mkdir(parents=True, exist_ok=True)
    (directory / filename).write_text(
        json.dumps(
            {
                "type": "user",
                "timestamp": timestamp,
                "message": {"content": message},
            }
        )
        + "\n",
        encoding="utf-8",
    )


def _write_codex_rollout(
    sessions_root: Path,
    day: str,
    filename: str,
    cwd: str,
    *,
    thread_source: str = "user",
    first_user: str = "帮我看下这个报错",
) -> None:
    year, month, date_part = day.split("-")
    path = sessions_root / year / month / date_part / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        json.dumps(
            {
                "type": "session_meta",
                "payload": {"cwd": cwd, "thread_source": thread_source},
            }
        ),
        json.dumps(
            {
                "type": "event_msg",
                "timestamp": f"{day}T12:00:00.000Z",
                "payload": {"type": "user_message", "message": first_user},
            }
        ),
        json.dumps(
            {
                "type": "event_msg",
                "timestamp": f"{day}T12:01:00.000Z",
                "payload": {"type": "agent_message", "message": "好的，我来看看。"},
            }
        ),
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _sync_client(tmp_path: Path) -> TestClient:
    return TestClient(
        create_app(
            database_url=f"sqlite:///{tmp_path / 'sync.db'}",
            upload_dir=tmp_path / "uploads",
            allowed_repo_roots=str(tmp_path),
            claude_projects_root=str(tmp_path / "claude-home" / "projects"),
            codex_sessions_root=str(tmp_path / "codex-home" / "sessions"),
        )
    )


def test_sync_imports_all_products_as_verified(tmp_path: Path):
    claude_root = tmp_path / "claude-home" / "projects"
    codex_root = tmp_path / "codex-home" / "sessions"
    project = tmp_path / "proj"
    project.mkdir()
    _write_claude_session(claude_root, "-Users-you-Projects-alpha", "a.jsonl")
    _write_codex_rollout(codex_root, "2026-05-11", "rollout-a.jsonl", str(project))

    with _sync_client(tmp_path) as client:
        summary = client.post("/api/v1/archive/sync").json()["data"]

        assert summary["projects_imported"] == 2
        assert summary["projects_skipped"] == 0
        assert summary["events_created"] == 2
        assert {(item["product"], item["status"]) for item in summary["products"]} == {
            ("claude", "imported"),
            ("codex", "imported"),
        }

        events = client.get("/api/v1/archive/events").json()["data"]
        assert len(events) == 2
        # 按发生日升序：先 Claude（05-10）后 Codex（05-11），全部系统核实。
        assert events[0]["title"] == "在 alpha 与 Claude Code 协作"
        assert events[1]["title"] == "在 proj 与 Codex 协作"
        assert {event["status"] for event in events} == {"verified"}
        assert {event["origin"] for event in events} == {"claude", "codex"}


def test_sync_is_idempotent_when_content_unchanged(tmp_path: Path):
    claude_root = tmp_path / "claude-home" / "projects"
    _write_claude_session(claude_root, "-Users-you-Projects-alpha", "a.jsonl")

    with _sync_client(tmp_path) as client:
        first = client.post("/api/v1/archive/sync").json()["data"]
        first_events = client.get("/api/v1/archive/events").json()["data"]
        first_coverage = client.get("/api/v1/archive/coverage").json()["data"]

        second = client.post("/api/v1/archive/sync").json()["data"]
        second_events = client.get("/api/v1/archive/events").json()["data"]
        second_coverage = client.get("/api/v1/archive/coverage").json()["data"]

        assert first["projects_imported"] == 1
        assert second["projects_imported"] == 0
        assert second["projects_skipped"] == 1
        assert second["events_created"] == 0
        # 事件 id 与 coverage 完全不变：没有新增 occurrence 或 claim。
        assert [event["id"] for event in second_events] == [
            event["id"] for event in first_events
        ]
        assert len(second_coverage) == len(first_coverage)


def test_sync_replaces_snapshot_and_preserves_user_judgment(tmp_path: Path):
    codex_root = tmp_path / "codex-home" / "sessions"
    project = tmp_path / "proj"
    project.mkdir()
    _write_codex_rollout(codex_root, "2026-05-10", "rollout-a.jsonl", str(project))

    with _sync_client(tmp_path) as client:
        first = client.post("/api/v1/archive/sync").json()["data"]
        assert first["projects_imported"] == 1
        events = client.get("/api/v1/archive/events").json()["data"]
        assert len(events) == 1

        # 用户对已有事件提出异议（真实性宪法：异议入口保留）。
        disputed = client.post(
            f"/api/v1/events/{events[0]['id']}/reviews",
            json={
                "decision": "disputed",
                "note": "这天其实在休假",
                "expected_revision": 0,
            },
        )
        assert disputed.status_code == 200

        # 项目新增一天的会话 → 证据文档变化 → 快照替换。
        _write_codex_rollout(codex_root, "2026-05-12", "rollout-b.jsonl", str(project))
        second = client.post("/api/v1/archive/sync").json()["data"]
        assert second["projects_imported"] == 1
        assert second["projects_skipped"] == 0

        after = client.get("/api/v1/archive/events").json()["data"]
        assert len(after) == 2
        # 异议判定保持：旧事件并入新快照的 claim，但不覆盖用户状态。
        old_event = next(
            event for event in after if event["occurred_on"] == "2026-05-10"
        )
        assert old_event["status"] == "disputed"
        assert old_event["id"] == events[0]["id"]
        new_event = next(
            event for event in after if event["occurred_on"] == "2026-05-12"
        )
        assert new_event["status"] == "verified"

        # 快照是替换不是堆积：一个项目始终只有一个 occurrence（3 条 coverage）。
        coverage = client.get("/api/v1/archive/coverage").json()["data"]
        assert len(coverage) == 3


def test_sync_self_heals_after_interrupted_import(tmp_path: Path):
    """对抗性审查 P0 回归：跳过仅在 occurrence 完整时成立。

    上次同步在 occurrence 落库后、事件持久化完成前被打断（进程被杀/
    磁盘满），occurrence 停在 processing 且 blob 字节相同——下一轮同步
    必须重建该项目，而不是永久跳过。
    """
    codex_root = tmp_path / "codex-home" / "sessions"
    project = tmp_path / "proj"
    project.mkdir()
    _write_codex_rollout(codex_root, "2026-05-10", "rollout-a.jsonl", str(project))

    with _sync_client(tmp_path) as client:
        first = client.post("/api/v1/archive/sync").json()["data"]
        assert first["projects_imported"] == 1

        # 模拟中断：occurrence 回到 processing（blob 与 source_key 原样保留）。
        engine = create_engine(f"sqlite:///{tmp_path / 'sync.db'}")
        try:
            with engine.connect() as connection:
                connection.execute(
                    text(
                        "UPDATE evidence_occurrences"
                        " SET status = 'processing' WHERE source_key IS NOT NULL"
                    )
                )
                connection.commit()
        finally:
            engine.dispose()

        healed = client.post("/api/v1/archive/sync").json()["data"]
        assert healed["projects_skipped"] == 0
        assert healed["projects_imported"] == 1
        events = client.get("/api/v1/archive/events").json()["data"]
        assert len(events) == 1
        assert events[0]["status"] == "verified"

        # 自愈之后再同步一次：内容与状态都完整 → 这次才真正跳过。
        settled = client.post("/api/v1/archive/sync").json()["data"]
        assert settled["projects_skipped"] == 1
        assert settled["projects_imported"] == 0


def test_wipe_archive_is_the_only_destructive_operation(tmp_path: Path):
    """清空档案库：全部数据行与 blob 文件回收，阶段视图一并清除。"""
    claude_root = tmp_path / "claude-home" / "projects"
    _write_claude_session(claude_root, "-Users-you-Projects-alpha", "a.jsonl")

    with _sync_client(tmp_path) as client:
        synced = client.post("/api/v1/archive/sync").json()["data"]
        assert synced["projects_imported"] == 1
        blob_sha = client.get("/api/v1/archive/events").json()["data"][0][
            "claims"
        ][0]["anchors"][0]["blob_sha256"]
        blob_file = tmp_path / "uploads" / blob_sha[:2] / f"{blob_sha}.txt"
        assert blob_file.is_file()

        wiped = client.delete("/api/v1/archive")

        assert wiped.status_code == 200
        body = wiped.json()["data"]
        assert body["cleared"] is True
        assert body["events_removed"] == 1
        assert client.get("/api/v1/archive/events").json()["data"] == []
        assert not blob_file.exists()
        # 再次清空：幂等，不报错。
        again = client.delete("/api/v1/archive")
        assert again.status_code == 200


def test_sync_isolates_per_project_persistence_failure(tmp_path: Path, monkeypatch):
    """对抗性审查 P0 回归：单项目落库失败只降级该项目，不中断整轮同步。"""
    codex_root = tmp_path / "codex-home" / "sessions"
    project_a = tmp_path / "proj-a"
    project_b = tmp_path / "proj-b"
    project_a.mkdir()
    project_b.mkdir()
    # proj-b 会话更多 → 发现在前、先导入；让 proj-a（后处理）落库时炸。
    _write_codex_rollout(codex_root, "2026-05-10", "rollout-b1.jsonl", str(project_b))
    _write_codex_rollout(codex_root, "2026-05-11", "rollout-b2.jsonl", str(project_b))
    _write_codex_rollout(codex_root, "2026-05-12", "rollout-a.jsonl", str(project_a))

    from app.services import museum_service

    original = museum_service._import_activity_evidence

    def flaky(session, **kwargs):
        if kwargs.get("label") == "proj-a":
            raise museum_service.ApiError(500, "boom", "模拟落库失败")
        return original(session, **kwargs)

    monkeypatch.setattr(museum_service, "_import_activity_evidence", flaky)

    with _sync_client(tmp_path) as client:
        summary = client.post("/api/v1/archive/sync").json()["data"]

    assert summary["projects_failed"] == 1
    assert summary["projects_imported"] == 1
    failed = next(item for item in summary["products"] if item["status"] == "failed")
    assert failed["project"] == "proj-a"
    assert failed["error_code"] == "boom"
