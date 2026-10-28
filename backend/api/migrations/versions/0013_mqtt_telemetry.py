"""Bind granted devices to MQTT and persist live sensor packets."""

from pathlib import Path

from alembic import op

revision = "0013_mqtt_telemetry"
down_revision = "0012_role_hierarchy_access_requests"
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
    # Preserve collected telemetry. Roll back the application before removing bindings.
    op.execute("""
    drop trigger device_connection_guard on public.devices;
    drop function public.guard_device_connection();
    alter table public.devices drop column connection_requested_at;
    alter table public.devices drop column mqtt_topic_prefix;
    drop index public.telemetry_device_recent;
    alter table public.telemetry_readings drop constraint telemetry_device_message_unique;
    alter table public.telemetry_readings drop column message_id;
    alter table public.telemetry_readings drop column sensor_status;
    alter table public.telemetry_readings drop column sd_ok;
    alter table public.telemetry_readings drop column voltage;
    alter table public.telemetry_readings drop column received_at;
    NOTIFY pgrst, 'reload schema';
    """)
