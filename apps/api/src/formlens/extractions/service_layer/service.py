"""Submit an extraction and read it back; knows nothing of HTTP, SQL or the model."""

import uuid
from collections.abc import Callable, Collection
from datetime import UTC, datetime, timedelta
from uuid import UUID

import structlog

from formlens.extractions.domain.exceptions import ExtractionNotFound
from formlens.extractions.domain.model import Extraction, ExtractionStatus
from formlens.extractions.domain.ports import ExtractionRepository, TemplateCatalog, TextSource

log = structlog.get_logger(__name__)


def utc_now() -> datetime:
    """Return the current time, aware, in UTC."""
    return datetime.now(UTC)


class ExtractionService:
    """Queue a document for extraction and read the state of a job."""

    def __init__(
        self,
        repository: ExtractionRepository,
        text_source: TextSource,
        catalog: TemplateCatalog,
        *,
        max_pending: int,
        result_ttl: timedelta,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        """Wire the ports and the limits."""
        self._repository = repository
        self._text_source = text_source
        self._catalog = catalog
        self._max_pending = max_pending
        self._result_ttl = result_ttl
        self._clock = clock

    def submit(self, content: bytes, template_id: UUID) -> Extraction:
        """Queue `content` to be read against the template; the work happens later, in the worker.

        The upload is checked first, because that is cheap, and the template is copied at this moment: a later
        edit or delete does not change this job. The "last used" date of the template is best effort: the job is
        stored before it is written, so a failure there is logged and the job is still returned.

        Raises:
            UploadRefused: The file is empty, too large or not a supported document.
            TemplateMissing: There is no such template.
            QueueFull: The queue is at its limit.
        """
        self._text_source.check(content)
        snapshot = self._catalog.snapshot(template_id)
        extraction = Extraction.new(uuid.uuid7(), snapshot, self._clock())
        self._repository.add(extraction, content, max_pending=self._max_pending)
        self._mark_used(template_id, extraction)
        log.info(
            "extraction_enqueued",
            extraction_id=str(extraction.id),
            template_id=str(template_id),
            template_version=snapshot.version,
            file_size_bytes=len(content),
        )
        return extraction

    def _mark_used(self, template_id: UUID, extraction: Extraction) -> None:
        """Record the use of the template; the extraction is already stored, so an error here is only logged."""
        try:
            self._catalog.mark_used(template_id, extraction.created_at)
        except Exception:
            log.exception("template_mark_used_failed", extraction_id=str(extraction.id), template_id=str(template_id))

    def page(
        self, *, statuses: Collection[ExtractionStatus], template_id: UUID | None, limit: int, offset: int
    ) -> tuple[list[Extraction], int]:
        """Return one page of extractions, newest first, and the total that match.

        Repeated statuses count once. A finished extraction past its time to live is left out of the page and of
        the total, the same rule under which `get` does not find it.
        """
        return self._repository.page(
            statuses=frozenset(statuses),
            template_id=template_id,
            finished_after=self._clock() - self._result_ttl,
            limit=limit,
            offset=offset,
        )

    def get(self, extraction_id: UUID) -> Extraction:
        """Return the extraction; one that is past its time to live is gone, as if it were deleted.

        Raises:
            ExtractionNotFound: There is no such extraction, or it expired.
        """
        extraction = self._repository.get(extraction_id)
        if extraction is None or extraction.is_expired(self._clock(), self._result_ttl):
            raise ExtractionNotFound(extraction_id)
        return extraction
