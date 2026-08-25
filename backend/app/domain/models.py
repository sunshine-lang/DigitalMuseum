from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def new_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(UTC)


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class EvidenceBlob(Base):
    __tablename__ = "evidence_blobs"

    sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    relative_path: Mapped[str] = mapped_column(String(255), unique=True)
    byte_size: Mapped[int] = mapped_column(Integer)
    media_type: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class EvidenceOccurrence(Base):
    __tablename__ = "evidence_occurrences"
    # 与迁移 c1d2a4f6b8e0 的命名一致，避免 alembic autogenerate 伪差异。
    __table_args__ = (UniqueConstraint("source_key", name="uq_evidence_occurrences_source_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    # 档案库为根（ADR-0001）：occurrence 全局归属档案库，不再挂阶段。
    # source_key 是同步幂等的身份键（如 "codex:/Users/x/proj"）；
    # 人工上传（笔记等）没有稳定身份，保持 NULL、不参与去重。
    source_key: Mapped[str | None] = mapped_column(String(300), nullable=True)
    blob_sha256: Mapped[str | None] = mapped_column(
        ForeignKey("evidence_blobs.sha256"), nullable=True
    )
    original_filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32))
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    blob: Mapped[EvidenceBlob | None] = relationship()
    coverage_items: Mapped[list[CoverageItem]] = relationship(
        back_populates="occurrence", cascade="all, delete-orphan"
    )


class CoverageItem(Base):
    __tablename__ = "coverage_items"
    __table_args__ = (UniqueConstraint("occurrence_id", "step"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    occurrence_id: Mapped[str] = mapped_column(
        ForeignKey("evidence_occurrences.id", ondelete="CASCADE")
    )
    step: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(24))
    processor_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    occurrence: Mapped[EvidenceOccurrence] = relationship(back_populates="coverage_items")


class CandidateEvent(Base):
    __tablename__ = "candidate_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    # 档案库为根（ADR-0001）：事件全局归属档案库；阶段只是对档案的
    # 时间窗视图，不再拥有数据。
    occurrence_id: Mapped[str | None] = mapped_column(
        ForeignKey("evidence_occurrences.id", ondelete="CASCADE"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200))
    occurred_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    time_precision: Mapped[str] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(String(24))
    revision: Mapped[int] = mapped_column(Integer, default=0)
    origin: Mapped[str] = mapped_column(String(24))
    aggregation_rule: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # 展签：展览态的人工策展文案（Omeka「展品与展签分离」）。空 = 用确定性叙事底稿。
    exhibit_caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_event_id: Mapped[str | None] = mapped_column(
        ForeignKey("candidate_events.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    occurrence: Mapped[EvidenceOccurrence] = relationship()
    claims: Mapped[list[Claim]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="Claim.created_at"
    )
    reviews: Mapped[list[EventReview]] = relationship(
        cascade="all, delete-orphan", order_by="EventReview.revision"
    )


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("candidate_events.id", ondelete="CASCADE"))
    occurrence_id: Mapped[str] = mapped_column(
        ForeignKey("evidence_occurrences.id", ondelete="CASCADE")
    )
    text: Mapped[str] = mapped_column(Text)
    epistemic_status: Mapped[str] = mapped_column(String(24))
    evidence_role: Mapped[str] = mapped_column(String(32))
    processor_version: Mapped[str] = mapped_column(String(80))
    source_title: Mapped[str] = mapped_column(String(200))
    source_occurred_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    event: Mapped[CandidateEvent] = relationship(back_populates="claims")
    anchors: Mapped[list[EvidenceAnchor]] = relationship(
        cascade="all, delete-orphan"
    )


class EvidenceAnchor(Base):
    __tablename__ = "evidence_anchors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id", ondelete="CASCADE"))
    blob_sha256: Mapped[str] = mapped_column(ForeignKey("evidence_blobs.sha256"))
    quote: Mapped[str] = mapped_column(Text)
    line_start: Mapped[int] = mapped_column(Integer)
    line_end: Mapped[int] = mapped_column(Integer)
    char_start: Mapped[int] = mapped_column(Integer)
    char_end: Mapped[int] = mapped_column(Integer)

    blob: Mapped[EvidenceBlob] = relationship()


class EventReview(Base):
    __tablename__ = "event_reviews"
    __table_args__ = (UniqueConstraint("event_id", "revision"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("candidate_events.id", ondelete="CASCADE"))
    decision: Mapped[str] = mapped_column(String(24))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    previous_status: Mapped[str] = mapped_column(String(24))
    revision: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
