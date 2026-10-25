"""Separate harvest and system notifications for account preferences."""

from alembic import op

revision = "0006_alert_categories"
down_revision = "0005_profile_race"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE public.alerts ADD COLUMN category text NOT NULL DEFAULT 'system' CHECK (category IN ('system','harvest'))"
    )
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.drop_column("alerts", "category")
