import { expect } from "storybook/test";
import preview from "~/.storybook/preview";

import { ExtractionFailed } from "./extraction-failed";

const TEMPLATE_ID = "00000000-0000-4000-8000-000000000001";
const MESSAGE = "The document could not be parsed.";

const meta = preview.meta({
  args: { message: MESSAGE, templateId: TEMPLATE_ID },
  component: ExtractionFailed,
  title: "Features/Extractions/Extraction Failed"
});

export const WithMessage = meta.story({});

WithMessage.test("Shows the API's message and Try again with the same form (AC26)", async ({ args, canvas }) => {
  await expect(canvas.getByText(MESSAGE)).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    `/documents/new?template=${args.templateId}`
  );
});

export const WithoutMessage = meta.story({ args: { message: null } });

WithoutMessage.test("Falls back to a generic message when the API gave none", async ({ canvas }) => {
  await expect(canvas.getByText("The document could not be read.")).toBeVisible();
});

const HTML_MESSAGE = `<img src=x onerror="alert(1)"> failed`;

export const MessageWithHtml = meta.story({ args: { message: HTML_MESSAGE } });

MessageWithHtml.test("Shows a message with HTML as plain text", async ({ canvas, canvasElement }) => {
  await expect(canvas.getByText(HTML_MESSAGE)).toBeVisible();
  await expect(canvasElement.querySelector("img")).toBeNull();
});
