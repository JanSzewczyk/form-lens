import { expect } from "storybook/test";
import preview from "~/.storybook/preview";

import { ExtractionNotFound } from "./extraction-status-view-not-found";

const meta = preview.meta({
  component: ExtractionNotFound,
  parameters: { layout: "padded" },
  title: "Features/Extractions/Extraction Not Found"
});

export const NotFound = meta.story({});

NotFound.test("Says the extraction was not found or expired and links to New document (AC28)", async ({ canvas }) => {
  await expect(canvas.getByText("Extraction not found")).toBeVisible();
  await expect(canvas.getByText(/its result has expired/)).toBeVisible();
  await expect(canvas.getByRole("link", { name: "New document" })).toHaveAttribute("href", "/documents/new");
});
