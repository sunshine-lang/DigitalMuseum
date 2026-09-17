from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Generic, Literal, Self, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

T = TypeVar("T")


class DataEnvelope(BaseModel, Generic[T]):
    data: T


class HealthOut(BaseModel):
    status: Literal["ok"]
    phase: Literal["phase-0-aggregation"]


class StageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    starts_on: date
    ends_on: date


# 长度/非空校验在 museum_service.rename_stage 统一为 invalid_stage_name。
class StageUpdate(BaseModel):
    name: str


class StageOut(BaseModel):

    id: str
    name: str
    starts_on: date
    ends_on: date
    created_at: datetime
    evidence_count: int = 0
    event_count: int = 0
    confirmed_count: int = 0
    verified_count: int = 0


class AnchorOut(BaseModel):
    blob_sha256: str
    quote: str
    line_start: int
    line_end: int
    char_start: int
    char_end: int


class ClaimOut(BaseModel):
    id: str
    text: str
    epistemic_status: Literal["unknown", "user_confirmed", "disputed"]
    evidence_role: Literal["user_statement", "artifact"]
    processor_version: str
    anchors: list[AnchorOut]


class ReviewOut(BaseModel):
    id: str
    decision: Literal["confirmed", "disputed", "unknown", "rejected"]
    note: str | None
    previous_status: str
    revision: int
    created_at: datetime


EventStatus = Literal[
    "candidate",
    "verified",
    "confirmed",
    "disputed",
    "unknown",
    "rejected",
]


class EventOut(BaseModel):
    id: str
    title: str
    occurred_on: date | None
    time_precision: Literal["exact", "unknown"]
    status: EventStatus
    revision: int
    is_formal: bool
    origin: Literal["aggregated", "claude", "codex", "pi", "dsh"]
    source_count: int
    project_key: str | None
    project_label: str | None
    project_path: str | None
    agent_products: list[Literal["claude", "codex", "pi", "dsh"]]
    claims: list[ClaimOut]
    latest_review: ReviewOut | None


class CoverageOut(BaseModel):
    id: str
    occurrence_id: str
    original_filename: str
    step: Literal["stored_locally", "parsed_locally", "candidate_generated"]
    status: Literal["completed", "failed"]
    processor_version: str | None
    error_code: str | None
    created_at: datetime


class ReviewCreate(BaseModel):
    decision: Literal["confirmed", "disputed", "unknown", "rejected"]
    note: str | None = Field(default=None, max_length=2000)
    expected_revision: int = Field(ge=0)


# 会话发现面板：本机有会话的项目清单（import_path 可原样传给导入端点）。
class AgentSessionProjectOut(BaseModel):
    project: str
    session_count: int
    import_path: str


# 档案库同步（ADR-0001）：source_key 内容寻址的幂等 upsert 结果。
class ArchiveSyncProductOut(BaseModel):
    product: Literal["claude", "codex", "pi", "dsh"]
    project: str
    session_count: int
    status: Literal["imported", "skipped", "failed"]
    error_code: str | None = None
    events_created: int


class ArchiveSyncOut(BaseModel):
    products: list[ArchiveSyncProductOut]
    projects_imported: int
    projects_skipped: int
    projects_failed: int
    events_created: int


StoryText = Annotated[str, Field(min_length=1)]


class StorySource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: StoryText
    role: Literal["user", "assistant", "document"]
    text: StoryText
    quote: StoryText | None
    filename: StoryText
    line: int = Field(ge=1)
    timestamp: StoryText

    @model_validator(mode="after")
    def validate_quote(self) -> Self:
        if self.quote is not None and self.quote not in self.text:
            raise ValueError("quote must be preserved verbatim in source text")
        return self


class StoryChapter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: StoryText
    title: StoryText
    paragraphs: list[StoryText] = Field(min_length=1)
    source_ids: list[StoryText] = Field(min_length=1)


class ExperiencePart(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actor: Literal["user", "agent", "record"]
    text: StoryText
    source_ids: list[StoryText] = Field(min_length=1)


class StoryExhibit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: StoryText
    summary: StoryText
    starts_on: date
    ends_on: date
    source_ids: list[StoryText] = Field(min_length=1)
    artwork: Literal["gathered-pages", "everyday-steps", "continuous-light"] | None = None
    goal: ExperiencePart
    process: list[ExperiencePart] = Field(min_length=1)
    result: ExperiencePart


class StoryDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: StoryText
    title: StoryText
    project_key: StoryText
    status: Literal["candidate"]
    starts_on: date
    ends_on: date
    chapters: list[StoryChapter] = Field(min_length=1)
    sources: list[StorySource] = Field(min_length=1)
    open_questions: list[StoryText]
    exhibit: StoryExhibit | None = None

    @model_validator(mode="after")
    def validate_references(self) -> Self:
        source_ids = {source.id for source in self.sources}
        if len(source_ids) != len(self.sources):
            raise ValueError("source ids must be unique")
        if len({chapter.id for chapter in self.chapters}) != len(self.chapters):
            raise ValueError("chapter ids must be unique")
        if any(not set(chapter.source_ids) <= source_ids for chapter in self.chapters):
            raise ValueError("each chapter must reference available sources")
        if self.starts_on > self.ends_on:
            raise ValueError("story date range must be ordered")
        if self.exhibit:
            exhibit = self.exhibit
            references = [exhibit.source_ids] + [
                part.source_ids for part in [exhibit.goal, *exhibit.process, exhibit.result]
            ]
            if any(not set(ids) <= source_ids for ids in references):
                raise ValueError("exhibit must reference available sources")
            if not self.starts_on <= exhibit.starts_on <= exhibit.ends_on <= self.ends_on:
                raise ValueError("exhibit dates must fit the story range")
        return self
