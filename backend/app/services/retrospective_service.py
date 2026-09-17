from __future__ import annotations

import os
import stat
from pathlib import Path

from pydantic import ValidationError

from app.core.errors import ApiError
from app.domain.schemas import StoryDraft

MAX_STORY_BYTES = 1024 * 1024


def list_retrospectives(root: Path, *, project_key: str | None) -> list[StoryDraft]:
    """Read saved drafts only; project_key is a filter, never a filesystem path."""
    try:
        if root.is_symlink():
            raise ValueError("retrospective root cannot be a symlink")
        if not root.exists():
            return []
        root = root.resolve(strict=True)
        stories = []
        seen_ids = set()
        for directory in sorted(root.iterdir()):
            if directory.is_symlink():
                raise ValueError("retrospective directory cannot be a symlink")
            if not directory.is_dir():
                continue
            path = directory / "story.json"
            if path.is_symlink():
                raise ValueError("retrospective file cannot be a symlink")
            if not path.exists():
                continue
            # O_NOFOLLOW also rejects a file changed to a symlink between checks.
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(descriptor, "rb") as stream:
                if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                    raise ValueError("retrospective must be a regular file")
                content = stream.read(MAX_STORY_BYTES + 1)
            if len(content) > MAX_STORY_BYTES:
                raise ValueError("retrospective file is too large")
            story = StoryDraft.model_validate_json(content)
            if story.id in seen_ids:
                raise ValueError("retrospective ids must be unique")
            seen_ids.add(story.id)
            if project_key is None or story.project_key == project_key:
                stories.append(story)
        return sorted(stories, key=lambda story: (story.ends_on, story.id), reverse=True)
    except (OSError, ValueError, ValidationError) as exc:
        raise ApiError(
            422, "invalid_retrospective", "本地故事草稿无法读取或校验未通过，请检查草稿文件"
        ) from exc


def list_exhibit_previews(root: Path) -> list[dict]:
    """一次读取展品目录，外层不预载私人原话全文。"""
    previews = []
    for story in list_retrospectives(root, project_key=None):
        if not story.exhibit:
            continue
        exhibit = story.exhibit
        ids = set(exhibit.source_ids)
        for part in [exhibit.goal, *exhibit.process, exhibit.result]:
            ids.update(part.source_ids)
        previews.append({
            "id": story.id,
            "project_key": story.project_key,
            "status": story.status,
            "title": exhibit.title,
            "summary": exhibit.summary,
            "starts_on": exhibit.starts_on,
            "ends_on": exhibit.ends_on,
            "artwork": exhibit.artwork,
            "source_roles": sorted({source.role for source in story.sources if source.id in ids}),
            "reference_count": len(ids),
        })
    return previews
