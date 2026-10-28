"""Role hierarchy, access requests, single-operator evaluator linking, and identity audit.

Revision ID: 0012_role_hierarchy_access_requests
Revises: 0011_superadmin_device_grants_rbac
"""

from pathlib import Path

from alembic import op

revision = "0012_role_hierarchy_access_requests"
down_revision = "0011_superadmin_device_grants_rbac"
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
    DROP FUNCTION IF EXISTS public.superadmin_assign_evaluator(integer, integer);
    DROP FUNCTION IF EXISTS public.operator_update_evaluator(integer, text, text, text);
    DROP FUNCTION IF EXISTS public.operator_list_evaluators();
    DROP FUNCTION IF EXISTS public.operator_decline_request(integer);
    DROP FUNCTION IF EXISTS public.operator_approve_request(integer);
    DROP FUNCTION IF EXISTS public.request_operator_access(text);
    DROP TABLE IF EXISTS public.access_requests;
    ALTER TABLE public.evaluator_access DROP CONSTRAINT IF EXISTS evaluator_access_evaluator_id_key;
    ALTER TABLE public.evaluator_access DROP COLUMN IF EXISTS evaluator_id;
    ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'evaluator';
    NOTIFY pgrst, 'reload schema';
    """)

