import type { ExtractionResponse } from "@form-lens/api-client";
import { expect } from "storybook/test";
import preview from "~/.storybook/preview";
import { type ExtractionView, ExtractionViewStatus } from "~/features/extractions/schemas/extraction";
import { extractionResponseBuilder } from "~/features/extractions/utils/extraction.builder";

import { ResultsCard } from "./results-card";

const FIELDS: ExtractionView["fields"] = [
  { name: "invoice_number", required: true, type: "text" },
  { name: "issue_date", required: true, type: "date" }
];

function extractionWith(overrides: Partial<ExtractionResponse>): ExtractionView {
  return extractionResponseBuilder.one({ overrides: { fields: FIELDS, ...overrides } });
}

const meta = preview.meta({
  args: { extraction: extractionWith({ status: ExtractionViewStatus.pending }) },
  component: ResultsCard,
  title: "Features/Extractions/Results Card"
});

export const Waiting = meta.story({});

Waiting.test("Shows one placeholder per field of the submitted form", async ({ canvas }) => {
  const rows = canvas.getAllByRole("listitem");

  await expect(rows).toHaveLength(FIELDS.length);
  await expect(rows[0]).toHaveTextContent("invoice_number");
  await expect(rows[1]).toHaveTextContent("issue_date");
  await expect(canvas.getByText("Data will appear here when the analysis finishes.")).toBeVisible();
  await expect(canvas.queryByRole("link", { name: "New document" })).not.toBeInTheDocument();
});

export const Completed = meta.story({
  args: {
    extraction: extractionWith({
      fields: [
        { name: "invoice_number", required: true, type: "text" },
        { name: "paid", required: false, type: "boolean" }
      ],
      result: { invoice_number: "FV/1/2026", paid: null },
      status: ExtractionViewStatus.completed
    })
  }
});

Completed.test("Lists each value and Not found for an optional field, in form order (AC24)", async ({ canvas }) => {
  const rows = canvas.getAllByRole("listitem");

  await expect(rows).toHaveLength(2);
  await expect(rows[0]).toHaveTextContent("invoice_numberFV/1/2026");
  await expect(rows[1]).toHaveTextContent("paidNot found");
  await expect(canvas.getByText("Every required field was found.")).toBeVisible();
  await expect(canvas.getByRole("link", { name: "New document" })).toHaveAttribute("href", "/documents/new");
});

export const MissingRequired = meta.story({
  args: {
    extraction: extractionWith({
      fields: [
        { name: "invoice_number", required: true, type: "text" },
        { name: "due_date", required: true, type: "date" }
      ],
      missing_required: ["due_date"],
      result: { due_date: null, invoice_number: "FV/1/2026" },
      status: ExtractionViewStatus.completed
    })
  }
});

MissingRequired.test("Marks the missing field and says how many were not found (AC25)", async ({ canvas }) => {
  const rows = canvas.getAllByRole("listitem");

  await expect(rows[1]).toHaveTextContent("due_dateMissing required");
  await expect(canvas.getByText("1 required field was not found.")).toBeVisible();
});

const HTML_VALUE = `<img src=x onerror="alert(1)">`;

export const ValueWithHtml = meta.story({
  args: {
    extraction: extractionWith({
      fields: [{ name: "seller", required: true, type: "text" }],
      result: { seller: HTML_VALUE },
      status: ExtractionViewStatus.completed
    })
  }
});

ValueWithHtml.test("Shows a value with HTML as plain text", async ({ canvas, canvasElement }) => {
  await expect(canvas.getByText(HTML_VALUE)).toBeVisible();
  await expect(canvasElement.querySelector("img")).toBeNull();
});

export const Cancelled = meta.story({
  args: { extraction: extractionWith({ status: ExtractionViewStatus.cancelled }) }
});

Cancelled.test("Has no rows and offers a new document", async ({ canvas }) => {
  await expect(canvas.queryByRole("list", { name: "Results" })).not.toBeInTheDocument();
  await expect(
    canvas.getByText("The job was cancelled before the document was read, so there are no results.")
  ).toBeVisible();
  await expect(canvas.getByRole("link", { name: "New document" })).toBeVisible();
});
