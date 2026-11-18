"""Submitting and reading an extraction, with fakes for every port."""

from datetime import timedelta
from uuid import UUID

import pytest
from structlog.testing import capture_logs

from formlens.extractions.domain.exceptions import (
    ExtractionNotFound,
    QueueFull,
    TemplateMissing,
    UploadEmpty,
    UploadTooLarge,
    UploadUnsupported,
)
from formlens.extractions.domain.model import ExtractionStatus
from formlens.extractions.service_layer.service import utc_now
from tests.extractions.factories import NOW, TEMPLATE_ID, ExtractionFactory, TemplateSnapshotFactory
from tests.extractions.fakes import PDF
from tests.extractions.harness import Harness


def test_a_submitted_document_is_queued_as_pending_with_a_copy_of_the_template() -> None:
    harness = Harness()
    snapshot = TemplateSnapshotFactory.build(version=4, name="Invoice v4")
    harness.catalog.snapshots[TEMPLATE_ID] = snapshot

    extraction = harness.service.submit(PDF, TEMPLATE_ID)

    stored = harness.stored(extraction)
    assert (stored.status, stored.attempts, stored.created_at) == (ExtractionStatus.PENDING, 0, NOW)
    assert stored.template == snapshot
    assert (stored.template.version, stored.template.name) == (4, "Invoice v4")
    assert harness.repository.read_input(extraction.id) == PDF
    assert extraction.id.version == 7


def test_a_queued_document_marks_the_template_as_used_at_the_extractions_creation_time() -> None:
    harness = Harness()

    extraction = harness.service.submit(PDF, TEMPLATE_ID)

    assert harness.catalog.marked == [(TEMPLATE_ID, extraction.created_at)]
    assert extraction.created_at == NOW


def test_every_submission_marks_the_template_again() -> None:
    harness = Harness()

    harness.submit()
    second = harness.submit()

    assert [at for _, at in harness.catalog.marked] == [NOW, second.created_at]


def test_a_template_is_not_marked_when_the_queue_refuses_the_document() -> None:
    harness = Harness(max_pending=1)
    harness.submit()
    marked_before = list(harness.catalog.marked)

    with pytest.raises(QueueFull):
        harness.submit()

    assert marked_before == [(TEMPLATE_ID, NOW)]
    assert harness.catalog.marked == marked_before


def test_a_template_is_not_marked_when_the_upload_or_the_template_is_refused() -> None:
    harness = Harness()

    with pytest.raises(UploadEmpty):
        harness.service.submit(b"", TEMPLATE_ID)
    with pytest.raises(TemplateMissing):
        harness.service.submit(PDF, UUID(int=999))

    assert harness.catalog.marked == []


def test_the_copy_does_not_change_when_the_template_does() -> None:
    harness = Harness()
    extraction = harness.service.submit(PDF, TEMPLATE_ID)

    harness.catalog.snapshots[TEMPLATE_ID] = TemplateSnapshotFactory.build(version=2, name="Edited")
    del harness.catalog.snapshots[TEMPLATE_ID]

    assert harness.stored(extraction).template.version == 1


def test_a_refused_upload_is_reported_before_the_template_is_looked_up() -> None:
    harness = Harness()

    with pytest.raises(UploadEmpty):
        harness.service.submit(b"", UUID(int=999))  # the template does not exist either
    with pytest.raises(UploadUnsupported):
        harness.service.submit(b"plain text", TEMPLATE_ID)

    assert harness.repository.count_pending() == 0


def test_an_unknown_template_is_reported_and_nothing_is_queued() -> None:
    harness = Harness()

    with pytest.raises(TemplateMissing):
        harness.service.submit(PDF, UUID(int=999))

    assert harness.repository.count_pending() == 0


def test_a_full_queue_refuses_the_submission_and_says_when_to_retry() -> None:
    harness = Harness(max_pending=2)
    harness.submit()
    harness.submit()

    with pytest.raises(QueueFull) as raised:
        harness.submit()

    assert raised.value.retry_after_seconds > 0
    assert harness.repository.count_pending() == 2


def test_submitting_logs_the_ids_and_the_size_but_not_the_document() -> None:
    harness = Harness()

    with capture_logs() as logs:
        extraction = harness.service.submit(PDF + b" SECRET-MARKER", TEMPLATE_ID)

    [line] = [entry for entry in logs if entry["event"] == "extraction_enqueued"]
    assert line["extraction_id"] == str(extraction.id)
    assert line["file_size_bytes"] == len(PDF) + len(b" SECRET-MARKER")
    assert "SECRET-MARKER" not in str(logs)


def test_a_stored_extraction_is_read_back() -> None:
    harness = Harness()
    extraction = harness.submit()

    assert harness.service.get(extraction.id) == extraction


def test_an_unknown_extraction_is_not_found() -> None:
    with pytest.raises(ExtractionNotFound):
        Harness().service.get(UUID(int=5))


def test_a_finished_extraction_is_gone_once_its_time_to_live_has_passed_even_before_the_purge() -> None:
    harness = Harness()
    extraction = harness.submit()
    assert harness.processor.run_once()
    finished_at = harness.stored(extraction).finished_at
    assert finished_at is not None

    harness.clock.now = finished_at + harness.ttl - timedelta(seconds=1)
    assert harness.service.get(extraction.id).status is ExtractionStatus.COMPLETED
    harness.clock.now = finished_at + harness.ttl

    with pytest.raises(ExtractionNotFound):
        harness.service.get(extraction.id)
    assert harness.repository.get(extraction.id) is not None  # still stored: the purge has not run


def test_a_page_drops_a_finished_extraction_at_its_time_to_live_and_counts_without_it() -> None:
    harness = Harness()
    finished_at = NOW - timedelta(hours=1)
    old = ExtractionFactory.build(id=UUID(int=1), status=ExtractionStatus.COMPLETED, finished_at=finished_at)
    harness.repository.add(old, b"", max_pending=10)
    harness.clock.now = finished_at + harness.ttl - timedelta(microseconds=1)

    before = harness.service.page(statuses=[], template_id=None, limit=10, offset=0)
    harness.clock.now = finished_at + harness.ttl
    after = harness.service.page(statuses=[], template_id=None, limit=10, offset=0)

    assert before == ([old], 1)
    assert after == ([], 0)


def test_a_page_keeps_extractions_that_have_not_finished_however_old() -> None:
    harness = Harness()
    waiting = ExtractionFactory.build(id=UUID(int=1), created_at=NOW - timedelta(days=100))
    harness.repository.add(waiting, b"", max_pending=10)

    items, total = harness.service.page(statuses=[], template_id=None, limit=10, offset=0)

    assert (items, total) == ([waiting], 1)


def test_a_status_given_twice_is_the_same_as_given_once() -> None:
    harness = Harness()
    failed = ExtractionFactory.build(id=UUID(int=1), status=ExtractionStatus.FAILED, finished_at=NOW)
    pending = ExtractionFactory.build(id=UUID(int=2))
    for extraction in (failed, pending):
        harness.repository.add(extraction, b"", max_pending=10)

    twice = harness.service.page(
        statuses=[ExtractionStatus.FAILED, ExtractionStatus.FAILED], template_id=None, limit=10, offset=0
    )
    once = harness.service.page(statuses=[ExtractionStatus.FAILED], template_id=None, limit=10, offset=0)

    assert twice == once == ([failed], 1)


def test_the_default_clock_is_aware_utc() -> None:
    assert utc_now().utcoffset() == timedelta(0)


def test_an_upload_over_the_limit_names_the_limit() -> None:
    error = UploadTooLarge(25)

    assert (error.limit_mb, str(error)) == (25, "The file is larger than 25 MB.")
