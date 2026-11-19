"""The use cases of the templates; knows nothing of HTTP or of SQL."""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

import structlog

from formlens.templates.exceptions import TemplateNotFound
from formlens.templates.models import Template, TemplateDraft
from formlens.templates.repository import TemplateRepository

log = structlog.get_logger(__name__)


def _utc_now() -> datetime:
    return datetime.now(UTC)


class TemplateService:
    """Create, read, replace and delete templates."""

    def __init__(self, repository: TemplateRepository, *, clock: Callable[[], datetime] = _utc_now) -> None:
        """Wire the storage and the clock."""
        self._repository = repository
        self._clock = clock

    def create(self, draft: TemplateDraft) -> Template:
        """Store a new template at version 1."""
        template = Template.create(uuid.uuid7(), draft, self._clock())
        self._repository.add(template)
        log.info("template_created", template_id=str(template.id), field_count=len(template.fields))
        return template

    def get(self, template_id: UUID) -> Template:
        """Return the template.

        Raises:
            TemplateNotFound: There is no template with this id.
        """
        template = self._repository.get(template_id)
        if template is None:
            raise TemplateNotFound(template_id)
        return template

    def page(self, *, search: str | None = None, limit: int, offset: int) -> tuple[list[Template], int]:
        """Return one page of templates and the total.

        `search`, when given, keeps the templates whose name contains it, ignoring case; the total counts only those.
        """
        return self._repository.page(search=search, limit=limit, offset=offset)

    def mark_used(self, template_id: UUID, at: datetime) -> None:
        """Record that an extraction was created with the template at `at`; nothing happens when it is gone."""
        self._repository.mark_used(template_id, at)

    def replace(self, template_id: UUID, draft: TemplateDraft) -> Template:
        """Replace a template's content; its version goes up by one.

        Raises:
            TemplateNotFound: There is no template with this id.
        """
        template = self._repository.replace(template_id, draft, self._clock())
        if template is None:
            raise TemplateNotFound(template_id)
        log.info("template_replaced", template_id=str(template.id), version=template.version)
        return template

    def delete(self, template_id: UUID) -> None:
        """Delete a template.

        Raises:
            TemplateNotFound: There is no template with this id.
        """
        if not self._repository.delete(template_id):
            raise TemplateNotFound(template_id)
        log.info("template_deleted", template_id=str(template_id))
