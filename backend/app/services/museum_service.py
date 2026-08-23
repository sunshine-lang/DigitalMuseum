from __future__ import annotations

import hashlib
import os
from calendar import monthrange
from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.errors import ApiError
from app.domain.models import (
    CandidateEvent,
    Claim,
    CoverageItem,
    EventReview,
    EvidenceAnchor,
    EvidenceBlob,
    EvidenceOccurrence,
    Stage,
    utc_now,
)
from app.domain.schemas import MergeCreate, ReviewCreate, StageCreate, StageUpdate
from app.services import git_evidence_service as git_evidence
from app.services import photo_evidence_service as photo_evidence
from app.services.git_evidence_service import GitEvidence
from app.services.note_parser import PROCESSOR_VERSION, ParsedNote
from app.services.photo_evidence_service import PhotoEvidence

AGGREGATION_RULE_VERSION = "note-aggregation-v1"
STRUCTURAL_STATUSES = {"merged", "split"}

COVERAGE_ORDER = {
    "stored_locally": 0,
    "parsed_locally": 1,
    "candidate_generated": 2,
}


def create_stage(session: Session, payload: StageCreate) -> dict:
    _validate_stage_range(payload.starts_on, payload.ends_on)
    normalized_name = payload.name.strip()
    if not normalized_name:
        raise ApiError(422, "invalid_stage_name", "阶段名称不能为空")
    stage = Stage(
        name=normalized_name,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
    )
    session.add(stage)
    session.commit()
    return serialize_stage(session, stage)


def get_stage(session: Session, stage_id: str) -> dict:
    stage = session.get(Stage, stage_id)
    if stage is None:
        raise ApiError(404, "stage_not_found", "没有找到这个建馆阶段")
    return serialize_stage(session, stage)


def list_stages(session: Session) -> list[dict]:
    stages = session.scalars(select(Stage).order_by(Stage.created_at.desc())).all()
    return [serialize_stage(session, stage) for stage in stages]


def rename_stage(session: Session, stage_id: str, payload: StageUpdate) -> dict:
    stage = require_stage(session, stage_id)
    normalized_name = payload.name.strip()
    if not normalized_name:
        raise ApiError(422, "invalid_stage_name", "阶段名称不能为空")
    stage.name = normalized_name
    session.commit()
    return serialize_stage(session, stage)


def delete_stage(session: Session, stage_id: str) -> None:
    stage = require_stage(session, stage_id)
    # 走 Core DELETE 让数据库 FK（ondelete=CASCADE）清理 occurrences、
    # coverage、events、claims、anchors、reviews；EvidenceBlob 不在级联链上，
    # 原始文件与内容寻址记录全部保留。
    session.execute(delete(Stage).where(Stage.id == stage.id))
    session.commit()
    session.expire_all()


def serialize_stage(session: Session, stage: Stage) -> dict:
    evidence_count = session.scalar(
        select(func.count(EvidenceOccurrence.id)).where(
            EvidenceOccurrence.stage_id == stage.id,
            EvidenceOccurrence.blob_sha256.is_not(None),
        )
    )
    event_count = session.scalar(
        select(func.count(CandidateEvent.id)).where(CandidateEvent.stage_id == stage.id)
    )
    confirmed_count = session.scalar(
        select(func.count(CandidateEvent.id)).where(
            CandidateEvent.stage_id == stage.id,
            CandidateEvent.status == "confirmed",
        )
    )
    return {
        "id": stage.id,
        "name": stage.name,
        "starts_on": stage.starts_on,
        "ends_on": stage.ends_on,
        "created_at": stage.created_at,
        "evidence_count": evidence_count or 0,
        "event_count": event_count or 0,
        "confirmed_count": confirmed_count or 0,
    }


def require_stage(session: Session, stage_id: str) -> Stage:
    stage = session.get(Stage, stage_id)
    if stage is None:
        raise ApiError(404, "stage_not_found", "没有找到这个建馆阶段")
    return stage


def record_failed_import(
    session: Session,
    *,
    stage_id: str,
    original_filename: str,
    step: str,
    error_code: str,
) -> None:
    stage = require_stage(session, stage_id)
    occurrence = EvidenceOccurrence(
        stage_id=stage.id,
        blob_sha256=None,
        original_filename=original_filename,
        status="failed",
    )
    occurrence.coverage_items.append(
        CoverageItem(step=step, status="failed", error_code=error_code)
    )
    session.add(occurrence)
    session.commit()


def start_note_import(
    session: Session,
    *,
    stage_id: str,
    original_filename: str,
    media_type: str,
    content: bytes,
    upload_dir: Path,
) -> EvidenceOccurrence:
    stage = require_stage(session, stage_id)
    blob, created_path = _get_or_create_blob(
        session,
        original_filename=original_filename,
        media_type=media_type,
        content=content,
        upload_dir=upload_dir,
    )

    occurrence = EvidenceOccurrence(
        stage_id=stage.id,
        blob_sha256=blob.sha256,
        original_filename=original_filename,
        status="processing",
    )
    occurrence.coverage_items.append(CoverageItem(step="stored_locally", status="completed"))
    session.add(occurrence)
    try:
        session.commit()
    except Exception:
        session.rollback()
        if created_path is not None:
            created_path.unlink(missing_ok=True)
        raise
    return occurrence


def mark_import_failed(
    session: Session,
    *,
    occurrence_id: str,
    step: str,
    error_code: str,
    processor_version: str = PROCESSOR_VERSION,
) -> None:
    occurrence = session.get(EvidenceOccurrence, occurrence_id)
    if occurrence is None:
        return
    occurrence.status = "failed"
    existing_steps = {item.step for item in occurrence.coverage_items}
    if step == "candidate_generated" and "parsed_locally" not in existing_steps:
        occurrence.coverage_items.append(
            CoverageItem(
                step="parsed_locally",
                status="completed",
                processor_version=processor_version,
            )
        )
    if step not in existing_steps:
        occurrence.coverage_items.append(
            CoverageItem(
                step=step,
                status="failed",
                processor_version=processor_version if step != "stored_locally" else None,
                error_code=error_code,
            )
        )
    session.commit()


def persist_note_candidate(
    session: Session,
    *,
    occurrence_id: str,
    parsed: ParsedNote,
) -> dict:
    occurrence = session.get(EvidenceOccurrence, occurrence_id)
    if occurrence is None:
        raise ApiError(404, "occurrence_not_found", "没有找到这次笔记导入")
    stage = require_stage(session, occurrence.stage_id)
    if parsed.occurred_on and not (stage.starts_on <= parsed.occurred_on <= stage.ends_on):
        raise ApiError(422, "note_outside_stage", "笔记日期不在当前建馆阶段内")
    if occurrence.blob is None:
        raise ApiError(500, "missing_evidence_blob", "原始证据没有完成本地保存")

    target = _find_aggregation_target(session, stage.id, parsed.title, parsed.occurred_on)
    if target is not None:
        event = target
        claim = Claim(
            event=event,
            occurrence_id=occurrence.id,
            text=parsed.claim_text,
            epistemic_status="unknown",
            evidence_role="user_statement",
            processor_version=PROCESSOR_VERSION,
            source_title=parsed.title,
            source_occurred_on=parsed.occurred_on,
        )
        claim.anchors.append(
            EvidenceAnchor(
                blob=occurrence.blob,
                quote=parsed.claim_text,
                line_start=parsed.line_start,
                line_end=parsed.line_end,
                char_start=parsed.char_start,
                char_end=parsed.char_end,
            )
        )
        event.origin = "aggregated"
        event.aggregation_rule = AGGREGATION_RULE_VERSION
        event.updated_at = utc_now()
        session.add(claim)
    else:
        event = CandidateEvent(
            stage_id=stage.id,
            occurrence=occurrence,
            title=parsed.title,
            occurred_on=parsed.occurred_on,
            time_precision="exact" if parsed.occurred_on else "unknown",
            status="candidate",
            revision=0,
            origin="note",
        )
        claim = Claim(
            event=event,
            occurrence_id=occurrence.id,
            text=parsed.claim_text,
            epistemic_status="unknown",
            evidence_role="user_statement",
            processor_version=PROCESSOR_VERSION,
            source_title=parsed.title,
            source_occurred_on=parsed.occurred_on,
        )
        claim.anchors.append(
            EvidenceAnchor(
                blob=occurrence.blob,
                quote=parsed.claim_text,
                line_start=parsed.line_start,
                line_end=parsed.line_end,
                char_start=parsed.char_start,
                char_end=parsed.char_end,
            )
        )
    occurrence.status = "completed"
    occurrence.coverage_items.extend(
        [
            CoverageItem(
                step="parsed_locally",
                status="completed",
                processor_version=PROCESSOR_VERSION,
            ),
            CoverageItem(
                step="candidate_generated",
                status="completed",
                processor_version=PROCESSOR_VERSION,
            ),
        ]
    )
    session.add(event)
    session.commit()
    reloaded_event = _load_event(session, event.id)
    coverage = list_coverage(session, stage.id)
    occurrence_coverage = [item for item in coverage if item["occurrence_id"] == occurrence.id]
    return {
        "occurrence": serialize_occurrence(occurrence),
        "event": serialize_event(reloaded_event),
        "coverage": occurrence_coverage,
    }


def import_git_evidence(
    session: Session,
    *,
    stage_id: str,
    repo_path: str,
    upload_dir: Path,
    allowed_repo_roots: str,
) -> dict:
    stage = require_stage(session, stage_id)
    evidence = git_evidence.import_git_repository(
        repo_path,
        starts_on=stage.starts_on,
        ends_on=stage.ends_on,
        allowed_roots=allowed_repo_roots,
    )
    content = evidence.document.encode("utf-8")
    occurrence = start_note_import(
        session,
        stage_id=stage.id,
        original_filename=f"{evidence.repo_name}-git-evidence.txt",
        media_type="text/plain",
        content=content,
        upload_dir=upload_dir,
    )
    occurrence_id = occurrence.id
    try:
        events = _persist_git_candidates(session, occurrence_id=occurrence_id, evidence=evidence)
    except ApiError as exc:
        mark_import_failed(
            session,
            occurrence_id=occurrence_id,
            step="candidate_generated",
            error_code=exc.code,
            processor_version=git_evidence.GIT_PROCESSOR_VERSION,
        )
        raise
    coverage = list_coverage(session, stage.id)
    occurrence_coverage = [item for item in coverage if item["occurrence_id"] == occurrence_id]
    return {
        "occurrence": serialize_occurrence(occurrence),
        "events": events,
        "coverage": occurrence_coverage,
    }


def _persist_git_candidates(
    session: Session,
    *,
    occurrence_id: str,
    evidence: GitEvidence,
) -> list[dict]:
    occurrence = session.get(EvidenceOccurrence, occurrence_id)
    if occurrence is None:
        raise ApiError(404, "occurrence_not_found", "没有找到这次仓库导入")
    stage = require_stage(session, occurrence.stage_id)
    if occurrence.blob is None:
        raise ApiError(500, "missing_evidence_blob", "原始证据没有完成本地保存")

    created_events: list[CandidateEvent] = []
    for item in evidence.items:
        target = _find_aggregation_target(
            session,
            stage.id,
            item.title,
            item.occurred_on,
            origins=("note", "aggregated", "git"),
        )
        if target is not None:
            event = target
            event.origin = "aggregated"
            event.aggregation_rule = AGGREGATION_RULE_VERSION
            event.updated_at = utc_now()
        else:
            event = CandidateEvent(
                stage_id=stage.id,
                occurrence=occurrence,
                title=item.title,
                occurred_on=item.occurred_on,
                time_precision="exact",
                status="candidate",
                revision=0,
                origin="git",
            )
            created_events.append(event)
        claim = Claim(
            event=event,
            occurrence_id=occurrence.id,
            text=item.claim_text,
            epistemic_status="unknown",
            evidence_role="artifact",
            processor_version=git_evidence.GIT_PROCESSOR_VERSION,
            source_title=item.title,
            source_occurred_on=item.occurred_on,
        )
        claim.anchors.extend(
            EvidenceAnchor(
                blob=occurrence.blob,
                quote=anchor.quote,
                line_start=anchor.line_start,
                line_end=anchor.line_end,
                char_start=anchor.char_start,
                char_end=anchor.char_end,
            )
            for anchor in item.anchors
        )
        session.add(claim)

    occurrence.status = "completed"
    occurrence.coverage_items.extend(
        [
            CoverageItem(
                step="parsed_locally",
                status="completed",
                processor_version=git_evidence.GIT_PROCESSOR_VERSION,
            ),
            CoverageItem(
                step="candidate_generated",
                status="completed",
                processor_version=git_evidence.GIT_PROCESSOR_VERSION,
            ),
        ]
    )
    session.commit()
    all_events = [serialize_event(_load_event(session, event.id)) for event in created_events]
    return all_events


def import_photo_evidence(
    session: Session,
    *,
    stage_id: str,
    filename: str,
    media_type: str,
    content: bytes,
    upload_dir: Path,
) -> dict:
    stage = require_stage(session, stage_id)
    occurrence = start_note_import(
        session,
        stage_id=stage.id,
        original_filename=filename,
        media_type=media_type,
        content=content,
        upload_dir=upload_dir,
    )
    occurrence_id = occurrence.id
    try:
        evidence = photo_evidence.analyze_photo(
            content,
            filename=filename,
            starts_on=stage.starts_on,
            ends_on=stage.ends_on,
        )
        descriptor_blob = _store_evidence_blob(
            session,
            original_filename=f"{Path(filename).stem}-photo-evidence.txt",
            media_type="text/plain",
            content=evidence.descriptor.encode("utf-8"),
            upload_dir=upload_dir,
        )
        result = _persist_photo_candidate(
            session,
            occurrence_id=occurrence_id,
            evidence=evidence,
            descriptor_blob=descriptor_blob,
        )
    except ApiError as exc:
        mark_import_failed(
            session,
            occurrence_id=occurrence_id,
            step="parsed_locally",
            error_code=exc.code,
            processor_version=photo_evidence.PHOTO_PROCESSOR_VERSION,
        )
        raise
    return result


def _persist_photo_candidate(
    session: Session,
    *,
    occurrence_id: str,
    evidence: PhotoEvidence,
    descriptor_blob: EvidenceBlob,
) -> dict:
    occurrence = session.get(EvidenceOccurrence, occurrence_id)
    if occurrence is None:
        raise ApiError(404, "occurrence_not_found", "没有找到这次照片导入")
    stage = require_stage(session, occurrence.stage_id)

    target = _find_aggregation_target(
        session,
        stage.id,
        evidence.event_title,
        evidence.occurred_on,
        origins=("note", "aggregated", "git", "photo"),
    )
    if target is not None:
        event = target
        event.origin = "aggregated"
        event.aggregation_rule = AGGREGATION_RULE_VERSION
        event.updated_at = utc_now()
    else:
        event = CandidateEvent(
            stage_id=stage.id,
            occurrence=occurrence,
            title=evidence.event_title,
            occurred_on=evidence.occurred_on,
            time_precision="exact",
            status="candidate",
            revision=0,
            origin="photo",
        )
    claim = Claim(
        event=event,
        occurrence_id=occurrence.id,
        text=evidence.claim_text,
        epistemic_status="unknown",
        evidence_role="artifact",
        processor_version=photo_evidence.PHOTO_PROCESSOR_VERSION,
        source_title=f"照片 {evidence.filename}"[:200],
        source_occurred_on=evidence.occurred_on,
    )
    claim.anchors.extend(
        EvidenceAnchor(
            blob=descriptor_blob,
            quote=anchor.quote,
            line_start=anchor.line_start,
            line_end=anchor.line_end,
            char_start=anchor.char_start,
            char_end=anchor.char_end,
        )
        for anchor in evidence.anchors
    )
    session.add(claim)

    occurrence.status = "completed"
    occurrence.coverage_items.extend(
        [
            CoverageItem(
                step="parsed_locally",
                status="completed",
                processor_version=photo_evidence.PHOTO_PROCESSOR_VERSION,
            ),
            CoverageItem(
                step="candidate_generated",
                status="completed",
                processor_version=photo_evidence.PHOTO_PROCESSOR_VERSION,
            ),
        ]
    )
    session.add(event)
    session.commit()
    reloaded_event = _load_event(session, event.id)
    coverage = list_coverage(session, stage.id)
    occurrence_coverage = [item for item in coverage if item["occurrence_id"] == occurrence.id]
    return {
        "occurrence": serialize_occurrence(occurrence),
        "event": serialize_event(reloaded_event),
        "coverage": occurrence_coverage,
    }


def merge_events(session: Session, stage_id: str, payload: MergeCreate) -> dict:
    require_stage(session, stage_id)
    unique_ids = list(dict.fromkeys(payload.event_ids))
    if len(unique_ids) < 2:
        raise ApiError(422, "merge_needs_multiple_events", "合并至少需要选择两个不同事件")

    events: list[CandidateEvent] = []
    for event_id in unique_ids:
        event = session.get(CandidateEvent, event_id)
        if event is None or event.stage_id != stage_id:
            raise ApiError(404, "event_not_found", "没有找到这个候选事件")
        events.append(event)
    for event in events:
        if event.status in STRUCTURAL_STATUSES:
            raise ApiError(409, "event_not_mergeable", "已合并或已拆分的事件不能再次合并")

    requested_title = payload.title.strip() if payload.title else None
    if payload.title is not None and not requested_title:
        raise ApiError(422, "invalid_merge_title", "合并事件的新标题不能为空白")

    ordered = sorted(events, key=lambda event: event.created_at)
    known_dates = [event.occurred_on for event in ordered if event.occurred_on is not None]
    dates_agree = len(known_dates) == len(ordered) and len(set(known_dates)) == 1

    merged = CandidateEvent(
        stage_id=stage_id,
        occurrence_id=None,
        title=(requested_title or ordered[0].title)[:200],
        occurred_on=known_dates[0] if dates_agree else None,
        time_precision="exact" if dates_agree else "unknown",
        status="candidate",
        revision=0,
        origin="merged",
    )
    session.add(merged)
    session.flush()

    source_ids = [event.id for event in ordered]
    session.execute(
        update(Claim)
        .where(Claim.event_id.in_(source_ids))
        .values(event_id=merged.id, epistemic_status="unknown")
    )
    now = utc_now()
    for event in ordered:
        previous_status = event.status
        event.status = "merged"
        event.revision += 1
        event.parent_event_id = merged.id
        event.occurrence_id = None
        event.updated_at = now
        session.add(
            EventReview(
                event_id=event.id,
                decision="merged",
                note=None,
                previous_status=previous_status,
                revision=event.revision,
            )
        )
    session.commit()
    session.expire_all()
    return {
        "event": serialize_event(_load_event(session, merged.id)),
        "sources": [serialize_event(_load_event(session, event_id)) for event_id in source_ids],
    }


def split_event(session: Session, event_id: str) -> dict:
    event = _load_event(session, event_id)
    if event.status in STRUCTURAL_STATUSES:
        raise ApiError(409, "event_not_splittable", "已合并或已拆分的事件不能再次拆分")

    claim_groups: dict[str, list[Claim]] = {}
    for claim in event.claims:
        claim_groups.setdefault(claim.occurrence_id, []).append(claim)
    if len(claim_groups) < 2:
        raise ApiError(409, "nothing_to_split", "这个事件只有一个来源 Note，无法拆分")

    children: list[CandidateEvent] = []
    for occurrence_id, claims in claim_groups.items():
        first_claim = claims[0]
        children.append(
            CandidateEvent(
                stage_id=event.stage_id,
                occurrence_id=occurrence_id,
                title=first_claim.source_title[:200],
                occurred_on=first_claim.source_occurred_on,
                time_precision="exact" if first_claim.source_occurred_on else "unknown",
                status="candidate",
                revision=0,
                origin="split",
                parent_event_id=event.id,
            )
        )
    session.add_all(children)
    session.flush()

    for child, (_occurrence_id, claims) in zip(children, claim_groups.items(), strict=True):
        session.execute(
            update(Claim)
            .where(Claim.id.in_([claim.id for claim in claims]))
            .values(event_id=child.id, epistemic_status="unknown")
        )

    previous_status = event.status
    event.status = "split"
    event.revision += 1
    event.occurrence_id = None
    event.updated_at = utc_now()
    session.add(
        EventReview(
            event_id=event.id,
            decision="split",
            note=None,
            previous_status=previous_status,
            revision=event.revision,
        )
    )
    session.commit()
    session.expire_all()
    return {
        "event": serialize_event(_load_event(session, event_id)),
        "events": [serialize_event(_load_event(session, child.id)) for child in children],
    }


def _find_aggregation_target(
    session: Session,
    stage_id: str,
    title: str,
    occurred_on: date | None,
    origins: tuple[str, ...] = ("note", "aggregated"),
) -> CandidateEvent | None:
    if occurred_on is None:
        return None
    normalized = _normalized_title(title)
    if not normalized:
        return None
    events = session.scalars(
        select(CandidateEvent).where(
            CandidateEvent.stage_id == stage_id,
            CandidateEvent.status == "candidate",
            CandidateEvent.revision == 0,
            CandidateEvent.occurred_on == occurred_on,
            CandidateEvent.origin.in_(origins),
        )
    ).all()
    return next((event for event in events if _normalized_title(event.title) == normalized), None)


def _normalized_title(title: str) -> str:
    return " ".join(title.casefold().split())


def list_events(session: Session, stage_id: str) -> list[dict]:
    if session.get(Stage, stage_id) is None:
        raise ApiError(404, "stage_not_found", "没有找到这个建馆阶段")
    events = session.scalars(
        select(CandidateEvent)
        .where(CandidateEvent.stage_id == stage_id)
        .options(
            selectinload(CandidateEvent.claims).selectinload(Claim.anchors),
            selectinload(CandidateEvent.reviews),
        )
        .order_by(CandidateEvent.created_at)
    ).all()
    return [serialize_event(event) for event in events]


def get_event(session: Session, event_id: str) -> dict:
    return serialize_event(_load_event(session, event_id))


def review_event(session: Session, event_id: str, payload: ReviewCreate) -> dict:
    event = _load_event(session, event_id)
    if event.status in STRUCTURAL_STATUSES:
        raise ApiError(409, "event_not_reviewable", "已合并或已拆分的事件不能再审阅")
    if event.revision != payload.expected_revision:
        raise ApiError(409, "stale_event_revision", "事件已被其他审阅更新，请刷新后再试")

    previous_status = event.status
    next_revision = event.revision + 1
    updated = session.execute(
        update(CandidateEvent)
        .where(
            CandidateEvent.id == event_id,
            CandidateEvent.revision == payload.expected_revision,
        )
        .values(
            status=payload.decision,
            revision=next_revision,
            updated_at=utc_now(),
        )
    )
    if updated.rowcount != 1:
        session.rollback()
        raise ApiError(409, "stale_event_revision", "事件已被其他审阅更新，请刷新后再试")

    claim_status = {
        "confirmed": "user_confirmed",
        "disputed": "disputed",
        "unknown": "unknown",
        "rejected": "unknown",
    }[payload.decision]
    session.execute(
        update(Claim).where(Claim.event_id == event_id).values(epistemic_status=claim_status)
    )
    session.add(
        EventReview(
            event_id=event_id,
            decision=payload.decision,
            note=payload.note.strip() if payload.note and payload.note.strip() else None,
            previous_status=previous_status,
            revision=next_revision,
        )
    )
    session.commit()
    return serialize_event(_load_event(session, event_id))


def list_coverage(session: Session, stage_id: str) -> list[dict]:
    if session.get(Stage, stage_id) is None:
        raise ApiError(404, "stage_not_found", "没有找到这个建馆阶段")
    rows = session.execute(
        select(CoverageItem, EvidenceOccurrence.original_filename)
        .join(EvidenceOccurrence, CoverageItem.occurrence_id == EvidenceOccurrence.id)
        .where(EvidenceOccurrence.stage_id == stage_id)
        .order_by(EvidenceOccurrence.imported_at, CoverageItem.created_at)
    ).all()
    serialized = [
        {
            "id": item.id,
            "occurrence_id": item.occurrence_id,
            "original_filename": original_filename,
            "step": item.step,
            "status": item.status,
            "processor_version": item.processor_version,
            "error_code": item.error_code,
            "created_at": item.created_at,
        }
        for item, original_filename in rows
    ]
    occurrence_rank: dict[str, int] = {}
    for item in serialized:
        occurrence_rank.setdefault(item["occurrence_id"], len(occurrence_rank))
    return sorted(
        serialized,
        key=lambda item: (
            occurrence_rank[item["occurrence_id"]],
            COVERAGE_ORDER[item["step"]],
        ),
    )


def serialize_occurrence(occurrence: EvidenceOccurrence) -> dict:
    return {
        "id": occurrence.id,
        "stage_id": occurrence.stage_id,
        "blob_sha256": occurrence.blob_sha256,
        "original_filename": occurrence.original_filename,
        "status": occurrence.status,
        "imported_at": occurrence.imported_at,
    }


def serialize_event(event: CandidateEvent) -> dict:
    latest_review = event.reviews[-1] if event.reviews else None
    return {
        "id": event.id,
        "stage_id": event.stage_id,
        "title": event.title,
        "occurred_on": event.occurred_on,
        "time_precision": event.time_precision,
        "status": event.status,
        "revision": event.revision,
        "is_formal": event.status == "confirmed",
        "origin": event.origin,
        "source_count": len({claim.occurrence_id for claim in event.claims}),
        "claims": [
            {
                "id": claim.id,
                "text": claim.text,
                "epistemic_status": claim.epistemic_status,
                "evidence_role": claim.evidence_role,
                "processor_version": claim.processor_version,
                "anchors": [
                    {
                        "blob_sha256": anchor.blob_sha256,
                        "quote": anchor.quote,
                        "line_start": anchor.line_start,
                        "line_end": anchor.line_end,
                        "char_start": anchor.char_start,
                        "char_end": anchor.char_end,
                    }
                    for anchor in claim.anchors
                ],
            }
            for claim in event.claims
        ],
        "latest_review": (
            {
                "id": latest_review.id,
                "decision": latest_review.decision,
                "note": latest_review.note,
                "previous_status": latest_review.previous_status,
                "revision": latest_review.revision,
                "created_at": latest_review.created_at,
            }
            if latest_review
            else None
        ),
    }


def _load_event(session: Session, event_id: str) -> CandidateEvent:
    event = session.scalar(
        select(CandidateEvent)
        .where(CandidateEvent.id == event_id)
        .options(
            selectinload(CandidateEvent.claims).selectinload(Claim.anchors),
            selectinload(CandidateEvent.reviews),
        )
    )
    if event is None:
        raise ApiError(404, "event_not_found", "没有找到这个候选事件")
    return event


def _get_or_create_blob(
    session: Session,
    *,
    original_filename: str,
    media_type: str,
    content: bytes,
    upload_dir: Path,
) -> tuple[EvidenceBlob, Path | None]:
    content_hash = hashlib.sha256(content).hexdigest()
    suffix = Path(original_filename).suffix.lower()
    blob = session.get(EvidenceBlob, content_hash)
    created_path: Path | None = None
    if blob is None:
        relative_path = Path(content_hash[:2]) / f"{content_hash}{suffix}"
        destination = upload_dir / relative_path
        if _write_content_once(destination, content):
            created_path = destination
        blob = EvidenceBlob(
            sha256=content_hash,
            relative_path=relative_path.as_posix(),
            byte_size=len(content),
            media_type=media_type,
        )
        session.add(blob)
    else:
        _write_content_once(upload_dir / blob.relative_path, content)
    return blob, created_path


def _store_evidence_blob(
    session: Session,
    *,
    original_filename: str,
    media_type: str,
    content: bytes,
    upload_dir: Path,
) -> EvidenceBlob:
    blob, created_path = _get_or_create_blob(
        session,
        original_filename=original_filename,
        media_type=media_type,
        content=content,
        upload_dir=upload_dir,
    )
    try:
        session.commit()
    except Exception:
        session.rollback()
        if created_path is not None:
            created_path.unlink(missing_ok=True)
        raise
    return blob


def _write_content_once(destination: Path, content: bytes) -> bool:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if destination.read_bytes() != content:
            raise ApiError(500, "evidence_hash_collision", "原始证据存储发生哈希冲突")
        return False
    temporary = destination.with_name(f".{destination.name}.{uuid4().hex}.tmp")
    try:
        temporary.write_bytes(content)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return True


def _validate_stage_range(starts_on: date, ends_on: date) -> None:
    earliest_end = _add_months(starts_on, 3) - timedelta(days=1)
    latest_end = _add_months(starts_on, 12) - timedelta(days=1)
    if ends_on < earliest_end or ends_on > latest_end:
        raise ApiError(422, "invalid_stage_range", "建馆阶段必须在 3 到 12 个月之间")


def _add_months(value: date, months: int) -> date:
    zero_based_month = value.month - 1 + months
    year = value.year + zero_based_month // 12
    month = zero_based_month % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)
