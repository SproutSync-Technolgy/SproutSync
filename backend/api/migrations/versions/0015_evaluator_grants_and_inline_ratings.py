"""Multi-Evaluator Persistence, Operator-Scoped Batch Visibility & 1-Click Inline Gold Star Ratings."""

from pathlib import Path

from alembic import op

revision = "0015_evaluator_grants_and_inline_ratings"
down_revision = "0014_wireless_discovery"
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
    drop function if exists public.rate_batch_inline(integer, integer, text);
    drop policy if exists evaluator_update on public.evaluations;
    drop policy if exists visible_evaluations on public.evaluations;
    alter table public.evaluations drop constraint if exists evaluations_evaluator_batch_unique;
    alter table public.evaluations drop constraint if exists evaluations_comments_check;
    alter table public.evaluations add constraint evaluations_comments_check check (length(comments) between 1 and 4000);
    drop trigger if exists trg_sync_user_evaluator_grants on public.users;
    drop function if exists public.sync_user_evaluator_grants();
    drop trigger if exists trg_sync_evaluator_access_identity on public.evaluator_access;
    drop function if exists public.sync_evaluator_access_identity();
    alter table public.evaluator_access drop constraint if exists evaluator_access_owner_email_unique;
    NOTIFY pgrst, 'reload schema';
    """)

