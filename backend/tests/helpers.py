"""测试共享助手（普通函数模块）。

约定：pytest fixtures 统一放在 conftest.py；可复用的纯函数/常量放在本模块，
测试文件通过 `from tests.helpers import ...` 显式导入（backend 根目录在
sys.path 上，见 pyproject.toml 的 `pythonpath = ["."]`）。
只收敛逐字节相同（或仅默认参数不同的超集签名）的助手，不改变任何断言。
"""

from __future__ import annotations

import os
import subprocess
from collections.abc import Sequence
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from PIL.ExifTags import IFD

STAGE_START = "2026-03-01"
STAGE_END = "2026-08-31"


def git(
    repo: Path,
    *args: str,
    date_iso: str | None = None,
    committer_date_iso: str | None = None,
) -> None:
    """跑一条针对测试仓库的 git 命令。

    date_iso 同时钉住 author/committer 日期（可复现）；committer_date_iso
    可单独改写 committer 日期，用于 cherry-pick/rebase 场景。
    """
    env = os.environ.copy()
    env.update(
        {
            "GIT_AUTHOR_NAME": "Tester",
            "GIT_AUTHOR_EMAIL": "tester@example.com",
            "GIT_COMMITTER_NAME": "Tester",
            "GIT_COMMITTER_EMAIL": "tester@example.com",
        }
    )
    if date_iso is not None:
        env["GIT_AUTHOR_DATE"] = f"{date_iso}T12:00:00"
        env["GIT_COMMITTER_DATE"] = f"{committer_date_iso or date_iso}T12:00:00"
    subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        env=env,
    )


def make_git_repo(
    repo: Path,
    commits: Sequence[tuple[str, str]],
    *,
    tags: Sequence[tuple[str, str, str]] = (),
) -> Path:
    """初始化仓库并按 (message, day) 逐条提交，再按 (name, message, day) 打标签。"""
    repo.mkdir()
    git(repo, "init", "-b", "main")
    for index, (message, day) in enumerate(commits):
        (repo / f"file-{index}.txt").write_text(f"content {index}", encoding="utf-8")
        git(repo, "add", ".")
        git(repo, "commit", "-m", message, date_iso=day)
    for name, message, day in tags:
        git(repo, "tag", "-a", name, "-m", message, date_iso=day)
    return repo


def _to_dms(value: float) -> tuple[int, int, float]:
    degrees = int(value)
    minutes_float = (value - degrees) * 60
    minutes = int(minutes_float)
    seconds = round((minutes_float - minutes) * 60, 4)
    return degrees, minutes, seconds


def jpeg_bytes(
    *,
    taken_at: str | None = "2026:05:10 14:30:22",
    make: str | None = None,
    model: str | None = None,
    gps: tuple[float, float] | None = None,
    color: tuple[int, int, int] = (200, 30, 30),
) -> bytes:
    """生成带 EXIF（拍摄时间 / 器型 / GPS 可选）的测试 JPEG。"""
    exif = Image.Exif()
    if make is not None:
        exif[271] = make
    if model is not None:
        exif[272] = model
    if taken_at is not None:
        exif.get_ifd(IFD.Exif)[36867] = taken_at
    if gps is not None:
        latitude, longitude = gps
        gps_ifd = exif.get_ifd(IFD.GPSInfo)
        gps_ifd[1] = "N"
        gps_ifd[2] = _to_dms(latitude)
        gps_ifd[3] = "E"
        gps_ifd[4] = _to_dms(longitude)
    image = Image.new("RGB", (32, 24), color)
    buffer = BytesIO()
    image.save(buffer, "JPEG", exif=exif)
    return buffer.getvalue()


def upload_photo(
    client: TestClient,
    stage_id: str,
    *,
    content: bytes,
    filename: str = "IMG_20260510_143022.jpg",
    media_type: str = "image/jpeg",
):
    return client.post(
        f"/api/v1/stages/{stage_id}/photos",
        files={"file": (filename, content, media_type)},
    )


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
    """phase0_api / aggregation / stages_management 家族用的上半年阶段。"""
    return create_stage(client, name, starts_on="2026-01-01", ends_on="2026-06-30")


def fetch_document(client: TestClient, sha256: str) -> str:
    """按内容哈希取证据文档原文（claude/codex 两个 Agent 适配器测试共用）。"""
    response = client.get(f"/api/v1/blobs/{sha256}")
    assert response.status_code == 200
    return response.text


def import_agent_sessions(client: TestClient, stage_id: str, path, endpoint: str) -> dict:
    """导入 Agent 会话证据；endpoint 传 "claude-sessions" 或 "codex-sessions"。"""
    response = client.post(
        f"/api/v1/stages/{stage_id}/{endpoint}",
        json={"path": str(path)},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]
