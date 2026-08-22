"""stage 2 claim sources and event lineage

Revision ID: a3f1c0d9e7b2
Revises: 6f62e2d8f5c1
Create Date: 2026-08-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a3f1c0d9e7b2"
down_revision: str | Sequence[str] | None = "6f62e2d8f5c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# SQLite 无法删除匿名 unique 约束，用 copy_from 提供带名字的旧表定义。
candidate_events_v1 = sa.Table(
    "candidate_events",
    sa.MetaData(),
    sa.Column("id", sa.String(length=36), primary_key=True),
    sa.Column("stage_id", sa.String(length=36), nullable=False),
    sa.Column("occurrence_id", sa.String(length=36), nullable=False),
    sa.Column("title", sa.String(length=200), nullable=False),
    sa.Column("occurred_on", sa.Date(), nullable=True),
    sa.Column("time_precision", sa.String(length=24), nullable=False),
    sa.Column("status", sa.String(length=24), nullable=False),
    sa.Column("revision", sa.Integer(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(["stage_id"], ["stages.id"], ondelete="CASCADE"),
    sa.ForeignKeyConstraint(["occurrence_id"], ["evidence_occurrences.id"], ondelete="CASCADE"),
    sa.UniqueConstraint("occurrence_id", name="uq_candidate_events_occurrence"),
)


def upgrade() -> None:
    with op.batch_alter_table("candidate_events", copy_from=candidate_events_v1) as batch_op:
        batch_op.drop_constraint("uq_candidate_events_occurrence", type_="unique")
        batch_op.alter_column(
            "occurrence_id",
            existing_type=sa.String(length=36),
            nullable=True,
        )
        batch_op.add_column(
            sa.Column("origin", sa.String(length=24), nullable=False, server_default="note")
        )
        batch_op.add_column(sa.Column("aggregation_rule", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("parent_event_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key(
            "fk_candidate_events_parent_event",
            "candidate_events",
            ["parent_event_id"],
            ["id"],
        )

    with op.batch_alter_table("claims") as batch_op:
        batch_op.add_column(sa.Column("occurrence_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("source_title", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("source_occurred_on", sa.Date(), nullable=True))

    op.execute(
        """
        UPDATE claims
        SET occurrence_id = (
            SELECT candidate_events.occurrence_id
            FROM candidate_events
            WHERE candidate_events.id = claims.event_id
        )
        """
    )
    op.execute(
        """
        UPDATE claims
        SET source_title = (
            SELECT candidate_events.title
            FROM candidate_events
            WHERE candidate_events.id = claims.event_id
        )
        """
    )
    op.execute(
        """
        UPDATE claims
        SET source_occurred_on = (
            SELECT candidate_events.occurred_on
            FROM candidate_events
            WHERE candidate_events.id = claims.event_id
        )
        """
    )

    with op.batch_alter_table("claims") as batch_op:
        batch_op.alter_column(
            "occurrence_id",
            existing_type=sa.String(length=36),
            nullable=False,
        )
        batch_op.alter_column(
            "source_title",
            existing_type=sa.String(length=200),
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("claims") as batch_op:
        batch_op.drop_column("source_occurred_on")
        batch_op.drop_column("source_title")
        batch_op.drop_column("occurrence_id")

    with op.batch_alter_table("candidate_events") as batch_op:
        batch_op.drop_constraint("fk_candidate_events_parent_event", type_="foreignkey")
        batch_op.drop_column("parent_event_id")
        batch_op.drop_column("aggregation_rule")
        batch_op.drop_column("origin")
        batch_op.alter_column(
            "occurrence_id",
            existing_type=sa.String(length=36),
            nullable=False,
        )
        batch_op.create_unique_constraint("uq_candidate_events_occurrence", ["occurrence_id"])
