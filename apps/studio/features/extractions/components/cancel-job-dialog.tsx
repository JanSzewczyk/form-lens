import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button
} from "@szum-tech/design-system";

type CancelJobDialogProps = {
  /** True while a cancel is on its way; the button cannot open the dialog again. */
  isCancelling?: boolean;
  onConfirm(): void;
};

/** Cancel job, behind a confirmation: dismissing the dialog closes it and changes nothing (AC30). */
export function CancelJobDialog({ isCancelling = false, onConfirm }: CancelJobDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={isCancelling} loading={isCancelling} type="button" variant="outline">
          Cancel job
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this job?</AlertDialogTitle>
          <AlertDialogDescription>
            FormLens stops reading the document and keeps no result. Upload the document again to read it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep running</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant="error">
            Cancel the job
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
