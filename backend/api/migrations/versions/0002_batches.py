"""Create the first grower batch table."""

import sqlalchemy as sa
from alembic import op

revision = "0002_batches"
down_revision = "0001_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create batches with ownership and lifecycle fields."""
    op.create_table(
        "batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("seed_type", sa.String(length=120), nullable=False, server_default="Mung beans"),
        sa.Column("seed_weight_grams", sa.Float(), nullable=True),
        sa.Column("stage", sa.String(length=32), nullable=False, server_default="soaking"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("target_harvest_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_batches_owner_id", "batches", ["owner_id"])
    op.create_index("ix_batches_code", "batches", ["code"])
    op.create_index("ix_batches_status", "batches", ["status"])


def downgrade() -> None:
    """Drop the batch table and its indexes."""
    op.drop_index("ix_batches_status", table_name="batches")
    op.drop_index("ix_batches_code", table_name="batches")
    op.drop_index("ix_batches_owner_id", table_name="batches")
    op.drop_table("batches")
