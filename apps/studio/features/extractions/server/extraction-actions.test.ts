import { FailureReason } from "@form-lens/api-client";
import { beforeEach, describe, expect, test as it, vi } from "vitest";

import { CancelFailureKind, ExtractionViewStatus } from "~/features/extractions/schemas/extraction";
import { extractionResponseBuilder } from "~/features/extractions/utils/extraction.builder";
import { resetLog } from "~/tests/unit/mock-logger";
import { apiUrl, HttpResponse, http, problem, server } from "~/tests/unit/msw/server";

const next = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  })
}));

vi.mock("next/navigation", () => ({ redirect: next.redirect }));
vi.mock("~/lib/logger", async () => (await import("~/tests/unit/mock-logger")).loggerModule);
/** Environment validation is skipped in tests, so the schema's default limit does not apply; set before the import. */
vi.hoisted(() => {
  vi.stubEnv("FORMLENS_MAX_UPLOAD_MB", "2");
});

import { cancelExtraction, submitExtraction } from "./extraction-actions";

const TEMPLATE_ID = "6f1c1b5e-0f0e-4b1e-9d36-3f0d8f9c2a10";
const EXTRACTIONS = "/v1/extractions";
const MB = 1024 * 1024;

function pdf(name = "invoice.pdf", size = 1024) {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

function formWith(file: File | string | null) {
  const formData = new FormData();
  if (file !== null) {
    formData.set("file", file);
  }
  return formData;
}

/** Makes the API answer a submit and returns what it received, so a test can see the file and the template. */
function apiAnswers(response: () => Response) {
  const received: Array<{ file: FormDataEntryValue | null; templateId: FormDataEntryValue | null }> = [];
  server.use(
    http.post(apiUrl(EXTRACTIONS), async ({ request }) => {
      const body = await request.formData();
      received.push({ file: body.get("file"), templateId: body.get("template_id") });
      return response();
    })
  );
  return received;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLog();
  next.redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

describe("submitExtraction", () => {
  it("sends the file and template, then opens the status page named in Location (AC14)", async () => {
    const extraction = extractionResponseBuilder.one({
      overrides: { id: "7a0e5f8c-1d2b-4c3a-9e8f-0a1b2c3d4e5f", template_id: TEMPLATE_ID }
    });
    const received = apiAnswers(() =>
      HttpResponse.json(extraction, { headers: { Location: `/v1/extractions/${extraction.id}` }, status: 202 })
    );

    await expect(submitExtraction(TEMPLATE_ID, null, formWith(pdf("scan.pdf")))).rejects.toThrow(
      `NEXT_REDIRECT:/jobs/${extraction.id}`
    );

    expect(received).toHaveLength(1);
    expect(received[0]?.templateId).toBe(TEMPLATE_ID);
    expect(received[0]?.file).toBeInstanceOf(File);
    expect((received[0]?.file as File).name).toBe("scan.pdf");
  });

  it("does not redirect when the 202 has no usable Location", async () => {
    apiAnswers(() => HttpResponse.json(extractionResponseBuilder.one(), { status: 202 }));

    const result = await submitExtraction(TEMPLATE_ID, null, formWith(pdf()));

    expect(result.kind).toBe("unavailable");
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it("opens the status page when Location is an absolute URL (AC14)", async () => {
    const extraction = extractionResponseBuilder.one({ overrides: { id: "7a0e5f8c-1d2b-4c3a-9e8f-0a1b2c3d4e5f" } });
    apiAnswers(() =>
      HttpResponse.json(extraction, {
        headers: { Location: `http://api.internal:8000/v1/extractions/${extraction.id}` },
        status: 202
      })
    );

    await expect(submitExtraction(TEMPLATE_ID, null, formWith(pdf()))).rejects.toThrow(
      `NEXT_REDIRECT:/jobs/${extraction.id}`
    );
  });

  it("opens the status page when Location carries a query string (AC14)", async () => {
    const extraction = extractionResponseBuilder.one({ overrides: { id: "7a0e5f8c-1d2b-4c3a-9e8f-0a1b2c3d4e5f" } });
    apiAnswers(() =>
      HttpResponse.json(extraction, {
        headers: { Location: `/v1/extractions/${extraction.id}?include=result` },
        status: 202
      })
    );

    await expect(submitExtraction(TEMPLATE_ID, null, formWith(pdf()))).rejects.toThrow(
      `NEXT_REDIRECT:/jobs/${extraction.id}`
    );
  });

  it("does not redirect to a Location that names another resource", async () => {
    apiAnswers(() =>
      HttpResponse.json(extractionResponseBuilder.one(), {
        headers: { Location: `/v1/templates/${TEMPLATE_ID}` },
        status: 202
      })
    );

    const result = await submitExtraction(TEMPLATE_ID, null, formWith(pdf()));

    expect(result.kind).toBe("unavailable");
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it("does not pass a 500's internal detail to the user (AC18)", async () => {
    apiAnswers(() => problem(500, { detail: "sqlite3.OperationalError: database is locked" }));

    const result = await submitExtraction(TEMPLATE_ID, null, formWith(pdf()));

    expect(result.kind).toBe("unavailable");
    expect(result.error).not.toContain("sqlite3");
  });

  it("shows the API's refusal of the file at the drop zone (AC15)", async () => {
    apiAnswers(() => problem(400, { detail: "The file is empty." }));

    await expect(submitExtraction(TEMPLATE_ID, null, formWith(pdf()))).resolves.toEqual({
      error: "The file is empty.",
      kind: "file",
      success: false
    });
  });

  it("says the form is gone when the API cannot find the template (AC16)", async () => {
    apiAnswers(() => problem(404, { detail: "Template not found" }));

    const result = await submitExtraction(TEMPLATE_ID, null, formWith(pdf()));

    expect(result.kind).toBe("form-gone");
  });

  it("asks to try again in the seconds of Retry-After when the queue is full (AC17)", async () => {
    apiAnswers(() =>
      HttpResponse.json({ status: 503, title: "Busy" }, { headers: { "Retry-After": "45" }, status: 503 })
    );

    const result = await submitExtraction(TEMPLATE_ID, null, formWith(pdf()));

    expect(result).toEqual({
      error: "FormLens is busy reading other documents. Try again in 45 s.",
      kind: "busy",
      success: false
    });
  });

  it("gives a generic error when the API does not answer (AC18)", async () => {
    server.use(http.post(apiUrl(EXTRACTIONS), () => HttpResponse.error()));

    const result = await submitExtraction(TEMPLATE_ID, null, formWith(pdf()));

    expect(result).toEqual({
      error: "The API is unavailable. Your form and file were kept, try again in a moment.",
      kind: "unavailable",
      success: false
    });
  });

  it("refuses a file type the API does not read without calling it (AC11)", async () => {
    const received = apiAnswers(() => new HttpResponse(null, { status: 500 }));
    const docx = new File(["x"], "letter.docx", { type: "application/msword" });

    const result = await submitExtraction(TEMPLATE_ID, null, formWith(docx));

    expect(result).toEqual({
      error: "This file type is not supported. Choose a PDF, PNG, JPEG or TIFF file.",
      kind: "file",
      success: false
    });
    expect(received).toHaveLength(0);
  });

  it("refuses a file over the Studio's limit without calling the API (AC12)", async () => {
    const received = apiAnswers(() => new HttpResponse(null, { status: 500 }));

    const result = await submitExtraction(TEMPLATE_ID, null, formWith(pdf("big.pdf", 2 * MB + 1)));

    expect(result.error).toBe("The file is larger than 2 MB. Choose a file of up to 2 MB.");
    expect(received).toHaveLength(0);
  });

  it("refuses a submit without a file", async () => {
    const result = await submitExtraction(TEMPLATE_ID, null, formWith("not a file"));

    expect(result).toEqual({ error: "Choose a file to analyse.", kind: "file", success: false });
  });

  it("treats a template id that is not a UUID as a form that is gone, without calling the API", async () => {
    const received = apiAnswers(() => new HttpResponse(null, { status: 500 }));

    const result = await submitExtraction("../templates", null, formWith(pdf()));

    expect(result.kind).toBe("form-gone");
    expect(received).toHaveLength(0);
  });
});

const EXTRACTION_ID = "10000000-0000-4000-8000-000000000118";
const CANCEL = `/v1/extractions/${EXTRACTION_ID}/cancel`;

/** Makes the API answer a cancel and counts the requests it received. */
function cancelAnswers(response: () => Response) {
  const received: Array<string> = [];
  server.use(
    http.post(apiUrl(CANCEL), ({ request }) => {
      received.push(request.url);
      return response();
    })
  );
  return received;
}

describe("cancelExtraction", () => {
  it("returns the cancelled extraction the API answers with (AC30)", async () => {
    const cancelled = extractionResponseBuilder.one({
      overrides: { id: EXTRACTION_ID, status: ExtractionViewStatus.cancelled }
    });
    const received = cancelAnswers(() => HttpResponse.json(cancelled));

    const result = await cancelExtraction(EXTRACTION_ID);

    expect(received).toHaveLength(1);
    expect(result.success).toBe(true);
    expect(result.success ? result.extraction.status : null).toBe(ExtractionViewStatus.cancelled);
  });

  it("on a 409 reads the extraction again and returns its final, completed state (cancel races completion)", async () => {
    const done = extractionResponseBuilder.one({
      overrides: {
        id: EXTRACTION_ID,
        result: { invoice_number: "FV/1/2026" },
        status: ExtractionViewStatus.completed
      }
    });
    cancelAnswers(() => problem(409, { detail: "The extraction has already ended." }));
    server.use(http.get(apiUrl(`/v1/extractions/${EXTRACTION_ID}`), () => HttpResponse.json(done)));

    const result = await cancelExtraction(EXTRACTION_ID);

    expect(result).toEqual({
      error: "The extraction ended before it could be cancelled.",
      extraction: expect.objectContaining({ result: { invoice_number: "FV/1/2026" }, status: "completed" }),
      kind: CancelFailureKind.finished,
      success: false
    });
  });

  it("on a 409 whose extraction cannot be read again says the API is unavailable", async () => {
    cancelAnswers(() => problem(409));
    server.use(http.get(apiUrl(`/v1/extractions/${EXTRACTION_ID}`), () => HttpResponse.error()));

    const result = await cancelExtraction(EXTRACTION_ID);

    expect(result.success ? null : result.kind).toBe(CancelFailureKind.unavailable);
  });

  it("says the extraction no longer exists on a 404", async () => {
    cancelAnswers(() => problem(404, { detail: "Extraction not found" }));

    await expect(cancelExtraction(EXTRACTION_ID)).resolves.toEqual({
      error: "This extraction no longer exists. Its result may have expired.",
      kind: CancelFailureKind.notFound,
      success: false
    });
  });

  it("gives a generic error when the API does not answer", async () => {
    server.use(http.post(apiUrl(CANCEL), () => HttpResponse.error()));

    await expect(cancelExtraction(EXTRACTION_ID)).resolves.toEqual({
      error: "The job could not be cancelled: the API is unavailable. Try again in a moment.",
      kind: CancelFailureKind.unavailable,
      success: false
    });
  });

  it("does not pass a 500's internal detail to the user", async () => {
    cancelAnswers(() => problem(500, { detail: "sqlite3.OperationalError: database is locked" }));

    const result = await cancelExtraction(EXTRACTION_ID);

    expect(result.success ? null : result.kind).toBe(CancelFailureKind.unavailable);
    expect(result.success ? "" : result.error).not.toContain("sqlite3");
  });

  it("treats a 200 that is not an extraction as unavailable", async () => {
    cancelAnswers(() => HttpResponse.json({ cancelled: true }));

    const result = await cancelExtraction(EXTRACTION_ID);

    expect(result.success ? null : result.kind).toBe(CancelFailureKind.unavailable);
  });

  it("treats an id that is not a UUID as not found, without calling the API", async () => {
    const received = cancelAnswers(() => new HttpResponse(null, { status: 500 }));

    const result = await cancelExtraction("../templates");

    expect(result.success ? null : result.kind).toBe(CancelFailureKind.notFound);
    expect(received).toHaveLength(0);
  });

  it("on a 409 whose extraction is gone when read again says it no longer exists (cancel races expiry)", async () => {
    const reads: Array<string> = [];
    cancelAnswers(() => problem(409, { detail: "The extraction has already ended." }));
    server.use(
      http.get(apiUrl(`/v1/extractions/${EXTRACTION_ID}`), ({ request }) => {
        reads.push(request.url);
        return problem(404, { detail: "Extraction not found" });
      })
    );

    await expect(cancelExtraction(EXTRACTION_ID)).resolves.toEqual({
      error: "This extraction no longer exists. Its result may have expired.",
      kind: CancelFailureKind.notFound,
      success: false
    });
    expect(reads).toHaveLength(1);
  });

  it("on a 409 returns the failed final state when the extraction failed before the cancel", async () => {
    const failed = extractionResponseBuilder.one({
      overrides: {
        error: { message: "The document could not be parsed.", reason: FailureReason.parse_failed },
        id: EXTRACTION_ID,
        status: ExtractionViewStatus.failed
      }
    });
    cancelAnswers(() => problem(409));
    server.use(http.get(apiUrl(`/v1/extractions/${EXTRACTION_ID}`), () => HttpResponse.json(failed)));

    const result = await cancelExtraction(EXTRACTION_ID);

    expect(result.success ? null : result.kind).toBe(CancelFailureKind.finished);
    expect("extraction" in result ? result.extraction.status : null).toBe(ExtractionViewStatus.failed);
    expect("extraction" in result ? result.extraction.error?.message : null).toBe(failed.error?.message);
  });

  it("says the extraction no longer exists on a 422", async () => {
    cancelAnswers(() => problem(422, { detail: "id is not a valid UUID" }));

    const result = await cancelExtraction(EXTRACTION_ID);

    expect(result.success ? null : result.kind).toBe(CancelFailureKind.notFound);
    expect(result.success ? "" : result.error).not.toContain("UUID");
  });
});
