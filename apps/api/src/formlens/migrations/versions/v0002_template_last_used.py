"""Add `templates.last_used_at`: when the newest extraction with the template was created.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-18

The column is nullable (a template nobody used has no date). Existing rows are filled from the extractions
still stored, so a template keeps the date of its newest extraction across the upgrade.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the column and fill it from the extractions."""
    with op.batch_alter_table("templates") as batch:
        batch.add_column(sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        "UPDATE templates SET last_used_at = "
        "(SELECT MAX(extractions.created_at) FROM extractions WHERE extractions.template_id = templates.id)"
    )


def downgrade() -> None:
    """Drop the column."""
    with op.batch_alter_table("templates") as batch:
        batch.drop_column("last_used_at")
