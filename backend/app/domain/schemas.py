from __future__ import annotations

from datetime import date, datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class DataEnvelope(BaseModel, Generic[T]):
    data: T


class HealthOut(BaseModel):
    status: Literal["ok"]
    phase: Literal["phase-0-note-tracer"]


class StageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    starts_on: date
    ends_on: date


class StageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    starts_on: date
    ends_on: date
    created_at: datetime
    evidence_count: int = 0
    event_count: int = 0


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
    evidence_role: Literal["user_statement"]
    processor_version: str
    anchors: list[AnchorOut]


class ReviewOut(BaseModel):
    id: str
    decision: Literal["confirmed", "disputed", "unknown", "rejected"]
    note: str | None
    previous_status: str
    revision: int
    created_at: datetime


class EventOut(BaseModel):
    id: str
    stage_id: str
    title: str
    occurred_on: date | None
    time_precision: Literal["exact", "unknown"]
    status: Literal["candidate", "confirmed", "disputed", "unknown", "rejected"]
    revision: int
    is_formal: bool
    claims: list[ClaimOut]
    latest_review: ReviewOut | None


class OccurrenceOut(BaseModel):
    id: str
    stage_id: str
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


class NoteImportOut(BaseModel):
    occurrence: OccurrenceOut
    event: EventOut
    coverage: list[CoverageOut]


class ReviewCreate(BaseModel):
    decision: Literal["confirmed", "disputed", "unknown", "rejected"]
    note: str | None = Field(default=None, max_length=2000)
    expected_revision: int = Field(ge=0)
