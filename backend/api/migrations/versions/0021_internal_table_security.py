"""Protect migration metadata and restrict access-request writes to trusted code."""

from alembic import op

revision = "0021_internal_table_security"
down_revision = "0020_workspace_search"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # RLS alone does not restrict TRUNCATE or sequence access. Revoke the
    # inherited Supabase default grants as well; the postgres owner keeps
    # migration access and the existing SECURITY DEFINER request RPCs still work.
    op.execute("""
        set local lock_timeout = '5s';
        alter table public.alembic_version enable row level security;
        revoke all privileges on table public.alembic_version
            from public, anon, authenticated;
        revoke all privileges (version_num) on public.alembic_version
            from public, anon, authenticated;

        revoke all privileges on table public.access_requests
            from public, anon, authenticated;
        revoke all privileges (id, evaluator_id, operator_id, status, created_at, decided_at)
            on public.access_requests from public, anon, authenticated;
        grant select on public.access_requests to authenticated;
        revoke all privileges on sequence public.access_requests_id_seq
            from public, anon, authenticated;
        notify pgrst, 'reload schema';
    """)


def downgrade() -> None:
    # Schema/data remain compatible with 0020. A downgrade must not restore
    # anonymous access to migration stamps or bypass the request workflow.
    pass
