"""Add `extractions.filename` and the status `cancelled`.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-26

The file name is nullable: an extraction stored before this revision has none. SQLite cannot change a CHECK in
place, so the `status_known` CHECK is replaced by a batch rebuild of `extractions` (copy, drop, rename). The
migration runs with `PRAGMA foreign_keys=ON` (it cannot be turned off inside the transaction), and dropping the
old table would cascade into `extraction_inputs` and delete the uploads of every job that still waits. The
uploads are copied aside before the rebuild and put back after it.

On downgrade a `cancelled` extraction becomes `failed` with the reason `interrupted`, the nearest state 0002 knows:
it ended without a result.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CHECK = "ck_extractions_status_known"
_STATUSES_0002 = "status IN ('pending', 'running', 'completed', 'failed')"
_STATUSES_0003 = "status IN ('pending', 'running', 'completed', 'failed', 'cancelled')"
# The fixed message of `interrupted` in the domain, written out: a migration never imports the code it migrates.
_INTERRUPTED_MESSAGE = "The service stopped before the extraction finished."


def _save_inputs() -> None:
    op.execute("CREATE TEMP TABLE v0003_saved_inputs AS SELECT extraction_id, content FROM extraction_inputs")


def _restore_inputs() -> None:
    """Put back the uploads the rebuild's cascade deleted; one it left in place is not inserted twice."""
    op.execute(
        "INSERT INTO extraction_inputs (extraction_id, content) SELECT extraction_id, content FROM v0003_saved_inputs "
        "WHERE extraction_id NOT IN (SELECT extraction_id FROM extraction_inputs)"
    )
    op.execute("DROP TABLE v0003_saved_inputs")


def upgrade() -> None:
    """Add the column and accept `cancelled`, in one rebuild; the uploads of waiting jobs survive it."""
    _save_inputs()
    with op.batch_alter_table("extractions") as batch:
        batch.add_column(sa.Column("filename", sa.String(length=255), nullable=True))
        batch.drop_constraint(op.f(_CHECK), type_="check")
        batch.create_check_constraint(op.f(_CHECK), _STATUSES_0003)
    _restore_inputs()


def downgrade() -> None:
    """Turn `cancelled` into `failed` as `interrupted`, then drop the column and narrow the CHECK."""
    op.execute(
        sa.text(
            "UPDATE extractions SET status = 'failed', error_reason = 'interrupted', error_message = :message "
            "WHERE status = 'cancelled'"
        ).bindparams(message=_INTERRUPTED_MESSAGE)
    )
    _save_inputs()
    with op.batch_alter_table("extractions") as batch:
        batch.drop_column("filename")
        batch.drop_constraint(op.f(_CHECK), type_="check")
        batch.create_check_constraint(op.f(_CHECK), _STATUSES_0002)
    _restore_inputs()
