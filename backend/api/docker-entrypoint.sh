#!/bin/sh
set -eu

# Apply reviewed schema changes before serving requests.
python -m app.check_setup
alembic upgrade head
# The MQTT bridge/cache belongs to this process; do not inherit a host's
# WEB_CONCURRENCY setting and accidentally create competing subscribers.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
