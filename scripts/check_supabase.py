"""Read-only anonymous REST availability check; never print users or credentials."""

import httpx

from app.config import settings


def main() -> int:
    if not settings.supabase_url or not settings.supabase_anon_key:
        print("Set SUPABASE_URL and SUPABASE_ANON_KEY in the root .env. See SETUP.md.")
        return 1
    try:
        response = httpx.get(
            settings.supabase_url.rstrip("/") + "/rest/v1/users",
            params={"select": "id", "limit": "0"},
            headers={"apikey": settings.supabase_anon_key},
            timeout=10,
        )
        print("Anonymous REST availability HTTP status:", response.status_code)
        print("An anonymous 401/403 can be expected with restricted table access; this does not test authenticated RLS.")
        return 0 if response.status_code in (200, 401, 403) else 1
    except httpx.HTTPError:
        print("Cannot reach Supabase REST. Check project settings and network access.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
