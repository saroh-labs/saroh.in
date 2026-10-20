import type {
    InvoiceFormBusiness,
    InvoiceFormValues,
} from "@/lib/invoices/new-invoice";
import { dueAtOf, issueLine, placeOf } from "@/lib/invoices/new-invoice";
import type { PreviewSums } from "@/lib/invoices/new-invoice-lines";
import type { Invoice } from "@/lib/invoices/service";

import { PaperPreview } from "./paper-preview";

/**
 * The right column (INVNewA): "How it will look", the paper as typed, in the
 * draft's own look or else the business's, and under it the one line on
 * what saving and issuing do. A phone keeps it behind See it (`open`).
 */
export function PreviewAside({
    id,
    open,
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
    withLink,
}: {
    id: string;
    /** Opened on a phone by See how it will look. */
    open: boolean;
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
    withLink: boolean;
}) {
    return (
        <aside
            id={id}
            aria-labelledby={`${id}-title`}
            className={
                open
                    ? "min-w-0 lg:sticky lg:top-3"
                    : "min-w-0 max-sm:hidden lg:sticky lg:top-3"
            }
        >
            <h2 id={`${id}-title`} className="label mb-2">
                How it will look
            </h2>
            <PaperPreview
                seller={
                    business?.seller ?? {
                        name: businessName,
                        address: null,
                        gstin: null,
                        state: null,
                        logo: null,
                    }
                }
                registered={registered}
                currency={currency}
                zone={zone}
                buyer={{
                    name: buyerName,
                    address: values.billToAddress,
                    gstin: values.billToGstin.trim().toUpperCase(),
                }}
                place={placeOf(values, business?.state ?? null)}
                sums={sums}
                dueAt={
                    values.due === 0
                        ? null
                        : dueAtOf(values.due, draft?.dueAt, now, zone)
                }
                style={
                    draft?.paper?.style ?? business?.paper.style ?? "CLASSIC"
                }
                colour={
                    draft?.paper
                        ? draft.paper.colour
                        : (business?.paper.colour ?? null)
                }
            />
            <p className="mt-2 text-[12px] leading-[1.5] text-muted-foreground">
                {issueLine(business?.nextNumber ?? null)}
                {withLink
                    ? " Its payment link is copied for you to send."
                    : null}
            </p>
        </aside>
    );
}
