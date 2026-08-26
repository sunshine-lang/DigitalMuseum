"""通道清剿（ADR-0002）：笔记/Git/合并拆分/人工展签整体退役

- candidate_events 删除 exhibit_caption 列（人工展签能力移除，展览文案
  完全由确定性叙事底稿承担）；
- 笔记与 Git 导入链路、Merge/Split 服务为代码级删除，不留数据迁移：
  存量档案仅含 Agent 会话事件（维护者档案已于 2026-08-25 核实），
  若有历史库残留笔记/Git 谱系，可用清空档案库（DELETE /archive）重来。
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d4c6b8e0a2f1"
down_revision: str | Sequence[str] | None = "c1d2a4f6b8e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("candidate_events") as batch:
        batch.drop_column("exhibit_caption")


def downgrade() -> None:
    raise NotImplementedError("通道清剿不可回滚（ADR-0002）")
