"""档案库为根：数据属主从阶段移交档案库（ADR-0001）

- evidence_occurrences / candidate_events 摘除 stage_id（数据全局归属档案库）；
- evidence_occurrences 新增 source_key（同步幂等身份键，唯一）；
- stages 表保留为纯视图元数据（名称 + 时间窗），不再被任何数据表引用。

存量数据为空（data/ 已清空、无外部用户），无需回填。
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c1d2a4f6b8e0"
down_revision: str | Sequence[str] | None = "e5a2c7f91b4d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("candidate_events") as batch:
        batch.drop_column("stage_id")
    with op.batch_alter_table("evidence_occurrences") as batch:
        batch.drop_column("stage_id")
        batch.add_column(
            sa.Column("source_key", sa.String(length=300), nullable=True)
        )
        batch.create_unique_constraint("uq_evidence_occurrences_source_key", ["source_key"])


def downgrade() -> None:
    # 属主关系不可逆：恢复 stage_id 需要指定归属，而视图语义下不存在该信息。
    raise NotImplementedError("档案库为根的属主迁移不可回滚（ADR-0001）")
