import * as React from "react";

import type { ExtractionView } from "~/features/extractions/schemas/extraction";

import { ExtractionPollUpdateKind, startExtractionPoller } from "./extraction-poller";

type ExtractionStatusState = {
  extraction: ExtractionView;
  /** The last check could not reach the API; the next one that does clears it. */
  isUnreachable: boolean;
  /** The extraction is gone (unknown id, or its result expired) since the page loaded; checks have stopped. */
  isNotFound: boolean;
};

/**
 * The live state of an extraction, starting from the one the server rendered. It checks the Studio route
 * `/api/extractions/<id>` every 3 s until the status is final; see `startExtractionPoller` for the rules.
 */
export function useExtractionStatus(initial: ExtractionView, intervalMs?: number): ExtractionStatusState {
  const [state, setState] = React.useState<ExtractionStatusState>({
    extraction: initial,
    isNotFound: false,
    isUnreachable: false
  });
  const { id, status: initialStatus } = initial;

  React.useEffect(
    () =>
      startExtractionPoller({
        initialStatus,
        intervalMs,
        onUpdate(update) {
          setState((current) => {
            if (update.kind === ExtractionPollUpdateKind.found) {
              return { extraction: update.extraction, isNotFound: false, isUnreachable: false };
            }
            if (update.kind === ExtractionPollUpdateKind.notFound) {
              return { ...current, isNotFound: true, isUnreachable: false };
            }
            return { ...current, isUnreachable: true };
          });
        },
        url: `/api/extractions/${encodeURIComponent(id)}`,
        visibility: document
      }),
    [id, initialStatus, intervalMs]
  );

  return state;
}
