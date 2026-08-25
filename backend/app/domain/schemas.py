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
    decision: Literal["confirmed", "disputed", "unknown", "rejected", "merged", "split"]
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
    "merged",
    "split",
]


class EventOut(BaseModel):
    id: str
    stage_id: str
    title: str
    occurred_on: date | None
    time_precision: Literal["exact", "unknown"]
    status: EventStatus
    revision: int
    is_formal: bool
    # "photo" 仅为兼容历史数据中的旧照片事件保留；照片适配器已于 2026-08-25 删除。
    origin: Literal[
        "note", "aggregated", "merged", "split", "git", "photo", "claude", "codex"
    ]
    source_count: int
    exhibit_caption: str | None
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


class MergeCreate(BaseModel):
    event_ids: list[str] = Field(min_length=2, max_length=20)
    title: str | None = Field(default=None, max_length=200)


class MergeOut(BaseModel):
    event: EventOut
    sources: list[EventOut]


class SplitOut(BaseModel):
    event: EventOut
    events: list[EventOut]


class ExhibitCaptionUpdate(BaseModel):
    # 空/空白 = 清除展签，回落到确定性叙事底稿；长度校验在服务层（invalid_caption）
    caption: str | None = None


# Git 仓库与 Claude/Codex 会话三个导入端点共用同形 path 入参。
class PathCreate(BaseModel):
    path: str = Field(min_length=1, max_length=1024)


class GitRepoPreviewOut(BaseModel):
    repo_name: str
    first_commit_on: date
    last_commit_on: date
    commit_count: int


class AgentSessionPreviewOut(BaseModel):
    project_label: str
    first_session_on: date
    last_session_on: date
    session_count: int


# 会话发现面板：本机有会话的项目清单（import_path 可原样传给导入端点）。
class AgentSessionProjectOut(BaseModel):
    project: str
    session_count: int
    import_path: str


# Git 提交与 Claude/Codex 会话三类活动证据的导入返回同形结构（一对多事件）。
class ActivityImportOut(BaseModel):
    occurrence: OccurrenceOut
    events: list[EventOut]
    coverage: list[CoverageOut]
