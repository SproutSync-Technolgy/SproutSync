"""Idempotent evaluator grants and hosted operator access workflows."""

from pathlib import Path

from alembic import op

revision = "0022_evaluator_workflows"
down_revision = "0021_internal_table_security"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade():
    # Additive workflow fixes remain compatible; do not restore broken RPCs.
    pass
