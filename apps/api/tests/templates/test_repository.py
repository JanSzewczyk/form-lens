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


@pytest.mark.parametrize(
    ("search", "expected"),
    [
        ("\u0142\u00f3d\u017a", ["\u0141\u00f3d\u017a Faktura"]),
        ("\u0141\u00d3D\u0179", ["\u0141\u00f3d\u017a Faktura"]),
        ("\u0105\u0119", ["Zam\u00f3wienie \u0104\u0118"]),
        ("\u0104\u0118", ["Zam\u00f3wienie \u0104\u0118"]),
        ("faktura", ["\u0141\u00f3d\u017a Faktura"]),
        ("\u00df", ["Stra\u00dfe"]),
        ("strasse", ["Stra\u00dfe"]),
    ],
    ids=[
        "lower-search",
        "upper-search",
        "lower-search-pl",
        "upper-search-pl",
        "ascii-search",
        "sharp-s",
        "folded-sharp-s",
    ],
)
def test_a_search_ignores_the_case_of_letters_outside_ascii(
    repository: SqliteTemplateRepository, search: str, expected: list[str]
) -> None:
    add_named(repository, "\u0141\u00f3d\u017a Faktura", "Zam\u00f3wienie \u0104\u0118", "Stra\u00dfe", "Lease")

    found, total = repository.page(search=search, limit=10, offset=0)

    assert ([item.name for item in found], total) == (expected, len(expected))


def test_a_search_with_non_ascii_letters_takes_the_escape_character_literally(
    repository: SqliteTemplateRepository,
) -> None:
    add_named(repository, "\u0141\\\u00f3d\u017a", "\u0141\u00f3d\u017a", "\u0141%\u00f3d\u017a")

    backslash, backslash_total = repository.page(search="\u0142\\\u00d3", limit=10, offset=0)
    percent, percent_total = repository.page(search="\u0142%\u00d3", limit=10, offset=0)

    assert ([item.name for item in backslash], backslash_total) == (["\u0141\\\u00f3d\u017a"], 1)
    assert ([item.name for item in percent], percent_total) == (["\u0141%\u00f3d\u017a"], 1)


def test_an_empty_search_keeps_every_template_and_counts_them_all(repository: SqliteTemplateRepository) -> None:
    add_named(repository, "Invoice", "Lease", "\u0141\u00f3d\u017a")

    found, total = repository.page(search="", limit=2, offset=0)

    assert ([item.name for item in found], total) == (["Invoice", "Lease"], 3)


@pytest.mark.parametrize("search", ["\x00", "a\x00zzz", "inv\x00"], ids=["only-nul", "nul-inside", "nul-at-the-end"])
def test_a_search_with_a_nul_character_matches_nothing(repository: SqliteTemplateRepository, search: str) -> None:
    # A search cut at its NUL would be `%`, `%a` or `%inv`: it would match all, `Visa` or `Pro-inv`.
    add_named(repository, "Invoice", "Visa", "Pro-inv")

    found, total = repository.page(search=search, limit=10, offset=0)

    assert (found, total) == ([], 0)


@pytest.mark.parametrize(
    "search",
    ["%\x00", "\x00%", "_\x00", "\x00_", "\\\x00", "\x00\\%", "\u0142\x00", "\u0141\x00\u00f3"],
    ids=[
        "percent-nul",
        "nul-percent",
        "underscore-nul",
        "nul-underscore",
        "backslash-nul",
        "nul-backslash-percent",
        "non-ascii-nul",
        "non-ascii-around-nul",
    ],
)
def test_a_nul_next_to_a_wildcard_a_backslash_or_a_non_ascii_letter_matches_nothing(
    repository: SqliteTemplateRepository, search: str
) -> None:
    add_named(repository, "100% sure", "a_b", "back\\slash", "\u0141\u00f3d\u017a")

    found, total = repository.page(search=search, limit=10, offset=0)

    assert (found, total) == ([], 0)


@pytest.mark.parametrize(
    ("limit", "offset"), [(1, 0), (1, 1), (100, 0), (5, 1000)], ids=["first", "second", "wide", "past"]
)
def test_a_search_with_a_nul_returns_an_empty_page_and_a_zero_total_whatever_the_paging(
    repository: SqliteTemplateRepository, limit: int, offset: int
) -> None:
    add_named(repository, "Invoice", "Visa", "Pro-inv")

    found, total = repository.page(search="inv\x00", limit=limit, offset=offset)
    everything, everything_total = repository.page(search=None, limit=10, offset=0)

    assert (found, total) == ([], 0)
    assert ([item.name for item in everything], everything_total) == (["Invoice", "Visa", "Pro-inv"], 3)


@pytest.mark.parametrize(
    "search",
    ["\u039a\u039f\u03a3\u039c\u039f\u03a3", "\u03ba\u03bf\u03c3\u03bc\u03bf\u03c2"],
    ids=["upper-search-with-final-sigma", "lower-search-with-final-sigma-form"],
)
def test_a_search_treats_the_final_sigma_as_a_sigma(repository: SqliteTemplateRepository, search: str) -> None:
    # `str.lower()` writes the last capital sigma as a final sigma, so lowering would miss; casefold does not.
    add_named(repository, "\u03ba\u03bf\u03c3\u03bc\u03bf\u03c3", "Lease")

    found, total = repository.page(search=search, limit=10, offset=0)

    assert ([item.name for item in found], total) == (["\u03ba\u03bf\u03c3\u03bc\u03bf\u03c3"], 1)


@pytest.mark.parametrize(
    ("search", "expected"),
    [
        (" ", ["VAT invoice", "VAT  invoice", "VAT   invoice"]),
        ("  ", ["VAT  invoice", "VAT   invoice"]),
        ("   ", ["VAT   invoice"]),
        ("    ", []),
    ],
    ids=["one-space", "two-spaces", "three-spaces", "four-spaces"],
)
def test_a_search_of_only_spaces_is_not_trimmed_and_matches_the_names_with_that_run_of_spaces(
    repository: SqliteTemplateRepository, search: str, expected: list[str]
) -> None:
    add_named(repository, "Invoice", "VAT invoice", "VAT  invoice", "VAT   invoice")

    found, total = repository.page(search=search, limit=10, offset=0)

    assert ([item.name for item in found], total) == (expected, len(expected))


def test_a_search_for_a_plain_i_finds_a_dotted_capital_i_because_it_folds_to_i_and_a_dot(
    repository: SqliteTemplateRepository,
) -> None:
    add_named(repository, "Lease", "\u0130stanbul")

    found, total = repository.page(search="i", limit=10, offset=0)

    assert ([item.name for item in found], total) == (["\u0130stanbul"], 1)


@pytest.fixture
def second_database(db_url: str) -> Iterator[Database]:
    """Another engine, and so another pool, on the same file as `repository`."""
    database = Database(db_url)
    yield database
    database.dispose()


def test_a_search_finds_a_template_stored_through_another_engine_of_the_same_file(
    repository: SqliteTemplateRepository, second_database: Database
) -> None:
    add_named(repository, "Łódź Faktura", "Lease")

    found, total = SqliteTemplateRepository(second_database).page(search="ŁÓDŹ", limit=10, offset=0)

    assert ([item.name for item in found], total) == (["Łódź Faktura"], 1)


def test_the_folding_function_exists_on_every_connection_the_pool_opens(second_database: Database) -> None:
    repository = SqliteTemplateRepository(second_database)
    add_named(repository, "Łódź Faktura", "Lease")

    with second_database.engine.connect() as first, second_database.engine.connect() as second:
        # Both are checked out now, so the search below runs on a third physical connection.
        assert first.connection.dbapi_connection is not second.connection.dbapi_connection
        folded = [
            connection.exec_driver_sql("SELECT formlens_casefold(?)", ("ŁÓDŹ",)).scalar_one()
            for connection in (first, second)
        ]
        found, total = repository.page(search="łÓdŹ", limit=10, offset=0)

    assert folded == ["łódź", "łódź"]
    assert ([item.name for item in found], total) == (["Łódź Faktura"], 1)


def test_the_folding_function_passes_null_through(second_database: Database) -> None:
    with second_database.engine.connect() as connection:
        folded = connection.exec_driver_sql("SELECT formlens_casefold(NULL)").scalar_one()

    assert folded is None


@pytest.mark.parametrize(
    ("name", "search"),
    [
        ("ΚΟΣΜΟΣ", "κοσμος"),  # final sigma in the search
        ("κοσμος", "ΚΟΣΜΟΣ"),  # final sigma in the name
        ("ΚΟΣΜΟΣ", "σ"),  # noqa: RUF001  # the letter itself
        ("FILE", "ﬁle"),  # the ligature in the search
        ("ﬁle", "FILE"),  # the ligature in the name
        ("STRASSE", "ß"),
        ("Straße", "STRASSE"),
        ("Straße", "ẞ"),  # capital sharp s
        ("İstanbul", "İSTANBUL"),  # dotted capital I against itself in another case
        ("Café Rouge", "CAFÉ"),  # a combining accent, the same form on both sides
        ("Café Rouge", "cafe"),
        ("\U00010400bc", "\U00010428"),  # outside the basic plane
    ],
    ids=[
        "final-sigma-search",
        "final-sigma-name",
        "sigma-letter",
        "ligature-search",
        "ligature-name",
        "sharp-s-name-upper",
        "strasse-search",
        "capital-sharp-s",
        "dotted-capital-i",
        "combining-accent",
        "combining-accent-prefix",
        "astral",
    ],
)
def test_a_search_follows_unicode_case_folding(repository: SqliteTemplateRepository, name: str, search: str) -> None:
    add_named(repository, "Lease", name)

    found, total = repository.page(search=search, limit=10, offset=0)

    assert ([item.name for item in found], total) == ([name], 1)


def test_a_search_with_a_non_ascii_text_pages_and_counts_the_matches_only(
    repository: SqliteTemplateRepository,
) -> None:
    add_named(repository, "Lease", "Łódź 1", "ŁÓDŹ 2", "x", "łódź 3")

    second, total = repository.page(search="ŁóDź", limit=1, offset=1)
    past_the_end, total_past = repository.page(search="ŁóDź", limit=1, offset=3)

    assert ([item.name for item in second], total) == (["ŁÓDŹ 2"], 3)
    assert (past_the_end, total_past) == ([], 3)


# The search is "contains the text, ignoring case", implemented as Unicode `str.casefold()` on both sides. The three
# tests below pin what that means where it differs from what a reader might expect: a documented limit, not a defect.
# Accent normalization and locale rules (Turkish i) are not case folding, and full case folding maps the capital
# dotted I to "i" plus a combining dot and the sharp s to "ss".


def test_a_search_in_ascii_does_not_find_a_name_with_a_dotted_capital_i_but_its_own_folded_form_does(
    repository: SqliteTemplateRepository,
) -> None:
    """Full case folding turns the capital dotted I into "i" and a combining dot, so a plain "i" is not equal to it."""
    add_named(repository, "Lease", "\u0130stanbul")

    ascii_search, ascii_total = repository.page(search="istanbul", limit=10, offset=0)
    same_letter, same_total = repository.page(search="\u0130stanbul", limit=10, offset=0)
    folded, folded_total = repository.page(search="i\u0307stanbul", limit=10, offset=0)

    assert (ascii_search, ascii_total) == ([], 0)
    assert ([item.name for item in same_letter], same_total) == (["\u0130stanbul"], 1)
    assert ([item.name for item in folded], folded_total) == (["\u0130stanbul"], 1)


def test_a_search_for_a_sharp_s_matches_names_with_a_double_s(
    repository: SqliteTemplateRepository,
) -> None:
    """Full case folding maps the sharp s to "ss", so a search for it finds "ss" wherever it stands in a name."""
    add_named(repository, "Class", "Assets", "Stra\u00dfe", "Lease")

    found, total = repository.page(search="\u00df", limit=10, offset=0)

    assert ([item.name for item in found], total) == (["Class", "Assets", "Stra\u00dfe"], 3)


@pytest.mark.parametrize(
    ("name", "search"),
    [("Caf\u00e9", "Cafe\u0301"), ("Cafe\u0301", "Caf\u00e9")],
    ids=["composed-name-decomposed-search", "decomposed-name-composed-search"],
)
def test_a_search_does_not_equate_a_composed_accent_with_a_combining_mark(
    repository: SqliteTemplateRepository, name: str, search: str
) -> None:
    """Case folding does not normalize: the two spellings of the same accent are different text to the search."""
    add_named(repository, "Lease", name)

    found, total = repository.page(search=search, limit=10, offset=0)

    assert (found, total) == ([], 0)
