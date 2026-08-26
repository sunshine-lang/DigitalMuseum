"""pi-agent-evidence-v1 与 dsh-evidence-v1 适配器行为（经档案库同步链路验证）。

pi：转义目录 + JSONL，首行 {type:"session", cwd}，ISO 时间戳；
dsh：转义目录 + zstd 压缩 JSONL，首行 {type:"session", cwd, delegationDepth}，
epoch 毫秒时间戳，user/message 须 data.source.kind == "user"。
"""

from __future__ import annotations

import json
from pathlib import Path

import zstandard
from fastapi.testclient import TestClient


def _write_pi_session(
    sessions_root: Path, munged: str, filename: str, cwd: str, *, day: str = "2026-05-10"
) -> None:
    directory = sessions_root / munged
    directory.mkdir(parents=True, exist_ok=True)
    lines = [
        json.dumps(
            {
                "type": "session",
                "version": 3,
                "id": filename,
                "timestamp": f"{day}T04:00:00.000Z",
                "cwd": cwd,
            }
        ),
        json.dumps(
            {
                "type": "message",
                "timestamp": f"{day}T04:01:00.000Z",
                "message": {
                    "role": "user",
                    "content": [{"type": "text", "text": "给这个项目加个测试"}],
                },
            }
        ),
        json.dumps(
            {
                "type": "message",
                "timestamp": f"{day}T04:02:00.000Z",
                "message": {"role": "assistant", "content": [{"type": "text", "text": "好的。"}]},
            }
        ),
    ]
    (directory / filename).write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_dsh_session(
    sessions_root: Path,
    session_dir: str,
    cwd: str,
    *,
    day_epoch_ms: int,
    delegation_depth: int = 0,
    injected_user: bool = False,
) -> None:
    directory = sessions_root / "-munged-project" / session_dir
    directory.mkdir(parents=True, exist_ok=True)
    records = [
        json.dumps(
            {
                "type": "session",
                "version": 0,
                "id": session_dir,
                "createdAt": day_epoch_ms,
                "cwd": cwd,
                "delegationDepth": delegation_depth,
            }
        ),
        json.dumps(
            {
                "type": "user/message",
                "seq": 1,
                "time": day_epoch_ms + 60_000,
                "data": {
                    "content": [{"type": "text", "text": "介绍一下这个项目"}],
                    "source": {"kind": "user" if not injected_user else "system", "rpcId": "rpc-1"},
                    "role": "user",
                    "id": "u1",
                },
            }
        ),
        json.dumps(
            {
                "type": "assistant/message",
                "seq": 2,
                "time": day_epoch_ms + 120_000,
                "data": {"turn": 1, "step": 1, "message": {"role": "assistant", "content": []}},
            }
        ),
    ]
    payload = ("\n".join(records) + "\n").encode("utf-8")
    (directory / "session.jsonl.zstd").write_bytes(zstandard.compress(payload))


def _sync(client: TestClient) -> dict:
    response = client.post("/api/v1/archive/sync")
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _events(client: TestClient) -> list[dict]:
    return client.get("/api/v1/archive/events").json()["data"]


def test_pi_projects_sync_as_verified(sync_client: TestClient, tmp_path: Path) -> None:
    project = tmp_path / "projects" / "pi-proj"
    project.mkdir(parents=True)
    sessions_root = tmp_path / "pi-home" / "sessions"
    _write_pi_session(sessions_root, "-Users-e2e-pi-proj", "a.jsonl", str(project))
    # cwd 已消失的项目不列。
    _write_pi_session(sessions_root, "-Users-e2e-gone", "b.jsonl", str(tmp_path / "vanished"))

    listed = sync_client.get("/api/v1/pi-sessions/projects").json()["data"]
    assert [(item["project"], item["session_count"]) for item in listed] == [("pi-proj", 1)]

    summary = _sync(sync_client)
    assert summary["projects_imported"] == 1
    assert [item["product"] for item in summary["products"]] == ["pi"]

    events = _events(sync_client)
    assert len(events) == 1
    event = events[0]
    assert event["title"] == "在 pi-proj 与 pi 协作"
    assert event["status"] == "verified"
    assert event["origin"] == "pi"
    assert event["claims"][0]["processor_version"] == "pi-agent-evidence-v1"
    assert "1 个 pi 会话" in event["claims"][0]["text"]
    assert "1 条用户消息" in event["claims"][0]["text"]
    assert "给这个项目加个测试" in event["claims"][0]["text"]


def test_dsh_projects_sync_excluding_delegated_threads(
    sync_client: TestClient, tmp_path: Path
) -> None:
    project = tmp_path / "projects" / "dsh-proj"
    project.mkdir(parents=True)
    sessions_root = tmp_path / "dsh-home" / "sessions"
    # 12:00Z = 东八区 20:00，归日稳定。
    _write_dsh_session(sessions_root, "session-user", str(project), day_epoch_ms=1_746_867_360_000)
    # 子代理线程：整体排除；注入源的 user 消息也不计。
    _write_dsh_session(
        sessions_root, "session-sub", str(project),
        day_epoch_ms=1_746_867_400_000, delegation_depth=1,
    )
    _write_dsh_session(
        sessions_root, "session-injected", str(project),
        day_epoch_ms=1_746_867_500_000, injected_user=True,
    )

    listed = sync_client.get("/api/v1/dsh-sessions/projects").json()["data"]
    assert [(item["project"], item["session_count"]) for item in listed] == [("dsh-proj", 2)]

    summary = _sync(sync_client)
    assert summary["projects_imported"] == 1

    events = _events(sync_client)
    assert len(events) == 1
    event = events[0]
    assert event["title"] == "在 dsh-proj 与 dsh 协作"
    assert event["status"] == "verified"
    assert event["origin"] == "dsh"
    assert event["claims"][0]["processor_version"] == "dsh-evidence-v1"
    # 只统计真人线程的 1 会话 1 用户消息；注入会话不计用户消息。
    assert "2 个 dsh 会话" in event["claims"][0]["text"]
    assert "1 条用户消息" in event["claims"][0]["text"]
    assert "介绍一下这个项目" in event["claims"][0]["text"]


def test_mixed_products_one_archive(sync_client: TestClient, tmp_path: Path) -> None:
    """四产品同档案并存：source_key 的产品前缀天然隔离，互不聚合。"""
    pi_project = tmp_path / "projects" / "mix"
    pi_project.mkdir(parents=True)
    codex_project = tmp_path / "projects" / "codex-mix"
    codex_project.mkdir(parents=True)
    _write_pi_session(
        tmp_path / "pi-home" / "sessions", "-Users-e2e-mix", "a.jsonl", str(pi_project)
    )
    helpers_seed_codex = tmp_path / "codex-home" / "sessions" / "2026" / "05" / "11"
    helpers_seed_codex.mkdir(parents=True)
    (helpers_seed_codex / "rollout-mix.jsonl").write_text(
        json.dumps(
            {
                "type": "session_meta",
                "payload": {"cwd": str(codex_project), "thread_source": "user"},
            }
        )
        + "\n"
        + json.dumps(
            {
                "timestamp": "2026-05-11T12:00:00.000Z",
                "type": "event_msg",
                "payload": {"type": "user_message", "message": "另一个项目"},
            }
        )
        + "\n",
        encoding="utf-8",
    )

    summary = _sync(sync_client)
    assert summary["projects_imported"] == 2
    products = sorted(item["product"] for item in summary["products"])
    assert products == ["codex", "pi"]

    events = _events(sync_client)
    assert len(events) == 2
    assert {event["origin"] for event in events} == {"pi", "codex"}
