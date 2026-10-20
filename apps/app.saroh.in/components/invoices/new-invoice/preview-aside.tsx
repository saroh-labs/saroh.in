import type { InvoiceFormBusiness } from "@/lib/invoices/new-invoice";
import { issueLine } from "@/lib/invoices/new-invoice";

import { PaperPreview } from "./paper-preview";
import type { PaperProps } from "./paper-props";

/**
 * The right column (INVNewA): "How it will look", the paper as typed, in the
 * draft's own look or else the business's, and under it the one line on
 * what saving and issuing do. A phone keeps it behind See it (`open`).
 */
export function PreviewAside({
    id,
    open,
    paper,
    business,
    withLink,
}: {
    id: string;
    /** Opened on a phone by See how it will look. */
    open: boolean;
    paper: PaperProps;
    business: InvoiceFormBusiness | null;
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
            <PaperPreview {...paper} />
            <p className="mt-2 text-[12px] leading-[1.5] text-muted-foreground">
                {issueLine(business?.nextNumber ?? null)}
                {withLink
                    ? " Its payment link is copied for you to send."
                    : null}
            </p>
        </aside>
    );
}
