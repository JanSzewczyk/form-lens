"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  FieldDescription,
  FieldError,
  Input,
  Sortable,
  Textarea
} from "@szum-tech/design-system";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { type FieldPath, FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";

import { DeleteTemplateDialog } from "~/features/templates/components/delete-template-dialog";
import { FieldRow } from "~/features/templates/components/field-row";
import { ResponsePreview } from "~/features/templates/components/response-preview";
import {
  type TemplateActionFailure,
  TemplateActionFailureKind
} from "~/features/templates/schemas/template-action-result";
import {
  FIELDS_MAX,
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_NAME_MAX,
  type TemplateFormValues,
  templateFormSchema
} from "~/features/templates/schemas/template-form-schema";
import { emptyFieldValues } from "~/features/templates/utils/template-mapping";

type TemplateEditorProps = {
  initialValues: TemplateFormValues;
  onSubmitAction(values: TemplateFormValues): Promise<TemplateActionFailure>;
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      onDeleteAction(): Promise<TemplateActionFailure>;
    }
);

function ignoreReorder() {
  // The order changes in `onMove`, through the field array; the sortable's own copy of the list is not used.
}

function readFieldId(field: { id: string }): string {
  return field.id;
}

/**
 * Client Component: it owns the form state (react-hook-form), the add/remove/reorder of the field rows and the
 * pending state of the Server Actions; the page around it stays on the server and passes the actions as props.
 */
export function TemplateEditor(props: TemplateEditorProps) {
  const { initialValues, mode, onSubmitAction } = props;
  const form = useForm<TemplateFormValues>({
    defaultValues: initialValues,
    resolver: zodResolver(templateFormSchema)
  });
  const { append, fields, move, remove } = useFieldArray({ control: form.control, name: "fields" });
  const watchedFields = useWatch({ control: form.control, name: "fields" });
  const [failure, setFailure] = React.useState<TemplateActionFailure | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const errors = form.formState.errors;
  const fieldsError = errors.fields?.root?.message ?? errors.fields?.message;
  const isEdit = mode === "edit";

  /** A failed action keeps the typed input; its messages go next to the fields they name, or above the buttons. */
  function showFailure(result: TemplateActionFailure) {
    setFailure(result);
    for (const [path, message] of Object.entries(result.fieldErrors)) {
      form.setError(path as FieldPath<TemplateFormValues>, { message, type: "server" });
    }
  }

  const submit = form.handleSubmit((values) => {
    setFailure(null);
    startTransition(async () => {
      showFailure(await onSubmitAction(values));
    });
  });

  function confirmDelete() {
    if (props.mode !== "edit") {
      return;
    }
    const { onDeleteAction } = props;
    setFailure(null);
    startTransition(async () => {
      showFailure(await onDeleteAction());
    });
  }

  return (
    <FormProvider {...form}>
      <form className="@container flex min-w-0 flex-col gap-6" noValidate onSubmit={submit}>
        <div className="grid min-w-0 gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(320px,26rem)] @4xl:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-heading-h3">Basic information</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-body-sm font-semibold" htmlFor="template-name">
                    Name
                  </label>
                  <Input
                    aria-describedby={errors.name ? "template-name-error" : undefined}
                    id="template-name"
                    invalid={Boolean(errors.name)}
                    maxLength={TEMPLATE_NAME_MAX * 2}
                    placeholder="Invoice"
                    {...form.register("name")}
                  />
                  <FieldError errors={[errors.name]} id="template-name-error" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-body-sm font-semibold" htmlFor="template-description">
                    Description <span className="text-mute font-normal">(optional)</span>
                  </label>
                  <Textarea
                    aria-describedby={errors.description ? "template-description-error" : undefined}
                    id="template-description"
                    invalid={Boolean(errors.description)}
                    placeholder="What kind of document this form describes"
                    rows={3}
                    {...form.register("description")}
                  />
                  <FieldDescription>Up to {TEMPLATE_DESCRIPTION_MAX} characters.</FieldDescription>
                  <FieldError errors={[errors.description]} id="template-description-error" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-heading-h3">Fields to find</CardTitle>
                <CardDescription>
                  {fields.length} {fields.length === 1 ? "field" : "fields"} — the order matches the order in the API
                  response
                </CardDescription>
                {fields.length > 0 ? (
                  <Button
                    disabled={fields.length >= FIELDS_MAX}
                    onClick={() => append(emptyFieldValues(), { shouldFocus: true })}
                    size="sm"
                    startIcon={<PlusIcon aria-hidden="true" />}
                    type="button"
                    variant="outline"
                  >
                    Add field
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {fields.length === 0 ? (
                  <Empty border="dashed">
                    <EmptyHeader>
                      <EmptyTitle>No fields yet</EmptyTitle>
                      <EmptyDescription>
                        Add the values the API should find in a document of this form.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        onClick={() => append(emptyFieldValues(), { shouldFocus: true })}
                        type="button"
                        variant="outline"
                      >
                        Add first field
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <Sortable
                    className="flex flex-col gap-3"
                    getItemValue={readFieldId}
                    onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
                    onValueChange={ignoreReorder}
                    value={fields}
                  >
                    {fields.map((field, index) => (
                      <FieldRow
                        fieldId={field.id}
                        index={index}
                        isFirst={index === 0}
                        isLast={index === fields.length - 1}
                        key={field.id}
                        onMoveDown={() => move(index, index + 1)}
                        onMoveUp={() => move(index, index - 1)}
                        onRemove={() => remove(index)}
                      />
                    ))}
                  </Sortable>
                )}
                <FieldError>{fieldsError}</FieldError>
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0 @4xl:sticky @4xl:top-6">
            <ResponsePreview fields={watchedFields} />
          </div>
        </div>

        {failure ? (
          <Alert role="alert" variant="destructive">
            <AlertDescription>
              {failure.error}
              {failure.kind === TemplateActionFailureKind.notFound ? (
                <>
                  {" "}
                  <Link className="underline" href="/forms">
                    Back to Forms
                  </Link>
                </>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {props.mode === "edit" ? (
            <DeleteTemplateDialog disabled={isPending} onConfirm={confirmDelete} templateName={initialValues.name} />
          ) : null}
          <div className="ml-auto flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/forms">Cancel</Link>
            </Button>
            <Button loading={isPending} type="submit">
              {isEdit ? "Save form" : "Create form"}
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
