"""Persistent workspaces, onboarding, telemetry and Supabase access policies."""

from pathlib import Path

from alembic import op

revision = "0004_workspace"
down_revision = "0003_default_evaluator_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql = Path(__file__).with_name("0004_workspace.sql").read_text(encoding="utf-8")
    if op.get_context().as_sql:
        op.execute(sql)
    else:
        with op.get_bind().connection.driver_connection.cursor() as cursor:
            cursor.execute(sql)


def downgrade() -> None:
    raise RuntimeError(
        "This migration retains production records. Restore a backup for rollback."
    )
