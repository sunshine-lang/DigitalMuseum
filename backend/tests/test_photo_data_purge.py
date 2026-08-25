"""照片存量数据清理迁移（e5a2c7f91b4d）的行为测试。

先升级到清理前版本，注入旧照片适配器形状的存量数据（纯照片事件、混入
photo claim 的聚合事件、照片 occurrence 与 image/descriptor blob），再升到
head 执行清理，断言：照片谱系整体删除、多源事件保留非照片 claim 与审阅、
零引用 blob 行与内容寻址文件回收、被篡改的文件 fail closed 保留。
"""

from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import uuid4

from alembic.config import Config
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.core.database import Base  # noqa: F401  （确保模型元数据已注册）
from app.domain import models

PRE_PURGE_HEAD = "b7c4e2f8a1d3"


def _config(database_url: str) -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    return config


def _write_blob_file(upload_dir: Path, sha: str, suffix: str, content: bytes) -> None:
    path = upload_dir / sha[:2] / f"{sha}{suffix}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def _blob(sha: str, suffix: str, media_type: str) -> models.EvidenceBlob:
    return models.EvidenceBlob(
        sha256=sha,
        relative_path=f"{sha[:2]}/{sha}{suffix}",
        byte_size=1,
        media_type=media_type,
    )


def _occurrence(
    session,
    stage_id: str,
    *,
    blob_sha256: str | None,
    original_filename: str,
    status: str = "completed",
) -> str:
    """旧 schema 播种用原生 SQL：occurrence 的 stage_id 属主列已在当前 ORM
    摘除（ADR-0001），但历史迁移测试必须按当时的表结构落行。"""
    occurrence_id = str(uuid4())
    session.execute(
        text(
            "INSERT INTO evidence_occurrences"
            " (id, stage_id, blob_sha256, original_filename, status, imported_at)"
            " VALUES (:id, :stage_id, :blob, :filename, :status, :now)"
        ),
        {
            "id": occurrence_id,
            "stage_id": stage_id,
            "blob": blob_sha256,
            "filename": original_filename,
            "status": status,
            "now": datetime.now(UTC),
        },
    )
    return occurrence_id


def _event(session, stage_id: str, **overrides) -> str:
    """同上：candidate_events 的旧属主列经原生 SQL 播种，返回新事件 id。"""
    fields = {
        "occurrence_id": None,
        "title": "事件",
        "occurred_on": date(2026, 7, 4),
        "time_precision": "exact",
        "status": "candidate",
        "revision": 0,
        "origin": "note",
        "parent_event_id": None,
    }
    fields.update(overrides)
    event_id = str(uuid4())
    now = datetime.now(UTC)
    session.execute(
        text(
            "INSERT INTO candidate_events"
            " (id, stage_id, occurrence_id, title, occurred_on, time_precision,"
            " status, revision, origin, aggregation_rule, exhibit_caption,"
            " parent_event_id, created_at, updated_at)"
            " VALUES (:id, :stage_id, :occurrence_id, :title, :occurred_on,"
            " :time_precision, :status, :revision, :origin, :aggregation_rule,"
            " :exhibit_caption, :parent_event_id, :created_at, :updated_at)"
        ),
        {
            "id": event_id,
            "stage_id": stage_id,
            **fields,
            "aggregation_rule": None,
            "exhibit_caption": None,
            "created_at": now,
            "updated_at": now,
        },
    )
    return event_id


def _claim(event_id: str, occurrence_id: str, processor: str) -> models.Claim:
    return models.Claim(
        event_id=event_id,
        occurrence_id=occurrence_id,
        text="一段确定性读出的文字",
        epistemic_status="unknown",
        evidence_role="artifact",
        processor_version=processor,
        source_title="来源",
        source_occurred_on=date(2026, 7, 4),
    )


def test_photo_purge_removes_photo_lineage_and_keeps_the_rest(tmp_path, monkeypatch):
    database_url = f"sqlite:///{tmp_path / 'purge.db'}"
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    # 迁移经 Settings() 解析 upload_dir，用环境变量指向测试目录。
    monkeypatch.setenv("DIGITAL_MUSEUM_UPLOAD_DIR", str(upload_dir))
    config = _config(database_url)
    command.upgrade(config, PRE_PURGE_HEAD)

    note_bytes = b"note content"
    note_sha = hashlib.sha256(note_bytes).hexdigest()
    image_bytes = b"legacy jpeg bytes"
    image_sha = hashlib.sha256(image_bytes).hexdigest()
    desc_bytes = b"photo descriptor document"
    desc_sha = hashlib.sha256(desc_bytes).hexdigest()
    gitdoc_bytes = b"git evidence document"
    gitdoc_sha = hashlib.sha256(gitdoc_bytes).hexdigest()
    for sha, suffix, content in (
        (note_sha, ".md", note_bytes),
        (image_sha, ".jpg", image_bytes),
        (desc_sha, ".txt", desc_bytes),
        (gitdoc_sha, ".txt", gitdoc_bytes),
    ):
        _write_blob_file(upload_dir, sha, suffix, content)

    seed_engine = create_engine(database_url)
    with sessionmaker(bind=seed_engine)() as session:
        stage = models.Stage(
            name="存量照片清理", starts_on=date(2026, 3, 1), ends_on=date(2026, 8, 31)
        )
        session.add(stage)
        session.flush()

        # 笔记链路：应完整保留（含审阅行与 blob 文件）。
        note_occ = _occurrence(
            session, stage.id, blob_sha256=note_sha, original_filename="note.md"
        )
        session.add(_blob(note_sha, ".md", "text/markdown"))
        session.flush()
        note_event = _event(
            session, stage.id, occurrence_id=note_occ, title="笔记事件",
            status="confirmed", revision=1, origin="note",
        )
        note_claim = _claim(note_event, note_occ, "note-development-v2")
        note_claim.evidence_role = "user_statement"
        session.add(note_claim)
        session.flush()
        session.add_all([
            models.EvidenceAnchor(
                claim_id=note_claim.id, blob_sha256=note_sha,
                quote="一段", line_start=1, line_end=1, char_start=0, char_end=3,
            ),
            models.EventReview(
                event_id=note_event, decision="confirmed", note=None,
                previous_status="candidate", revision=1,
            ),
        ])

        # 纯照片事件（已确认过）：事件、审阅、occurrence、coverage 全部应删除。
        photo_occ = _occurrence(
            session, stage.id, blob_sha256=image_sha,
            original_filename="IMG_20260704.jpg",
        )
        session.add_all([
            _blob(image_sha, ".jpg", "image/jpeg"),
            _blob(desc_sha, ".txt", "text/plain"),
        ])
        session.flush()
        session.add(
            models.CoverageItem(
                occurrence_id=photo_occ, step="stored_locally", status="completed"
            )
        )
        photo_event = _event(
            session, stage.id, occurrence_id=photo_occ, title="拍摄照片",
            status="confirmed", revision=1, origin="photo",
        )
        photo_claim = _claim(photo_event, photo_occ, "photo-evidence-v1")
        session.add(photo_claim)
        session.flush()
        session.add_all([
            models.EvidenceAnchor(
                claim_id=photo_claim.id, blob_sha256=desc_sha,
                quote="拍摄时间", line_start=1, line_end=1, char_start=0, char_end=4,
            ),
            models.EventReview(
                event_id=photo_event, decision="confirmed", note=None,
                previous_status="verified", revision=1,
            ),
        ])

        # 混合聚合事件：photo claim + git claim。photo claim 删除、git claim 保留；
        # occurrence 曾指向照片导入（photo 白名单允许并 git），清理后应置 NULL。
        git_occ = _occurrence(
            session, stage.id, blob_sha256=gitdoc_sha,
            original_filename="repo-git-evidence.txt",
        )
        session.add(_blob(gitdoc_sha, ".txt", "text/plain"))
        session.flush()
        # lineage 守卫：幸存事件指向被删照片事件时，parent_event_id 应置 NULL。
        mixed_event = _event(
            session, stage.id, occurrence_id=photo_occ, title="混合事件",
            status="verified", revision=0, origin="aggregated",
            parent_event_id=photo_event,
        )
        git_claim = _claim(mixed_event, git_occ, "git-evidence-v1")
        mixed_photo_claim = _claim(mixed_event, photo_occ, "photo-evidence-v1")
        session.add_all([git_claim, mixed_photo_claim])
        session.flush()
        session.add_all([
            models.EvidenceAnchor(
                claim_id=git_claim.id, blob_sha256=gitdoc_sha,
                quote="提交", line_start=1, line_end=1, char_start=0, char_end=2,
            ),
            models.EvidenceAnchor(
                claim_id=mixed_photo_claim.id, blob_sha256=desc_sha,
                quote="拍摄时间", line_start=1, line_end=1, char_start=0, char_end=4,
            ),
        ])

        # merge/split 历史源事件：零 claim 是合法终态（claims 已移交产物事件，
        # 作为审计行保留），清理必须跳过它们。
        merged_source = _event(
            session, stage.id, title="被合并的笔记经历", status="merged",
            revision=1, origin="note", parent_event_id=note_event,
        )
        split_source = _event(
            session, stage.id, title="被拆分的原始经历", status="split",
            revision=1, origin="note",
        )
        session.add_all([
            models.EventReview(
                event_id=merged_source, decision="merged", note=None,
                previous_status="candidate", revision=1,
            ),
            models.EventReview(
                event_id=split_source, decision="split", note=None,
                previous_status="candidate", revision=1,
            ),
        ])
        session.commit()
        ids = {
            "note_event": note_event,
            "photo_event": photo_event,
            "mixed_event": mixed_event,
            "note_occ": note_occ,
            "photo_occ": photo_occ,
            "git_occ": git_occ,
            "merged_source": merged_source,
            "split_source": split_source,
        }
    seed_engine.dispose()

    command.upgrade(config, "head")

    check_engine = create_engine(database_url)
    try:
        with sessionmaker(bind=check_engine)() as check:
            photo_claims = check.scalar(
                select(func.count(models.Claim.id)).where(
                    models.Claim.processor_version == "photo-evidence-v1"
                )
            )
            assert photo_claims == 0

            surviving_mixed = check.get(models.CandidateEvent, ids["mixed_event"])
            assert surviving_mixed is not None
            assert [c.processor_version for c in surviving_mixed.claims] == [
                "git-evidence-v1"
            ]
            assert surviving_mixed.occurrence_id is None
            assert surviving_mixed.parent_event_id is None

            assert check.get(models.CandidateEvent, ids["note_event"]) is not None
            assert check.get(models.CandidateEvent, ids["photo_event"]) is None

            # merge/split 历史源事件与其审计行原样保留；指向幸存事件的
            # parent_event_id 不得被误置 NULL。
            kept_merged = check.get(models.CandidateEvent, ids["merged_source"])
            assert kept_merged is not None
            assert kept_merged.parent_event_id == ids["note_event"]
            kept_split = check.get(models.CandidateEvent, ids["split_source"])
            assert kept_split is not None
            kept_reviews = check.scalar(
                select(func.count(models.EventReview.id)).where(
                    models.EventReview.event_id.in_(
                        [ids["merged_source"], ids["split_source"]]
                    )
                )
            )
            assert kept_reviews == 2

            assert check.get(models.EvidenceOccurrence, ids["photo_occ"]) is None
            assert check.get(models.EvidenceOccurrence, ids["note_occ"]) is not None
            assert check.get(models.EvidenceOccurrence, ids["git_occ"]) is not None
            assert check.get(models.EvidenceBlob, image_sha) is None
            assert check.get(models.EvidenceBlob, desc_sha) is None
            assert check.get(models.EvidenceBlob, note_sha) is not None
            assert check.get(models.EvidenceBlob, gitdoc_sha) is not None

            descriptor_anchors = check.scalar(
                select(func.count(models.EvidenceAnchor.id)).where(
                    models.EvidenceAnchor.blob_sha256 == desc_sha
                )
            )
            assert descriptor_anchors == 0

            photo_reviews = check.scalar(
                select(func.count(models.EventReview.id)).where(
                    models.EventReview.event_id == ids["photo_event"]
                )
            )
            assert photo_reviews == 0
    finally:
        check_engine.dispose()

    assert (upload_dir / note_sha[:2] / f"{note_sha}.md").is_file()
    assert (upload_dir / gitdoc_sha[:2] / f"{gitdoc_sha}.txt").is_file()
    assert not (upload_dir / image_sha[:2] / f"{image_sha}.jpg").exists()
    assert not (upload_dir / desc_sha[:2] / f"{desc_sha}.txt").exists()


def test_photo_purge_keeps_tampered_files_fail_closed(tmp_path, monkeypatch):
    database_url = f"sqlite:///{tmp_path / 'tamper.db'}"
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setenv("DIGITAL_MUSEUM_UPLOAD_DIR", str(upload_dir))
    config = _config(database_url)
    command.upgrade(config, PRE_PURGE_HEAD)

    # 零引用 blob，但磁盘文件内容与指纹不符：行删除，文件必须保留。
    stale_bytes = b"origin content"
    stale_sha = hashlib.sha256(stale_bytes).hexdigest()
    path = upload_dir / stale_sha[:2] / f"{stale_sha}.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"tampered content")

    seed_engine = create_engine(database_url)
    with sessionmaker(bind=seed_engine)() as session:
        session.add(_blob(stale_sha, ".txt", "text/plain"))
        session.commit()
    seed_engine.dispose()

    command.upgrade(config, "head")

    check_engine = create_engine(database_url)
    try:
        with sessionmaker(bind=check_engine)() as check:
            assert check.get(models.EvidenceBlob, stale_sha) is None
    finally:
        check_engine.dispose()
    assert path.is_file()
