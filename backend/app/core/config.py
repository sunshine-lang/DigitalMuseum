from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DIGITAL_MUSEUM_",
        env_file=PROJECT_ROOT / ".env",
        extra="ignore",
    )

    database_url: str = f"sqlite:///{PROJECT_ROOT / 'data' / 'digital_museum.db'}"
    upload_dir: Path = PROJECT_ROOT / "data" / "uploads"
    max_upload_bytes: int = Field(default=2 * 1024 * 1024, ge=1)
    max_photo_bytes: int = Field(default=25 * 1024 * 1024, ge=1)
    allowed_repo_roots: str = "~"
    cors_origins: tuple[str, ...] = (
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
    )
