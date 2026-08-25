"""Archive 备份导出与恢复（对抗误删级联删除，PRD v0.2 开放问题 #4 的小切片）。

设计要点：
- 导出：全部阶段/事件/审阅/blob 打包为一个 ZIP（archive.json + blobs/ 原文），
  纯本地操作，GET 下载即得；
- 恢复：确定性重建——stage/occurrence/event/claim/anchor/coverage/review 一律
  生成新 id（避免与现有库冲突或覆盖任何东西），blob 按内容哈希寻址：行缺失则
  从 ZIP 校验后写回，行已存在则复用（天然去重）；
- 完整性 fail closed：ZIP 内每个 blob 的字节必须与其 sha256 文件名一致，
  manifest 缺失/版本不符/结构不合法一律 422 拒绝，不留半成品。
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from datetime import date, datetime
from pathlib import Path

from sqlalchemy.orm import Session

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
    new_id,
)

ARCHIVE_FORMAT_VERSION = "archive-v2"
MANIFEST_NAME = "archive.json"
MAX_ARCHIVE_BYTES = 200 * 1024 * 1024


def _iso(value: datetime | date | None) -> str | None:
    return value.isoformat() if value is not None else None


def export_archive(session: Session, *, upload_dir: Path) -> bytes:
    """把整库打包为 ZIP 字节流（不含任何 data/ 之外的路径信息）。"""
    manifest = {
        "version": ARCHIVE_FORMAT_VERSION,
        "exported_at": _iso(datetime.now().astimezone()),
        "stages": [
            {
                "id": s.id,
                "name": s.name,
                "starts_on": _iso(s.starts_on),
                "ends_on": _iso(s.ends_on),
                "created_at": _iso(s.created_at),
            }
            for s in session.query(Stage).order_by(Stage.created_at).all()
        ],
        "blobs": [
            {
                "sha256": b.sha256,
                "relative_path": b.relative_path,
                "byte_size": b.byte_size,
                "media_type": b.media_type,
                "created_at": _iso(b.created_at),
            }
            for b in session.query(EvidenceBlob).order_by(EvidenceBlob.sha256).all()
        ],
        "occurrences": [
            {
                "id": o.id,
                "source_key": o.source_key,
                "blob_sha256": o.blob_sha256,
                "original_filename": o.original_filename,
                "status": o.status,
                "imported_at": _iso(o.imported_at),
            }
            for o in session.query(EvidenceOccurrence).order_by(EvidenceOccurrence.id).all()
        ],
        "coverage_items": [
            {
                "id": c.id,
                "occurrence_id": c.occurrence_id,
                "step": c.step,
                "status": c.status,
                "processor_version": c.processor_version,
                "error_code": c.error_code,
                "created_at": _iso(c.created_at),
            }
            for c in session.query(CoverageItem).order_by(CoverageItem.id).all()
        ],
        "events": [
            {
                "id": e.id,
                "occurrence_id": e.occurrence_id,
                "title": e.title,
                "occurred_on": _iso(e.occurred_on),
                "time_precision": e.time_precision,
                "status": e.status,
                "revision": e.revision,
                "origin": e.origin,
                "aggregation_rule": e.aggregation_rule,
                "exhibit_caption": e.exhibit_caption,
                "parent_event_id": e.parent_event_id,
                "created_at": _iso(e.created_at),
                "updated_at": _iso(e.updated_at),
            }
            for e in session.query(CandidateEvent).order_by(CandidateEvent.created_at).all()
        ],
        "claims": [
            {
                "id": cl.id,
                "event_id": cl.event_id,
                "occurrence_id": cl.occurrence_id,
                "text": cl.text,
                "epistemic_status": cl.epistemic_status,
                "evidence_role": cl.evidence_role,
                "processor_version": cl.processor_version,
                "source_title": cl.source_title,
                "source_occurred_on": _iso(cl.source_occurred_on),
                "created_at": _iso(cl.created_at),
            }
            for cl in session.query(Claim).order_by(Claim.id).all()
        ],
        "anchors": [
            {
                "id": a.id,
                "claim_id": a.claim_id,
                "blob_sha256": a.blob_sha256,
                "quote": a.quote,
                "line_start": a.line_start,
                "line_end": a.line_end,
                "char_start": a.char_start,
                "char_end": a.char_end,
            }
            for a in session.query(EvidenceAnchor).order_by(EvidenceAnchor.id).all()
        ],
        "reviews": [
            {
                "id": r.id,
                "event_id": r.event_id,
                "decision": r.decision,
                "note": r.note,
                "previous_status": r.previous_status,
                "revision": r.revision,
                "created_at": _iso(r.created_at),
            }
            for r in session.query(EventReview).order_by(EventReview.created_at).all()
        ],
    }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            MANIFEST_NAME, json.dumps(manifest, ensure_ascii=False, indent=1)
        )
        for blob in manifest["blobs"]:
            content = (upload_dir / blob["relative_path"]).read_bytes()
            archive.writestr(f"blobs/{blob['sha256']}", content)
    return buffer.getvalue()


def import_archive(session: Session, archive_bytes: bytes, *, upload_dir: Path) -> dict:
    """从备份 ZIP 恢复为新数据（全部生成新 id，绝不覆盖既有行）。"""
    if len(archive_bytes) > MAX_ARCHIVE_BYTES:
        raise ApiError(422, "archive_too_large", "备份文件超过 200 MiB 上限")
    try:
        archive = zipfile.ZipFile(io.BytesIO(archive_bytes))
    except zipfile.BadZipFile as exc:
        raise ApiError(422, "archive_invalid", "这不是一个有效的备份 ZIP 文件") from exc

    try:
        manifest = json.loads(archive.read(MANIFEST_NAME))
    except (KeyError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        raise ApiError(422, "archive_invalid", "备份缺少 archive.json 或其已损坏") from exc
    if not isinstance(manifest, dict) or manifest.get("version") != ARCHIVE_FORMAT_VERSION:
        raise ApiError(422, "archive_version_unsupported", "备份格式版本不受支持")

    counts = {
        "stages": 0,
        "occurrences": 0,
        "events": 0,
        "claims": 0,
        "anchors": 0,
        "reviews": 0,
        "coverage_items": 0,
        "blobs_restored": 0,
        "blobs_reused": 0,
    }

    occurrence_ids = {row["id"] for row in manifest.get("occurrences", [])}
    event_ids = {row["id"] for row in manifest.get("events", [])}
    claim_ids = {row["id"] for row in manifest.get("claims", [])}
    for row in manifest.get("events", []):
        if row.get("occurrence_id") and row["occurrence_id"] not in occurrence_ids:
            raise ApiError(422, "archive_invalid", "备份结构不完整（event 的 occurrence 引用断裂）")
    for row in manifest.get("coverage_items", []):
        if row.get("occurrence_id") not in occurrence_ids:
            raise ApiError(
                422, "archive_invalid", "备份结构不完整（coverage 的 occurrence 引用断裂）"
            )
    for row in manifest.get("claims", []):
        if row.get("event_id") not in event_ids or row.get("occurrence_id") not in occurrence_ids:
            raise ApiError(422, "archive_invalid", "备份结构不完整（claim 的引用断裂）")
    for row in manifest.get("anchors", []):
        if row.get("claim_id") not in claim_ids:
            raise ApiError(422, "archive_invalid", "备份结构不完整（anchor 的引用断裂）")

    # 1) blob：内容寻址，先校验 ZIP 内字节与 sha 一致，再决定写文件或复用。
    for row in manifest.get("blobs", []):
        sha = row["sha256"]
        existing = session.get(EvidenceBlob, sha)
        if existing is not None:
            counts["blobs_reused"] += 1
            continue
        try:
            content = archive.read(f"blobs/{sha}")
        except KeyError as exc:
            raise ApiError(422, "archive_invalid", f"备份缺少 blob {sha}") from exc
        if hashlib.sha256(content).hexdigest() != sha:
            raise ApiError(422, "archive_integrity_error", f"blob {sha} 内容与哈希不符")
        relative_path = row["relative_path"]
        target = upload_dir / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        session.add(
            EvidenceBlob(
                sha256=sha,
                relative_path=relative_path,
                byte_size=row["byte_size"],
                media_type=row["media_type"],
                created_at=_parse_dt(row.get("created_at")),
            )
        )
        counts["blobs_restored"] += 1

    session.flush()  # blob 先落库，后续 occurrence 的外键才可满足

    # 2) stage / occurrence / coverage / event / claim / anchor / review，
    #    全部换新 id；引用按映射重写。
    stage_map: dict[str, str] = {}
    for row in manifest.get("stages", []):
        new_stage_id = new_id()
        stage_map[row["id"]] = new_stage_id
        session.add(
            Stage(
                id=new_stage_id,
                name=row["name"],
                starts_on=_parse_date(row["starts_on"]),
                ends_on=_parse_date(row["ends_on"]),
                created_at=_parse_dt(row.get("created_at")),
            )
        )
        counts["stages"] += 1

    session.flush()  # stage 先落库（仅作为视图元数据导出）
    occurrence_map: dict[str, str] = {}
    for row in manifest.get("occurrences", []):
        new_occurrence_id = new_id()
        occurrence_map[row["id"]] = new_occurrence_id
        session.add(
            EvidenceOccurrence(
                id=new_occurrence_id,
                # 恢复行不携带 source_key：重复导入同一备份必须仍然可行
                # （全库换新 id 的复制语义），同步身份由下次 sync 重新建立。
                source_key=None,
                blob_sha256=row.get("blob_sha256"),
                original_filename=row["original_filename"],
                status=row["status"],
                imported_at=_parse_dt(row.get("imported_at")),
            )
        )
        counts["occurrences"] += 1

    for row in manifest.get("coverage_items", []):
        session.add(
            CoverageItem(
                id=new_id(),
                occurrence_id=occurrence_map[row["occurrence_id"]],
                step=row["step"],
                status=row["status"],
                processor_version=row.get("processor_version"),
                error_code=row.get("error_code"),
                created_at=_parse_dt(row.get("created_at")),
            )
        )
        counts["coverage_items"] += 1

    session.flush()  # occurrence 先落库
    event_map: dict[str, str] = {}
    for row in manifest.get("events", []):
        new_event_id = new_id()
        event_map[row["id"]] = new_event_id
        session.add(
            CandidateEvent(
                id=new_event_id,
                occurrence_id=(
                    occurrence_map[row["occurrence_id"]]
                    if row.get("occurrence_id")
                    else None
                ),
                title=row["title"],
                occurred_on=_parse_date(row.get("occurred_on")),
                time_precision=row["time_precision"],
                status=row["status"],
                revision=row["revision"],
                origin=row["origin"],
                aggregation_rule=row.get("aggregation_rule"),
                exhibit_caption=row.get("exhibit_caption"),
                parent_event_id=None,  # 血缘在全部事件建好后再回填
                created_at=_parse_dt(row.get("created_at")),
                updated_at=_parse_dt(row.get("updated_at")),
            )
        )
        counts["events"] += 1
    for row in manifest.get("events", []):
        if row.get("parent_event_id"):
            restored = session.get(CandidateEvent, event_map[row["id"]])
            restored.parent_event_id = event_map[row["parent_event_id"]]

    session.flush()  # event 先落库（parent_event_id 随后置值）
    claim_map: dict[str, str] = {}
    for row in manifest.get("claims", []):
        new_claim_id = new_id()
        claim_map[row["id"]] = new_claim_id
        session.add(
            Claim(
                id=new_claim_id,
                event_id=event_map[row["event_id"]],
                occurrence_id=occurrence_map[row["occurrence_id"]],
                text=row["text"],
                epistemic_status=row["epistemic_status"],
                evidence_role=row["evidence_role"],
                processor_version=row["processor_version"],
                source_title=row["source_title"],
                source_occurred_on=_parse_date(row.get("source_occurred_on")),
                created_at=_parse_dt(row.get("created_at")),
            )
        )
        counts["claims"] += 1

    session.flush()  # claim 先落库
    for row in manifest.get("anchors", []):
        session.add(
            EvidenceAnchor(
                id=new_id(),
                claim_id=claim_map[row["claim_id"]],
                blob_sha256=row["blob_sha256"],
                quote=row["quote"],
                line_start=row["line_start"],
                line_end=row["line_end"],
                char_start=row["char_start"],
                char_end=row["char_end"],
            )
        )
        counts["anchors"] += 1

    session.flush()  # anchor 先落库
    for row in manifest.get("reviews", []):
        if row.get("event_id") not in event_map:
            raise ApiError(422, "archive_invalid", "备份结构不完整（review 的引用断裂）")
        session.add(
            EventReview(
                id=new_id(),
                event_id=event_map[row["event_id"]],
                decision=row["decision"],
                note=row.get("note"),
                previous_status=row["previous_status"],
                revision=row["revision"],
                created_at=_parse_dt(row.get("created_at")),
            )
        )
        counts["reviews"] += 1

    session.commit()
    return {"restored": counts}


def _parse_dt(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value)


def _parse_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None
