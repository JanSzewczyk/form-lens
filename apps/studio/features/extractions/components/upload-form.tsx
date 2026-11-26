"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FileUpload,
  FileUploadDropzone,
  FileUploadTrigger,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle
} from "@szum-tech/design-system";
import { UploadIcon, XIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { type SubmitFailure, SubmitFailureKind } from "~/features/extractions/schemas/extraction";
import { checkFile, formatFileSize } from "~/features/extractions/utils/accepted-file";

type UploadFormProps = {
  /** The Studio's upload limit in MB, from the server env. */
  maxMb: number;
  /** `submitExtraction` bound to the selected template: it redirects on success and returns a failure otherwise. */
  onSubmitAction(previous: SubmitFailure | null, formData: FormData): Promise<SubmitFailure>;
};

/**
 * The Upload step's form: one file in a drop zone, checked before any upload, then Start analysis. The file lives in
 * state, not in the input, so it stays chosen after the action answers with a failure.
 */
export function UploadForm({ maxMb, onSubmitAction }: UploadFormProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [rejection, setRejection] = React.useState<string | null>(null);
  const [failure, submitAction, isPending] = React.useActionState(onSubmitAction, null);
  /** The action's last answer cannot be reset, so a refusal of the file is hidden once that file is replaced or removed. */
  const [isRefusalOutdated, setIsRefusalOutdated] = React.useState(false);

  function submit(formData: FormData) {
    if (file === null) {
      return;
    }
    formData.set("file", file);
    setIsRefusalOutdated(false);
    submitAction(formData);
  }

  function replaceFile(next: File | null) {
    setFile(next);
    setRejection(null);
    setIsRefusalOutdated(true);
  }

  function chooseFile(files: Array<File>) {
    // A second file replaces the first: only the newest one is kept.
    replaceFile(files.at(-1) ?? null);
  }

  const fileMessage =
    rejection ?? (failure?.kind === SubmitFailureKind.file && !isRefusalOutdated ? failure.error : null);

  return (
    <form action={submit} className="flex min-w-0 flex-col gap-5">
      <FileUpload
        invalid={fileMessage !== null}
        label="Document to analyse"
        onFileReject={(_, message) => setRejection(message)}
        onFileValidate={(candidate) => checkFile(candidate, maxMb)}
        onValueChange={chooseFile}
        value={file === null ? [] : [file]}
      >
        <FileUploadDropzone className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <UploadIcon aria-hidden className="text-muted-foreground" />
          <p className="text-heading-h4">Drag a file here</p>
          <p className="text-mute">or click to choose it from your computer · max {maxMb} MB</p>
          <FileUploadTrigger asChild>
            <Button size="sm" type="button" variant="outline">
              Choose file
            </Button>
          </FileUploadTrigger>
        </FileUploadDropzone>
      </FileUpload>
      {fileMessage === null ? null : (
        <p className="text-body-sm text-error" role="alert">
          {fileMessage}
        </p>
      )}
      {file === null ? null : (
        <Item variant="outline">
          <ItemContent className="min-w-0">
            <ItemTitle className="font-code break-all">{file.name}</ItemTitle>
            <ItemDescription>{formatFileSize(file.size)} · ready for analysis</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              aria-label="Remove file"
              onClick={() => replaceFile(null)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <XIcon aria-hidden />
            </Button>
          </ItemActions>
        </Item>
      )}
      {failure?.kind === SubmitFailureKind.formGone ? (
        <Alert role="alert" variant="destructive">
          <AlertTitle>The form no longer exists</AlertTitle>
          <AlertDescription>
            <p>{failure.error}</p>
            <Link className="underline" href="/documents/new">
              Choose form
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {failure?.kind === SubmitFailureKind.busy || failure?.kind === SubmitFailureKind.unavailable ? (
        <Alert role="alert" variant="destructive">
          <AlertTitle>The analysis did not start</AlertTitle>
          <AlertDescription>{failure.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button disabled={file === null || isPending} loading={isPending} size="lg" type="submit">
          Start analysis
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/forms">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
