"""add exhibit_caption to candidate_events

Revision ID: b7c4e2f8a1d3
Revises: a3f1c0d9e7b2
Create Date: 2026-08-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7c4e2f8a1d3"
down_revision: str | Sequence[str] | None = "a3f1c0d9e7b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "candidate_events",
        sa.Column("exhibit_caption", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("candidate_events", "exhibit_caption")
