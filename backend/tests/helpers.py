"""测试共享助手（普通函数模块）。

约定：pytest fixtures 统一放在 conftest.py；可复用的纯函数/常量放在本模块，
测试文件通过 `from tests.helpers import ...` 显式导入（backend 根目录在
sys.path 上，见 pyproject.toml 的 `pythonpath = ["."]`）。
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

STAGE_START = "2026-03-01"
STAGE_END = "2026-08-31"


def create_stage(
    client: TestClient,
    name: str,
    *,
    starts_on: str = STAGE_START,
    ends_on: str = STAGE_END,
) -> str:
    response = client.post(
        "/api/v1/stages",
        json={"name": name, "starts_on": starts_on, "ends_on": ends_on},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def create_half_year_stage(client: TestClient, name: str = "我的 AI 产品半年") -> str:
    """阶段视图测试用的上半年窗口。"""
    return create_stage(client, name, starts_on="2026-01-01", ends_on="2026-06-30")


def fetch_document(client: TestClient, sha256: str) -> str:
    """按内容哈希取证据文档原文（claude/codex 两个 Agent 适配器测试共用）。"""
    response = client.get(f"/api/v1/blobs/{sha256}")
    assert response.status_code == 200
    return response.text


def seed_codex_project(
    tmp_path: Path,
    *,
    project: str = "proj",
    day: str = "2026-05-10",
    first_user: str = "帮我看下这个报错",
) -> Path:
    """在约定的一次性 codex 根目录下播种一个单会话项目，返回项目路径。"""
    workspace = tmp_path / "projects" / project
    workspace.mkdir(parents=True, exist_ok=True)
    year, month, date_part = day.split("-")
    day_dir = tmp_path / "codex-home" / "sessions" / year / month / date_part
    day_dir.mkdir(parents=True, exist_ok=True)
    lines = [
        json.dumps(
            {
                "type": "session_meta",
                "payload": {"cwd": str(workspace), "thread_source": "user"},
            }
        ),
        json.dumps(
            {
                "timestamp": f"{day}T12:00:00.000Z",
                "type": "event_msg",
                "payload": {"type": "user_message", "message": first_user},
            }
        ),
        json.dumps(
            {
                "timestamp": f"{day}T12:01:00.000Z",
                "type": "event_msg",
                "payload": {"type": "agent_message", "message": "好的，我来看看。"},
            }
        ),
    ]
    (day_dir / f"rollout-{day}.jsonl").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )
    return workspace


def sync_archive(client: TestClient) -> dict:
    """触发档案库一键同步，返回汇总。"""
    response = client.post("/api/v1/archive/sync")
    assert response.status_code == 200, response.text
    return response.json()["data"]
