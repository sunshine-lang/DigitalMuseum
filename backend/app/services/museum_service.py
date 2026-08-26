from __future__ import annotations

import hashlib
import os
from calendar import monthrange
from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy import delete, exists, func, or_, select, update
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
from app.domain.schemas import ReviewCreate, StageCreate, StageUpdate
from app.services import claude_session_evidence_service as claude_evidence
from app.services import codex_session_evidence_service as codex_evidence
from app.services import dsh_session_evidence_service as dsh_evidence
from app.services import pi_agent_evidence_service as pi_evidence
from app.services.agent_session_evidence import AgentActivityItem

AGGREGATION_RULE_VERSION = "agent-session-aggregation-v1"
# 聚合可并入的状态：candidate 是待核对草稿；verified 是确定性读数的系统核实态。
# 被用户审阅过的事件 revision > 0，天然不会匹配。
AGGREGATABLE_STATUSES = ("candidate", "verified")

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


def delete_stage(session: Session, stage_id: str) -> None:
    """阶段是档案库上的视图（ADR-0001）：删除只移除视图行，不动任何档案数据。"""
    stage = require_stage(session, stage_id)
    session.delete(stage)
    session.commit()


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
    """阶段序列化 = 视图元数据 + 档案库在时间窗内的投影计数。

    evidence_count 同样按窗口投影：统计窗口内事件的 claims 实际引用的
    occurrence 数（项目快照跨多天，按引用归属而不是按日期截断）。
    """
    in_window = _stage_window_filter(stage)
    evidence_count = session.scalar(
        select(func.count(func.distinct(Claim.occurrence_id)))
        .join(CandidateEvent, Claim.event_id == CandidateEvent.id)
        .where(in_window, Claim.occurrence_id.is_not(None))
    )
    event_count = session.scalar(
        select(func.count(CandidateEvent.id)).where(in_window)
    )
    confirmed_count = session.scalar(
        select(func.count(CandidateEvent.id)).where(
            in_window, CandidateEvent.status == "confirmed"
        )
    )
    verified_count = session.scalar(
        select(func.count(CandidateEvent.id)).where(
            in_window, CandidateEvent.status == "verified"
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


def _stage_window_filter(stage: Stage):
    """时间窗视图的确定性过滤：日期在窗内，或日期未知（不隐藏无日期事件）。"""
    return or_(
        CandidateEvent.occurred_on.is_(None),
        CandidateEvent.occurred_on.between(stage.starts_on, stage.ends_on),
    )


def require_stage(session: Session, stage_id: str) -> Stage:
    stage = session.get(Stage, stage_id)
    if stage is None:
        raise ApiError(404, "stage_not_found", "没有找到这个建馆阶段")
    return stage


def record_failed_import(
    session: Session,
    *,
    original_filename: str,
    step: str,
    error_code: str,
) -> None:
    occurrence = EvidenceOccurrence(
        blob_sha256=None,
        original_filename=original_filename,
        status="failed",
    )
    occurrence.coverage_items.append(
        CoverageItem(step=step, status="failed", error_code=error_code)
    )
    session.add(occurrence)
    session.commit()


def start_evidence_import(
    session: Session,
    *,
    original_filename: str,
    media_type: str,
    content: bytes,
    upload_dir: Path,
    source_key: str | None = None,
) -> EvidenceOccurrence:
    blob, created_path = _get_or_create_blob(
        session,
        original_filename=original_filename,
        media_type=media_type,
        content=content,
        upload_dir=upload_dir,
    )

    occurrence = EvidenceOccurrence(
        source_key=source_key,
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
    processor_version: str,
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


def _import_activity_evidence(
    session: Session,
    *,
    upload_dir: Path,
    document: str,
    items: tuple[AgentActivityItem, ...],
    label: str,
    filename_suffix: str,
    origin: str,
    origins: tuple[str, ...],
    processor_version: str,
    source_key: str | None = None,
) -> dict:
    """Agent 会话同步链路的公共尾部：

    证据文档落 blob → 起始 occurrence → 持久化机器候选（失败则标记失败
    coverage 后原样抛出）→ 只保留本次 occurrence 的 coverage 并组装返回。
    """
    occurrence = start_evidence_import(
        session,
        original_filename=f"{label}{filename_suffix}",
        media_type="text/plain",
        content=document.encode("utf-8"),
        upload_dir=upload_dir,
        source_key=source_key,
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
        "coverage": _occurrence_coverage(session, occurrence_id),
    }


def _persist_machine_candidates(
    session: Session,
    *,
    occurrence_id: str,
    items: tuple[AgentActivityItem, ...],
    origin: str,
    origins: tuple[str, ...],
    processor_version: str,
) -> list[dict]:
    occurrence = session.get(EvidenceOccurrence, occurrence_id)
    if occurrence is None:
        raise ApiError(404, "occurrence_not_found", "没有找到这次导入")
    if occurrence.blob is None:
        raise ApiError(500, "missing_evidence_blob", "原始证据没有完成本地保存")

    created_events: list[CandidateEvent] = []
    for item in items:
        event, created = _resolve_machine_event(
            session,
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


def _resolve_machine_event(
    session: Session,
    occurrence: EvidenceOccurrence,
    *,
    title: str,
    occurred_on: date,
    initial_status: str,
    origin: str,
    origins: tuple[str, ...],
) -> tuple[CandidateEvent, bool]:
    """确定性证据（Git/Agent 会话）的事件落位规则（档案库全局）。

    1. 同题同日的未审阅事件（candidate/verified，revision=0）→ 并入聚合；
    2. 同题同日、用户已审阅且仍可见（confirmed/disputed/unknown，revision>0）
       → 并入为新 claim，但**保持用户判定**——机器读数不得覆盖或复制用户
       刚刚否认过的事实；
    3. 同题同日但被用户 rejected（已从可见列表排除）→ 新建事件降级为
       candidate（人工意见与机器读数冲突时，交还人工）；
    4. 都没有 → 按 initial_status 新建（提交日/会话日 = verified，推断性
       标题 = candidate）。
    """
    target = _find_aggregation_target(session, title, occurred_on, origins=origins)
    if target is not None:
        target.origin = "aggregated"
        target.aggregation_rule = AGGREGATION_RULE_VERSION
        target.updated_at = utc_now()
        return target, False

    absorb = _find_reviewed_absorb_target(session, title, occurred_on, origins)
    if absorb is not None:
        absorb.origin = "aggregated"
        absorb.aggregation_rule = AGGREGATION_RULE_VERSION
        absorb.updated_at = utc_now()
        return absorb, False

    status = initial_status
    if _has_rejected_target(session, title, occurred_on, origins):
        status = "candidate"
    event = CandidateEvent(
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
    title: str,
    occurred_on: date,
    origins: tuple[str, ...],
) -> CandidateEvent | None:
    events = session.scalars(
        select(CandidateEvent).where(
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
    title: str,
    occurred_on: date,
    origins: tuple[str, ...],
) -> bool:
    events = session.scalars(
        select(CandidateEvent).where(
            CandidateEvent.status == "rejected",
            CandidateEvent.occurred_on == occurred_on,
        )
    ).all()
    return any(_normalized_title(event.title) == _normalized_title(title) for event in events)


def _find_aggregation_target(
    session: Session,
    title: str,
    occurred_on: date | None,
    origins: tuple[str, ...],
) -> CandidateEvent | None:
    if occurred_on is None:
        return None
    normalized = _normalized_title(title)
    if not normalized:
        return None
    events = session.scalars(
        select(CandidateEvent).where(
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
    """阶段视图：档案库全局事件按时间窗过滤（无日期事件不隐藏）。"""
    stage = require_stage(session, stage_id)
    events = session.scalars(
        select(CandidateEvent)
        .where(_stage_window_filter(stage))
        .options(
            selectinload(CandidateEvent.claims).selectinload(Claim.anchors),
            selectinload(CandidateEvent.reviews),
        )
        .order_by(CandidateEvent.created_at)
    ).all()
    return [serialize_event(event, session) for event in events]


def list_archive_events(session: Session) -> list[dict]:
    """档案库时间线：全部事件按发生日升序（无日期排最后）。"""
    events = session.scalars(
        select(CandidateEvent)
        .options(
            selectinload(CandidateEvent.claims).selectinload(Claim.anchors),
            selectinload(CandidateEvent.reviews),
        )
        .order_by(
            CandidateEvent.occurred_on.is_(None),
            CandidateEvent.occurred_on,
            CandidateEvent.created_at,
        )
    ).all()
    return [serialize_event(event, session) for event in events]


def get_event(session: Session, event_id: str) -> dict:
    return serialize_event(_load_event(session, event_id), session)


def review_event(session: Session, event_id: str, payload: ReviewCreate) -> dict:
    event = _load_event(session, event_id)
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


def list_coverage(session: Session) -> list[dict]:
    """档案库导入日志：全部 coverage 按导入时间排序（阶段无关）。"""
    rows = session.execute(
        select(CoverageItem, EvidenceOccurrence.original_filename)
        .join(EvidenceOccurrence, CoverageItem.occurrence_id == EvidenceOccurrence.id)
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


def _occurrence_coverage(session: Session, occurrence_id: str) -> list[dict]:
    """导入返回只携带本次 occurrence 的 coverage（全档案列表按 occurrence 过滤）。"""
    coverage = list_coverage(session)
    return [item for item in coverage if item["occurrence_id"] == occurrence_id]


def serialize_occurrence(occurrence: EvidenceOccurrence) -> dict:
    return {
        "id": occurrence.id,
        "blob_sha256": occurrence.blob_sha256,
        "original_filename": occurrence.original_filename,
        "status": occurrence.status,
        "imported_at": occurrence.imported_at,
    }


def serialize_event(event: CandidateEvent, session: Session) -> dict:
    latest_review = event.reviews[-1] if event.reviews else None
    return {
        "id": event.id,
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


# ---------------------------------------------------------------------------
# 档案库同步（ADR-0001 / PRD v0.3 S1）
# ---------------------------------------------------------------------------


# 产品注册表：各 Agent 适配器以统一模块界面接入
# （KIND / list_projects / import_project / EVIDENCE_SUFFIX /
#   AGGREGATION_ORIGINS / *_PROCESSOR_VERSION），新增产品照此注册。
AGENT_PRODUCTS = (
    claude_evidence,
    codex_evidence,
    pi_evidence,
    dsh_evidence,
)


def sync_archive(
    session: Session,
    *,
    upload_dir: Path,
    allowed_repo_roots: str,
    claude_projects_root: str,
    codex_sessions_root: str,
    pi_sessions_root: str,
    dsh_sessions_root: str,
) -> dict:
    """一键同步本机全部 Agent 会话项目到档案库。

    幂等语义（source_key 内容寻址 upsert）：
    - 项目证据文档字节不变 → 跳过（自动增量的零开销路径）；
    - 内容有变化（新增会话）→ 替换该项目的 occurrence 快照（旧 claims 随
      旧快照级联清理），事件按全局同题同日并入、用户判定保持；
    - 换掉的旧快照 blob 由 _reclaim_orphan_blobs 回收。
    """
    roots = {
        "claude": claude_projects_root,
        "codex": codex_sessions_root,
        "pi": pi_sessions_root,
        "dsh": dsh_sessions_root,
    }
    products: list[dict] = []
    for adapter in AGENT_PRODUCTS:
        root = roots[adapter.KIND]
        for project in adapter.list_projects(root):
            products.append(
                _sync_agent_project(
                    session,
                    adapter=adapter,
                    project=project,
                    upload_dir=upload_dir,
                    allowed_repo_roots=allowed_repo_roots,
                    root=root,
                )
            )
    _reclaim_orphan_blobs(session, upload_dir)
    return {
        "products": products,
        "projects_imported": sum(1 for item in products if item["status"] == "imported"),
        "projects_skipped": sum(1 for item in products if item["status"] == "skipped"),
        "projects_failed": sum(1 for item in products if item["status"] == "failed"),
        "events_created": sum(item["events_created"] for item in products),
    }


def wipe_archive(session: Session, *, upload_dir: Path) -> dict:
    """清空档案库：唯一的破坏性数据操作（ADR-0001）。

    顺序：先删事件（级联清 claims/anchors/reviews）→ 再删 occurrence
    （级联清 coverage）→ 删阶段视图 → 回收全部零引用 blob（删行并清文件）。
    """
    events_removed = session.scalar(select(func.count(CandidateEvent.id))) or 0
    occurrences_removed = session.scalar(
        select(func.count(EvidenceOccurrence.id))
    )
    session.execute(delete(CandidateEvent))
    session.execute(delete(EvidenceOccurrence))
    session.execute(delete(Stage))
    session.commit()
    _reclaim_orphan_blobs(session, upload_dir)
    return {
        "cleared": True,
        "events_removed": events_removed,
        "occurrences_removed": occurrences_removed or 0,
    }


def _sync_agent_project(
    session: Session,
    *,
    adapter,
    project: dict,
    upload_dir: Path,
    allowed_repo_roots: str,
    root: str,
) -> dict:
    import_path = project["import_path"]
    source_key = f"{adapter.KIND}:{Path(import_path).expanduser().resolve()}"
    entry = {
        "product": adapter.KIND,
        "project": project["project"],
        "session_count": project["session_count"],
        "status": "failed",
        "error_code": None,
        "events_created": 0,
    }
    try:
        evidence = adapter.import_project(
            import_path,
            starts_on=None,
            ends_on=None,
            allowed_roots=allowed_repo_roots,
            root=root,
        )
    except ApiError as exc:
        entry["error_code"] = exc.code
        return entry

    document_sha = hashlib.sha256(evidence.document.encode("utf-8")).hexdigest()
    existing = session.scalar(
        select(EvidenceOccurrence).where(EvidenceOccurrence.source_key == source_key)
    )
    # 只有「已完整导入」（completed 且字节相同）才允许跳过。上次同步中断/
    # 失败留下的 occurrence（processing/failed）即使字节相同也必须重建——
    # 否则 source_key 被永久毒化，该项目再也不会导入（对抗性审查 P0）。
    if (
        existing is not None
        and existing.status == "completed"
        and existing.blob_sha256 == document_sha
    ):
        entry["status"] = "skipped"
        return entry
    if existing is not None:
        # 快照替换：先摘开仍指向旧快照的事件（occurrence_id 置空，事件与
        # 用户审阅判定保留），再删旧 occurrence（级联清旧 claims/coverage），
        # 由新快照的导入重新并入。替换后若导入失败，occurrence 停在
        # failed/processing 态，下一轮 sync 会再次进入本分支自愈。
        session.execute(
            update(CandidateEvent)
            .where(CandidateEvent.occurrence_id == existing.id)
            .values(occurrence_id=None)
        )
        session.execute(
            delete(EvidenceOccurrence).where(EvidenceOccurrence.id == existing.id)
        )
        session.commit()

    try:
        result = _import_activity_evidence(
            session,
            upload_dir=upload_dir,
            document=evidence.document,
            items=evidence.items,
            label=evidence.project_label,
            filename_suffix=adapter.EVIDENCE_SUFFIX,
            origin=adapter.KIND,
            origins=adapter.AGGREGATION_ORIGINS,
            processor_version=adapter.PROCESSOR_VERSION,
            source_key=source_key,
        )
    except ApiError as exc:
        entry["error_code"] = exc.code
        return entry
    except Exception as exc:  # noqa: BLE001 —— 单项目落库失败只降级该项目，不得中断整轮同步
        entry["error_code"] = type(exc).__name__
        session.rollback()
        return entry
    entry["status"] = "imported"
    entry["events_created"] = len(result["events"])
    return entry
