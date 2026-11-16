"""The extractions endpoints."""

from typing import Annotated, Any, Final
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Response

from formlens.extractions.domain.model import ExtractionStatus
from formlens.extractions.entrypoints.dependencies import get_extraction_service, read_template_id
from formlens.extractions.entrypoints.errors import EXTRACTION_NOT_FOUND, QUEUE_FULL
from formlens.extractions.entrypoints.schemas import ExtractionPage, ExtractionResponse
from formlens.extractions.service_layer.service import ExtractionService
from formlens.pagination import PageParams, get_page_params
from formlens.parsing.dependencies import read_upload
from formlens.parsing.errors import FILE_TOO_LARGE, INVALID_FILE, UNSUPPORTED_MEDIA_TYPE
from formlens.problems import VALIDATION_ERROR, problem_response
from formlens.templates.errors import TEMPLATE_NOT_FOUND

EXTRACTIONS_PATH: Final = "/v1/extractions"
EXTRACTIONS_TAG: Final = {
    "name": "extractions",
    "description": "Submit a document with a template and read the result later. The model runs on the server; "
    "nothing leaves it.",
}

router = APIRouter(prefix=EXTRACTIONS_PATH, tags=["extractions"])


def _accepted() -> dict[str, Any]:
    return {
        "description": "The document is queued. Poll the `Location` until `status` is `completed` or `failed`.",
        "headers": {
            "Location": {
                "description": "Where to read the extraction.",
                "schema": {"type": "string", "examples": ["/v1/extractions/0192f5e0-5a3b-7c11-9d2e-3f6a1b2c4d5e"]},
            }
        },
    }


def _unavailable() -> dict[str, Any]:
    response = problem_response(QUEUE_FULL)
    response["headers"] = {
        "Retry-After": {
            "description": "Whole seconds to wait before trying again; set when the queue is full.",
            "schema": {"type": "integer", "examples": [30]},
        }
    }
    return response


@router.post(
    "",
    operation_id="create_extraction",
    status_code=202,
    response_model=ExtractionResponse,
    responses={
        202: _accepted(),
        400: problem_response(
            INVALID_FILE,
            description=("The file is empty (`invalid-file`), or the multipart body is malformed (`about:blank`)."),
        ),
        404: problem_response(TEMPLATE_NOT_FOUND),
        413: problem_response(FILE_TOO_LARGE),
        415: problem_response(UNSUPPORTED_MEDIA_TYPE),
        422: problem_response(
            VALIDATION_ERROR,
            description=(
                "Request validation failed (`validation-error`): `file` is missing, is sent more than once or is a "
                "plain field; `template_id` is missing, is sent more than once or is not a UUID."
            ),
        ),
        503: _unavailable(),
    },
)
def create_extraction(
    service: Annotated[ExtractionService, Depends(get_extraction_service)],
    content: Annotated[bytes, Depends(read_upload)],
    template_id: Annotated[UUID, Depends(read_template_id)],
    response: Response,
) -> ExtractionResponse:
    """Queue a document to be read against a template.

    Send the file as multipart form data in the `file` field, with the `template_id` field. The answer comes
    at once, with status 202 and a `Location`; the document is read later. The file is refused at once when it
    is empty, too large or not a PDF, PNG, JPEG or TIFF. A full queue answers 503 with a `Retry-After` header.
    """
    extraction = service.submit(content, template_id)
    response.headers["Location"] = f"{EXTRACTIONS_PATH}/{extraction.id}"
    return ExtractionResponse.from_domain(extraction)


@router.get(
    "",
    operation_id="list_extractions",
    response_model=ExtractionPage,
    responses={422: problem_response(VALIDATION_ERROR)},
)
def list_extractions(
    service: Annotated[ExtractionService, Depends(get_extraction_service)],
    page: Annotated[PageParams, Depends(get_page_params)],
    status: Annotated[
        list[ExtractionStatus] | None,
        Query(
            description="Keep extractions in this status. Repeat the parameter to accept several: "
            "`?status=pending&status=running`. Omit it to keep every status.",
            examples=["failed"],
        ),
    ] = None,
    template_id: Annotated[
        UUID | None,
        Query(
            description="Keep extractions made with this template; an unknown id gives an empty page.",
            examples=["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
        ),
    ] = None,
) -> ExtractionPage:
    """List extractions, newest first, one page at a time.

    `status` and `template_id` narrow the list; a status given more than once matches any of them, and both
    filters must match. `total` counts every match across all pages. A finished extraction whose result expired
    is not listed, as `GET /v1/extractions/{extraction_id}` does not find it.
    """
    items, total = service.page(statuses=status or [], template_id=template_id, limit=page.limit, offset=page.offset)
    return ExtractionPage(
        items=[ExtractionResponse.from_domain(item) for item in items],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get(
    "/{extraction_id}",
    operation_id="get_extraction",
    response_model=ExtractionResponse,
    responses={
        404: problem_response(
            EXTRACTION_NOT_FOUND,
            description="No extraction has this id, or its result expired (`extraction-not-found`).",
        ),
        422: problem_response(VALIDATION_ERROR),
    },
)
def get_extraction(
    extraction_id: Annotated[UUID, Path(description="Identifier of the extraction.")],
    service: Annotated[ExtractionService, Depends(get_extraction_service)],
) -> ExtractionResponse:
    """Return an extraction.

    While `status` is `pending` or `running`, ask again. A `completed` extraction has a `result` with one
    key per field of the template (`null` where the document shows nothing) and the required fields that
    came back `null` under `missing_required`. A `failed` one has an `error`. A result is kept for a limited
    time after it ends, then the extraction is gone.
    """
    return ExtractionResponse.from_domain(service.get(extraction_id))
