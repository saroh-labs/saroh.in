import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";

import type {
    InvoiceFormLine,
    InvoiceFormValues,
} from "@/lib/invoices/new-invoice";
import { EMPTY_LINE } from "@/lib/invoices/new-invoice";

type Form = UseFormReturn<InvoiceFormValues>;
type Lines = UseFieldArrayReturn<InvoiceFormValues, "lines">;

/**
 * A line put on the invoice, by the form's lines table or by "Add a line" on
 * the paper (U14, U15): into the first line nobody has started, else at the
 * end. Answers the place it took, for the paper to open its editor.
 */
export function placeLine(
    form: Form,
    lines: Lines,
    line: InvoiceFormLine,
): number {
    const empty = form
        .getValues("lines")
        .findIndex((l) => !l.description.trim() && !l.unitPrice.trim());
    if (empty >= 0) {
        form.setValue(`lines.${empty}`, line, {
            shouldDirty: true,
            shouldValidate: form.formState.isSubmitted,
        });
        return empty;
    }
    lines.append(line);
    return lines.fields.length;
}

/** A line taken off; the last one empties rather than goes, as an invoice has one. */
export function takeLine(form: Form, lines: Lines, index: number): void {
    if (lines.fields.length > 1) {
        lines.remove(index);
        return;
    }
    form.setValue("lines.0", { ...EMPTY_LINE }, { shouldDirty: true });
}
