"""allow failed import without blob

Revision ID: 6f62e2d8f5c1
Revises: fe822725611d
Create Date: 2026-08-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "6f62e2d8f5c1"
down_revision: str | Sequence[str] | None = "fe822725611d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("evidence_occurrences") as batch_op:
        batch_op.alter_column(
            "blob_sha256",
            existing_type=sa.String(length=64),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("evidence_occurrences") as batch_op:
        batch_op.alter_column(
            "blob_sha256",
            existing_type=sa.String(length=64),
            nullable=False,
        )
