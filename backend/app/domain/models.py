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

    occurrences: Mapped[list[EvidenceOccurrence]] = relationship(back_populates="stage")
    events: Mapped[list[CandidateEvent]] = relationship(back_populates="stage")


class EvidenceBlob(Base):
    __tablename__ = "evidence_blobs"

    sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    relative_path: Mapped[str] = mapped_column(String(255), unique=True)
    byte_size: Mapped[int] = mapped_column(Integer)
    media_type: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    occurrences: Mapped[list[EvidenceOccurrence]] = relationship(back_populates="blob")
    anchors: Mapped[list[EvidenceAnchor]] = relationship(back_populates="blob")


class EvidenceOccurrence(Base):
    __tablename__ = "evidence_occurrences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    stage_id: Mapped[str] = mapped_column(ForeignKey("stages.id", ondelete="CASCADE"))
    blob_sha256: Mapped[str | None] = mapped_column(
        ForeignKey("evidence_blobs.sha256"), nullable=True
    )
    original_filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="completed")
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    stage: Mapped[Stage] = relationship(back_populates="occurrences")
    blob: Mapped[EvidenceBlob | None] = relationship(back_populates="occurrences")
    coverage_items: Mapped[list[CoverageItem]] = relationship(
        back_populates="occurrence", cascade="all, delete-orphan"
    )
    event: Mapped[CandidateEvent | None] = relationship(back_populates="occurrence")


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
    stage_id: Mapped[str] = mapped_column(ForeignKey("stages.id", ondelete="CASCADE"))
    occurrence_id: Mapped[str] = mapped_column(
        ForeignKey("evidence_occurrences.id", ondelete="CASCADE"), unique=True
    )
    title: Mapped[str] = mapped_column(String(200))
    occurred_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    time_precision: Mapped[str] = mapped_column(String(24), default="unknown")
    status: Mapped[str] = mapped_column(String(24), default="candidate")
    revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    stage: Mapped[Stage] = relationship(back_populates="events")
    occurrence: Mapped[EvidenceOccurrence] = relationship(back_populates="event")
    claims: Mapped[list[Claim]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="Claim.created_at"
    )
    reviews: Mapped[list[EventReview]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="EventReview.revision"
    )


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("candidate_events.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    epistemic_status: Mapped[str] = mapped_column(String(24), default="unknown")
    evidence_role: Mapped[str] = mapped_column(String(32), default="user_statement")
    processor_version: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    event: Mapped[CandidateEvent] = relationship(back_populates="claims")
    anchors: Mapped[list[EvidenceAnchor]] = relationship(
        back_populates="claim", cascade="all, delete-orphan"
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

    claim: Mapped[Claim] = relationship(back_populates="anchors")
    blob: Mapped[EvidenceBlob] = relationship(back_populates="anchors")


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

    event: Mapped[CandidateEvent] = relationship(back_populates="reviews")
