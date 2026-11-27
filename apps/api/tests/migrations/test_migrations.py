"""The migrations: they run on a real file, undo themselves, and describe exactly the models."""

import json
import logging
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import CheckConstraint, inspect, text
from sqlalchemy.exc import IntegrityError

import formlens.templates.tables  # noqa: F401  # registers its tables on Base.metadata for the comparison
from formlens.database import Base, Database
from formlens.extractions.adapters.sqlite_repository import SqliteExtractionRepository
from formlens.extractions.adapters.tables import ExtractionRow
from formlens.extractions.domain.model import FAILURE_MESSAGES, ExtractionStatus, FailureReason
from formlens.logging_config import configure_logging
from formlens.migrations import (
    SCRIPT_LOCATION,
    DatabaseNotAtHead,
    assert_at_head,
    current_revision,
    downgrade_to_base,
    head_revision,
    upgrade_to_head,
)
from formlens.templates.repository import SqliteTemplateRepository
from tests.conftest import make_settings


@pytest.fixture
def url(tmp_path: Path) -> str:
    return f"sqlite:///{tmp_path / 'migrated.db'}"


@pytest.fixture
def database(url: str) -> Iterator[Database]:
    db = Database(url)
    yield db
    db.dispose()


def table_names(database: Database) -> set[str]:
    return set(inspect(database.engine).get_table_names())


def test_a_new_database_is_upgraded_to_the_head_revision(url: str, database: Database) -> None:
    upgrade_to_head(url)

    assert current_revision(database.engine) == head_revision()
    assert {"alembic_version", "templates", "extractions", "extraction_inputs"} <= table_names(database)


def test_upgrading_twice_changes_nothing(url: str, database: Database) -> None:
    upgrade_to_head(url)
    upgrade_to_head(url)

    assert current_revision(database.engine) == head_revision()


def test_downgrading_to_base_removes_every_table_of_the_models(url: str, database: Database) -> None:
    upgrade_to_head(url)

    downgrade_to_base(url)

    assert table_names(database) == {"alembic_version"}
    assert current_revision(database.engine) is None


def test_upgrade_after_a_downgrade_restores_the_schema(url: str, database: Database) -> None:
    upgrade_to_head(url)
    created = table_names(database)
    downgrade_to_base(url)

    upgrade_to_head(url)

    assert table_names(database) == created


def test_the_migrated_schema_matches_the_models_exactly(url: str, database: Database) -> None:
    """A model changed without a migration (or the reverse) shows up as a difference here."""
    upgrade_to_head(url)

    with database.engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True, "render_as_batch": True})
        differences = compare_metadata(context, Base.metadata)

    assert differences == []


def test_the_service_check_refuses_an_empty_database(url: str, database: Database) -> None:
    with pytest.raises(DatabaseNotAtHead, match="none"):
        assert_at_head(database)


def test_the_service_check_accepts_a_migrated_database(url: str, database: Database) -> None:
    upgrade_to_head(url)

    assert_at_head(database)


def test_the_service_check_refuses_a_database_behind_the_code(url: str, database: Database) -> None:
    upgrade_to_head(url)
    downgrade_to_base(url)

    with pytest.raises(DatabaseNotAtHead) as raised:
        assert_at_head(database)

    assert raised.value.current is None
    assert raised.value.head == head_revision()


def test_a_migration_leaves_the_logging_of_the_application_alone(url: str) -> None:
    """`fileConfig` would replace every handler; the migration must keep the one `configure_logging` set."""
    configure_logging(make_settings(log_format="json"))
    before = list(logging.getLogger().handlers)

    upgrade_to_head(url)

    assert logging.getLogger().handlers == before


# --- 0002: templates.last_used_at ------------------------------------------------------------------


def migrate(url: str, revision: str, *, down: bool = False) -> None:
    """Upgrade or downgrade to one revision; the package only offers `head` and `base`."""
    config = Config()
    config.set_main_option("script_location", SCRIPT_LOCATION)
    config.attributes["url"] = url
    (command.downgrade if down else command.upgrade)(config, revision)


def template_columns(database: Database) -> set[str]:
    return {column["name"] for column in inspect(database.engine).get_columns("templates")}


def insert_template(database: Database, template_id: UUID, name: str) -> None:
    with database.engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO templates (id, name, description, version, fields, created_at, updated_at) "
                "VALUES (:id, :name, '', 1, :fields, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000')"
            ),
            {"id": template_id.hex, "name": name, "fields": json.dumps([{"name": "a", "type": "text"}])},
        )


def insert_extraction(database: Database, extraction_id: UUID, template_id: UUID, created_at: str) -> None:
    with database.engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO extractions (id, template_id, template_version, template_name, template_fields, "
                "template_schema, status, attempts, created_at) "
                "VALUES (:id, :template_id, 1, 'T', '[]', '{}', 'pending', 0, :created_at)"
            ),
            {"id": extraction_id.hex, "template_id": template_id.hex, "created_at": created_at},
        )


def test_upgrading_fills_last_used_at_with_the_newest_extraction_of_each_template(url: str, database: Database) -> None:
    used, unused = UUID(int=1), UUID(int=2)
    migrate(url, "0001")
    insert_template(database, used, "Used")
    insert_template(database, unused, "Unused")
    insert_extraction(database, UUID(int=11), used, "2026-03-01 09:00:00.000000")
    insert_extraction(database, UUID(int=12), used, "2026-03-02 10:30:00.250000")  # the newest
    insert_extraction(database, UUID(int=13), used, "2026-03-01 23:59:59.000000")
    assert "last_used_at" not in template_columns(database)

    upgrade_to_head(url)

    repository = SqliteTemplateRepository(database)
    assert (found := repository.get(used)) is not None
    assert found.last_used_at == datetime(2026, 3, 2, 10, 30, 0, 250000, tzinfo=UTC)
    assert (found := repository.get(unused)) is not None
    assert found.last_used_at is None


def test_downgrading_to_0001_drops_last_used_at_and_keeps_the_templates(url: str, database: Database) -> None:
    upgrade_to_head(url)
    insert_template(database, UUID(int=1), "Kept")
    assert "last_used_at" in template_columns(database)

    migrate(url, "0001", down=True)

    assert current_revision(database.engine) == "0001"
    assert "last_used_at" not in template_columns(database)
    with database.engine.connect() as connection:
        assert connection.execute(text("SELECT name FROM templates")).scalars().all() == ["Kept"]


def test_the_backfill_gives_each_template_its_own_newest_extraction_and_survives_a_round_trip(
    url: str, database: Database
) -> None:
    first, second, unused = UUID(int=1), UUID(int=2), UUID(int=3)
    migrate(url, "0001")
    for template_id, name in ((first, "First"), (second, "Second"), (unused, "Unused")):
        insert_template(database, template_id, name)
    insert_extraction(database, UUID(int=11), first, "2026-03-05 08:00:00.000000")
    insert_extraction(database, UUID(int=12), second, "2026-03-09 08:00:00.000000")  # newer, but not the first's
    insert_extraction(database, UUID(int=13), first, "2026-03-01 08:00:00.000000")
    insert_extraction(database, UUID(int=14), second, "2026-03-02 08:00:00.000000")

    upgrade_to_head(url)
    migrate(url, "0001", down=True)
    upgrade_to_head(url)

    repository = SqliteTemplateRepository(database)
    found = {template_id: repository.get(template_id) for template_id in (first, second, unused)}
    assert {key: value.last_used_at for key, value in found.items() if value is not None} == {
        first: datetime(2026, 3, 5, 8, 0, tzinfo=UTC),
        second: datetime(2026, 3, 9, 8, 0, tzinfo=UTC),
        unused: None,
    }
    assert current_revision(database.engine) == head_revision()


def test_a_backfilled_date_keeps_its_microseconds_and_reads_back_as_utc(url: str, database: Database) -> None:
    migrate(url, "0001")
    insert_template(database, UUID(int=1), "Used")
    insert_extraction(database, UUID(int=11), UUID(int=1), "2026-03-05 08:00:00.500000")

    upgrade_to_head(url)

    listed = SqliteTemplateRepository(database).page(limit=10, offset=0)[0]
    assert [item.last_used_at for item in listed] == [datetime(2026, 3, 5, 8, 0, 0, 500000, tzinfo=UTC)]


# --- 0003: extractions.filename and the status `cancelled` ------------------------------------------

UPLOAD = b"%PDF-1.7 waiting upload"


def insert_upload(database: Database, extraction_id: UUID) -> None:
    with database.engine.begin() as connection:
        connection.execute(
            text("INSERT INTO extraction_inputs (extraction_id, content) VALUES (:id, :content)"),
            {"id": extraction_id.hex, "content": UPLOAD},
        )


def set_status(database: Database, extraction_id: UUID, status: str) -> None:
    with database.engine.begin() as connection:
        connection.execute(
            text("UPDATE extractions SET status = :status WHERE id = :id"), {"status": status, "id": extraction_id.hex}
        )


def set_attempts(database: Database, extraction_id: UUID, attempts: int) -> None:
    with database.engine.begin() as connection:
        connection.execute(
            text("UPDATE extractions SET attempts = :attempts WHERE id = :id"),
            {"attempts": attempts, "id": extraction_id.hex},
        )


def extraction_sql(database: Database) -> str:
    with database.engine.connect() as connection:
        sql: str = connection.execute(
            text("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'extractions'")
        ).scalar_one()
    return sql


def extraction_columns(database: Database) -> set[str]:
    return {column["name"] for column in inspect(database.engine).get_columns("extractions")}


def at_0002_with_a_waiting_job(url: str, database: Database) -> UUID:
    """A database at 0002 holding a pending extraction with its upload; returns the extraction's id."""
    migrate(url, "0002")
    job = UUID(int=21)
    insert_extraction(database, job, UUID(int=1), "2026-03-01 09:00:00.000000")
    insert_upload(database, job)
    return job


def test_upgrading_to_0003_keeps_the_rows_and_uploads_of_0002_with_no_file_name(url: str, database: Database) -> None:
    job = at_0002_with_a_waiting_job(url, database)

    migrate(url, "0003")

    repository = SqliteExtractionRepository(database)
    found = repository.get(job)
    assert found is not None
    assert (found.status, found.filename) == (ExtractionStatus.PENDING, None)
    assert repository.read_input(job) == UPLOAD  # the rebuild's cascade did not delete it


def test_after_0003_cancelled_is_accepted_and_an_unknown_status_is_refused(url: str, database: Database) -> None:
    job = at_0002_with_a_waiting_job(url, database)
    migrate(url, "0003")

    set_status(database, job, "cancelled")

    with pytest.raises(IntegrityError, match="ck_extractions_status_known"):
        set_status(database, job, "bogus")
    with pytest.raises(IntegrityError, match="ck_extractions_attempts_not_negative"):
        set_attempts(database, job, -1)


def test_0003_keeps_the_indexes_and_the_cascade_of_the_uploads(url: str, database: Database) -> None:
    job = at_0002_with_a_waiting_job(url, database)
    migrate(url, "0003")

    with database.engine.begin() as connection:
        connection.execute(text("DELETE FROM extractions WHERE id = :id"), {"id": job.hex})

    assert SqliteExtractionRepository(database).read_input(job) is None
    assert {index["name"] for index in inspect(database.engine).get_indexes("extractions")} == {
        "ix_extractions_status_created_at_id",
        "ix_extractions_finished_at",
    }
    assert extraction_sql(database).count("CHECK") == 2


def test_the_check_of_0003_is_the_one_the_model_declares(url: str, database: Database) -> None:
    upgrade_to_head(url)

    declared = next(
        constraint
        for constraint in Base.metadata.tables[ExtractionRow.__tablename__].constraints
        if isinstance(constraint, CheckConstraint) and constraint.name == "ck_extractions_status_known"
    )
    assert f"CONSTRAINT ck_extractions_status_known CHECK ({declared.sqltext})" in extraction_sql(database)


def test_downgrading_0003_turns_a_cancelled_extraction_into_failed_as_interrupted(url: str, database: Database) -> None:
    job = at_0002_with_a_waiting_job(url, database)
    cancelled, completed = UUID(int=22), UUID(int=23)
    insert_extraction(database, cancelled, UUID(int=1), "2026-03-01 10:00:00.000000")
    insert_extraction(database, completed, UUID(int=1), "2026-03-01 11:00:00.000000")
    migrate(url, "0003")
    set_status(database, cancelled, "cancelled")
    set_status(database, completed, "completed")

    migrate(url, "0002", down=True)

    assert current_revision(database.engine) == "0002"
    assert "filename" not in extraction_columns(database)
    with database.engine.connect() as connection:
        rows = connection.execute(
            text("SELECT id, status, error_reason, error_message FROM extractions ORDER BY id")
        ).all()
        upload = connection.execute(text("SELECT content FROM extraction_inputs")).scalar_one()
    assert [tuple(row[1:]) for row in rows] == [
        ("pending", None, None),
        ("failed", "interrupted", FAILURE_MESSAGES[FailureReason.INTERRUPTED]),
        ("completed", None, None),
    ]
    assert upload == UPLOAD
    with pytest.raises(IntegrityError, match="ck_extractions_status_known"):
        set_status(database, job, "cancelled")
