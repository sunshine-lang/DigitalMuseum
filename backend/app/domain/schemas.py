from __future__ import annotations

from datetime import date, datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field

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
    claims: list[ClaimOut]
    latest_review: ReviewOut | None


class OccurrenceOut(BaseModel):
    id: str
    blob_sha256: str | None
    original_filename: str
    status: str
    imported_at: datetime


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
