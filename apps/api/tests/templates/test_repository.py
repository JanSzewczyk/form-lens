"""The SQLite template repository: the search and the last-used date, on a real database file."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

import pytest
from sqlalchemy.exc import StatementError

from formlens.database import Database
from formlens.templates.repository import SqliteTemplateRepository
from tests.templates.factories import NOW, TemplateDraftFactory, TemplateFactory

USED_AT = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def repository(db_url: str) -> Iterator[SqliteTemplateRepository]:
    database = Database(db_url)
    yield SqliteTemplateRepository(database)
    database.dispose()


def add_named(repository: SqliteTemplateRepository, *names: str) -> list[UUID]:
    """Store one template per name, created one minute apart so the order is the order of the names."""
    ids = []
    for index, name in enumerate(names, start=1):
        created = NOW + timedelta(minutes=index)
        repository.add(TemplateFactory.build(id=UUID(int=index), name=name, created_at=created, updated_at=created))
        ids.append(UUID(int=index))
    return ids


def test_a_new_template_has_no_last_used_date(repository: SqliteTemplateRepository) -> None:
    [template_id] = add_named(repository, "Invoice")

    template = repository.get(template_id)

    assert template is not None
    assert template.last_used_at is None


def test_marking_a_template_used_stores_the_time_as_utc(repository: SqliteTemplateRepository) -> None:
    [template_id] = add_named(repository, "Invoice")

    repository.mark_used(template_id, USED_AT)

    template = repository.get(template_id)
    assert template is not None
    assert template.last_used_at == USED_AT
    assert template.last_used_at.utcoffset() == timedelta(0)


def test_marking_a_template_used_leaves_the_other_templates_alone(repository: SqliteTemplateRepository) -> None:
    first, second = add_named(repository, "Invoice", "Lease")

    repository.mark_used(first, USED_AT)

    other = repository.get(second)
    assert other is not None
    assert other.last_used_at is None


def test_an_earlier_use_does_not_move_the_date_back(repository: SqliteTemplateRepository) -> None:
    """Two submissions may mark in either order; the newest extraction's time must stay."""
    [template_id] = add_named(repository, "Invoice")
    repository.mark_used(template_id, USED_AT)

    repository.mark_used(template_id, USED_AT - timedelta(seconds=1))
    repository.mark_used(template_id, USED_AT + timedelta(seconds=1))
    repository.mark_used(template_id, USED_AT)

    template = repository.get(template_id)
    assert template is not None
    assert template.last_used_at == USED_AT + timedelta(seconds=1)


def test_a_use_is_compared_in_utc_whatever_the_offset_it_is_given_in(repository: SqliteTemplateRepository) -> None:
    [template_id] = add_named(repository, "Invoice")
    plus_two = timezone(timedelta(hours=2))
    repository.mark_used(template_id, USED_AT)  # 12:00 UTC

    repository.mark_used(template_id, datetime(2026, 3, 1, 13, 30, tzinfo=plus_two))  # 11:30 UTC: earlier, ignored
    kept = repository.get(template_id)
    repository.mark_used(template_id, datetime(2026, 3, 1, 14, 30, tzinfo=plus_two))  # 12:30 UTC: later, stored

    assert kept is not None
    assert kept.last_used_at == USED_AT
    moved = repository.get(template_id)
    assert moved is not None
    assert moved.last_used_at == datetime(2026, 3, 1, 12, 30, tzinfo=UTC)
    assert moved.last_used_at.utcoffset() == timedelta(0)


def test_a_naive_time_is_refused_and_the_stored_date_stays(repository: SqliteTemplateRepository) -> None:
    [template_id] = add_named(repository, "Invoice")
    repository.mark_used(template_id, USED_AT)

    with pytest.raises(StatementError, match="naive datetime"):
        repository.mark_used(template_id, datetime(2027, 1, 1, 0, 0))  # noqa: DTZ001

    template = repository.get(template_id)
    assert template is not None
    assert template.last_used_at == USED_AT


def test_marking_a_missing_template_changes_nothing(repository: SqliteTemplateRepository) -> None:
    [template_id] = add_named(repository, "Invoice")

    repository.mark_used(UUID(int=999), USED_AT)

    templates, total = repository.page(limit=10, offset=0)
    assert total == 1
    assert [(item.id, item.last_used_at) for item in templates] == [(template_id, None)]


def test_marking_a_deleted_template_is_a_no_op_and_does_not_bring_it_back(
    repository: SqliteTemplateRepository,
) -> None:
    [template_id] = add_named(repository, "Invoice")
    assert repository.delete(template_id)

    repository.mark_used(template_id, USED_AT)

    assert repository.get(template_id) is None
    assert repository.page(limit=10, offset=0) == ([], 0)


def test_replacing_a_template_keeps_its_last_used_date(repository: SqliteTemplateRepository) -> None:
    [template_id] = add_named(repository, "Before")
    repository.mark_used(template_id, USED_AT)

    replaced = repository.replace(template_id, TemplateDraftFactory.build(name="After"), NOW + timedelta(days=1))

    assert replaced is not None
    assert (replaced.name, replaced.last_used_at) == ("After", USED_AT)


def test_a_search_keeps_the_names_that_contain_the_text_whatever_its_case(
    repository: SqliteTemplateRepository,
) -> None:
    add_named(repository, "VAT INVOICE", "Lease", "Pro-Inv 2")

    found, total = repository.page(search="inv", limit=10, offset=0)

    assert ([item.name for item in found], total) == (["VAT INVOICE", "Pro-Inv 2"], 2)


@pytest.mark.parametrize(
    ("search", "expected"),
    [("%", {"50% off"}), ("_", {"a_b"}), ("\\", {"a\\b"}), ("a_b", {"a_b"}), ("%%", set()), ("\\%", set())],
    ids=["percent", "underscore", "backslash", "underscore-inside-text", "two-percents", "backslash-then-percent"],
)
def test_a_search_takes_like_wildcards_and_the_escape_character_literally(
    repository: SqliteTemplateRepository, search: str, expected: set[str]
) -> None:
    add_named(repository, "50% off", "50 off", "a_b", "axb", "a\\b", "ab")

    found, total = repository.page(search=search, limit=10, offset=0)

    assert {item.name for item in found} == expected
    assert total == len(expected)


def test_the_total_of_a_search_counts_the_matches_beyond_the_page(repository: SqliteTemplateRepository) -> None:
    add_named(repository, "Invoice 1", "Lease", "Invoice 2", "Invoice 3")

    found, total = repository.page(search="invoice", limit=1, offset=1)

    assert ([item.name for item in found], total) == (["Invoice 2"], 3)
