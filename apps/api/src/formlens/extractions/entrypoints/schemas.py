"""Response models of the extractions API."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from formlens.extractions.domain.model import Extraction, ExtractionStatus, FailureReason
from formlens.pagination import Page


class ExtractionErrorResponse(BaseModel):
    """Why an extraction failed."""

    reason: FailureReason = Field(description="Machine-readable cause; branch on this.", examples=["timed_out"])
    message: str = Field(
        description="Fixed text for people. It never holds text of the document.",
        examples=["The extraction took longer than the time allowed."],
    )


class ExtractionFieldResponse(BaseModel):
    """One field of the template as it was when the document was submitted."""

    name: str = Field(description="The key of the field in `result`.", examples=["invoice_number"])
    type: str = Field(description="The type of the field in the template.", examples=["text"])
    required: bool = Field(description="Whether the template marks the field as required.", examples=[True])


class ExtractionResponse(BaseModel):
    """An extraction: where it is, and its result once it has one."""

    id: UUID = Field(description="Identifier of the extraction.", examples=["0192f5e0-5a3b-7c11-9d2e-3f6a1b2c4d5e"])
    status: ExtractionStatus = Field(
        description="`pending` waits for the worker, `running` is being read, `completed` has a `result`, "
        "`failed` has an `error`, `cancelled` was stopped by a client and never gets a result.",
        examples=["pending"],
    )
    template_id: UUID = Field(
        description="The template the document is read against.", examples=["0192f5e0-5a3b-7c11-9d2e-3f6a1b2c4d00"]
    )
    template_version: int = Field(
        description="The version of the template that was copied when the document was submitted; a later edit "
        "does not change this extraction.",
        examples=[1],
    )
    template_name: str = Field(
        description="The name of the template as it was when the document was submitted.", examples=["Invoice"]
    )
    fields: list[ExtractionFieldResponse] = Field(
        description="The fields of the template as they were when the document was submitted, in template order; "
        "a later edit or delete of the template does not change them.",
    )
    filename: str | None = Field(
        description="The name the client gave the uploaded file, without any path, at most 255 characters. "
        "`null` when it gave none or the extraction was submitted before file names were kept.",
        examples=["invoice_118_2026.pdf"],
    )
    result: dict[str, Any] | None = Field(
        default=None,
        description="One key per field of the template, `null` where the document does not show a value. "
        "Present when `status` is `completed`.",
        examples=[{"invoice_number": "FV/12/2026", "total": None}],
    )
    missing_required: list[str] = Field(
        description="The required fields whose value is `null`. A completed result may have some; it is still "
        "delivered. Empty until the extraction completes.",
        examples=[[]],
    )
    error: ExtractionErrorResponse | None = Field(default=None, description="Present when `status` is `failed`.")
    attempts: int = Field(description="How many times the worker took the job.", examples=[1], ge=0)
    created_at: datetime = Field(description="When the document was submitted (UTC).")
    started_at: datetime | None = Field(
        default=None, description="When the worker took the job (UTC); `null` while it waits."
    )
    finished_at: datetime | None = Field(
        default=None,
        description="When the extraction ended or was cancelled (UTC). The result is kept for a limited time after "
        "this.",
    )

    @classmethod
    def from_domain(cls, extraction: Extraction) -> ExtractionResponse:
        """Describe an extraction."""
        return cls(
            id=extraction.id,
            status=extraction.status,
            template_id=extraction.template.template_id,
            template_version=extraction.template.version,
            template_name=extraction.template.name,
            fields=[
                ExtractionFieldResponse(name=item.name, type=item.type, required=item.required)
                for item in extraction.template.fields
            ],
            filename=extraction.filename,
            result=extraction.result,
            missing_required=extraction.missing_required,
            error=(
                ExtractionErrorResponse(reason=extraction.error.reason, message=extraction.error.message)
                if extraction.error
                else None
            ),
            attempts=extraction.attempts,
            created_at=extraction.created_at,
            started_at=extraction.started_at,
            finished_at=extraction.finished_at,
        )


class ExtractionPage(Page[ExtractionResponse]):
    """One page of extractions."""
