import { expect } from "storybook/test";
import preview from "~/.storybook/preview";

import { ResultsCard } from "./results-card";

const FIELDS = [
  { name: "invoice_number", required: true, type: "text" },
  { name: "issue_date", required: true, type: "date" }
];

const meta = preview.meta({
  args: { fields: FIELDS },
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
});
