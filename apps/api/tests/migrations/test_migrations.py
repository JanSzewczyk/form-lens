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
from sqlalchemy import inspect, text

import formlens.extractions.adapters.tables  # registers its tables on Base.metadata for the comparison
import formlens.templates.tables  # noqa: F401
from formlens.database import Base, Database
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
