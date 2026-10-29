"""Keep discovered-device telemetry tied to its advertised serial."""

from alembic import op

revision = "0014_wireless_discovery"
down_revision = "0013_mqtt_telemetry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    alter table public.devices add column requires_serial_number boolean not null default false;
    NOTIFY pgrst, 'reload schema';
    """)


def downgrade() -> None:
    op.execute("""
    alter table public.devices drop column requires_serial_number;
    NOTIFY pgrst, 'reload schema';
    """)
