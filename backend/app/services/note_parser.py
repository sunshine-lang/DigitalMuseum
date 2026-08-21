from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

import yaml

from app.core.errors import ApiError

PROCESSOR_VERSION = "note-development-v1"


@dataclass(frozen=True, slots=True)
class ParsedNote:
    title: str
    occurred_on: date | None
    claim_text: str
    line_start: int
    line_end: int
    char_start: int
    char_end: int


def parse_note(text: str, filename: str) -> ParsedNote:
    lines = text.splitlines(keepends=True)
    if not lines:
        raise ApiError(415, "invalid_note_content", "笔记中没有可解析的文字")

    metadata: dict[str, object] = {}
    content_start = 0
    if lines[0].strip() == "---":
        closing_index = next(
            (index for index, line in enumerate(lines[1:], start=1) if line.strip() == "---"),
            None,
        )
        if closing_index is None:
            raise ApiError(422, "invalid_frontmatter", "YAML Frontmatter 缺少结束分隔线")
        raw_frontmatter = "".join(lines[1:closing_index])
        try:
            loaded = yaml.safe_load(raw_frontmatter) or {}
        except yaml.YAMLError as exc:
            raise ApiError(422, "invalid_frontmatter", "YAML Frontmatter 无法解析") from exc
        if not isinstance(loaded, dict):
            raise ApiError(422, "invalid_frontmatter", "YAML Frontmatter 必须是键值结构")
        metadata = loaded
        content_start = closing_index + 1

    title = _metadata_title(metadata)
    heading_title: str | None = None
    paragraph_indices: list[int] = []
    paragraph_started = False

    for index in range(content_start, len(lines)):
        line_without_newline = lines[index].rstrip("\r\n")
        stripped = line_without_newline.strip()
        if not stripped:
            if paragraph_started:
                break
            continue
        if stripped.startswith("#"):
            if heading_title is None:
                heading_title = stripped.lstrip("#").strip() or None
            if not paragraph_started:
                continue
        paragraph_started = True
        paragraph_indices.append(index)

    if not paragraph_indices:
        raise ApiError(415, "invalid_note_content", "笔记中没有可作为候选主张的正文")

    first_index = paragraph_indices[0]
    last_index = paragraph_indices[-1]
    claim_text = "".join(lines[first_index : last_index + 1]).rstrip("\r\n")
    char_start = sum(len(line) for line in lines[:first_index])
    char_end = char_start + len(claim_text)
    fallback_title = Path(filename).stem.replace("_", " ").replace("-", " ").strip()

    return ParsedNote(
        title=(title or heading_title or fallback_title or "未命名笔记")[:200],
        occurred_on=_metadata_date(metadata),
        claim_text=claim_text,
        line_start=first_index + 1,
        line_end=last_index + 1,
        char_start=char_start,
        char_end=char_end,
    )


def _metadata_title(metadata: dict[str, object]) -> str | None:
    value = metadata.get("title")
    if value is None:
        return None
    title = str(value).strip()
    return title or None


def _metadata_date(metadata: dict[str, object]) -> date | None:
    value = metadata.get("date")
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip())
    except ValueError as exc:
        raise ApiError(422, "invalid_note_date", "笔记日期必须使用 YYYY-MM-DD") from exc
