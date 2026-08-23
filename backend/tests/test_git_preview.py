from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def _git(repo: Path, *args: str, date_iso: str | None = None) -> None:
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
        env["GIT_COMMITTER_DATE"] = f"{date_iso}T12:00:00"
    subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        env=env,
    )


@pytest.fixture
def multi_date_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "preview-repo"
    repo.mkdir()
    _git(repo, "init", "-b", "main")
    days = ["2025-11-02", "2026-05-10", "2026-05-10", "2026-07-18", "2026-01-09"]
    for index, day in enumerate(days):
        (repo / f"file-{index}.txt").write_text(f"content {index}", encoding="utf-8")
        _git(repo, "add", ".")
        _git(repo, "commit", "-m", f"work {index}", date_iso=day)
    return repo


@pytest.fixture
def git_client(app_paths, tmp_path: Path) -> TestClient:
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(tmp_path),
        )
    ) as test_client:
        yield test_client


def _preview(client: TestClient, path: str):
    return client.get("/api/v1/git-repos/preview", params={"path": path})


def test_preview_returns_first_last_and_count(
    git_client: TestClient,
    multi_date_repo: Path,
):
    response = _preview(git_client, str(multi_date_repo))
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["repo_name"] == "preview-repo"
    assert payload["first_commit_on"] == "2025-11-02"
    assert payload["last_commit_on"] == "2026-07-18"
    # 同日多提交也要计入总数（5 个提交分布在 4 天）。
    assert payload["commit_count"] == 5


def test_preview_empty_repo_returns_no_commits(git_client: TestClient, tmp_path: Path):
    empty_repo = tmp_path / "empty-repo"
    empty_repo.mkdir()
    _git(empty_repo, "init", "-b", "main")
    response = _preview(git_client, str(empty_repo))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "no_commits"
    assert response.json()["error"]["message"] == "这个仓库还没有任何提交"


def test_preview_plain_directory_is_not_a_repository(
    git_client: TestClient, tmp_path: Path
):
    plain_dir = tmp_path / "not-a-repo"
    plain_dir.mkdir()
    response = _preview(git_client, str(plain_dir))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "not_a_git_repository"


def test_preview_missing_directory_returns_repo_not_found(git_client: TestClient):
    response = _preview(git_client, "/definitely/not/a/real/path")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "repo_not_found"


def test_preview_path_outside_allowed_roots_is_rejected(
    app_paths, tmp_path: Path, multi_date_repo: Path
):
    database_url, upload_dir = app_paths
    other_root = tmp_path / "elsewhere"
    other_root.mkdir()
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            allowed_repo_roots=str(other_root),
        )
    ) as client:
        response = _preview(client, str(multi_date_repo))
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "repo_path_not_allowed"


def test_preview_blank_path_is_rejected(git_client: TestClient):
    for blank in ("", "   "):
        response = _preview(git_client, blank)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "repo_path_required"


def test_preview_has_no_database_side_effects(
    git_client: TestClient,
    multi_date_repo: Path,
    tmp_path: Path,
):
    empty_repo = tmp_path / "empty-repo"
    empty_repo.mkdir()
    _git(empty_repo, "init", "-b", "main")
    plain_dir = tmp_path / "plain"
    plain_dir.mkdir()

    assert _preview(git_client, str(multi_date_repo)).status_code == 200
    assert _preview(git_client, str(empty_repo)).status_code == 422
    assert _preview(git_client, str(plain_dir)).status_code == 422
    # 家目录不在测试允许根内：403 路径也不会留下副作用。
    assert _preview(git_client, str(Path.home())).status_code == 403

    # 只读端点：成功与失败预览都不应产生任何阶段或事件。
    assert git_client.get("/api/v1/stages").json()["data"] == []
