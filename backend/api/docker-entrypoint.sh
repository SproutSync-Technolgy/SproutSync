#!/bin/sh
set -eu

# Apply reviewed schema changes before serving requests.
python -m app.check_setup
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
