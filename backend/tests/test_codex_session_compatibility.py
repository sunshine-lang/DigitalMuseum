"""去私密 fixture 保留实测 item_completed 的结构，正文/路径/ID/时间已替换。"""

import json
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.core.errors import ApiError
from app.services.codex_session_evidence_service import import_project, list_projects


def record(kind, payload, minute=1, **extra):
    return {
        "timestamp": f"2026-05-10T02:{minute:02d}:00Z",
        "type": kind,
        "payload": payload,
        **extra,
    }


def completed(
    role="user", identity="u1", turn="t1", text="请检查演示项目的测试", minute=1, **extra
):
    return record(
        "event_msg",
        {
            "type": "item_completed",
            "thread_id": "thread-one",
            "turn_id": turn,
            "item": {
                "type": "UserMessage" if role == "user" else "AgentMessage",
                "id": identity,
                "content": [{"type": "text" if role == "user" else "Text", "text": text}],
            },
        },
        minute,
        **extra,
    )


def response(role, identity, turn, text, minute=1):
    return record(
        "response_item",
        {
            "type": "message",
            "id": identity,
            "role": role,
            "content": [{"type": "input_text" if role == "user" else "output_text", "text": text}],
            "internal_chat_message_metadata_passthrough": {"turn_id": turn},
        },
        minute,
    )


def write_session(
    tmp_path, messages, name="rollout-thread-one.jsonl", *, history=None, source="user"
):
    project = tmp_path / "project"
    project.mkdir(exist_ok=True)
    sessions = tmp_path / "codex-home" / "sessions"
    sessions.mkdir(parents=True, exist_ok=True)
    meta = record(
        "session_meta",
        {"id": "thread-one", "thread_source": source, "cwd": str(project)},
        0,
        ordinal=0,
    )
    if history is not None:
        meta["payload"]["history_base"] = history
    path = sessions / name
    path.write_text(
        "\n".join(json.dumps(r) if isinstance(r, dict) else r for r in [meta, *messages]) + "\n"
    )
    return path


def read_project(tmp_path):
    return import_project(
        str(tmp_path / "project"),
        allowed_roots=str(tmp_path),
        root=str(tmp_path / "codex-home" / "sessions"),
    )


def test_completed_messages_are_read_instead_of_verified_zero(tmp_path: Path):
    project = tmp_path / "project"
    project.mkdir()
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    fixture = Path(__file__).parent / "fixtures" / "codex-item-completed.jsonl"
    (sessions / "rollout-sample.jsonl").write_text(
        fixture.read_text().replace("{PROJECT}", str(project)), encoding="utf-8"
    )
    evidence = import_project(str(project), allowed_roots=str(tmp_path), root=str(sessions))
    assert "user_messages=1 assistant_messages=1" in evidence.document
    assert "> 请检查演示项目的测试" in evidence.document
    assert "共 1 条用户消息" in evidence.items[0].claim_text


def test_mixed_formats_choose_one_source_per_turn_and_preserve_repeated_words(tmp_path):
    user = completed()
    agent = completed("assistant", "a1", text="开始检查", minute=2)
    old = record("event_msg", {"type": "user_message", "message": "继续"}, 3)
    write_session(
        tmp_path,
        [
            response(
                "user", "injected", "t1", "# AGENTS.md instructions for /demo\nInjected context"
            ),
            response("user", "mirror-u1", "t1", "请检查演示项目的测试"),
            user,
            deepcopy(user),
            record("event_msg", {"type": "user_message", "message": "请检查演示项目的测试"}),
            agent,
            response("assistant", "a1", "t1", "开始检查", 2),
            record("turn_context", {"turn_id": "t2"}, 3),
            old,
            deepcopy(old),
            record("event_msg", {"type": "agent_message", "message": "继续检查"}, 4),
            response("user", "u3", "t3", "独立的第三轮请求", 5),
            response("assistant", "a3", "t3", "第三轮回复", 6),
            completed(identity="u4", turn="t4", text="继续", minute=7),
            "broken-json",
            "null",
            "[]",
            record("compacted", {"replacement_history": [user, agent]}),
            record(
                "response_item",
                {
                    "type": "agent_message",
                    "author": "/root/helper",
                    "recipient": "/root",
                    "content": [{"type": "encrypted_content", "data": "opaque"}],
                },
            ),
        ],
    )
    evidence = read_project(tmp_path)
    assert "user_messages=4 assistant_messages=3" in evidence.document
    assert "> 请检查演示项目的测试" in evidence.document
    assert "Injected" not in evidence.document and "opaque" not in evidence.document


def test_full_replay_files_with_same_thread_and_message_ids_count_once(tmp_path):
    messages = [completed(), completed("assistant", "a1", text="完成", minute=2)]
    write_session(tmp_path, messages)
    write_session(
        tmp_path,
        [*messages, completed(identity="u2", turn="t2", text="请检查演示项目的测试", minute=3)],
        "rollout-replay.jsonl",
    )
    evidence = read_project(tmp_path)
    assert "(1 sessions)" in evidence.document
    assert "user_messages=2 assistant_messages=1" in evidence.document
    assert list_projects(str(tmp_path / "codex-home" / "sessions"))[0]["session_count"] == 1


def test_history_base_clips_replaced_tail_and_keeps_one_session(tmp_path):
    write_session(
        tmp_path,
        [
            completed(ordinal=2),
            completed("assistant", "a1", ordinal=3),
            completed(identity="obsolete", text="被替代的尾部", ordinal=8),
        ],
    )
    base = {"thread_id": "thread-one", "end_ordinal_exclusive": 5, "end_byte_offset": 1234}
    write_session(
        tmp_path,
        [
            completed(identity="u2", turn="t2", text="继续", minute=3, ordinal=7),
            completed("assistant", "a2", turn="t2", minute=4, ordinal=9),
        ],
        "rollout-thread-one_resume-two.jsonl",
        history=base,
    )
    evidence = read_project(tmp_path)
    assert "(1 sessions)" in evidence.document
    assert "user_messages=2 assistant_messages=2" in evidence.document
    assert "被替代" not in evidence.document


@pytest.mark.parametrize("branched", [False, True])
def test_missing_or_branched_history_is_explicit_error(tmp_path, branched):
    base = {"thread_id": "thread-one", "end_ordinal_exclusive": 5}
    write_session(
        tmp_path, [completed(ordinal=7)], "rollout-thread-one_child-a.jsonl", history=base
    )
    if branched:
        write_session(tmp_path, [completed(ordinal=2)])
        write_session(
            tmp_path, [completed(ordinal=7)], "rollout-thread-one_child-b.jsonl", history=base
        )
    with pytest.raises(ApiError) as raised:
        read_project(tmp_path)
    assert raised.value.code == (
        "ambiguous_codex_history" if branched else "incomplete_codex_history"
    )


@pytest.mark.parametrize(
    "message",
    [
        record("event_msg", {"type": ["user_message"]}),
        record("event_msg", {"type": "item_completed", "item": {"type": []}}),
        record("event_msg", {"type": "item_completed", "item": {"type": "NewHumanMessage"}}),
        record("event_msg", {"type": "user_message", "message": {"body": "unknown"}}),
        response("user", "no-provenance", None, "无法确定出处的用户容器"),
    ],
)
def test_unsupported_messages_fail_instead_of_becoming_verified_zero(tmp_path, message):
    write_session(tmp_path, [message])
    with pytest.raises(ApiError, match="unsupported_codex_message"):
        read_project(tmp_path)


def test_injected_context_tools_and_non_user_threads_are_not_messages(tmp_path):
    write_session(
        tmp_path,
        [
            *[
                response(role, role, "t1", "非对话上下文")
                for role in ("system", "developer", "tool")
            ],
            completed(text="<environment_context>context</environment_context>"),
            response("user", "meta", "t1", "<recommended_plugins>context</recommended_plugins>"),
            record("event_msg", {"type": "item_completed", "item": {"type": "CommandExecution"}}),
            completed(
                identity="real",
                text="<in-app-browser-context>context</in-app-browser-context>"
                "\n## My request:\n请检查实际问题",
            ),
        ],
    )
    write_session(
        tmp_path,
        [completed(identity="sub", text="子任务注入")],
        "rollout-sub.jsonl",
        source="subagent",
    )
    write_session(
        tmp_path,
        [completed(identity="guard", text="审查注入")],
        "rollout-guard.jsonl",
        source="guardian_review",
    )
    evidence = read_project(tmp_path)
    assert "user_messages=1 assistant_messages=0" in evidence.document
    assert "> 请检查实际问题" in evidence.document


def test_message_time_not_metadata_or_completion_time_drives_range(tmp_path):
    message = completed(minute=9)
    message["payload"]["started_at_ms"] = 1778378460000
    write_session(tmp_path, [message])
    evidence = read_project(tmp_path)
    local_time = datetime.fromtimestamp(1778378460, UTC).astimezone().strftime("%H:%M")
    assert f"{local_time}-{local_time}" in evidence.document


def test_user_pasted_material_is_not_dropped_when_request_caption_is_empty(tmp_path):
    text = "# Files pasted by the user:\n用户提供的一段材料\n## My request:\n"
    write_session(tmp_path, [completed(text=text)])
    evidence = read_project(tmp_path)
    assert "user_messages=1" in evidence.document
    assert "用户提供的一段材料" in evidence.document


def test_failed_sync_keeps_previous_snapshot_and_review(sync_client, tmp_path):
    path = write_session(tmp_path, [completed()])
    assert sync_client.post("/api/v1/archive/sync").json()["data"]["projects_imported"] == 1
    event = sync_client.get("/api/v1/archive/events").json()["data"][0]
    sync_client.post(
        f"/api/v1/events/{event['id']}/reviews",
        json={"decision": "disputed", "note": "待核对", "expected_revision": 0},
    )
    before = sync_client.get("/api/v1/archive/events").json()
    path.write_text(
        path.read_text()
        + json.dumps(record("event_msg", {"type": "user_message", "message": {}}))
        + "\n"
    )
    result = sync_client.post("/api/v1/archive/sync").json()["data"]
    assert result["projects_failed"] == 1
    assert result["products"][0]["error_code"] == "unsupported_codex_message"
    assert sync_client.get("/api/v1/archive/events").json() == before


@pytest.mark.parametrize("role", [[], {}, None, "future-human"])
def test_unknown_response_role_is_a_project_error_not_a_sync_crash(
    sync_client, tmp_path, role
):
    path = write_session(tmp_path, [completed()])
    assert sync_client.post("/api/v1/archive/sync").json()["data"]["projects_imported"] == 1
    before = sync_client.get("/api/v1/archive/events").json()
    message = response("user", "unknown-role", "t2", "无法识别角色的发言")
    message["payload"]["role"] = role
    path.write_text(path.read_text() + json.dumps(message) + "\n")
    result = sync_client.post("/api/v1/archive/sync").json()["data"]
    assert result["projects_failed"] == 1
    assert result["products"][0]["error_code"] == "unsupported_codex_message"
    assert sync_client.get("/api/v1/archive/events").json() == before
