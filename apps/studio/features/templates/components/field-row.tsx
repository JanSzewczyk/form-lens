import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  FieldError,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SortableItem,
  SortableItemHandle,
  Switch,
  Textarea
} from "@szum-tech/design-system";
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, GripVerticalIcon, Trash2Icon } from "lucide-react";
import * as React from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { TemplateFieldType, type TemplateFormValues } from "~/features/templates/schemas/template-form-schema";

const TYPE_LABEL: Record<TemplateFieldType, string> = {
  boolean: "Yes / no (boolean)",
  choice: "Choice",
  date: "Date",
  integer: "Whole number (integer)",
  number: "Number",
  text: "Text"
};

interface FieldRowProps {
  fieldId: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveDown(): void;
  onMoveUp(): void;
  onRemove(): void;
}

/**
 * One field of the template. Its parts stack in a column while the row is narrow and sit side by side once the row is
 * wide enough; the row measures itself (container query), so the layout follows the room it has, not the screen.
 */
export function FieldRow({ fieldId, index, isFirst, isLast, onMoveDown, onMoveUp, onRemove }: FieldRowProps) {
  const {
    control,
    formState: { errors },
    register,
    setValue
  } = useFormContext<TemplateFormValues>();
  const rowErrors = errors.fields?.[index];
  const type = useWatch({ control, name: `fields.${index}.type` });
  const advanced = useWatch({ control, name: `fields.${index}` });
  const hasAdvancedValue = [advanced.minimum, advanced.maximum, advanced.pattern].some((value) => value !== "");
  const [isAdvancedOpen, setAdvancedOpen] = React.useState(hasAdvancedValue);
  const hasAdvancedError = Boolean(rowErrors?.minimum || rowErrors?.maximum || rowErrors?.pattern);
  const number = index + 1;
  const hasRange = type === TemplateFieldType.number || type === TemplateFieldType.integer;
  const isText = type === TemplateFieldType.text;

  function errorId(property: string) {
    return `${fieldId}-${property}-error`;
  }

  function changeType(next: TemplateFieldType, onChange: (value: TemplateFieldType) => void) {
    onChange(next);
    if (next !== TemplateFieldType.number && next !== TemplateFieldType.integer) {
      setValue(`fields.${index}.minimum`, "");
      setValue(`fields.${index}.maximum`, "");
    }
    if (next !== TemplateFieldType.text) {
      setValue(`fields.${index}.pattern`, "");
    }
    if (next !== TemplateFieldType.choice) {
      setValue(`fields.${index}.allowedValues`, "");
    }
  }

  return (
    <SortableItem
      className="bg-card @container flex min-w-0 flex-col gap-3 rounded-lg border p-3"
      data-testid={`field-row-${number}`}
      value={fieldId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SortableItemHandle className="text-muted-foreground touch-none">
          <GripVerticalIcon aria-hidden="true" className="size-5" />
        </SortableItemHandle>
        <span className="text-mute font-semibold">Field {number}</span>
        <label className="text-body-sm ml-auto flex items-center gap-2">
          <Controller
            control={control}
            name={`fields.${index}.required`}
            render={({ field }) => (
              <Switch
                aria-label={`Field ${number} is required`}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          Required
        </label>
        <Button
          aria-label={`Move field ${number} up`}
          disabled={isFirst}
          onClick={onMoveUp}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
        <Button
          aria-label={`Move field ${number} down`}
          disabled={isLast}
          onClick={onMoveDown}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowDownIcon aria-hidden="true" />
        </Button>
        <Button aria-label={`Remove field ${number}`} onClick={onRemove} size="icon-sm" type="button" variant="ghost">
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 @xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,11rem)]">
        <div className="flex min-w-0 flex-col gap-1">
          <Input
            aria-describedby={rowErrors?.key ? errorId("key") : undefined}
            aria-label={`Key of field ${number}`}
            autoComplete="off"
            className="font-code"
            invalid={Boolean(rowErrors?.key)}
            placeholder="invoice_number"
            {...register(`fields.${index}.key`)}
          />
          <FieldError errors={[rowErrors?.key]} id={errorId("key")} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Input
            aria-describedby={rowErrors?.description ? errorId("description") : undefined}
            aria-label={`Description of field ${number}`}
            invalid={Boolean(rowErrors?.description)}
            placeholder="What to look for, where it sits on the form"
            {...register(`fields.${index}.description`)}
          />
          <FieldError errors={[rowErrors?.description]} id={errorId("description")} />
        </div>
        <Controller
          control={control}
          name={`fields.${index}.type`}
          render={({ field }) => (
            <Select
              aria-label={`Type of field ${number}`}
              onValueChange={(next) => changeType(next as TemplateFieldType, field.onChange)}
              value={field.value}
            >
              <SelectContent>
                {Object.values(TemplateFieldType).map((value) => (
                  <SelectItem key={value} value={value}>
                    {TYPE_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {type === TemplateFieldType.choice ? (
        <div className="flex min-w-0 flex-col gap-1">
          <Textarea
            aria-describedby={rowErrors?.allowedValues ? errorId("allowedValues") : undefined}
            aria-label={`Allowed values of field ${number}`}
            invalid={Boolean(rowErrors?.allowedValues)}
            placeholder={"Allowed values, one per line\nopen\nclosed"}
            rows={3}
            {...register(`fields.${index}.allowedValues`)}
          />
          <FieldError errors={[rowErrors?.allowedValues]} id={errorId("allowedValues")} />
        </div>
      ) : null}

      {hasRange || isText ? (
        <Collapsible onOpenChange={setAdvancedOpen} open={isAdvancedOpen || hasAdvancedError}>
          <CollapsibleTrigger asChild>
            <Button className="group" size="sm" type="button" variant="ghost">
              Advanced
              <ChevronDownIcon aria-hidden="true" className="transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            {hasRange ? (
              <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <Input
                    aria-describedby={rowErrors?.minimum ? errorId("minimum") : undefined}
                    aria-label={`Minimum of field ${number}`}
                    inputMode="decimal"
                    invalid={Boolean(rowErrors?.minimum)}
                    placeholder="Minimum"
                    {...register(`fields.${index}.minimum`)}
                  />
                  <FieldError errors={[rowErrors?.minimum]} id={errorId("minimum")} />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <Input
                    aria-describedby={rowErrors?.maximum ? errorId("maximum") : undefined}
                    aria-label={`Maximum of field ${number}`}
                    inputMode="decimal"
                    invalid={Boolean(rowErrors?.maximum)}
                    placeholder="Maximum"
                    {...register(`fields.${index}.maximum`)}
                  />
                  <FieldError errors={[rowErrors?.maximum]} id={errorId("maximum")} />
                </div>
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-1">
                <Input
                  aria-describedby={rowErrors?.pattern ? errorId("pattern") : undefined}
                  aria-label={`Pattern of field ${number}`}
                  className="font-code"
                  invalid={Boolean(rowErrors?.pattern)}
                  placeholder="Regular expression, for example ^INV-[0-9]+$"
                  {...register(`fields.${index}.pattern`)}
                />
                <FieldError errors={[rowErrors?.pattern]} id={errorId("pattern")} />
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </SortableItem>
  );
}
