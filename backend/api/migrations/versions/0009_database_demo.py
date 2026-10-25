"""Persist the former prototype demonstration records under RLS ownership."""

from pathlib import Path

from alembic import op

revision = "0009_database_demo"
down_revision = "0008_google_onboarding"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql = Path(__file__).with_suffix(".sql").read_text(encoding="utf-8")
    if op.get_context().as_sql:
        op.execute(sql)
    else:
        with op.get_bind().connection.driver_connection.cursor() as cursor:
            cursor.execute(sql)


def downgrade() -> None:
    raise RuntimeError(
        "Demonstration rows may have been edited. Use a reviewed data migration to remove them."
    )
