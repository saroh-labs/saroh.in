import type { ComponentProps } from "react";

import type {
    InvoiceFormBusiness,
    InvoiceFormValues,
} from "@/lib/invoices/new-invoice";
import { dueAtOf, placeOf } from "@/lib/invoices/new-invoice";
import type { PreviewSums } from "@/lib/invoices/new-invoice-lines";
import { lookOf } from "@/lib/invoices/paper-look";
import type { Invoice } from "@/lib/invoices/service";

import type { PaperPreview } from "./paper-preview";

export type PaperProps = Omit<ComponentProps<typeof PaperPreview>, "editing">;

/**
 * The paper as the form has it now, for every place that draws it: "How it
 * will look" beside the form (U14), the paper being edited, and "See it as
 * Vivek will" (U15). Its look is the draft's own choice, else the
 * business's default (`lookOf`), so all three draw the same.
 */
export function paperPropsOf({
    values,
    sums,
    business,
    businessName,
    buyerName,
    registered,
    currency,
    zone,
    draft,
    now,
}: {
    values: InvoiceFormValues;
    sums: PreviewSums;
    business: InvoiceFormBusiness | null;
    businessName: string;
    buyerName: string | null;
    registered: boolean;
    currency: string;
    zone: string;
    draft?: Invoice;
    now: Date;
}): PaperProps {
    const look = lookOf(
        values,
        business?.paper ?? {
            // A role that can't read the settings: what the draft says.
            style: draft?.paper?.style ?? "CLASSIC",
            colour: draft?.paper?.colour ?? null,
        },
    );
    return {
        seller: business?.seller ?? {
            name: businessName,
            address: null,
            gstin: null,
            state: null,
            logo: null,
        },
        registered,
        currency,
        zone,
        buyer: {
            name: buyerName,
            address: values.billToAddress,
            gstin: values.billToGstin.trim().toUpperCase(),
        },
        place: placeOf(values, business?.state ?? null),
        sums,
        dueAt:
            values.due === 0
                ? null
                : dueAtOf(values.due, draft?.dueAt, now, zone),
        style: look.style,
        colour: look.colour,
        howToPay: business?.howToPay ?? null,
    };
}
