"""Check the hosted mobile redirect using an anonymous OAuth authorization.

Never follows Google, signs in, sends mail, or prints OAuth state/session values.
Run again after saving Supabase Authentication > URL Configuration.
"""

import base64
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit, urlunsplit
from uuid import UUID

import httpx
from sqlalchemy import create_engine, text

CALLBACK = "io.sproutsync.app://login-callback/"


def main():
    """Report the actual hosted callback without accessing private credentials."""
    settings = {}
    root = Path(__file__).resolve().parents[1]
    for line in (root / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            settings[key.strip()] = value.strip().strip('"').strip("'")
    base = settings.get("SUPABASE_URL") or settings.get("VITE_SUPABASE_URL")
    key = settings.get("SUPABASE_ANON_KEY") or settings.get("VITE_SUPABASE_ANON_KEY")
    if not base or not key or urlsplit(base).scheme != "https":
        raise SystemExit("Configure the public hosted Supabase URL and client key.")
    with httpx.Client(follow_redirects=False, timeout=30) as client:
        response = client.get(
            base.rstrip("/") + "/auth/v1/authorize",
            headers={"apikey": key},
            params={"provider": "google", "redirect_to": CALLBACK},
        )
        if response.status_code not in (302, 303):
            raise SystemExit(
                f"Could not start redirect check (HTTP {response.status_code})."
            )
        provider_url = urlsplit(response.headers.get("location", ""))
        state = parse_qs(provider_url.query).get("state", [None])[0]
        if provider_url.hostname != "accounts.google.com" or not state:
            raise SystemExit(
                "Google provider did not return the expected authorization URL."
            )
    # Read only the redirect stored for this check's own state. OAuth errors can
    # fall back to Site URL on some Auth versions, even with a valid allowlist.
    if len(state.split(".")) == 3:
        claims = json.loads(base64.urlsafe_b64decode(state.split(".")[1] + "==="))
        referrer = claims.get("referrer")
    else:
        flow_id = str(UUID(state))
        database_url = settings.get("DATABASE_URL")
        if not database_url:
            raise SystemExit(
                "DATABASE_URL is needed to inspect this check's opaque OAuth state."
            )
        engine = create_engine(database_url, connect_args={"connect_timeout": 10})
        try:
            with engine.connect() as connection, connection.begin():
                connection.execute(text("SET TRANSACTION READ ONLY"))
                referrer = connection.execute(
                    text("SELECT referrer FROM auth.flow_state WHERE id = :id"),
                    {"id": flow_id},
                ).scalar_one_or_none()
        finally:
            engine.dispose()
    if not referrer:
        raise SystemExit(
            "Auth did not expose a referrer for this check; inspect the project's redirect allowlist."
        )
    location = urlsplit(referrer)
    actual = urlunsplit((location.scheme, location.netloc, location.path, "", ""))
    if not actual:
        raise SystemExit(
            "Auth returned an empty callback; inspect the project's redirect allowlist."
        )
    print("Requested mobile callback:", CALLBACK)
    print("Actual hosted callback:  ", actual)
    if actual != CALLBACK:
        print(
            "FAIL: Add the exact requested callback to Supabase Auth > URL Configuration > Redirect URLs."
        )
        raise SystemExit(1)
    print(
        "PASS: Hosted Auth accepts the mobile callback. No Google login or email was sent."
    )


if __name__ == "__main__":
    main()
