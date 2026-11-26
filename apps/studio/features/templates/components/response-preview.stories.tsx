import { expect } from "storybook/test";
import preview from "~/.storybook/preview";
import { fieldValuesBuilder } from "~/features/templates/utils/template.builder";

import { ResponsePreview } from "./response-preview";

const meta = preview.meta({ component: ResponsePreview, title: "Templates/Response preview" });

export const NoFields = meta.story({ args: { fields: [] } });

NoFields.test("Shows an empty object", async ({ canvas }) => {
  await expect(canvas.getByLabelText("Preview of the API response")).toHaveTextContent("{ }");
});

export const ThreeFields = meta.story({
  args: {
    fields: [
      fieldValuesBuilder.one({ overrides: { key: "total", type: "number" } }),
      fieldValuesBuilder.one({ overrides: { key: "issued_on", type: "date" } }),
      fieldValuesBuilder.one({ overrides: { key: "status", type: "choice" } })
    ]
  }
});

ThreeFields.test("Lists the keys in the order given, with their types", async ({ canvas }) => {
  await expect(canvas.getByLabelText("Preview of the API response")).toHaveTextContent(
    '{ "total": "number", "issued_on": "date", "status": "choice" }'
  );
});
