from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.helpers import git, make_git_repo


@pytest.fixture
def multi_date_repo(tmp_path: Path) -> Path:
    days = ["2025-11-02", "2026-05-10", "2026-05-10", "2026-07-18", "2026-01-09"]
    return make_git_repo(
        tmp_path / "preview-repo",
        [(f"work {index}", day) for index, day in enumerate(days)],
    )


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


@pytest.mark.parametrize(
    ("scenario", "raw_path", "expected_status", "expected_code", "expected_message"),
    [
        ("empty-repo", None, 422, "no_commits", "这个仓库还没有任何提交"),
        ("plain-dir", None, 422, "not_a_git_repository", None),
        ("missing-dir", "/definitely/not/a/real/path", 422, "repo_not_found", None),
        ("blank-path", "", 422, "repo_path_required", None),
        ("blank-path", "   ", 422, "repo_path_required", None),
        ("disallowed-root", None, 403, "repo_path_not_allowed", None),
    ],
)
def test_preview_error_contract(
    git_client: TestClient,
    app_paths,
    tmp_path: Path,
    multi_date_repo: Path,
    scenario: str,
    raw_path: str | None,
    expected_status: int,
    expected_code: str,
    expected_message: str | None,
):
    if scenario == "disallowed-root":
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
    else:
        path = raw_path
        if scenario == "empty-repo":
            empty_repo = tmp_path / "empty-repo"
            empty_repo.mkdir()
            git(empty_repo, "init", "-b", "main")
            path = str(empty_repo)
        elif scenario == "plain-dir":
            plain_dir = tmp_path / "not-a-repo"
            plain_dir.mkdir()
            path = str(plain_dir)
        response = _preview(git_client, path)

    assert response.status_code == expected_status
    assert response.json()["error"]["code"] == expected_code
    if expected_message is not None:
        assert response.json()["error"]["message"] == expected_message


def test_preview_has_no_database_side_effects(
    git_client: TestClient,
    multi_date_repo: Path,
    tmp_path: Path,
):
    empty_repo = tmp_path / "empty-repo"
    empty_repo.mkdir()
    git(empty_repo, "init", "-b", "main")
    plain_dir = tmp_path / "plain"
    plain_dir.mkdir()

    assert _preview(git_client, str(multi_date_repo)).status_code == 200
    assert _preview(git_client, str(empty_repo)).status_code == 422
    assert _preview(git_client, str(plain_dir)).status_code == 422
    # 家目录不在测试允许根内：403 路径也不会留下副作用。
    assert _preview(git_client, str(Path.home())).status_code == 403

    # 只读端点：成功与失败预览都不应产生任何阶段或事件。
    assert git_client.get("/api/v1/stages").json()["data"] == []
