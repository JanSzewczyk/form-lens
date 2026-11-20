import { renderToString } from "react-dom/server";
import { describe, expect, test as it } from "vitest";

import { TemplateEditor } from "~/features/templates/components/template-editor";
import { fieldValuesBuilder, templateFormValuesBuilder } from "~/features/templates/utils/template.builder";

const FAILURE = { error: "", fieldErrors: {}, kind: "validation", success: false } as const;

function renderEditor() {
  const fields = [
    fieldValuesBuilder.one({ overrides: { key: "invoice_number" } }),
    fieldValuesBuilder.one({ overrides: { key: "total", type: "number" } }),
    fieldValuesBuilder.one({ overrides: { allowedValues: "paid\nopen", key: "status", type: "choice" } })
  ];
  const initialValues = templateFormValuesBuilder.one({ overrides: { fields, name: "Invoice" } });

  return renderToString(
    <TemplateEditor
      initialValues={initialValues}
      mode="edit"
      onDeleteAction={async () => FAILURE}
      onSubmitAction={async () => FAILURE}
    />
  );
}

/** Every attribute whose value names another element or tags a row: what hydration compares between server and browser. */
function identityAttributes(html: string): Array<string> {
  return [...html.matchAll(/ (id|aria-describedby|aria-controls|aria-labelledby|data-value|for)="([^"]*)"/g)].map(
    ([, name, value]) => `${name}=${value}`
  );
}

describe("TemplateEditor server render (no hydration mismatch)", () => {
  it("renders the same ids on every request, in the whole page and not only on the rows", () => {
    const first = identityAttributes(renderEditor());
    const second = identityAttributes(renderEditor());

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it("holds no random id of the drag-and-drop library", () => {
    expect(renderEditor()).not.toContain("DndDescribedBy");
  });

  it("gives every element a describedby that points at an element of the page", () => {
    const html = renderEditor();
    const ids = new Set([...html.matchAll(/ id="([^"]*)"/g)].map(([, id]) => id));
    const referenced = [...html.matchAll(/ aria-describedby="([^"]*)"/g)].flatMap(([, value]) =>
      (value ?? "").split(" ")
    );

    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(ids, `aria-describedby="${id}" has no element`).toContain(id);
    }
  });

  it("names the drag handle of every row", () => {
    const html = renderEditor();

    for (const number of [1, 2, 3]) {
      expect(html).toContain(`aria-label="Reorder field ${number}"`);
    }
  });

  it("gives each row its own id", () => {
    const rowIds = [...renderEditor().matchAll(/data-slot="sortable-item"[^>]*data-value="([^"]*)"/g)].map(
      ([, value]) => value
    );

    expect(rowIds).toHaveLength(3);
    expect(new Set(rowIds).size).toBe(3);
  });
});
