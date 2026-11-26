"""The extractions endpoints, through HTTP, a real SQLite file and a fake parser and model."""

import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from structlog.testing import capture_logs

from formlens.config import Settings
from formlens.extractions.domain.exceptions import InvalidOutput, LlmUnavailable
from formlens.extractions.domain.model import Extraction, ExtractionStatus
from formlens.extractions.service_layer.processor import ExtractionProcessor
from formlens.logging_config import configure_logging
from formlens.main import create_app
from formlens.parsing.exceptions import InvalidFile
from formlens.problems import PROBLEM_MEDIA_TYPE
from tests.conftest import make_settings
from tests.documents import png_of_size, sample
from tests.extractions.factories import NOW, TEMPLATE_ID, ExtractionFactory, TemplateSnapshotFactory
from tests.extractions.fakes import FakeExtractor
from tests.fakes import FakeParser
from tests.templates.factories import field_body, template_body

URL = "/v1/extractions"
PDF = sample("text_layer.pdf")


def problem_type(slug: str) -> str:
    return f"urn:problem:formlens:{slug}"


def make_template(client: TestClient, **overrides: Any) -> dict[str, Any]:
    body = template_body(
        name="Invoice",
        fields=[field_body(name="number", required=True), field_body(name="buyer")],
        **overrides,
    )
    response = client.post("/v1/templates", json=body)
    assert response.status_code == 201
    created: dict[str, Any] = response.json()
    return created


def submit(client: TestClient, template_id: str, content: bytes = PDF, **kwargs: Any) -> Any:
    return client.post(
        URL, data={"template_id": template_id}, files={"file": ("form.pdf", content, "application/pdf")}, **kwargs
    )


def processor(app: FastAPI) -> ExtractionProcessor:
    return app.state.extraction_processor  # type: ignore[no-any-return]  # set by the lifespan


@pytest.fixture
def extractor() -> FakeExtractor:
    return FakeExtractor({"number": "INV-42", "buyer": "ACME"})


@pytest.fixture
def app(settings: Settings, extractor: FakeExtractor) -> Any:
    application = create_app(
        settings, parser_factory=lambda _: FakeParser(), extractor_factory=lambda _: extractor, start_worker=False
    )
    yield application
    application.state.database.dispose()


# --- submit and read -------------------------------------------------------------------------------


def test_a_submitted_document_is_accepted_with_202_and_a_location_and_is_pending(client: TestClient) -> None:
    template = make_template(client)

    response = submit(client, template["id"])

    body = response.json()
    assert response.status_code == 202
    assert response.headers["Location"] == f"{URL}/{body['id']}"
    assert UUID(body["id"]).version == 7
    assert (body["status"], body["attempts"], body["template_id"], body["template_version"]) == (
        "pending",
        0,
        template["id"],
        1,
    )
    assert (body["result"], body["error"], body["missing_required"]) == (None, None, [])
    assert client.get(response.headers["Location"]).json() == body


def test_a_submission_sets_the_templates_last_used_date_to_the_extractions_creation_time(
    client: TestClient,
) -> None:
    used = make_template(client)
    unused = make_template(client)
    assert used["last_used_at"] is None

    first = submit(client, used["id"]).json()
    after_first = client.get(f"/v1/templates/{used['id']}").json()["last_used_at"]
    second = submit(client, used["id"]).json()

    assert after_first == first["created_at"]
    assert client.get(f"/v1/templates/{used['id']}").json()["last_used_at"] == second["created_at"]
    assert client.get(f"/v1/templates/{unused['id']}").json()["last_used_at"] is None


def test_the_last_used_date_is_a_utc_timestamp_written_like_the_other_dates_of_the_template(
    client: TestClient,
) -> None:
    template = make_template(client)
    submit(client, template["id"])

    fetched = client.get(f"/v1/templates/{template['id']}").json()

    last_used = datetime.fromisoformat(fetched["last_used_at"])
    assert last_used.utcoffset() == timedelta(0)
    assert fetched["last_used_at"][-1] == fetched["created_at"][-1] == "Z"
    assert last_used >= datetime.fromisoformat(fetched["created_at"])


def test_a_submission_marks_only_its_own_template(client: TestClient) -> None:
    first = make_template(client)
    second = make_template(client)
    submit(client, first["id"])

    listed = {item["id"]: item["last_used_at"] for item in client.get("/v1/templates").json()["items"]}

    assert listed[first["id"]] is not None
    assert listed[second["id"]] is None


def test_a_refused_submission_leaves_the_templates_last_used_date_empty(client: TestClient) -> None:
    template = make_template(client)

    assert submit(client, template["id"], b"").status_code == 400

    assert client.get(f"/v1/templates/{template['id']}").json()["last_used_at"] is None


def test_a_submission_is_accepted_when_the_last_used_date_cannot_be_written(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    template = make_template(client)

    def fail(*_: object) -> None:
        raise RuntimeError("database is locked")

    monkeypatch.setattr(app.state.template_repository, "mark_used", fail)

    with capture_logs() as logs:
        response = submit(client, template["id"])

    body = response.json()
    assert response.status_code == 202
    assert client.get(response.headers["Location"]).json() == body
    assert [entry["event"] for entry in logs if entry["log_level"] == "error"] == ["template_mark_used_failed"]
    assert client.get(f"/v1/templates/{template['id']}").json()["last_used_at"] is None


def test_a_template_deleted_while_it_is_marked_does_not_fail_the_submission(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    template = make_template(client)
    repository = app.state.template_repository
    mark_used = repository.mark_used

    def delete_then_mark(template_id: UUID, at: datetime) -> None:
        repository.delete(template_id)
        mark_used(template_id, at)

    monkeypatch.setattr(repository, "mark_used", delete_then_mark)

    with capture_logs() as logs:
        response = submit(client, template["id"])

    assert response.status_code == 202
    assert client.get(response.headers["Location"]).json() == response.json()
    assert [entry for entry in logs if entry["log_level"] == "error"] == []
    assert client.get(f"/v1/templates/{template['id']}").status_code == 404


def test_a_database_that_refuses_the_last_used_date_still_accepts_this_and_the_next_submission(
    app: FastAPI, client: TestClient
) -> None:
    template = make_template(client)
    with app.state.database.engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TRIGGER refuse_mark BEFORE UPDATE OF last_used_at ON templates "
            "BEGIN SELECT RAISE(ABORT, 'refused'); END"
        )

    with capture_logs() as logs:
        first = submit(client, template["id"])
        second = submit(client, template["id"])

    assert (first.status_code, second.status_code) == (202, 202)
    assert [entry["event"] for entry in logs if entry["log_level"] == "error"] == ["template_mark_used_failed"] * 2
    assert client.get(f"/v1/templates/{template['id']}").json()["last_used_at"] is None
    with app.state.database.engine.begin() as connection:
        connection.exec_driver_sql("DROP TRIGGER refuse_mark")
    third = submit(client, template["id"])
    assert third.status_code == 202
    assert client.get(f"/v1/templates/{template['id']}").json()["last_used_at"] == third.json()["created_at"]


def test_the_last_used_date_is_listed_with_the_template_and_survives_a_replacement(client: TestClient) -> None:
    template = make_template(client)
    created_at = submit(client, template["id"]).json()["created_at"]

    client.put(f"/v1/templates/{template['id']}", json=template_body(name="Renamed"))

    listed = client.get("/v1/templates", params={"search": "renamed"}).json()
    assert [(item["name"], item["last_used_at"]) for item in listed["items"]] == [("Renamed", created_at)]


def test_a_job_goes_from_pending_to_completed_with_a_result_that_fits_the_template(
    app: FastAPI, client: TestClient
) -> None:
    template = make_template(client)
    location = submit(client, template["id"]).headers["Location"]

    assert processor(app).run_once() is True

    done = client.get(location).json()
    assert done["status"] == "completed"
    assert done["attempts"] == 1
    assert done["result"] == {"number": "INV-42", "buyer": "ACME"}
    assert Draft202012Validator(template["json_schema"]).is_valid(done["result"])
    assert (done["started_at"], done["finished_at"]) != (None, None)
    assert (done["error"], done["missing_required"]) == (None, [])


def test_ten_documents_complete_one_after_another_each_with_a_result_that_fits_the_schema(
    app: FastAPI, client: TestClient
) -> None:
    template = make_template(client)
    locations = [submit(client, template["id"]).headers["Location"] for _ in range(10)]
    assert {client.get(location).json()["status"] for location in locations} == {"pending"}
    validator = Draft202012Validator(template["json_schema"])

    steps = [processor(app).run_once() for _ in range(11)]

    assert steps == [True] * 10 + [False]
    results = [client.get(location).json() for location in locations]
    assert {item["status"] for item in results} == {"completed"}
    assert all(validator.is_valid(item["result"]) for item in results)
    assert [item["id"] for item in results] == [location.rsplit("/", 1)[1] for location in locations]


def test_a_null_in_a_required_field_is_still_completed_and_is_listed_as_missing(
    app: FastAPI, client: TestClient, extractor: FakeExtractor
) -> None:
    extractor.values = {"number": None, "buyer": "ACME"}
    template = make_template(client)
    location = submit(client, template["id"]).headers["Location"]

    processor(app).run_once()

    done = client.get(location).json()
    assert done["status"] == "completed"
    assert done["result"] == {"number": None, "buyer": "ACME"}
    assert done["missing_required"] == ["number"]


def test_a_failed_job_reports_a_reason_and_a_fixed_message_and_no_result(
    app: FastAPI, client: TestClient, extractor: FakeExtractor
) -> None:
    extractor.errors = [InvalidOutput("schema"), InvalidOutput("schema")]
    template = make_template(client)
    location = submit(client, template["id"]).headers["Location"]

    processor(app).run_once()
    assert client.get(location).json()["status"] == "pending"  # the first attempt is retried
    processor(app).run_once()

    failed = client.get(location).json()
    assert (failed["status"], failed["attempts"], failed["result"]) == ("failed", 2, None)
    assert failed["error"] == {
        "reason": "invalid_output",
        "message": "The language model did not return a result that fits the template.",
    }


def test_a_model_that_is_down_fails_the_job_after_the_attempts_without_losing_it_meanwhile(
    app: FastAPI, client: TestClient, extractor: FakeExtractor
) -> None:
    extractor.errors = [LlmUnavailable("ConnectError"), LlmUnavailable("ConnectError")]
    template = make_template(client)
    location = submit(client, template["id"]).headers["Location"]

    processor(app).run_once()
    processor(app).run_once()

    assert client.get(location).json()["error"]["reason"] == "llm_unavailable"


# --- the template is copied at submit time ---------------------------------------------------------


def test_editing_the_template_after_submit_does_not_change_the_queued_job(
    app: FastAPI, client: TestClient, extractor: FakeExtractor
) -> None:
    template = make_template(client)
    location = submit(client, template["id"]).headers["Location"]
    client.put(
        f"/v1/templates/{template['id']}",
        json=template_body(name="Invoice 2", fields=[field_body(name="other", required=True)]),
    )

    processor(app).run_once()

    done = client.get(location).json()
    assert done["template_version"] == 1
    assert sorted(done["result"]) == ["buyer", "number"]  # the fields of version 1, not of version 2
    assert extractor.calls[0][1] == UUID(template["id"])


def test_deleting_the_template_after_submit_does_not_stop_the_job(app: FastAPI, client: TestClient) -> None:
    template = make_template(client)
    location = submit(client, template["id"]).headers["Location"]
    assert client.delete(f"/v1/templates/{template['id']}").status_code == 204

    processor(app).run_once()

    assert client.get(location).json()["status"] == "completed"


# --- refusals --------------------------------------------------------------------------------------


def test_an_unknown_template_is_a_404_template_not_found_and_nothing_is_queued(client: TestClient) -> None:
    response = submit(client, str(uuid4()))

    assert response.status_code == 404
    assert response.headers["content-type"] == PROBLEM_MEDIA_TYPE
    assert response.json()["type"] == problem_type("template-not-found")


def test_an_empty_file_is_a_400_invalid_file(client: TestClient) -> None:
    template = make_template(client)

    response = submit(client, template["id"], b"")

    assert (response.status_code, response.json()["type"]) == (400, problem_type("invalid-file"))


def test_a_file_that_is_not_a_document_is_a_415(client: TestClient) -> None:
    template = make_template(client)

    response = submit(client, template["id"], b"just some text")

    assert (response.status_code, response.json()["type"]) == (415, problem_type("unsupported-media-type"))


@pytest.mark.parametrize("size", [1024 * 1024 + 1, 3 * 1024 * 1024], ids=["over-the-limit", "over-the-body-cap"])
def test_a_file_over_the_limit_is_a_413(db_url: str, size: int) -> None:
    app = create_app(
        make_settings(db_url=db_url, max_upload_mb=1),
        parser_factory=lambda _: FakeParser(),
        extractor_factory=lambda _: FakeExtractor(),
        start_worker=False,
    )
    try:
        with TestClient(app) as client:
            template = make_template(client)
            response = submit(client, template["id"], png_of_size(size))
    finally:
        app.state.database.dispose()

    assert (response.status_code, response.json()["type"]) == (413, problem_type("file-too-large"))


@pytest.mark.parametrize(
    "data",
    [{}, {"template_id": "not-a-uuid"}],
    ids=["no-template-id", "template-id-not-a-uuid"],
)
def test_a_missing_or_malformed_template_id_is_a_422(client: TestClient, data: dict[str, str]) -> None:
    response = client.post(URL, data=data, files={"file": ("a.pdf", PDF, "application/pdf")})

    assert response.status_code == 422
    assert response.json()["type"] == problem_type("validation-error")


def test_a_request_without_a_file_is_a_422(client: TestClient) -> None:
    template = make_template(client)

    response = client.post(URL, data={"template_id": template["id"]})

    assert response.status_code == 422


def test_an_unknown_extraction_is_a_404_extraction_not_found(client: TestClient) -> None:
    response = client.get(f"{URL}/{uuid4()}")

    assert response.status_code == 404
    assert response.json()["type"] == problem_type("extraction-not-found")


def test_an_extraction_id_that_is_not_a_uuid_is_a_422(client: TestClient) -> None:
    response = client.get(f"{URL}/not-a-uuid")

    assert (response.status_code, response.json()["type"]) == (422, problem_type("validation-error"))


def test_a_result_older_than_its_time_to_live_is_a_404_even_before_the_purge(app: FastAPI, client: TestClient) -> None:
    template = make_template(client)
    location = submit(client, template["id"]).headers["Location"]
    repository = app.state.extraction_repository
    taken = repository.claim_next(datetime.now(UTC))
    ended = taken.complete({"number": "x", "buyer": None}, datetime.now(UTC) - timedelta(hours=25))
    assert repository.finish_if_running(ended) is True

    response = client.get(location)

    assert (response.status_code, response.json()["type"]) == (404, problem_type("extraction-not-found"))


# --- the queue -------------------------------------------------------------------------------------


def test_a_full_queue_is_a_503_queue_full_with_retry_after_and_a_free_place_opens_when_a_job_ends(
    db_url: str,
) -> None:
    app = create_app(
        make_settings(db_url=db_url, queue_max_pending=2),
        parser_factory=lambda _: FakeParser(),
        extractor_factory=lambda _: FakeExtractor(),
        start_worker=False,
    )
    try:
        with TestClient(app) as client:
            template = make_template(client)
            assert [submit(client, template["id"]).status_code for _ in range(2)] == [202, 202]

            full = submit(client, template["id"])
            processor(app).run_once()
            again = submit(client, template["id"])
    finally:
        app.state.database.dispose()

    assert full.status_code == 503
    assert full.headers["Retry-After"] == "30"
    assert full.json()["type"] == problem_type("queue-full")
    assert again.status_code == 202


def test_a_browser_may_read_the_location_header(db_url: str) -> None:
    origin = "https://app.example.com"
    app = create_app(
        make_settings(db_url=db_url, cors_origins=[origin]),
        parser_factory=lambda _: FakeParser(),
        extractor_factory=lambda _: FakeExtractor(),
        start_worker=False,
    )
    try:
        with TestClient(app) as client:
            template = make_template(client)
            response = client.post(
                URL,
                data={"template_id": template["id"]},
                files={"file": ("a.pdf", PDF, "application/pdf")},
                headers={"Origin": origin},
            )
    finally:
        app.state.database.dispose()

    exposed = response.headers["access-control-expose-headers"]
    assert "Location" in exposed
    assert "Retry-After" in exposed


# --- the spec --------------------------------------------------------------------------------------


def test_the_three_routes_are_in_the_spec_with_their_statuses(client: TestClient) -> None:
    spec = client.app.openapi()  # type: ignore[attr-defined]  # the app of the client

    post = spec["paths"]["/v1/extractions"]["post"]
    listing = spec["paths"]["/v1/extractions"]["get"]
    get = spec["paths"]["/v1/extractions/{extraction_id}"]["get"]
    assert (post["operationId"], listing["operationId"], get["operationId"]) == (
        "create_extraction",
        "list_extractions",
        "get_extraction",
    )
    assert sorted(listing["responses"]) == ["200", "422"]
    assert {parameter["name"] for parameter in listing["parameters"]} == {"limit", "offset", "status", "template_id"}
    assert sorted(post["responses"]) == ["202", "400", "404", "413", "415", "422", "503"]
    assert "Location" in post["responses"]["202"]["headers"]
    assert "Retry-After" in post["responses"]["503"]["headers"]
    assert sorted(get["responses"]) == ["200", "404", "422"]


def test_the_response_has_no_field_for_the_document_or_the_prompt(client: TestClient) -> None:
    schema = client.app.openapi()["components"]["schemas"]["ExtractionResponse"]  # type: ignore[attr-defined]

    assert set(schema["properties"]) == {
        "id",
        "status",
        "template_id",
        "template_version",
        "result",
        "missing_required",
        "error",
        "attempts",
        "created_at",
        "started_at",
        "finished_at",
    }


def test_the_extraction_state_is_exactly_what_the_repository_holds(app: FastAPI, client: TestClient) -> None:
    template = make_template(client)
    body = submit(client, template["id"]).json()

    stored: Extraction | None = app.state.extraction_repository.get(UUID(body["id"]))

    assert stored is not None
    assert stored.status is ExtractionStatus.PENDING
    assert body["id"] == str(stored.id)


# --- the request, read strictly --------------------------------------------------------------------


@pytest.mark.parametrize("bad_first", [True, False], ids=["bad-first", "bad-last"])
def test_a_template_id_sent_twice_is_a_422_and_queues_nothing(client: TestClient, bad_first: bool) -> None:
    """A repeated `file` part is refused rather than resolved silently; a repeated `template_id` is the same case."""
    template = make_template(client)
    ids = ["not-a-uuid", template["id"]] if bad_first else [template["id"], str(uuid4())]

    response = client.post(URL, data={"template_id": ids}, files={"file": ("a.pdf", PDF, "application/pdf")})

    assert response.status_code == 422
    assert response.json()["type"] == problem_type("validation-error")


def test_two_files_in_one_request_are_a_422_and_queue_nothing(app: FastAPI, client: TestClient) -> None:
    template = make_template(client)

    response = client.post(
        URL,
        data={"template_id": template["id"]},
        files=[("file", ("a.pdf", PDF, "application/pdf")), ("file", ("b.pdf", PDF, "application/pdf"))],
    )

    assert (response.status_code, response.json()["type"]) == (422, problem_type("validation-error"))
    assert app.state.extraction_repository.count_pending() == 0


def test_a_file_exactly_at_the_size_limit_is_accepted(db_url: str) -> None:
    app = create_app(
        make_settings(db_url=db_url, max_upload_mb=1),
        parser_factory=lambda _: FakeParser(),
        extractor_factory=lambda _: FakeExtractor(),
        start_worker=False,
    )
    try:
        with TestClient(app) as client:
            template = make_template(client)
            response = submit(client, template["id"], png_of_size(1024 * 1024))
    finally:
        app.state.database.dispose()

    assert response.status_code == 202


def test_a_deleted_template_is_a_404_for_a_new_document_and_nothing_is_queued(app: FastAPI, client: TestClient) -> None:
    template = make_template(client)
    assert client.delete(f"/v1/templates/{template['id']}").status_code == 204

    response = submit(client, template["id"])

    assert (response.status_code, response.json()["type"]) == (404, problem_type("template-not-found"))
    assert app.state.extraction_repository.count_pending() == 0


@pytest.mark.parametrize(
    ("method", "path", "allowed"),
    [
        pytest.param("PUT", "/v1/extractions", "GET, POST", id="collection-put"),
        pytest.param("DELETE", "/v1/extractions", "GET, POST", id="collection-delete"),
        pytest.param("POST", f"/v1/extractions/{UUID(int=1)}", "GET", id="item-post"),
        pytest.param("DELETE", f"/v1/extractions/{UUID(int=1)}", "GET", id="item-delete"),
        pytest.param("PUT", f"/v1/extractions/{UUID(int=1)}", "GET", id="item-put"),
    ],
)
def test_a_wrong_method_on_an_extractions_path_is_a_405_with_the_allow_header(
    client: TestClient, method: str, path: str, allowed: str
) -> None:
    response = client.request(method, path)

    assert response.status_code == 405
    assert response.headers["Allow"] == allowed
    assert response.headers["content-type"] == PROBLEM_MEDIA_TYPE


# --- reading the job -------------------------------------------------------------------------------


def test_a_job_is_seen_running_while_the_model_works_and_completed_when_it_is_released(
    db_url: str,
) -> None:
    release = threading.Event()
    extractor = FakeExtractor({"number": "INV-42"}, release=release)
    app = create_app(
        make_settings(db_url=db_url),
        parser_factory=lambda _: FakeParser(),
        extractor_factory=lambda _: extractor,
        start_worker=False,
    )
    try:
        with TestClient(app) as client:
            location = submit(client, make_template(client)["id"]).headers["Location"]
            pending = client.get(location).json()
            with ThreadPoolExecutor(1) as pool:
                worker = pool.submit(processor(app).run_once)
                assert extractor.started.wait(5)
                running = client.get(location).json()
                release.set()
                assert worker.result(timeout=10) is True
            done = client.get(location).json()
    finally:
        release.set()
        app.state.database.dispose()

    assert [pending["status"], running["status"], done["status"]] == ["pending", "running", "completed"]
    assert (pending["attempts"], running["attempts"], done["attempts"]) == (0, 1, 1)
    assert (running["result"], running["finished_at"], running["started_at"] is None) == (None, None, False)
    assert done["result"]["number"] == "INV-42"


def test_reading_a_finished_extraction_again_returns_the_same_answer_and_changes_nothing(
    app: FastAPI, client: TestClient
) -> None:
    location = submit(client, make_template(client)["id"]).headers["Location"]
    processor(app).run_once()

    reads = [client.get(location) for _ in range(3)]

    assert {read.status_code for read in reads} == {200}
    assert reads[0].json() == reads[1].json() == reads[2].json()
    assert processor(app).run_once() is False  # reading took nothing from the queue and requeued nothing


@pytest.mark.parametrize(
    "value", [0, False, "", 0.0, [], "null"], ids=["zero", "false", "empty-string", "float-zero", "empty-list", "text"]
)
def test_a_required_field_holding_a_falsy_value_is_not_missing(
    app: FastAPI, client: TestClient, extractor: FakeExtractor, value: Any
) -> None:
    extractor.values = {"number": value}
    location = submit(client, make_template(client)["id"]).headers["Location"]
    processor(app).run_once()

    done = client.get(location).json()

    assert done["status"] == "completed"
    assert done["missing_required"] == []


# --- the document stays out of the logs ------------------------------------------------------------


def test_no_value_of_the_result_and_no_text_of_a_failure_reaches_the_log(
    app: FastAPI, client: TestClient, extractor: FakeExtractor, capsys: pytest.CaptureFixture[str]
) -> None:
    configure_logging(make_settings(log_format="json", log_level="DEBUG"))
    marker = "SECRET-PESEL-44051401359"
    template = make_template(client)
    extractor.values = {"number": marker, "buyer": marker}
    completed = submit(client, template["id"]).headers["Location"]
    processor(app).run_once()
    extractor.errors = [RuntimeError(f"model said {marker}"), InvalidOutput("schema")]
    interrupted = submit(client, template["id"]).headers["Location"]
    processor(app).run_once()

    answers = [client.get(completed), client.get(interrupted)]
    out = capsys.readouterr().out

    assert answers[0].json()["result"] == {"number": marker, "buyer": marker}  # the result itself is served
    assert answers[1].json()["error"]["reason"] == "interrupted"
    assert marker not in answers[1].text
    assert "extraction_finished" in out  # the log was captured at all
    assert marker not in out


# --- a full queue under parallel requests ----------------------------------------------------------

ROUNDS = [pytest.param(number, id=f"round-{number}") for number in range(5)]


@pytest.mark.concurrency
@pytest.mark.parametrize("_round", ROUNDS)
def test_parallel_submissions_beyond_the_queue_cap_are_503_with_retry_after_and_the_rest_are_queued(
    db_url: str, _round: int
) -> None:
    room, posters = 3, 8
    app = create_app(
        make_settings(db_url=db_url, queue_max_pending=room),
        parser_factory=lambda _: FakeParser(),
        extractor_factory=lambda _: FakeExtractor(),
        start_worker=False,
    )
    try:
        with TestClient(app) as client:
            template = make_template(client)
            app.openapi()  # the first request builds the OpenAPI document; do not let the threads do it together
            barrier = threading.Barrier(posters, timeout=5)

            def post(_: int) -> Any:
                own = TestClient(app)
                barrier.wait()
                return submit(own, template["id"])

            with ThreadPoolExecutor(posters) as pool:
                answers = list(pool.map(post, range(posters)))
            queued = [answer for answer in answers if answer.status_code == 202]
            states = [client.get(answer.headers["Location"]).json()["status"] for answer in queued]
    finally:
        app.state.database.dispose()

    assert Counter(answer.status_code for answer in answers) == {202: room, 503: posters - room}
    assert {answer.headers["Retry-After"] for answer in answers if answer.status_code == 503} == {"30"}
    assert len({answer.headers["Location"] for answer in queued}) == room
    assert states == ["pending"] * room


def test_a_template_id_sent_twice_queues_nothing_and_names_the_field(app: FastAPI, client: TestClient) -> None:
    template = make_template(client)

    response = client.post(
        URL, data={"template_id": [template["id"], template["id"]]}, files={"file": ("a.pdf", PDF, "application/pdf")}
    )

    assert response.status_code == 422
    assert response.json()["errors"] == [
        {"loc": ["body", "template_id"], "msg": "Send the template_id once.", "type": "repeated_parameter"}
    ]
    assert app.state.extraction_repository.count_pending() == 0


def test_a_corrupt_file_with_a_valid_signature_is_queued_and_the_extraction_fails_as_invalid_file(
    db_url: str,
) -> None:
    """What problem-types.md says: this endpoint answers 400 `invalid-file` for an empty file only."""
    app = create_app(
        make_settings(db_url=db_url),
        parser_factory=lambda _: FakeParser(error=InvalidFile()),  # the model cannot open the file
        extractor_factory=lambda _: FakeExtractor(),
        start_worker=False,
    )
    try:
        with TestClient(app) as client:
            template = make_template(client)
            queued = submit(client, template["id"], b"%PDF-1.7 corrupt")

            processor(app).run_once()

            failed = client.get(queued.headers["Location"]).json()
    finally:
        app.state.database.dispose()

    assert queued.status_code == 202
    assert (failed["status"], failed["error"]["reason"], failed["attempts"]) == ("failed", "invalid_file", 1)


# --- the list --------------------------------------------------------------------------------------


def put(
    app: FastAPI,
    n: int,
    *,
    status: ExtractionStatus = ExtractionStatus.PENDING,
    template_id: str | None = None,
    created_at: datetime | None = None,
    finished_at: datetime | None = None,
) -> Extraction:
    """Store extraction number `n` as it is given, `n` seconds after `NOW`, the way the service stores one."""
    snapshot = TemplateSnapshotFactory.build(template_id=UUID(template_id) if template_id else TEMPLATE_ID)
    extraction = ExtractionFactory.build(
        id=UUID(int=n),
        status=status,
        template=snapshot,
        created_at=created_at or NOW + timedelta(seconds=n),
        finished_at=finished_at,
    )
    app.state.extraction_repository.add(extraction, PDF, max_pending=1000)
    return extraction


def ids_of(response: Any) -> list[str]:
    return [item["id"] for item in response.json()["items"]]


def test_the_list_has_every_extraction_newest_first_and_a_total(app: FastAPI, client: TestClient) -> None:
    for n in (1, 2, 3):
        put(app, n)

    response = client.get(URL)

    assert response.status_code == 200
    assert ids_of(response) == [str(UUID(int=n)) for n in (3, 2, 1)]
    body = response.json()
    assert (body["total"], body["limit"], body["offset"]) == (3, 20, 0)
    assert set(body) == {"items", "total", "limit", "offset"}


def test_the_list_of_an_empty_store_is_an_empty_page(client: TestClient) -> None:
    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "limit": 20, "offset": 0}


def test_the_third_page_of_twenty_five_has_five_items_and_the_total_of_all(app: FastAPI, client: TestClient) -> None:
    for n in range(1, 26):
        put(app, n)

    response = client.get(URL, params={"limit": 10, "offset": 20})

    body = response.json()
    assert (response.status_code, len(body["items"]), body["total"], body["limit"], body["offset"]) == (
        200,
        5,
        25,
        10,
        20,
    )
    assert ids_of(response) == [str(UUID(int=n)) for n in (5, 4, 3, 2, 1)]


def test_an_offset_past_the_end_is_an_empty_page_with_the_real_total(app: FastAPI, client: TestClient) -> None:
    for n in (1, 2, 3):
        put(app, n)

    response = client.get(URL, params={"offset": 100})

    assert (response.status_code, response.json()["items"], response.json()["total"]) == (200, [], 3)


def test_two_extractions_created_at_the_same_time_keep_their_order_across_pages(
    app: FastAPI, client: TestClient
) -> None:
    for n in range(1, 5):
        put(app, n, created_at=NOW)

    first = client.get(URL, params={"limit": 2, "offset": 0})
    second = client.get(URL, params={"limit": 2, "offset": 2})

    assert ids_of(first) + ids_of(second) == [str(UUID(int=n)) for n in (4, 3, 2, 1)]


def test_the_status_filter_keeps_only_that_status_and_the_total_follows(app: FastAPI, client: TestClient) -> None:
    put(app, 1, status=ExtractionStatus.PENDING)
    put(app, 2, status=ExtractionStatus.FAILED, finished_at=datetime.now(UTC))
    put(app, 3, status=ExtractionStatus.FAILED, finished_at=datetime.now(UTC))

    response = client.get(URL, params={"status": "failed"})

    assert ids_of(response) == [str(UUID(int=3)), str(UUID(int=2))]
    assert response.json()["total"] == 2


def test_the_template_filter_keeps_only_that_templates_extractions(app: FastAPI, client: TestClient) -> None:
    template_a, template_b = str(UUID(int=0xA)), str(UUID(int=0xB))
    put(app, 1, template_id=template_a)
    put(app, 2, template_id=template_b)
    put(app, 3, template_id=template_a)

    response = client.get(URL, params={"template_id": template_a})

    assert ids_of(response) == [str(UUID(int=3)), str(UUID(int=1))]
    assert response.json()["total"] == 2


def test_status_and_template_filters_must_both_match(app: FastAPI, client: TestClient) -> None:
    template_a, template_b = str(UUID(int=0xA)), str(UUID(int=0xB))
    finished = datetime.now(UTC)
    put(app, 1, template_id=template_a, status=ExtractionStatus.FAILED, finished_at=finished)
    put(app, 2, template_id=template_b, status=ExtractionStatus.FAILED, finished_at=finished)
    put(app, 3, template_id=template_a, status=ExtractionStatus.PENDING)

    response = client.get(URL, params={"status": "failed", "template_id": template_a})

    assert ids_of(response) == [str(UUID(int=1))]
    assert response.json()["total"] == 1


def test_a_repeated_status_matches_any_of_them(app: FastAPI, client: TestClient) -> None:
    finished = datetime.now(UTC)
    put(app, 1, status=ExtractionStatus.PENDING)
    put(app, 2, status=ExtractionStatus.RUNNING)
    put(app, 3, status=ExtractionStatus.COMPLETED, finished_at=finished)
    put(app, 4, status=ExtractionStatus.FAILED, finished_at=finished)

    response = client.get(URL, params=[("status", "pending"), ("status", "running")])

    assert response.status_code == 200
    assert ids_of(response) == [str(UUID(int=2)), str(UUID(int=1))]
    assert response.json()["total"] == 2


def test_the_same_status_given_twice_lists_each_extraction_once(app: FastAPI, client: TestClient) -> None:
    put(app, 1, status=ExtractionStatus.PENDING)
    put(app, 2, status=ExtractionStatus.FAILED, finished_at=datetime.now(UTC))

    response = client.get(URL, params=[("status", "failed"), ("status", "failed")])

    assert ids_of(response) == [str(UUID(int=2))]
    assert response.json()["total"] == 1


def test_a_template_that_does_not_exist_is_an_empty_page_not_a_404(client: TestClient) -> None:
    response = client.get(URL, params={"template_id": str(uuid4())})

    assert (response.status_code, response.json()["items"], response.json()["total"]) == (200, [], 0)


def test_the_extractions_of_a_deleted_template_are_still_listed(client: TestClient) -> None:
    template = make_template(client)
    submitted = submit(client, template["id"]).json()
    assert client.delete(f"/v1/templates/{template['id']}").status_code == 204

    response = client.get(URL, params={"template_id": template["id"]})

    assert (response.status_code, ids_of(response), response.json()["total"]) == (200, [submitted["id"]], 1)


@pytest.mark.parametrize(
    "params",
    [
        pytest.param({"status": "unknown"}, id="status-unknown"),
        pytest.param({"template_id": "not-a-uuid"}, id="template-id-not-a-uuid"),
        pytest.param({"limit": 0}, id="limit-0"),
        pytest.param({"limit": 101}, id="limit-101"),
        pytest.param({"offset": -1}, id="offset-negative"),
    ],
)
def test_an_invalid_filter_or_page_parameter_is_a_422_problem(client: TestClient, params: dict[str, Any]) -> None:
    response = client.get(URL, params=params)

    assert response.status_code == 422
    assert response.headers["content-type"] == PROBLEM_MEDIA_TYPE
    assert response.json()["type"] == problem_type("validation-error")


def test_a_repeated_status_with_one_bad_value_is_a_422(client: TestClient) -> None:
    response = client.get(URL, params=[("status", "pending"), ("status", "nope")])

    assert (response.status_code, response.json()["type"]) == (422, problem_type("validation-error"))


def test_a_scalar_parameter_given_twice_is_still_a_422(client: TestClient) -> None:
    response = client.get(URL, params=[("template_id", str(uuid4())), ("template_id", str(uuid4()))])

    assert (response.status_code, response.json()["type"]) == (422, problem_type("validation-error"))


def test_each_listed_item_is_the_same_as_the_extraction_read_by_id(app: FastAPI, client: TestClient) -> None:
    template = make_template(client)
    location = submit(client, template["id"]).headers["Location"]
    processor(app).run_once()
    submit(client, template["id"])  # one more, still pending

    listed = client.get(URL).json()["items"]

    assert len(listed) == 2
    assert [client.get(f"{URL}/{item['id']}").json() for item in listed] == listed
    assert {item["status"] for item in listed} == {"completed", "pending"}
    assert location.rsplit("/", 1)[1] in {item["id"] for item in listed}


def test_a_result_past_its_time_to_live_is_neither_listed_nor_counted_and_is_a_404_by_id(
    app: FastAPI, client: TestClient
) -> None:
    now = datetime.now(UTC)
    expired = put(app, 1, status=ExtractionStatus.COMPLETED, finished_at=now - timedelta(hours=25))
    fresh = put(app, 2, status=ExtractionStatus.COMPLETED, finished_at=now - timedelta(hours=23))

    listed = client.get(URL)

    assert ids_of(listed) == [str(fresh.id)]
    assert listed.json()["total"] == 1
    assert client.get(f"{URL}/{expired.id}").status_code == 404
    assert client.get(f"{URL}/{fresh.id}").status_code == 200


def test_a_pending_extraction_older_than_the_time_to_live_is_still_listed(app: FastAPI, client: TestClient) -> None:
    old = put(app, 1, created_at=datetime.now(UTC) - timedelta(days=30))

    response = client.get(URL)

    assert (ids_of(response), response.json()["total"]) == ([str(old.id)], 1)


# --- the list: edges the first tests leave open ---------------------------------------------------


def test_the_list_without_a_limit_returns_the_default_page_of_twenty(app: FastAPI, client: TestClient) -> None:
    for n in range(1, 26):
        put(app, n)

    body = client.get(URL).json()

    assert (len(body["items"]), body["total"], body["limit"], body["offset"]) == (20, 25, 20, 0)
    assert [item["id"] for item in body["items"]] == [str(UUID(int=n)) for n in range(25, 5, -1)]


@pytest.mark.parametrize(
    ("params", "expected_ids", "limit", "offset"),
    [
        pytest.param({"limit": 100}, [3, 2, 1], 100, 0, id="limit-100"),
        pytest.param({"limit": 1}, [3], 1, 0, id="limit-1"),
        pytest.param({"limit": 5, "offset": 2147483647}, [], 5, 2147483647, id="offset-maximum"),
        pytest.param({"offset": 0}, [3, 2, 1], 20, 0, id="offset-0"),
    ],
)
def test_the_limit_and_offset_at_their_edges_are_accepted_and_echoed(
    app: FastAPI, client: TestClient, params: dict[str, Any], expected_ids: list[int], limit: int, offset: int
) -> None:
    for n in (1, 2, 3):
        put(app, n)

    response = client.get(URL, params=params)

    body = response.json()
    assert response.status_code == 200
    assert ids_of(response) == [str(UUID(int=n)) for n in expected_ids]
    assert (body["total"], body["limit"], body["offset"]) == (3, limit, offset)


@pytest.mark.parametrize(
    "params",
    [
        pytest.param([("offset", "2147483648")], id="offset-over-the-maximum"),
        pytest.param([("limit", "abc")], id="limit-not-a-number"),
        pytest.param([("limit", "1.5")], id="limit-not-an-integer"),
        pytest.param([("offset", "abc")], id="offset-not-a-number"),
        pytest.param([("limit", "5"), ("limit", "6")], id="limit-twice"),
        pytest.param([("offset", "0"), ("offset", "1")], id="offset-twice"),
        pytest.param([("status", "")], id="status-empty"),
        pytest.param([("status", "FAILED")], id="status-wrong-case"),
        pytest.param([("template_id", "")], id="template-id-empty"),
    ],
)
def test_more_invalid_list_parameters_are_a_422_problem_and_list_nothing(
    app: FastAPI, client: TestClient, params: Any
) -> None:
    put(app, 1)

    response = client.get(URL, params=params)

    assert response.status_code == 422
    assert response.headers["content-type"] == PROBLEM_MEDIA_TYPE
    assert response.json()["type"] == problem_type("validation-error")
    assert "items" not in response.json()


def test_the_list_follows_creation_time_not_the_order_of_ids_or_of_insertion(app: FastAPI, client: TestClient) -> None:
    put(app, 2, created_at=NOW + timedelta(seconds=30))
    put(app, 3, created_at=NOW)
    put(app, 1, created_at=NOW + timedelta(seconds=60))

    response = client.get(URL)

    assert ids_of(response) == [str(UUID(int=n)) for n in (1, 2, 3)]


def test_a_failed_extraction_past_its_time_to_live_is_neither_listed_nor_counted_under_a_status_filter(
    app: FastAPI, client: TestClient
) -> None:
    now = datetime.now(UTC)
    put(app, 1, status=ExtractionStatus.FAILED, finished_at=now - timedelta(hours=25))
    kept = put(app, 2, status=ExtractionStatus.FAILED, finished_at=now - timedelta(hours=1))

    response = client.get(URL, params=[("status", "failed"), ("status", "completed")])

    assert (ids_of(response), response.json()["total"]) == ([str(kept.id)], 1)


def test_expired_extractions_in_the_middle_leave_no_gap_between_pages_and_no_count(
    app: FastAPI, client: TestClient
) -> None:
    now = datetime.now(UTC)
    for n in (1, 2, 4, 5):
        put(app, n, status=ExtractionStatus.FAILED, finished_at=now)
    put(app, 3, status=ExtractionStatus.FAILED, finished_at=now - timedelta(hours=48))

    first = client.get(URL, params={"limit": 2, "offset": 0})
    second = client.get(URL, params={"limit": 2, "offset": 2})
    third = client.get(URL, params={"limit": 2, "offset": 4})

    assert ids_of(first) + ids_of(second) == [str(UUID(int=n)) for n in (5, 4, 2, 1)]
    assert (ids_of(third), first.json()["total"], second.json()["total"], third.json()["total"]) == ([], 4, 4, 4)


def test_the_time_to_live_of_the_list_is_the_one_in_the_settings(db_url: str) -> None:
    app = create_app(
        make_settings(db_url=db_url, result_ttl_hours=1),
        parser_factory=lambda _: FakeParser(),
        extractor_factory=lambda _: FakeExtractor(),
        start_worker=False,
    )
    try:
        with TestClient(app) as client:
            now = datetime.now(UTC)
            put(app, 1, status=ExtractionStatus.COMPLETED, finished_at=now - timedelta(hours=2))
            kept = put(app, 2, status=ExtractionStatus.COMPLETED, finished_at=now - timedelta(minutes=30))

            response = client.get(URL)
    finally:
        app.state.database.dispose()

    assert (ids_of(response), response.json()["total"]) == ([str(kept.id)], 1)


@pytest.mark.parametrize("spelling", [str.upper, lambda text: text.replace("-", "")], ids=["uppercase", "no-hyphens"])
def test_a_template_id_in_another_uuid_spelling_matches_the_same_extractions(
    app: FastAPI, client: TestClient, spelling: Any
) -> None:
    template_a, template_b = str(UUID(int=0xAB)), str(UUID(int=0xCD))
    put(app, 1, template_id=template_a)
    put(app, 2, template_id=template_b)

    response = client.get(URL, params={"template_id": spelling(template_a)})

    assert (ids_of(response), response.json()["total"]) == ([str(UUID(int=1))], 1)


def test_all_four_statuses_given_together_list_every_extraction_that_has_not_expired(
    app: FastAPI, client: TestClient
) -> None:
    now = datetime.now(UTC)
    put(app, 1, status=ExtractionStatus.PENDING)
    put(app, 2, status=ExtractionStatus.RUNNING)
    put(app, 3, status=ExtractionStatus.COMPLETED, finished_at=now)
    put(app, 4, status=ExtractionStatus.FAILED, finished_at=now)
    put(app, 5, status=ExtractionStatus.FAILED, finished_at=now - timedelta(days=2))

    response = client.get(URL, params=[("status", s.value) for s in ExtractionStatus])

    assert ids_of(response) == [str(UUID(int=n)) for n in (4, 3, 2, 1)]
    assert response.json()["total"] == 4


def test_a_failed_item_in_the_list_is_the_same_as_the_failed_extraction_read_by_id(db_url: str) -> None:
    app = create_app(
        make_settings(db_url=db_url),
        parser_factory=lambda _: FakeParser(error=InvalidFile()),
        extractor_factory=lambda _: FakeExtractor(),
        start_worker=False,
    )
    try:
        with TestClient(app) as client:
            location = submit(client, make_template(client)["id"], b"%PDF-1.7 corrupt").headers["Location"]
            processor(app).run_once()
            by_id = client.get(location).json()

            listed = client.get(URL).json()["items"]
    finally:
        app.state.database.dispose()

    assert (by_id["status"], by_id["error"]["reason"]) == ("failed", "invalid_file")
    assert listed == [by_id]
