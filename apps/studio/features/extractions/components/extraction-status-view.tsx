"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardFooter,
  Spinner
} from "@szum-tech/design-system";

import * as React from "react";

import { useExtractionStatus } from "~/features/extractions/hooks/use-extraction-status";
import {
  CancelFailureKind,
  type CancelResult,
  type ExtractionView,
  ExtractionViewStatus,
  FINAL_STATUSES
} from "~/features/extractions/schemas/extraction";
import { getStatusSummary } from "~/features/extractions/utils/status-steps";

import { CancelJobDialog } from "./cancel-job-dialog";
import { ExtractionFailed } from "./extraction-failed";
import { ExtractionNotFound } from "./extraction-status-view-not-found";
import { ResultsCard } from "./results-card";
import { StatusStepper } from "./status-stepper";

/** UTC on both sides, so the server-rendered time and the hydrated one are the same text. */
const SUBMIT_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

type ExtractionStatusViewProps = {
  /** The extraction as the server rendered it; the page shows it at once and then follows it live. */
  initial: ExtractionView;
  /** Time between checks. Only stories change it: Storybook has no fake timers. */
  intervalMs?: number;
  /** `cancelExtraction`: the cancelled extraction, or why it was not cancelled (with the final state after a 409). */
  onCancelAction(extractionId: string): Promise<CancelResult>;
};

function formatSubmitTime(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? createdAt : `${SUBMIT_TIME.format(date)} UTC`;
}

/**
 * The status page of one extraction. A client component because it owns the polling hook and the cancel: the status,
 * the badge and the outage notice change without a reload. The file name, the result values and the API's messages are
 * rendered as React text, never as HTML.
 */
export function ExtractionStatusView({ initial, intervalMs, onCancelAction }: ExtractionStatusViewProps) {
  /** The final state a cancel answered with; it replaces the polled one and, being final, stops the checks. */
  const [settled, setSettled] = React.useState<ExtractionView | null>(null);
  const [cancelMessage, setCancelMessage] = React.useState<string | null>(null);
  const [isCancelling, startCancel] = React.useTransition();
  const live = useExtractionStatus(settled ?? initial, intervalMs);
  const extraction = settled ?? live.extraction;
  const isUnreachable = settled === null ? live.isUnreachable : false;

  if (settled === null && live.isNotFound) {
    return <ExtractionNotFound />;
  }

  const summary = getStatusSummary(extraction.status);
  const isFinal = FINAL_STATUSES.includes(extraction.status);
  const source = extraction.filename
    ? `${extraction.filename} · ${extraction.template_name}`
    : extraction.template_name;

  function handleCancel() {
    setCancelMessage(null);
    startCancel(async () => {
      const result = await onCancelAction(extraction.id);
      const final = result.success || result.kind === CancelFailureKind.finished ? result.extraction : null;
      if (final !== null && FINAL_STATUSES.includes(final.status)) {
        setSettled(final);
      }
      setCancelMessage(result.success ? null : result.error);
    });
  }

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-heading-h1">Document status</h1>
          <p className="text-mute">FormLens reads the document against the form; the status refreshes automatically.</p>
        </div>
        {isFinal ? null : <CancelJobDialog isCancelling={isCancelling} onConfirm={handleCancel} />}
      </header>
      <div className="flex min-w-0 flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[999_1_520px]">
          <CardContent className="flex min-w-0 flex-col gap-5">
            <div className="flex min-w-0 flex-wrap items-center gap-4">
              <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-md">
                {isFinal ? null : <Spinner aria-hidden="true" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 className="text-heading-h4">{summary.headline}</h2>
                <p className="font-code text-body-sm min-w-0 break-all">{source}</p>
                <p className="text-small">
                  Submitted <time dateTime={extraction.created_at}>{formatSubmitTime(extraction.created_at)}</time>
                </p>
              </div>
              <Badge variant={summary.badge.variant}>{summary.badge.label}</Badge>
            </div>
            <StatusStepper status={extraction.status} />
            {isUnreachable ? (
              <Alert variant="destructive">
                <AlertTitle>The status cannot be refreshed</AlertTitle>
                <AlertDescription>The FormLens API does not answer. The page keeps trying.</AlertDescription>
              </Alert>
            ) : null}
            {cancelMessage === null ? null : (
              <Alert role="status" variant={isFinal ? "default" : "destructive"}>
                <AlertTitle>{isFinal ? "The job was not cancelled" : "The job could not be cancelled"}</AlertTitle>
                <AlertDescription>{cancelMessage}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="border-border text-small flex min-w-0 flex-wrap gap-x-2 border-t">
            <span>{isFinal ? "The extraction has ended" : "Polling job status every 3 seconds"}</span>
            <span className="font-code min-w-0 break-all">{extraction.id}</span>
          </CardFooter>
        </Card>
        <div className="min-w-0 flex-[1_1_300px]">
          {extraction.status === ExtractionViewStatus.failed ? (
            <ExtractionFailed message={extraction.error?.message} templateId={extraction.template_id} />
          ) : (
            <ResultsCard extraction={extraction} />
          )}
        </div>
      </div>
    </>
  );
}
