"""One suite, every repository: the fake and the SQLite adapter must behave the same wherever a test relies on it."""

from collections.abc import Callable
from datetime import datetime, timedelta
from uuid import UUID

import pytest

from formlens.extractions.domain.exceptions import QueueFull
from formlens.extractions.domain.model import Extraction, ExtractionStatus, FailureReason
from formlens.extractions.domain.ports import ExtractionRepository
from tests.extractions.factories import NOW, TEMPLATE_ID, ExtractionFactory, TemplateSnapshotFactory

CONTENT = b"%PDF-1.7 content of one upload"
CAP = 100


def add(
    repository: ExtractionRepository, extraction: Extraction, content: bytes = CONTENT, *, cap: int = CAP
) -> Extraction:
    repository.add(extraction, content, max_pending=cap)
    return extraction


def id_of(n: int) -> UUID:
    return UUID(int=n)


def claimed(repository: ExtractionRepository, extraction: Extraction, now_offset: int = 1) -> Extraction:
    add(repository, extraction)
    taken = repository.claim_next(NOW + timedelta(seconds=now_offset))
    assert taken is not None
    assert taken.id == extraction.id
    return taken


# --- add, get, read_input --------------------------------------------------------------------------


def test_an_added_extraction_is_read_back_unchanged_with_its_upload(repository: ExtractionRepository) -> None:
    extraction = add(repository, ExtractionFactory.build(id=id_of(1)))

    assert repository.get(id_of(1)) == extraction
    assert repository.read_input(id_of(1)) == CONTENT


def test_an_unknown_extraction_is_none_and_has_no_upload(repository: ExtractionRepository) -> None:
    assert repository.get(id_of(9)) is None
    assert repository.read_input(id_of(9)) is None


def test_the_snapshot_of_the_template_is_stored_whole(repository: ExtractionRepository) -> None:
    extraction = add(repository, ExtractionFactory.build(id=id_of(1)))

    stored = repository.get(id_of(1))

    assert stored is not None
    assert stored.template == extraction.template
    assert stored.template.json_schema["required"] == ["number", "buyer"]


def test_a_new_extraction_has_no_result_not_a_null_one(repository: ExtractionRepository) -> None:
    add(repository, ExtractionFactory.build(id=id_of(1)))

    stored = repository.get(id_of(1))

    assert stored is not None
    assert (stored.result, stored.error, stored.started_at, stored.finished_at) == (None, None, None, None)


# --- queue cap -------------------------------------------------------------------------------------


def test_the_queue_refuses_the_extraction_after_the_last_free_place_and_keeps_nothing_of_it(
    repository: ExtractionRepository,
) -> None:
    add(repository, ExtractionFactory.build(id=id_of(1)), cap=2)
    add(repository, ExtractionFactory.build(id=id_of(2)), cap=2)

    with pytest.raises(QueueFull) as raised:
        add(repository, ExtractionFactory.build(id=id_of(3)), cap=2)

    assert raised.value.retry_after_seconds > 0
    assert repository.count_pending() == 2
    assert repository.get(id_of(3)) is None
    assert repository.read_input(id_of(3)) is None


def test_only_waiting_extractions_count_against_the_cap(repository: ExtractionRepository) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    add(repository, ExtractionFactory.build(id=id_of(2)), cap=1)  # the running one does not count

    with pytest.raises(QueueFull):
        add(repository, ExtractionFactory.build(id=id_of(3)), cap=1)
    repository.finish_if_running(taken.complete({}, NOW))

    assert repository.count_pending() == 1


# --- claim -----------------------------------------------------------------------------------------


def test_claiming_takes_the_oldest_waiting_extraction_and_counts_the_attempt(repository: ExtractionRepository) -> None:
    add(repository, ExtractionFactory.build(id=id_of(2), created_at=NOW + timedelta(seconds=5)))
    add(repository, ExtractionFactory.build(id=id_of(1), created_at=NOW))
    taken_at = NOW + timedelta(seconds=30)

    taken = repository.claim_next(taken_at)

    assert taken is not None
    assert (taken.id, taken.status, taken.attempts, taken.started_at) == (
        id_of(1),
        ExtractionStatus.RUNNING,
        1,
        taken_at,
    )
    assert repository.get(id_of(1)) == taken
    assert repository.count_pending() == 1


def test_two_extractions_created_at_the_same_time_are_claimed_in_id_order(repository: ExtractionRepository) -> None:
    add(repository, ExtractionFactory.build(id=id_of(7)))
    add(repository, ExtractionFactory.build(id=id_of(3)))

    first, second = repository.claim_next(NOW), repository.claim_next(NOW)

    assert first is not None
    assert second is not None
    assert (first.id, second.id) == (id_of(3), id_of(7))


def test_claiming_with_nothing_waiting_is_none_and_a_running_one_is_not_claimed_again(
    repository: ExtractionRepository,
) -> None:
    assert repository.claim_next(NOW) is None
    claimed(repository, ExtractionFactory.build(id=id_of(1)))

    assert repository.claim_next(NOW) is None


def test_the_claimed_extraction_still_has_its_upload(repository: ExtractionRepository) -> None:
    claimed(repository, ExtractionFactory.build(id=id_of(1)))

    assert repository.read_input(id_of(1)) == CONTENT


# --- finish ----------------------------------------------------------------------------------------


def test_finishing_a_running_extraction_stores_the_result_and_deletes_the_upload(
    repository: ExtractionRepository,
) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    done = taken.complete({"number": "42", "buyer": None}, NOW + timedelta(seconds=9))

    assert repository.finish_if_running(done) is True

    assert repository.get(id_of(1)) == done
    assert repository.read_input(id_of(1)) is None


def test_a_failure_is_stored_with_its_reason_and_fixed_message(repository: ExtractionRepository) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    failed = taken.fail(FailureReason.INVALID_OUTPUT, NOW + timedelta(seconds=9))

    assert repository.finish_if_running(failed) is True

    stored = repository.get(id_of(1))
    assert stored == failed
    assert stored is not None
    assert stored.error is not None
    assert stored.error.reason is FailureReason.INVALID_OUTPUT
    assert repository.read_input(id_of(1)) is None


def test_a_result_arriving_after_a_timeout_changes_nothing(repository: ExtractionRepository) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    timed_out = taken.fail(FailureReason.TIMED_OUT, NOW + timedelta(seconds=600))
    late = taken.complete({"number": "42", "buyer": None}, NOW + timedelta(seconds=700))
    assert repository.finish_if_running(timed_out) is True

    assert repository.finish_if_running(late) is False

    assert repository.get(id_of(1)) == timed_out


def test_a_second_finish_of_the_same_attempt_changes_nothing(repository: ExtractionRepository) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    first = taken.complete({"number": "1", "buyer": None}, NOW)
    assert repository.finish_if_running(first) is True

    assert repository.finish_if_running(taken.complete({"number": "2", "buyer": None}, NOW)) is False

    assert repository.get(id_of(1)) == first


def test_a_result_of_an_earlier_attempt_does_not_end_the_later_one(repository: ExtractionRepository) -> None:
    first_attempt = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    assert repository.release_if_running(first_attempt.retry(), claimed_attempts=1) is True
    second_attempt = repository.claim_next(NOW + timedelta(seconds=5))
    assert second_attempt is not None
    assert second_attempt.attempts == 2

    assert repository.finish_if_running(first_attempt.complete({"number": "old", "buyer": None}, NOW)) is False

    assert repository.get(id_of(1)) == second_attempt


def test_finishing_an_unknown_extraction_is_false(repository: ExtractionRepository) -> None:
    ghost = ExtractionFactory.build(id=id_of(5)).claim(NOW).complete({}, NOW)

    assert repository.finish_if_running(ghost) is False


# --- release ---------------------------------------------------------------------------------------


def test_a_retry_goes_back_to_the_queue_keeps_its_attempt_and_its_upload(repository: ExtractionRepository) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))

    assert repository.release_if_running(taken.retry(), claimed_attempts=1) is True

    stored = repository.get(id_of(1))
    assert stored is not None
    assert (stored.status, stored.attempts, stored.started_at) == (ExtractionStatus.PENDING, 1, None)
    assert repository.read_input(id_of(1)) == CONTENT
    again = repository.claim_next(NOW)
    assert again is not None
    assert again.attempts == 2


def test_a_busy_parser_gives_the_attempt_back(repository: ExtractionRepository) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))

    assert repository.release_if_running(taken.requeue_busy(), claimed_attempts=1) is True

    stored = repository.get(id_of(1))
    assert stored is not None
    assert (stored.status, stored.attempts) == (ExtractionStatus.PENDING, 0)
    again = repository.claim_next(NOW)
    assert again is not None
    assert again.attempts == 1


def test_releasing_an_extraction_that_already_ended_or_was_taken_again_changes_nothing(
    repository: ExtractionRepository,
) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    timed_out = taken.fail(FailureReason.TIMED_OUT, NOW)
    assert repository.finish_if_running(timed_out) is True

    assert repository.release_if_running(taken.requeue_busy(), claimed_attempts=1) is False
    assert repository.get(id_of(1)) == timed_out


def test_a_release_by_an_earlier_attempt_does_not_put_the_later_attempt_back_in_the_queue(
    repository: ExtractionRepository,
) -> None:
    """The guard of the attempt count in `release_if_running`: only the attempt that holds the job may give it back."""
    first = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    assert repository.release_if_running(first.retry(), claimed_attempts=1) is True
    second = repository.claim_next(NOW + timedelta(seconds=5))
    assert second is not None
    assert second.attempts == 2

    stale = repository.release_if_running(first.requeue_busy(), claimed_attempts=1)

    assert stale is False
    assert repository.get(id_of(1)) == second
    assert repository.count_pending() == 0


# --- recovery --------------------------------------------------------------------------------------


def test_recovery_requeues_a_running_job_with_an_attempt_left_and_fails_one_without(
    repository: ExtractionRepository,
) -> None:
    add(repository, ExtractionFactory.build(id=id_of(1), created_at=NOW))
    add(repository, ExtractionFactory.build(id=id_of(2), created_at=NOW + timedelta(seconds=1)))
    repository.claim_next(NOW)  # id 1, attempt 1
    second = repository.claim_next(NOW)  # id 2, attempt 1
    assert second is not None
    assert repository.release_if_running(second.retry(), claimed_attempts=1) is True
    assert repository.claim_next(NOW) is not None  # id 2, attempt 2
    restart = NOW + timedelta(minutes=5)

    counts = repository.recover_running(2, restart)

    assert (counts.requeued, counts.failed) == (1, 1)
    one, two = repository.get(id_of(1)), repository.get(id_of(2))
    assert one is not None
    assert two is not None
    assert (one.status, one.attempts, one.started_at) == (ExtractionStatus.PENDING, 1, None)
    assert two.status is ExtractionStatus.FAILED
    assert two.error is not None
    assert two.error.reason is FailureReason.INTERRUPTED
    assert two.finished_at == restart
    assert repository.read_input(id_of(1)) == CONTENT
    assert repository.read_input(id_of(2)) is None


def test_recovery_leaves_waiting_and_finished_extractions_alone(repository: ExtractionRepository) -> None:
    add(repository, ExtractionFactory.build(id=id_of(1), created_at=NOW))
    add(repository, ExtractionFactory.build(id=id_of(2), created_at=NOW + timedelta(seconds=1)))
    done = repository.claim_next(NOW)
    assert done is not None
    finished = done.complete({"number": "1", "buyer": None}, NOW)
    repository.finish_if_running(finished)

    counts = repository.recover_running(2, NOW)

    assert (counts.requeued, counts.failed) == (0, 0)
    assert repository.get(id_of(1)) == finished
    waiting = repository.get(id_of(2))
    assert waiting is not None
    assert waiting.status is ExtractionStatus.PENDING


# --- purge -----------------------------------------------------------------------------------------


def test_purge_deletes_what_finished_before_the_cutoff_and_nothing_else(repository: ExtractionRepository) -> None:
    old = claimed(repository, ExtractionFactory.build(id=id_of(1), created_at=NOW), 1)
    repository.finish_if_running(old.complete({"number": "1", "buyer": None}, NOW + timedelta(hours=1)))
    recent = claimed(repository, ExtractionFactory.build(id=id_of(2), created_at=NOW + timedelta(seconds=1)), 2)
    repository.finish_if_running(recent.complete({"number": "2", "buyer": None}, NOW + timedelta(hours=30)))
    running_one = claimed(repository, ExtractionFactory.build(id=id_of(4), created_at=NOW + timedelta(seconds=3)), 3)
    add(repository, ExtractionFactory.build(id=id_of(3), created_at=NOW + timedelta(seconds=2)))

    purged = repository.purge_before(NOW + timedelta(hours=25))

    assert purged == 1
    assert repository.get(id_of(1)) is None
    assert repository.get(id_of(2)) is not None
    assert repository.get(id_of(3)) is not None
    assert repository.get(id_of(4)) == running_one
    assert repository.read_input(id_of(4)) == CONTENT


def test_purging_twice_deletes_nothing_the_second_time(repository: ExtractionRepository) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    repository.finish_if_running(taken.complete({}, NOW))

    assert repository.purge_before(NOW + timedelta(days=1)) == 1
    assert repository.purge_before(NOW + timedelta(days=1)) == 0


def test_a_job_finishing_exactly_at_the_cutoff_is_kept(repository: ExtractionRepository) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    repository.finish_if_running(taken.complete({}, NOW + timedelta(hours=1)))

    assert repository.purge_before(NOW + timedelta(hours=1)) == 0


def test_an_upload_of_any_bytes_is_stored_and_read_back_exactly(repository: ExtractionRepository) -> None:
    content = bytes(range(256)) * 100
    add(repository, ExtractionFactory.build(id=id_of(1)), content)

    assert repository.read_input(id_of(1)) == content


# --- page ------------------------------------------------------------------------------------------

EVERY_TIME = NOW - timedelta(days=3650)  # a cutoff nothing is older than
OTHER_TEMPLATE_ID = UUID(int=0xDEF)


def stored(
    repository: ExtractionRepository,
    n: int,
    *,
    status: ExtractionStatus = ExtractionStatus.PENDING,
    template_id: UUID = TEMPLATE_ID,
    created_at: datetime = NOW,
    finished_at: datetime | None = None,
) -> Extraction:
    """Store extraction number `n` as it is given; a finished one needs `finished_at`."""
    return add(
        repository,
        ExtractionFactory.build(
            id=id_of(n),
            status=status,
            template=TemplateSnapshotFactory.build(template_id=template_id),
            created_at=created_at,
            finished_at=finished_at,
        ),
    )


def page_ids(
    repository: ExtractionRepository,
    *,
    statuses: frozenset[ExtractionStatus] = frozenset(),
    template_id: UUID | None = None,
    finished_after: datetime = EVERY_TIME,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[UUID], int]:
    items, total = repository.page(
        statuses=statuses, template_id=template_id, finished_after=finished_after, limit=limit, offset=offset
    )
    return [item.id for item in items], total


def test_a_page_is_newest_first_and_the_id_breaks_a_tie_in_descending_order(repository: ExtractionRepository) -> None:
    stored(repository, 1, created_at=NOW)
    stored(repository, 2, created_at=NOW + timedelta(seconds=10))
    stored(repository, 3, created_at=NOW + timedelta(seconds=5))
    stored(repository, 4, created_at=NOW + timedelta(seconds=5))

    ids, total = page_ids(repository)

    assert ids == [id_of(2), id_of(4), id_of(3), id_of(1)]
    assert total == 4


def test_pages_cut_a_list_with_equal_creation_times_without_a_gap_or_a_repeat(repository: ExtractionRepository) -> None:
    for n in range(1, 6):
        stored(repository, n)

    first, total = page_ids(repository, limit=2, offset=0)
    second, _ = page_ids(repository, limit=2, offset=2)
    third, _ = page_ids(repository, limit=2, offset=4)

    assert first + second + third == [id_of(n) for n in (5, 4, 3, 2, 1)]
    assert total == 5


def test_a_page_returns_the_extraction_as_it_was_stored(repository: ExtractionRepository) -> None:
    done = stored(repository, 1, status=ExtractionStatus.COMPLETED, finished_at=NOW)

    items, _ = repository.page(statuses=frozenset(), template_id=None, finished_after=EVERY_TIME, limit=10, offset=0)

    assert items == [done]


def test_an_empty_store_gives_an_empty_page_and_a_total_of_zero(repository: ExtractionRepository) -> None:
    assert page_ids(repository) == ([], 0)


def test_an_offset_past_the_end_gives_no_items_and_the_real_total(repository: ExtractionRepository) -> None:
    for n in range(1, 4):
        stored(repository, n)

    assert page_ids(repository, limit=10, offset=50) == ([], 3)


def test_the_statuses_are_combined_with_or_and_no_status_means_all(repository: ExtractionRepository) -> None:
    stored(repository, 1, status=ExtractionStatus.PENDING, created_at=NOW)
    stored(repository, 2, status=ExtractionStatus.RUNNING, created_at=NOW + timedelta(seconds=1))
    stored(repository, 3, status=ExtractionStatus.COMPLETED, created_at=NOW + timedelta(seconds=2), finished_at=NOW)
    stored(repository, 4, status=ExtractionStatus.FAILED, created_at=NOW + timedelta(seconds=3), finished_at=NOW)

    one = page_ids(repository, statuses=frozenset({ExtractionStatus.FAILED}))
    two = page_ids(repository, statuses=frozenset({ExtractionStatus.PENDING, ExtractionStatus.RUNNING}))
    every = page_ids(repository)

    assert one == ([id_of(4)], 1)
    assert two == ([id_of(2), id_of(1)], 2)
    assert every == ([id_of(4), id_of(3), id_of(2), id_of(1)], 4)


def test_the_template_filter_keeps_only_that_templates_extractions(repository: ExtractionRepository) -> None:
    stored(repository, 1, template_id=TEMPLATE_ID)
    stored(repository, 2, template_id=OTHER_TEMPLATE_ID)
    stored(repository, 3, template_id=TEMPLATE_ID)

    assert page_ids(repository, template_id=OTHER_TEMPLATE_ID) == ([id_of(2)], 1)
    assert page_ids(repository, template_id=UUID(int=0x999)) == ([], 0)


def test_status_and_template_are_combined_with_and(repository: ExtractionRepository) -> None:
    stored(repository, 1, template_id=TEMPLATE_ID, status=ExtractionStatus.FAILED, finished_at=NOW)
    stored(repository, 2, template_id=OTHER_TEMPLATE_ID, status=ExtractionStatus.FAILED, finished_at=NOW)
    stored(repository, 3, template_id=TEMPLATE_ID, status=ExtractionStatus.PENDING)

    ids, total = page_ids(repository, statuses=frozenset({ExtractionStatus.FAILED}), template_id=TEMPLATE_ID)

    assert (ids, total) == ([id_of(1)], 1)


def test_the_total_counts_every_match_across_pages_not_the_page(repository: ExtractionRepository) -> None:
    for n in range(1, 8):
        stored(repository, n, template_id=TEMPLATE_ID if n <= 5 else OTHER_TEMPLATE_ID)

    ids, total = page_ids(repository, template_id=TEMPLATE_ID, limit=2, offset=1)

    assert (ids, total) == ([id_of(4), id_of(3)], 5)


def test_a_finished_extraction_at_the_cutoff_is_excluded_and_one_a_moment_later_is_kept(
    repository: ExtractionRepository,
) -> None:
    cutoff = NOW + timedelta(hours=1)
    stored(repository, 1, status=ExtractionStatus.COMPLETED, finished_at=cutoff - timedelta(microseconds=1))
    stored(repository, 2, status=ExtractionStatus.COMPLETED, finished_at=cutoff)
    stored(repository, 3, status=ExtractionStatus.FAILED, finished_at=cutoff + timedelta(microseconds=1))

    assert page_ids(repository, finished_after=cutoff) == ([id_of(3)], 1)


def test_an_extraction_that_has_not_finished_never_expires(repository: ExtractionRepository) -> None:
    stored(repository, 1, status=ExtractionStatus.PENDING, created_at=NOW - timedelta(days=400))
    stored(repository, 2, status=ExtractionStatus.RUNNING, created_at=NOW - timedelta(days=400))

    assert page_ids(repository, finished_after=NOW + timedelta(days=1000)) == ([id_of(2), id_of(1)], 2)


def test_an_expired_extraction_is_not_counted_with_the_filters(repository: ExtractionRepository) -> None:
    cutoff = NOW
    stored(repository, 1, status=ExtractionStatus.COMPLETED, finished_at=cutoff - timedelta(hours=1))
    stored(repository, 2, status=ExtractionStatus.COMPLETED, finished_at=cutoff + timedelta(hours=1))

    ids, total = page_ids(repository, statuses=frozenset({ExtractionStatus.COMPLETED}), finished_after=cutoff)

    assert (ids, total) == ([id_of(2)], 1)


# --- the file name ---------------------------------------------------------------------------------


@pytest.mark.parametrize("filename", ["invoice_118_2026.pdf", "ż" * 255, None], ids=["plain", "255-non-ascii", "none"])
def test_the_file_name_is_stored_and_read_back(repository: ExtractionRepository, filename: str | None) -> None:
    add(repository, ExtractionFactory.build(id=id_of(1), filename=filename))

    found = repository.get(id_of(1))

    assert found is not None
    assert found.filename == filename


# --- cancel ----------------------------------------------------------------------------------------

CANCELLED_AT = NOW + timedelta(minutes=5)


def test_cancelling_a_waiting_extraction_ends_it_and_deletes_its_upload(repository: ExtractionRepository) -> None:
    waiting = add(repository, ExtractionFactory.build(id=id_of(1), filename="a.pdf"))

    cancelled = repository.cancel_if_unfinished(id_of(1), CANCELLED_AT)

    assert cancelled == waiting.cancel(CANCELLED_AT)
    assert repository.get(id_of(1)) == cancelled
    assert repository.read_input(id_of(1)) is None


def test_a_cancelled_waiting_extraction_is_never_claimed(repository: ExtractionRepository) -> None:
    add(repository, ExtractionFactory.build(id=id_of(1)))
    repository.cancel_if_unfinished(id_of(1), CANCELLED_AT)

    assert repository.claim_next(CANCELLED_AT) is None
    assert repository.count_pending() == 0


def test_cancelling_a_running_extraction_ends_it_and_keeps_its_attempt(repository: ExtractionRepository) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))

    cancelled = repository.cancel_if_unfinished(id_of(1), CANCELLED_AT)

    assert cancelled == taken.cancel(CANCELLED_AT)
    assert cancelled is not None
    assert (cancelled.attempts, cancelled.started_at) == (1, taken.started_at)
    assert repository.read_input(id_of(1)) is None


LATE_ENDS: dict[str, Callable[[Extraction], Extraction]] = {
    "completed": lambda taken: taken.complete({"number": "42", "buyer": None}, CANCELLED_AT + timedelta(seconds=1)),
    "failed": lambda taken: taken.fail(FailureReason.TIMED_OUT, CANCELLED_AT + timedelta(seconds=1)),
}


@pytest.mark.parametrize("outcome", list(LATE_ENDS))
def test_a_worker_that_finishes_after_the_cancel_changes_nothing(
    repository: ExtractionRepository, outcome: str
) -> None:
    """AC36 in storage: the terminal write needs `running`, and a cancelled job is not."""
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    cancelled = repository.cancel_if_unfinished(id_of(1), CANCELLED_AT)

    assert repository.finish_if_running(LATE_ENDS[outcome](taken)) is False
    assert repository.get(id_of(1)) == cancelled


@pytest.mark.parametrize("move", ["retry", "requeue_busy"])
def test_a_worker_that_releases_the_job_after_the_cancel_does_not_put_it_back_in_the_queue(
    repository: ExtractionRepository, move: str
) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    cancelled = repository.cancel_if_unfinished(id_of(1), CANCELLED_AT)
    released = getattr(taken, move)()

    assert repository.release_if_running(released, claimed_attempts=taken.attempts) is False
    assert repository.get(id_of(1)) == cancelled
    assert repository.count_pending() == 0


def end_by_finishing(repository: ExtractionRepository, taken: Extraction, end: ExtractionStatus) -> Extraction | None:
    ended = taken.complete({}, NOW) if end is ExtractionStatus.COMPLETED else taken.fail(FailureReason.TIMED_OUT, NOW)
    repository.finish_if_running(ended)
    return ended


ENDINGS: dict[str, Callable[[ExtractionRepository, Extraction], Extraction | None]] = {
    "completed": lambda repository, taken: end_by_finishing(repository, taken, ExtractionStatus.COMPLETED),
    "failed": lambda repository, taken: end_by_finishing(repository, taken, ExtractionStatus.FAILED),
    "cancelled": lambda repository, taken: repository.cancel_if_unfinished(taken.id, NOW + timedelta(seconds=2)),
}


@pytest.mark.parametrize("end", list(ENDINGS))
def test_an_extraction_that_ended_is_not_cancelled_and_stays_as_it_was(
    repository: ExtractionRepository, end: str
) -> None:
    taken = claimed(repository, ExtractionFactory.build(id=id_of(1)))
    ended = ENDINGS[end](repository, taken)

    assert repository.cancel_if_unfinished(id_of(1), CANCELLED_AT) is None
    assert repository.get(id_of(1)) == ended


def test_cancelling_an_unknown_extraction_is_none(repository: ExtractionRepository) -> None:
    assert repository.cancel_if_unfinished(id_of(9), CANCELLED_AT) is None


def test_recovery_leaves_a_cancelled_extraction_alone(repository: ExtractionRepository) -> None:
    claimed(repository, ExtractionFactory.build(id=id_of(1)))
    cancelled = repository.cancel_if_unfinished(id_of(1), CANCELLED_AT)

    counts = repository.recover_running(2, CANCELLED_AT)

    assert (counts.requeued, counts.failed) == (0, 0)
    assert repository.get(id_of(1)) == cancelled


def test_purge_deletes_a_cancelled_extraction_by_the_time_it_was_cancelled(repository: ExtractionRepository) -> None:
    add(repository, ExtractionFactory.build(id=id_of(1), created_at=NOW))
    add(repository, ExtractionFactory.build(id=id_of(2), created_at=NOW + timedelta(seconds=1)))
    repository.cancel_if_unfinished(id_of(1), NOW + timedelta(hours=1))
    kept = repository.cancel_if_unfinished(id_of(2), NOW + timedelta(hours=30))

    purged = repository.purge_before(NOW + timedelta(hours=25))

    assert purged == 1
    assert repository.get(id_of(1)) is None
    assert repository.get(id_of(2)) == kept


def test_the_cancelled_status_filters_a_page_and_its_total(repository: ExtractionRepository) -> None:
    stored(repository, 1, created_at=NOW)
    stored(repository, 2, created_at=NOW + timedelta(seconds=1))
    stored(repository, 3, created_at=NOW + timedelta(seconds=2))
    repository.cancel_if_unfinished(id_of(1), NOW)
    repository.cancel_if_unfinished(id_of(3), NOW)

    assert page_ids(repository, statuses=frozenset({ExtractionStatus.CANCELLED})) == ([id_of(3), id_of(1)], 2)
