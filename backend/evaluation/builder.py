from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
NOTES_DIR = DATASET_DIR / "notes"
MANIFEST_PATH = DATASET_DIR / "manifest.json"


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def build_dataset(workdir: Path, manifest: dict) -> dict:
    """在工作目录内确定性构建 git 仓库与被拒绝文件，返回导入清单。"""
    workdir.mkdir(parents=True, exist_ok=True)
    return {
        "notes": sorted(path.name for path in NOTES_DIR.glob("*.md")),
        "git_repo": _build_git_repo(workdir, manifest["git_repo"]),
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


def _build_rejected(workdir: Path, specs: list[dict]) -> list[dict]:
    rejected_dir = workdir / "rejected"
    rejected_dir.mkdir(exist_ok=True)
    prepared = []
    for spec in specs:
        path = rejected_dir / spec["filename"]
        path.write_text(spec["content"], encoding="utf-8")
        prepared.append(
            {
                "filename": spec["filename"],
                "path": path,
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
