# Supabase public-table security review

Reviewed and applied on 11 November 2026 for the configured SproutSync project.

The warning in the 8 November email was reproducible: `public.alembic_version`
had row-level security disabled and default grants allowed anonymous and signed-in
clients to read and change its migration stamp. This table holds migration
metadata. The other 17 public tables already had RLS enabled. This inspection
does not establish whether anyone previously accessed or changed data.

Migration `0021_internal_table_security` enables RLS on `alembic_version` and
revokes table and column privileges from `PUBLIC`, `anon` and `authenticated`.
It deliberately creates no client policy for internal migration metadata. The
trusted PostgreSQL owner still reads and updates the stamp, so Alembic continues
to work. No business records are deleted or rewritten.

The review also found default grants on `access_requests`, including unnecessary
client writes and `TRUNCATE`. Its RLS was already enabled, but RLS does not govern
`TRUNCATE`. The migration removes those grants and client access to its sequence.
Authenticated clients retain `SELECT`, filtered by the existing participant and
superadmin policy. Request changes continue through the authorized backend; the
existing request-submission RPC also retains its trusted-owner access.

This uses the separate grant and RLS controls described in
[Supabase's Data API security guide](https://supabase.com/docs/guides/api/securing-your-api).
The [Security Advisor](https://supabase.com/docs/guides/observability/advisors)
can be rerun in the dashboard to refresh the emailed finding. The old email
itself will not change. This review checks the reported condition and affected
access paths; it is not a complete audit of every Supabase service or RPC.

## Verification and repeatable checks

From the repository root in PowerShell:

```powershell
$env:PYTHONPATH = 'backend/api'
& backend/api/.venv/Scripts/python.exe scripts/verify_database_security.py --http
& backend/api/.venv/Scripts/python.exe scripts/verify_workspace_rls.py
& backend/api/.venv/Scripts/python.exe scripts/verify_workspace_search.py
```

The security verifier checks public tables for disabled RLS, forbidden metadata
and request-write privileges, client sequence access and public-table truncate
grants. It tests real anonymous/authenticated PostgreSQL roles, trusted migration
stamp updates, request submission, owner isolation, the current FastAPI approval
handler and the resulting evaluator grant. All synthetic fixtures and test
updates are rolled back. `--http` additionally checks actual anonymous Data API
requests for permission denial without displaying client keys. Run `--pending`
instead before applying revision 0021 to test its DDL inside the same rollback-only
transaction; it cannot be combined with the installed HTTP check.

One unrelated legacy SQL-only path was found during validation:
`operator_approve_request(integer)` still refers to an `evaluator_id` uniqueness
constraint removed by migration 0015. Current clients approve through FastAPI,
which is the path verified here. Repair or retire that legacy RPC before reusing
it; this permissions migration does not modify its behavior.

The migration uses a five-second lock timeout so deployment fails rather than
waiting indefinitely behind another transaction. Its downgrade intentionally
retains these protections: restoring anonymous access is not a safe rollback.
Application schema and records remain compatible with revision 0020. Future
public-table migrations must explicitly define grants and RLS; rerun the checks
after adding tables or changing permissions.
