"""Support existing descriptive revision IDs without renaming migration history."""

import sqlalchemy as sa
from alembic.ddl.postgresql import PostgresqlImpl

REVISION_LENGTH = 64


class SproutSyncPostgresqlImpl(PostgresqlImpl):
    """Use Alembic's public version-table hook for new installations and SQL exports."""

    __dialect__ = "postgresql"

    def version_table_impl(self, **kwargs) -> sa.Table:
        table = super().version_table_impl(**kwargs)
        table.c.version_num.type = sa.String(REVISION_LENGTH)
        return table


def widen_existing_version_table(connection: sa.Connection) -> None:
    """Preserve existing stamps while allowing revisions longer than 32 characters."""
    inspector = sa.inspect(connection)
    if not inspector.has_table("alembic_version"):
        return
    column = next(
        c
        for c in inspector.get_columns("alembic_version")
        if c["name"] == "version_num"
    )
    length = getattr(column["type"], "length", None)
    if length is not None and length < REVISION_LENGTH:
        connection.execute(
            sa.text(
                f"ALTER TABLE alembic_version ALTER COLUMN version_num TYPE varchar({REVISION_LENGTH})"
            )
        )
