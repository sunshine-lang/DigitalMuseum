from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def app_paths(tmp_path: Path) -> tuple[str, Path]:
    return f"sqlite:///{tmp_path / 'museum.db'}", tmp_path / "uploads"


@pytest.fixture
def client(app_paths: tuple[str, Path]) -> TestClient:
    database_url, upload_dir = app_paths
    with TestClient(
        create_app(
            database_url=database_url,
            upload_dir=upload_dir,
            max_upload_bytes=1024,
        )
    ) as test_client:
        yield test_client
