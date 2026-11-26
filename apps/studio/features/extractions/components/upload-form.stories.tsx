import { expect, fn, waitFor } from "storybook/test";
import preview from "~/.storybook/preview";
import type { SubmitFailure } from "~/features/extractions/schemas/extraction";

import { UploadForm } from "./upload-form";

const MB = 1024 * 1024;

function pdf(name = "invoice.pdf", size = 2 * MB) {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" });
}

function failingWith(failure: SubmitFailure) {
  return fn(async () => failure);
}

function fileInput(canvasElement: HTMLElement): HTMLInputElement {
  const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) {
    throw new Error("The drop zone has no file input");
  }
  return input;
}

const meta = preview.meta({
  args: { maxMb: 25, onSubmitAction: failingWith({ error: "unused", kind: "unavailable", success: false }) },
  component: UploadForm,
  decorators: [
    (Story) => (
      <div className="max-w-[640px] p-6">
        <Story />
      </div>
    )
  ],
  title: "Features/Extractions/Upload Form"
});

export const EmptyDropZone = meta.story({ name: "Empty drop zone" });

EmptyDropZone.test("Disables Start analysis until a file is chosen (AC9)", async ({ canvas, args }) => {
  await expect(canvas.getByRole("button", { name: "Start analysis" })).toBeDisabled();
  await expect(canvas.getByText(/max 25 MB/)).toBeVisible();
  await expect(args.onSubmitAction).not.toHaveBeenCalled();
});

EmptyDropZone.test("Links Cancel to the Forms page (AC7)", async ({ canvas }) => {
  await expect(canvas.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/forms");
});

EmptyDropZone.test(
  "Shows a chosen 2 MB PDF and enables Start analysis; Remove empties it (AC10)",
  async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("invoice.pdf", 2 * MB));

    await expect(await canvas.findByText("invoice.pdf")).toBeVisible();
    await expect(canvas.getByText("2 MB · ready for analysis")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Start analysis" })).toBeEnabled();

    await userEvent.click(canvas.getByRole("button", { name: "Remove file" }));

    await expect(canvas.queryByText("invoice.pdf")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Start analysis" })).toBeDisabled();
  }
);

EmptyDropZone.test(
  "Refuses a .docx before any upload, naming the accepted types (AC11)",
  async ({ args, canvas, canvasElement, userEvent }) => {
    const docx = new File(["x"], "letter.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    await userEvent.upload(fileInput(canvasElement), docx);

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "This file type is not supported. Choose a PDF, PNG, JPEG or TIFF file."
    );
    await expect(canvas.queryByText("letter.docx")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Start analysis" })).toBeDisabled();
    await expect(args.onSubmitAction).not.toHaveBeenCalled();
  }
);

export const SmallLimit = meta.story({ args: { maxMb: 1 }, name: "Small size limit" });

SmallLimit.test(
  "Refuses a file over the limit before any upload, giving the limit in MB (AC12)",
  async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("big.pdf", 2 * MB));

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The file is larger than 1 MB. Choose a file of up to 1 MB."
    );
    await expect(canvas.queryByText("big.pdf")).not.toBeInTheDocument();
  }
);

EmptyDropZone.test(
  "Keeps only the newest file when another is chosen (AC13)",
  async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("first.pdf"));
    await expect(await canvas.findByText("first.pdf")).toBeVisible();

    await userEvent.upload(fileInput(canvasElement), pdf("second.pdf"));

    await expect(await canvas.findByText("second.pdf")).toBeVisible();
    await expect(canvas.queryByText("first.pdf")).not.toBeInTheDocument();
  }
);

EmptyDropZone.test("Shows a file name with HTML as plain text", async ({ canvas, canvasElement, userEvent }) => {
  const name = '<img src=x onerror="alert(1)">.pdf';
  await userEvent.upload(fileInput(canvasElement), pdf(name));

  await expect(await canvas.findByText(name)).toBeVisible();
  await expect(canvasElement.querySelector("img")).toBeNull();
});

EmptyDropZone.test(
  "Sends the chosen file to the action on Start analysis (AC14)",
  async ({ args, canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("scan.pdf"));
    await userEvent.click(await canvas.findByRole("button", { name: "Start analysis" }));

    await waitFor(() => expect(args.onSubmitAction).toHaveBeenCalledOnce());
    const formData = (args.onSubmitAction as ReturnType<typeof fn>).mock.calls[0]?.[1] as FormData;
    await expect((formData.get("file") as File).name).toBe("scan.pdf");
  }
);

export const FileRefusedByApi = meta.story({
  args: { onSubmitAction: failingWith({ error: "The file is empty.", kind: "file", success: false }) },
  name: "File refused by the API"
});

FileRefusedByApi.test(
  "Shows the API's message at the drop zone and keeps the file (AC15)",
  async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("scan.pdf"));
    await userEvent.click(await canvas.findByRole("button", { name: "Start analysis" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent("The file is empty.");
    await expect(canvas.getByText("scan.pdf")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Start analysis" })).toBeEnabled();
  }
);

export const FormGone = meta.story({
  args: {
    onSubmitAction: failingWith({
      error: "This form no longer exists. It may have been deleted elsewhere. Choose another form.",
      kind: "form-gone",
      success: false
    })
  },
  name: "Form deleted before submit"
});

FormGone.test(
  "Says the form no longer exists and offers Choose form (AC16)",
  async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("scan.pdf"));
    await userEvent.click(await canvas.findByRole("button", { name: "Start analysis" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent("The form no longer exists");
    await expect(canvas.getByRole("link", { name: "Choose form" })).toHaveAttribute("href", "/documents/new");
  }
);

export const QueueFull = meta.story({
  args: {
    onSubmitAction: failingWith({
      error: "FormLens is busy reading other documents. Try again in 30 s.",
      kind: "busy",
      success: false
    })
  },
  name: "Queue full"
});

QueueFull.test(
  "Asks to try again in N seconds and keeps the file (AC17)",
  async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("scan.pdf"));
    await userEvent.click(await canvas.findByRole("button", { name: "Start analysis" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent("Try again in 30 s.");
    await expect(canvas.getByText("scan.pdf")).toBeVisible();
  }
);

export const ApiUnavailable = meta.story({
  args: {
    onSubmitAction: failingWith({
      error: "The API is unavailable. Your form and file were kept, try again in a moment.",
      kind: "unavailable",
      success: false
    })
  },
  name: "API unavailable"
});

ApiUnavailable.test("Shows an error and keeps the file (AC18)", async ({ canvas, canvasElement, userEvent }) => {
  await userEvent.upload(fileInput(canvasElement), pdf("scan.pdf"));
  await userEvent.click(await canvas.findByRole("button", { name: "Start analysis" }));

  await expect(await canvas.findByRole("alert")).toHaveTextContent("The API is unavailable.");
  await expect(canvas.getByText("scan.pdf")).toBeVisible();
});

export const PhoneWidth = meta.story({
  decorators: [
    (Story) => (
      <div className="w-[320px]" data-testid="phone">
        <Story />
      </div>
    )
  ],
  name: "Phone width"
});

PhoneWidth.test(
  "Fits a 320 px screen without horizontal scroll (AC35)",
  async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf(`${"a-very-long-file-name".repeat(6)}.pdf`));
    await canvas.findByText(/ready for analysis/);

    const phone = canvas.getByTestId("phone");
    await expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);
  }
);

FileRefusedByApi.test(
  "Clears the API's refusal when another file is chosen (AC15, known issue)",
  async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("scan.pdf"));
    await userEvent.click(await canvas.findByRole("button", { name: "Start analysis" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("The file is empty.");

    await userEvent.upload(fileInput(canvasElement), pdf("other.pdf"));

    await expect(await canvas.findByText("other.pdf")).toBeVisible();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  }
);

FileRefusedByApi.test(
  "Clears the API's refusal when the file is removed (AC15, known issue)",
  async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("scan.pdf"));
    await userEvent.click(await canvas.findByRole("button", { name: "Start analysis" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("The file is empty.");

    await userEvent.click(canvas.getByRole("button", { name: "Remove file" }));

    await expect(canvas.queryByText("scan.pdf")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Start analysis" })).toBeDisabled();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  }
);

export const PendingSubmit = meta.story({
  args: {
    // The answer comes late, so the test sees the pending state; it does come, so no action stays pending after the test.
    onSubmitAction: fn(
      () =>
        new Promise<SubmitFailure>((resolve) => {
          setTimeout(() => resolve({ error: "The API is unavailable.", kind: "unavailable", success: false }), 500);
        })
    )
  },
  name: "Submit in progress"
});

PendingSubmit.test(
  "Disables Start analysis while the file is being sent, so it is not sent twice (AC14)",
  async ({ args, canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("scan.pdf"));
    await userEvent.click(await canvas.findByRole("button", { name: "Start analysis" }));

    // While loading, the button's name is "Loading Start analysis".
    await waitFor(() => expect(canvas.getByRole("button", { name: /Start analysis/ })).toBeDisabled());
    await expect(args.onSubmitAction).toHaveBeenCalledOnce();
    await expect(await canvas.findByRole("alert")).toHaveTextContent("The API is unavailable.");
  }
);

EmptyDropZone.test(
  "Shows a file name with quotes, an ampersand and HTML as plain text",
  async ({ canvas, canvasElement, userEvent }) => {
    const name = `O'Brien "draft" & <b>bold</b>.pdf`;
    await userEvent.upload(fileInput(canvasElement), pdf(name));

    await expect(await canvas.findByText(name)).toBeVisible();
    await expect(canvasElement.querySelector("b")).toBeNull();
  }
);

EmptyDropZone.test(
  "Keeps the chosen file when a refused file is dropped after it (AC11, AC13)",
  async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.upload(fileInput(canvasElement), pdf("first.pdf"));
    await expect(await canvas.findByText("first.pdf")).toBeVisible();

    await userEvent.upload(fileInput(canvasElement), new File(["x"], "letter.docx", { type: "application/msword" }));

    await expect(await canvas.findByRole("alert")).toHaveTextContent("PDF, PNG, JPEG or TIFF");
    await expect(canvas.queryByText("letter.docx")).not.toBeInTheDocument();
    await expect(canvas.getByText("first.pdf")).toBeVisible();
  }
);

export const RefusalWithMarkup = meta.story({
  args: {
    onSubmitAction: failingWith({ error: '<b>Bad</b> file & "type"', kind: "file", success: false })
  },
  name: "API refusal with markup in its message"
});

RefusalWithMarkup.test("Shows the API's message as plain text (AC15)", async ({ canvas, canvasElement, userEvent }) => {
  await userEvent.upload(fileInput(canvasElement), pdf("scan.pdf"));
  await userEvent.click(await canvas.findByRole("button", { name: "Start analysis" }));

  await expect(await canvas.findByRole("alert")).toHaveTextContent('<b>Bad</b> file & "type"');
  await expect(canvasElement.querySelector("b")).toBeNull();
});
