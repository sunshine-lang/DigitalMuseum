"""purge legacy photo-evidence data

Revision ID: e5a2c7f91b4d
Revises: b7c4e2f8a1d3
Create Date: 2026-08-25

photo-evidence-v1 适配器已于 2026-08-25 整体删除（见同日提交）。本迁移清理
存量库中该适配器留下的全部谱系数据：

- photo claims（processor_version='photo-evidence-v1'）与全部锚点；
- 纯照片事件（origin='photo'）与**因 photo claim 删除而被清空**的事件（先记
  录曾持有 photo claim 的事件集合，再判空），连同其审阅行（parent_event_id
  指向被删事件的行先置 NULL，避免悬挂引用）。merge/split 的历史源事件是
  合法的零 claim 终态（claims 已移交产物事件，作为审计行保留），不在清理
  范围内；
- 照片导入 occurrence（blob media_type 为 image/jpeg|png）及其 coverage；
- 上述删除后零引用的 EvidenceBlob：删行，并删除内容寻址文件——删文件前
  先提交行删除（与服务层 _reclaim_orphan_blobs 同序：回滚窗口只留下无害
  垃圾文件），且校验磁盘内容 sha256 与行一致、路径位于 upload_dir 之内，
  不一致则保留文件（fail closed）。

混入 photo claim 的多源聚合事件保留其余 claim 与用户审阅状态。本迁移为
破坏性数据清理，被删除的用户数据无法还原，downgrade 为 no-op。
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa

from alembic import op
from app.core.config import Settings

revision: str = "e5a2c7f91b4d"
down_revision: str | Sequence[str] | None = "b7c4e2f8a1d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PHOTO_PROCESSOR_VERSION = "photo-evidence-v1"
PHOTO_MEDIA_TYPES = ("image/jpeg", "image/png")


def upgrade() -> None:
    conn = op.get_bind()

    # 1) photo claims：先锚点后本体（迁移连接不依赖 FK 强制）。删除前先记下
    #    曾持有 photo claim 的事件集合——第 2 步只清空"被照片清理掏空"的事件，
    #    不得触碰 merge/split 历史（它们零 claim 是合法终态）。
    photo_event_ids = conn.execute(
        sa.text(
            "SELECT DISTINCT event_id FROM claims WHERE processor_version = :version"
        ),
        {"version": PHOTO_PROCESSOR_VERSION},
    ).scalars().all()
    conn.execute(
        sa.text(
            "DELETE FROM evidence_anchors WHERE claim_id IN "
            "(SELECT id FROM claims WHERE processor_version = :version)"
        ),
        {"version": PHOTO_PROCESSOR_VERSION},
    )
    conn.execute(
        sa.text("DELETE FROM claims WHERE processor_version = :version"),
        {"version": PHOTO_PROCESSOR_VERSION},
    )

    # 2) 纯照片事件 + 因 photo claim 删除而被清空的事件；先解除 lineage 引用，
    #    再删审阅与本体。
    doomed_events = conn.execute(
        sa.text(
            "SELECT id FROM candidate_events WHERE origin = 'photo' "
            "OR (id IN :photo_events AND id NOT IN (SELECT event_id FROM claims))"
        ).bindparams(sa.bindparam("photo_events", expanding=True)),
        {"photo_events": photo_event_ids or [""]},
    ).scalars().all()
    if doomed_events:
        _execute_in(
            conn,
            "UPDATE candidate_events SET parent_event_id = NULL WHERE parent_event_id IN :ids",
            doomed_events,
        )
        _execute_in(conn, "DELETE FROM event_reviews WHERE event_id IN :ids", doomed_events)
        _execute_in(conn, "DELETE FROM candidate_events WHERE id IN :ids", doomed_events)

    # 3) 照片导入 occurrence：blob 是原图（image/*）的导入即照片；先解除事件引用
    #    与 coverage，再删本体。
    photo_occurrence_ids = conn.execute(
        sa.text(
            "SELECT o.id FROM evidence_occurrences o "
            "JOIN evidence_blobs b ON b.sha256 = o.blob_sha256 "
            "WHERE b.media_type IN :types"
        ).bindparams(sa.bindparam("types", expanding=True)),
        {"types": list(PHOTO_MEDIA_TYPES)},
    ).scalars().all()
    if photo_occurrence_ids:
        _execute_in(
            conn,
            "UPDATE candidate_events SET occurrence_id = NULL WHERE occurrence_id IN :ids",
            photo_occurrence_ids,
        )
        _execute_in(
            conn, "DELETE FROM coverage_items WHERE occurrence_id IN :ids", photo_occurrence_ids
        )
        _execute_in(
            conn, "DELETE FROM evidence_occurrences WHERE id IN :ids", photo_occurrence_ids
        )

    # 4) 零引用 blob 回收：删行，随后在事务外删内容寻址文件（与服务层
    #    _reclaim_orphan_blobs 同序——先提交行删除再删文件，中途失败的残留
    #    只是无害垃圾文件，而不是"行在文件丢"）。autocommit_block 进入时提交
    #    当前事务；若之后版本戳失败，重跑迁移时孤儿集已空，天然幂等。
    orphans = conn.execute(
        sa.text(
            "SELECT sha256, relative_path FROM evidence_blobs WHERE NOT EXISTS "
            "(SELECT 1 FROM evidence_occurrences o WHERE o.blob_sha256 = evidence_blobs.sha256) "
            "AND NOT EXISTS "
            "(SELECT 1 FROM evidence_anchors a WHERE a.blob_sha256 = evidence_blobs.sha256)"
        )
    ).all()
    if orphans:
        _execute_in(
            conn,
            "DELETE FROM evidence_blobs WHERE sha256 IN :ids",
            [sha256 for sha256, _ in orphans],
        )
        with op.get_context().autocommit_block():
            _unlink_verified_files(Settings().upload_dir, orphans)


def _execute_in(conn, statement: str, ids: Sequence[str]) -> None:
    conn.execute(
        sa.text(statement).bindparams(sa.bindparam("ids", expanding=True)), {"ids": ids}
    )


def _unlink_verified_files(upload_dir: Path, orphans) -> None:
    root = upload_dir.resolve()
    for sha256, relative_path in orphans:
        path = (upload_dir / relative_path).resolve()
        if not path.is_relative_to(root):
            continue
        if not path.is_file():
            continue
        # fail closed：磁盘内容与内容寻址指纹一致才删；被换过/损坏的文件保留在原地。
        if hashlib.sha256(path.read_bytes()).hexdigest() == sha256:
            path.unlink()


def downgrade() -> None:
    # 破坏性数据清理：删除的用户审阅与照片谱系无法还原，不提供逆向操作。
    pass
