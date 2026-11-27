"""One problem type per extraction error, and the mapping the app registers.

An upload the service refuses is the same problem as on the parse endpoint, so those types are reused.
"""

from typing import Final

from formlens.extractions.domain.exceptions import (
    ExtractionNotCancellable,
    ExtractionNotFound,
    QueueFull,
    TemplateMissing,
    UploadEmpty,
    UploadTooLarge,
    UploadUnsupported,
)
from formlens.parsing.errors import FILE_TOO_LARGE, INVALID_FILE, UNSUPPORTED_MEDIA_TYPE
from formlens.problems import ProblemType
from formlens.templates.errors import TEMPLATE_NOT_FOUND

EXTRACTION_NOT_FOUND: Final = ProblemType("extraction-not-found", "Extraction not found", 404)
EXTRACTION_NOT_CANCELLABLE: Final = ProblemType("extraction-not-cancellable", "Extraction not cancellable", 409)
QUEUE_FULL: Final = ProblemType("queue-full", "Queue full", 503)

ERRORS: Final[dict[type[Exception], ProblemType]] = {
    ExtractionNotFound: EXTRACTION_NOT_FOUND,
    ExtractionNotCancellable: EXTRACTION_NOT_CANCELLABLE,
    QueueFull: QUEUE_FULL,
    TemplateMissing: TEMPLATE_NOT_FOUND,
    UploadEmpty: INVALID_FILE,
    UploadTooLarge: FILE_TOO_LARGE,
    UploadUnsupported: UNSUPPORTED_MEDIA_TYPE,
}
