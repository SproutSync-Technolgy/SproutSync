# Security

Never commit `.env` files, device credentials, private keys, user records, or
database backups. Use environment-specific secrets and rotate exposed credentials.

The current web/mobile clients use Supabase Auth and protected PostgREST/RPCs.
FastAPI verifies Supabase bearer tokens; database policies and API authorization
must enforce the same ownership and role boundaries. Google provider secrets
belong in Supabase Auth provider settings. Server-only database, SMTP, and optional
service-role credentials belong in the ignored root `.env` or deployment secrets.
Only public Supabase URL/client keys belong in `VITE_` variables or mobile builds.

Schema changes run through Alembic, not public HTTP repair endpoints or automatic
account-verification changes at API startup. Back up shared data before upgrading.
Bind development services to localhost. The optional MQTT service is anonymous
only in loopback development; production requires TLS, per-device credentials,
and ACLs. See [SETUP.md](SETUP.md).

Report vulnerabilities privately through the team's existing private channel.
Do not post credentials or exploit details in public issues. A formal security
contact remains a team setup task.
