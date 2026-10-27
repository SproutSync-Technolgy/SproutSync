"""Superadmin role, device serial grants, strict evaluator scoping, and audit logs.

Revision ID: 0011_superadmin_device_grants_rbac
Revises: 0010_verification_attempts
"""

from pathlib import Path

from alembic import op

revision = "0011_superadmin_device_grants_rbac"
down_revision = "0010_verification_attempts"
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
    op.execute("""
    DROP TRIGGER IF EXISTS evaluator_access_audit ON public.evaluator_access;
    DROP FUNCTION IF EXISTS public.record_evaluator_access_activity();
    DROP FUNCTION IF EXISTS public.superadmin_revoke_serial(bigint);
    DROP FUNCTION IF EXISTS public.superadmin_grant_serial(integer, text, text);
    DROP FUNCTION IF EXISTS public.superadmin_update_account(integer, text, text, text, text, text);
    DROP FUNCTION IF EXISTS public.is_superadmin();
    ALTER TABLE public.evaluator_access DROP COLUMN IF EXISTS granted_at;
    ALTER TABLE public.evaluator_access DROP COLUMN IF EXISTS granted_by;
    ALTER TABLE public.devices DROP COLUMN IF EXISTS granted_at;
    ALTER TABLE public.devices DROP COLUMN IF EXISTS granted_by;
    NOTIFY pgrst, 'reload schema';
    """)
