from __future__ import annotations

import hashlib
import os
from calendar import monthrange
from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy import delete, exists, func, select, update
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
from app.services import claude_session_evidence_service as claude_evidence
from app.services import codex_session_evidence_service as codex_evidence
from app.services import git_evidence_service as git_evidence
from app.services.agent_session_evidence import AgentActivityItem
from app.services.git_evidence_service import GitActivityItem
from app.services.note_parser import PROCESSOR_VERSION, ParsedNote

AGGREGATION_RULE_VERSION = "note-aggregation-v1"
STRUCTURAL_STATUSES = {"merged", "split"}
# 聚合可并入的状态：candidate 是待核对草稿；verified 是确定性证据的系统核实态
# （Git 提交）。被用户审阅过的事件 revision > 0，天然不会匹配。
AGGREGATABLE_STATUSES = ("candidate", "verified")

# 机器证据同题同日聚合时的候选 origin 白名单。各家族只并入自身与笔记；
# Claude/Codex 会话事件不与 Git 聚合。
NOTE_AGGREGATION_ORIGINS = ("note", "aggregated")
GIT_AGGREGATION_ORIGINS = ("note", "aggregated", "git")
CLAUDE_AGGREGATION_ORIGINS = ("note", "aggregated", "claude")
CODEX_AGGREGATION_ORIGINS = ("note", "aggregated", "codex")

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
    if not normalized_name or len(normalized_name) > 120:
        raise ApiError(422, "invalid_stage_name", "阶段名称不能为空且不超过 120 字")
    stage.name = normalized_name
    session.commit()
    return serialize_stage(session, stage)


def delete_stage(session: Session, stage_id: str, *, upload_dir: Path) -> None:
    stage = require_stage(session, stage_id)
    # 走 Core DELETE 让数据库 FK（ondelete=CASCADE）清理 occurrences、
    # coverage、events、claims、anchors、reviews；EvidenceBlob 不在级联链上。
    session.execute(delete(Stage).where(Stage.id == stage.id))
    session.commit()
    session.expire_all()
    # Blob 引用回收：occurrences 与 evidence_anchors 都不再引用的 blob 删行并
    # 清理文件；被其他阶段共享（仍有引用）的内容寻址 blob 必须保留。
    _reclaim_orphan_blobs(session, upload_dir)


def _reclaim_orphan_blobs(session: Session, upload_dir: Path) -> None:
    orphans = session.scalars(
        select(EvidenceBlob).where(
            ~exists().where(EvidenceOccurrence.blob_sha256 == EvidenceBlob.sha256),
            ~exists().where(EvidenceAnchor.blob_sha256 == EvidenceBlob.sha256),
        )
    ).all()
    if not orphans:
        return
    orphan_paths = [upload_dir / Path(blob.relative_path) for blob in orphans]
    for blob in orphans:
        session.delete(blob)
    session.commit()
    # 先删行再清文件：文件不存在时容错跳过（missing_ok）。
    for path in orphan_paths:
        path.unlink(missing_ok=True)


def resolve_blob_media(session: Session, sha256: str, upload_dir: Path) -> tuple[Path, str]:
    """按内容哈希只读解析本地 blob；文件路径只来自 DB 的 relative_path。"""
    blob = session.get(EvidenceBlob, sha256)
    if blob is None:
        raise ApiError(404, "blob_not_found", "没有找到这份原始文件")
    path = upload_dir / Path(blob.relative_path)
    if not path.is_file():
        raise ApiError(404, "blob_not_found", "原始文件已不在本地存储中")
    return path, blob.media_type


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
    verified_count = session.scalar(
        select(func.count(CandidateEvent.id)).where(
            CandidateEvent.stage_id == stage.id,
            CandidateEvent.status == "verified",
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
        "verified_count": verified_count or 0,
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
    return {
        "occurrence": serialize_occurrence(occurrence),
        "event": serialize_event(reloaded_event, session),
        "coverage": _occurrence_coverage(session, stage.id, occurrence.id),
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
    return _import_activity_evidence(
        session,
        stage=stage,
        upload_dir=upload_dir,
        document=evidence.document,
        items=evidence.items,
        label=evidence.repo_name,
        filename_suffix="-git-evidence.txt",
        origin="git",
        origins=GIT_AGGREGATION_ORIGINS,
        processor_version=git_evidence.GIT_PROCESSOR_VERSION,
    )


def import_claude_sessions(
    session: Session,
    *,
    stage_id: str,
    path: str,
    upload_dir: Path,
    allowed_repo_roots: str,
    claude_projects_root: str,
) -> dict:
    stage = require_stage(session, stage_id)
    evidence = claude_evidence.import_claude_sessions(
        path,
        starts_on=stage.starts_on,
        ends_on=stage.ends_on,
        allowed_roots=allowed_repo_roots,
        projects_root=claude_projects_root,
    )
    return _import_activity_evidence(
        session,
        stage=stage,
        upload_dir=upload_dir,
        document=evidence.document,
        items=evidence.items,
        label=evidence.project_label,
        filename_suffix="-claude-sessions.txt",
        origin="claude",
        origins=CLAUDE_AGGREGATION_ORIGINS,
        processor_version=claude_evidence.CLAUDE_PROCESSOR_VERSION,
    )


def import_codex_sessions(
    session: Session,
    *,
    stage_id: str,
    path: str,
    upload_dir: Path,
    allowed_repo_roots: str,
    codex_sessions_root: str,
) -> dict:
    stage = require_stage(session, stage_id)
    evidence = codex_evidence.import_codex_sessions(
        path,
        starts_on=stage.starts_on,
        ends_on=stage.ends_on,
        allowed_roots=allowed_repo_roots,
        sessions_root=codex_sessions_root,
    )
    return _import_activity_evidence(
        session,
        stage=stage,
        upload_dir=upload_dir,
        document=evidence.document,
        items=evidence.items,
        label=evidence.project_label,
        filename_suffix="-codex-sessions.txt",
        origin="codex",
        origins=CODEX_AGGREGATION_ORIGINS,
        processor_version=codex_evidence.CODEX_PROCESSOR_VERSION,
    )


def _import_activity_evidence(
    session: Session,
    *,
    stage: Stage,
    upload_dir: Path,
    document: str,
    items: tuple[GitActivityItem | AgentActivityItem, ...],
    label: str,
    filename_suffix: str,
    origin: str,
    origins: tuple[str, ...],
    processor_version: str,
) -> dict:
    """Git / Claude / Codex 三条导入链路的公共尾部：

    证据文档落 blob → 起始 occurrence → 持久化机器候选（失败则标记失败
    coverage 后原样抛出）→ 只保留本次 occurrence 的 coverage 并组装返回。
    """
    occurrence = start_note_import(
        session,
        stage_id=stage.id,
        original_filename=f"{label}{filename_suffix}",
        media_type="text/plain",
        content=document.encode("utf-8"),
        upload_dir=upload_dir,
    )
    occurrence_id = occurrence.id
    try:
        events = _persist_machine_candidates(
            session,
            occurrence_id=occurrence_id,
            items=items,
            origin=origin,
            origins=origins,
            processor_version=processor_version,
        )
    except ApiError as exc:
        mark_import_failed(
            session,
            occurrence_id=occurrence_id,
            step="candidate_generated",
            error_code=exc.code,
            processor_version=processor_version,
        )
        raise
    return {
        "occurrence": serialize_occurrence(occurrence),
        "events": events,
        "coverage": _occurrence_coverage(session, stage.id, occurrence_id),
    }


def _persist_machine_candidates(
    session: Session,
    *,
    occurrence_id: str,
    items: tuple[GitActivityItem | AgentActivityItem, ...],
    origin: str,
    origins: tuple[str, ...],
    processor_version: str,
) -> list[dict]:
    occurrence = session.get(EvidenceOccurrence, occurrence_id)
    if occurrence is None:
        raise ApiError(404, "occurrence_not_found", "没有找到这次导入")
    stage = require_stage(session, occurrence.stage_id)
    if occurrence.blob is None:
        raise ApiError(500, "missing_evidence_blob", "原始证据没有完成本地保存")

    created_events: list[CandidateEvent] = []
    for item in items:
        event, created = _resolve_machine_event(
            session,
            stage,
            occurrence,
            title=item.title,
            occurred_on=item.occurred_on,
            initial_status=item.initial_status,
            origin=origin,
            origins=origins,
        )
        if created:
            created_events.append(event)
        claim = Claim(
            event=event,
            occurrence_id=occurrence.id,
            text=item.claim_text,
            epistemic_status="unknown",
            evidence_role="artifact",
            processor_version=processor_version,
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
                processor_version=processor_version,
            ),
            CoverageItem(
                step="candidate_generated",
                status="completed",
                processor_version=processor_version,
            ),
        ]
    )
    session.commit()
    all_events = [
        serialize_event(_load_event(session, event.id), session)
        for event in created_events
    ]
    return all_events


def set_exhibit_caption(session: Session, event_id: str, caption: str | None) -> dict:
    """展签是展览态的人工策展文案：只改 display 层，不触碰状态机、
    审计与聚合语义（结构性事件也可改——拆分产物同样要展出）。"""
    event = _load_event(session, event_id)
    normalized = caption.strip() if caption else ""
    if normalized and len(normalized) > 200:
        raise ApiError(422, "invalid_caption", "展签不能超过 200 字")
    event.exhibit_caption = normalized or None
    event.updated_at = utc_now()
    session.commit()
    return serialize_event(event, session)


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
        "event": serialize_event(_load_event(session, merged.id), session),
        "sources": [
            serialize_event(_load_event(session, event_id), session)
            for event_id in source_ids
        ],
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
        "event": serialize_event(_load_event(session, event_id), session),
        "events": [
            serialize_event(_load_event(session, child.id), session)
            for child in children
        ],
    }


def _resolve_machine_event(
    session: Session,
    stage: Stage,
    occurrence: EvidenceOccurrence,
    *,
    title: str,
    occurred_on: date,
    initial_status: str,
    origin: str,
    origins: tuple[str, ...],
) -> tuple[CandidateEvent, bool]:
    """确定性证据（Git/Agent 会话）的事件落位规则。

    1. 同题同日的未审阅事件（candidate/verified，revision=0）→ 并入聚合；
    2. 同题同日、用户已审阅且仍可见（confirmed/disputed/unknown，revision>0）
       → 并入为新 claim，但**保持用户判定**——机器读数不得覆盖或复制用户
       刚刚否认过的事实；
    3. 同题同日但被用户 rejected（已从可见列表排除）→ 新建事件降级为
       candidate（人工意见与机器读数冲突时，交还人工）；
    4. 都没有 → 按 initial_status 新建（提交日/会话日 = verified，推断性
       标题 = candidate）。
    """
    target = _find_aggregation_target(
        session, stage.id, title, occurred_on, origins=origins
    )
    if target is not None:
        target.origin = "aggregated"
        target.aggregation_rule = AGGREGATION_RULE_VERSION
        target.updated_at = utc_now()
        return target, False

    absorb = _find_reviewed_absorb_target(session, stage.id, title, occurred_on, origins)
    if absorb is not None:
        absorb.origin = "aggregated"
        absorb.aggregation_rule = AGGREGATION_RULE_VERSION
        absorb.updated_at = utc_now()
        return absorb, False

    status = initial_status
    if _has_rejected_target(session, stage.id, title, occurred_on, origins):
        status = "candidate"
    event = CandidateEvent(
        stage_id=stage.id,
        occurrence=occurrence,
        title=title,
        occurred_on=occurred_on,
        time_precision="exact",
        status=status,
        revision=0,
        origin=origin,
    )
    session.add(event)
    return event, True


def _find_reviewed_absorb_target(
    session: Session,
    stage_id: str,
    title: str,
    occurred_on: date,
    origins: tuple[str, ...],
) -> CandidateEvent | None:
    events = session.scalars(
        select(CandidateEvent).where(
            CandidateEvent.stage_id == stage_id,
            CandidateEvent.status.in_(("confirmed", "disputed", "unknown")),
            CandidateEvent.revision > 0,
            CandidateEvent.occurred_on == occurred_on,
            CandidateEvent.origin.in_(origins + ("merged", "split")),
        )
    ).all()
    return next(
        (event for event in events if _normalized_title(event.title) == _normalized_title(title)),
        None,
    )


def _has_rejected_target(
    session: Session,
    stage_id: str,
    title: str,
    occurred_on: date,
    origins: tuple[str, ...],
) -> bool:
    events = session.scalars(
        select(CandidateEvent).where(
            CandidateEvent.stage_id == stage_id,
            CandidateEvent.status == "rejected",
            CandidateEvent.occurred_on == occurred_on,
        )
    ).all()
    return any(_normalized_title(event.title) == _normalized_title(title) for event in events)


def _find_aggregation_target(
    session: Session,
    stage_id: str,
    title: str,
    occurred_on: date | None,
    origins: tuple[str, ...] = NOTE_AGGREGATION_ORIGINS,
) -> CandidateEvent | None:
    if occurred_on is None:
        return None
    normalized = _normalized_title(title)
    if not normalized:
        return None
    events = session.scalars(
        select(CandidateEvent).where(
            CandidateEvent.stage_id == stage_id,
            CandidateEvent.status.in_(AGGREGATABLE_STATUSES),
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
    return [serialize_event(event, session) for event in events]


def get_event(session: Session, event_id: str) -> dict:
    return serialize_event(_load_event(session, event_id), session)


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
    return serialize_event(_load_event(session, event_id), session)


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


def _occurrence_coverage(session: Session, stage_id: str, occurrence_id: str) -> list[dict]:
    """导入返回只携带本次 occurrence 的 coverage（全阶段列表按 occurrence 过滤）。"""
    coverage = list_coverage(session, stage_id)
    return [item for item in coverage if item["occurrence_id"] == occurrence_id]


def serialize_occurrence(occurrence: EvidenceOccurrence) -> dict:
    return {
        "id": occurrence.id,
        "stage_id": occurrence.stage_id,
        "blob_sha256": occurrence.blob_sha256,
        "original_filename": occurrence.original_filename,
        "status": occurrence.status,
        "imported_at": occurrence.imported_at,
    }


def serialize_event(event: CandidateEvent, session: Session) -> dict:
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
        "exhibit_caption": event.exhibit_caption,
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
