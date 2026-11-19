"""Where templates are stored: the port the service needs and the SQLite adapter behind it."""

from datetime import datetime
from typing import Any, Final, Protocol, cast
from uuid import UUID

from sqlalchemy import CursorResult, delete, func, or_, select, update

from formlens.database import Database
from formlens.templates.models import FieldType, Template, TemplateDraft, TemplateField
from formlens.templates.tables import TemplateRow

LIKE_ESCAPE: Final = "\\"


class TemplateRepository(Protocol):
    """What the service needs from storage. Each method is one short transaction."""

    def add(self, template: Template) -> None:
        """Store a new template."""
        ...

    def get(self, template_id: UUID) -> Template | None:
        """Return the template, or None when there is none."""
        ...

    def page(self, *, search: str | None = None, limit: int, offset: int) -> tuple[list[Template], int]:
        """Return one page, oldest first, and the number of templates that match, across all pages.

        `search`, when given, keeps the templates whose name contains it, ignoring case; `%` and `_` in it are
        taken literally.
        """
        ...

    def mark_used(self, template_id: UUID, at: datetime) -> None:
        """Record `at` as the last use, unless a later use is already recorded; nothing happens for a missing id."""
        ...

    def replace(self, template_id: UUID, draft: TemplateDraft, now: datetime) -> Template | None:
        """Replace name, description and fields and raise the version by one in a single step.

        Returns the stored result, or None when there is no such template.
        """
        ...

    def delete(self, template_id: UUID) -> bool:
        """Delete the template; False when there was none."""
        ...


def _field_to_json(item: TemplateField) -> dict[str, Any]:
    return {
        "name": item.name,
        "type": item.type.value,
        "description": item.description,
        "required": item.required,
        "allowed_values": list(item.allowed_values) if item.allowed_values is not None else None,
        "minimum": item.minimum,
        "maximum": item.maximum,
        "pattern": item.pattern,
    }


def _field_from_json(data: dict[str, Any]) -> TemplateField:
    allowed = data.get("allowed_values")
    return TemplateField(
        name=data["name"],
        type=FieldType(data["type"]),
        description=data.get("description", ""),
        required=data.get("required", False),
        allowed_values=tuple(allowed) if allowed is not None else None,
        minimum=data.get("minimum"),
        maximum=data.get("maximum"),
        pattern=data.get("pattern"),
    )


def _to_template(row: TemplateRow) -> Template:
    return Template(
        id=row.id,
        name=row.name,
        description=row.description,
        fields=tuple(_field_from_json(item) for item in row.fields),
        version=row.version,
        created_at=row.created_at,
        updated_at=row.updated_at,
        last_used_at=row.last_used_at,
    )


def _contains_pattern(text: str) -> str:
    """Build the LIKE pattern that matches `text` anywhere, with the escape character, `%` and `_` literal."""
    escaped = text.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2).replace("%", LIKE_ESCAPE + "%").replace("_", LIKE_ESCAPE + "_")
    return f"%{escaped}%"


class SqliteTemplateRepository:
    """Stores templates in the `templates` table."""

    def __init__(self, database: Database) -> None:
        """Use the sessions of `database`."""
        self._database = database

    def add(self, template: Template) -> None:
        """Insert the template."""
        with self._database.write() as session:
            session.add(
                TemplateRow(
                    id=template.id,
                    name=template.name,
                    description=template.description,
                    version=template.version,
                    fields=[_field_to_json(item) for item in template.fields],
                    created_at=template.created_at,
                    updated_at=template.updated_at,
                )
            )

    def get(self, template_id: UUID) -> Template | None:
        """Read one template."""
        with self._database.read() as session:
            row = session.get(TemplateRow, template_id)
            return _to_template(row) if row is not None else None

    def page(self, *, search: str | None = None, limit: int, offset: int) -> tuple[list[Template], int]:
        """Read a page in creation order; the id breaks a tie between two templates made at the same time.

        The search is `lower(name) LIKE lower(:pattern)` with a backslash as the escape character (SQLite lowers
        ASCII letters only), and the total counts the same rows.
        """
        match = (
            func.lower(TemplateRow.name).like(func.lower(_contains_pattern(search)), escape=LIKE_ESCAPE)
            if search
            else None
        )
        rows_query = select(TemplateRow)
        count_query = select(func.count()).select_from(TemplateRow)
        if match is not None:
            rows_query = rows_query.where(match)
            count_query = count_query.where(match)
        with self._database.read() as session:
            rows = session.scalars(
                rows_query.order_by(TemplateRow.created_at, TemplateRow.id).limit(limit).offset(offset)
            ).all()
            total = session.scalar(count_query) or 0
            return [_to_template(row) for row in rows], total

    def mark_used(self, template_id: UUID, at: datetime) -> None:
        """Set `last_used_at` in one UPDATE that only moves it forward.

        Two submissions at the same time may write in either order; the later time wins, so the column is the
        newest extraction's creation time. A deleted template has no row, so nothing changes.
        """
        with self._database.write() as session:
            session.execute(
                update(TemplateRow)
                .where(
                    TemplateRow.id == template_id,
                    or_(TemplateRow.last_used_at.is_(None), TemplateRow.last_used_at < at),
                )
                .values(last_used_at=at)
            )

    def replace(self, template_id: UUID, draft: TemplateDraft, now: datetime) -> Template | None:
        """Replace the content and bump the version in one UPDATE.

        The guard of the rule "every replacement gets the next version": the new version is computed by the
        database from the row it updates, not read first and written back. Two replacements at the same time
        get two different versions, and the row holds the content of the later one.
        """
        with self._database.write() as session:
            row = session.execute(
                update(TemplateRow)
                .where(TemplateRow.id == template_id)
                .values(
                    name=draft.name,
                    description=draft.description,
                    fields=[_field_to_json(item) for item in draft.fields],
                    version=TemplateRow.version + 1,
                    updated_at=now,
                )
                .returning(TemplateRow)
            ).scalar_one_or_none()
            return _to_template(row) if row is not None else None

    def delete(self, template_id: UUID) -> bool:
        """Delete one template."""
        with self._database.write() as session:
            result = cast(
                "CursorResult[Any]", session.execute(delete(TemplateRow).where(TemplateRow.id == template_id))
            )
            return result.rowcount > 0
