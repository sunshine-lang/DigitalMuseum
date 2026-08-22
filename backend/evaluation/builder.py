from __future__ import annotations

import json
import os
import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image
from PIL.ExifTags import IFD

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
NOTES_DIR = DATASET_DIR / "notes"
MANIFEST_PATH = DATASET_DIR / "manifest.json"


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def build_dataset(workdir: Path, manifest: dict) -> dict:
    """在工作目录内确定性构建 git 仓库、照片与被拒绝文件，返回导入清单。"""
    workdir.mkdir(parents=True, exist_ok=True)
    return {
        "notes": sorted(path.name for path in NOTES_DIR.glob("*.md")),
        "git_repo": _build_git_repo(workdir, manifest["git_repo"]),
        "photos": _build_photos(workdir, manifest["photos"]),
        "rejected": _build_rejected(workdir, manifest["rejected"]),
    }


def _build_git_repo(workdir: Path, spec: dict) -> Path:
    repo = workdir / spec["repo_dirname"]
    repo.mkdir()
    _git(repo, "init", "-b", "main")
    for index, commit in enumerate(spec["commits"]):
        (repo / f"file-{index}.txt").write_text(f"content {index}", encoding="utf-8")
        _git(repo, "add", ".")
        _git(repo, "commit", "-m", commit["message"], date_iso=commit["date"])
    for tag in spec.get("tags", []):
        _git(repo, "tag", "-a", tag["name"], "-m", tag["message"], date_iso=tag["date"])
    return repo


def _build_photos(workdir: Path, specs: list[dict]) -> list[Path]:
    photos_dir = workdir / "photos"
    photos_dir.mkdir(exist_ok=True)
    paths = []
    for spec in specs:
        exif = Image.Exif()
        if spec.get("make"):
            exif[271] = spec["make"]
        if spec.get("model"):
            exif[272] = spec["model"]
        exif.get_ifd(IFD.Exif)[36867] = spec["taken_at"]
        image = Image.new("RGB", (48, 36), (120, 90, 60))
        path = photos_dir / spec["filename"]
        image.save(path, "JPEG", exif=exif)
        paths.append(path)
    return paths


def _build_rejected(workdir: Path, specs: list[dict]) -> list[dict]:
    rejected_dir = workdir / "rejected"
    rejected_dir.mkdir(exist_ok=True)
    prepared = []
    for spec in specs:
        path = rejected_dir / spec["filename"]
        if spec["kind"] == "photo":
            image = Image.new("RGB", (32, 24), (20, 20, 20))
            buffer = BytesIO()
            image.save(buffer, spec.get("format", "PNG"))
            path.write_bytes(buffer.getvalue())
        else:
            path.write_text(spec["content"], encoding="utf-8")
        prepared.append(
            {
                "kind": spec["kind"],
                "path": path,
                "filename": spec["filename"],
                "status": spec["status"],
                "error_code": spec["error_code"],
            }
        )
    return prepared


def _git(repo: Path, *args: str, date_iso: str | None = None) -> None:
    env = os.environ.copy()
    env.update(
        {
            "GIT_AUTHOR_NAME": "Evaluator",
            "GIT_AUTHOR_EMAIL": "evaluator@example.com",
            "GIT_COMMITTER_NAME": "Evaluator",
            "GIT_COMMITTER_EMAIL": "evaluator@example.com",
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
