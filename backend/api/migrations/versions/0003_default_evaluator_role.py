"""Change default role for users to evaluator.

Revision ID: 0003_default_evaluator_role
Revises: 0002_batches
Create Date: 2026-10-26 00:00:00.000000
"""

from alembic import op

revision = "0003_default_evaluator_role"
down_revision = "0002_batches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Alter users.role server default to 'evaluator'."""
    op.alter_column("users", "role", server_default="evaluator")


def downgrade() -> None:
    """Revert users.role server default to 'operator'."""
    op.alter_column("users", "role", server_default="operator")
