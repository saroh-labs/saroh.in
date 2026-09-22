import type { InvoiceSource, InvoiceStanding } from "./service";

/**
 * How an invoice's status is said, and in what shape (ADR-007).
 *
 * The word carries the meaning and the colour only reinforces it, because
 * a shop floor in bright light resolves colour last. Overdue is derived by
 * the API from the due date; this adds how long, or when it falls due.
 */

type Variant = "info" | "error" | "success" | "neutral";

export interface StatusView {
    label: string;
    variant: Variant;
    /** "Due tomorrow", "3 days overdue" — null when there is nothing to add. */
    detail: string | null;
}

const DAY = 86_400_000;

/** Whole calendar days from `now` to `iso`, by UTC date. */
function daysUntil(iso: string, now: Date): number {
    const due = new Date(iso);
    const a = Date.UTC(
        due.getUTCFullYear(),
        due.getUTCMonth(),
        due.getUTCDate(),
    );
    const b = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
    );
    return Math.round((a - b) / DAY);
}

export function invoiceStatus(
    invoice: { standing: InvoiceStanding; dueAt: string | null },
    now: Date = new Date(),
): StatusView {
    switch (invoice.standing) {
        case "DRAFT":
            return { label: "Draft", variant: "neutral", detail: null };
        case "PAID":
            return { label: "Paid", variant: "success", detail: null };
        case "VOID":
            return { label: "Void", variant: "neutral", detail: null };
        case "OVERDUE": {
            const late = invoice.dueAt ? -daysUntil(invoice.dueAt, now) : 0;
            return {
                label: "Overdue",
                variant: "error",
                detail:
                    late <= 0
                        ? "Overdue"
                        : `${late} ${late === 1 ? "day" : "days"} overdue`,
            };
        }
        case "ISSUED": {
            if (!invoice.dueAt) {
                return { label: "Issued", variant: "info", detail: null };
            }
            const d = daysUntil(invoice.dueAt, now);
            return {
                label: "Issued",
                variant: "info",
                detail:
                    d <= 0
                        ? "Due today"
                        : d === 1
                          ? "Due tomorrow"
                          : `Due in ${d} days`,
            };
        }
    }
}

/**
 * Who it is billed to. An issued invoice keeps the name and email it was
 * issued with, so a deleted or edited contact never changes it; a draft has
 * no bill-to yet and reads the contact.
 */
export function billedTo(invoice: {
    contact: { id: string; name: string; email: string } | null;
    billTo: { name: string | null; email: string | null } | null;
}): { name: string; email: string | null; contactId: string | null } {
    const contactId = invoice.contact?.id ?? null;
    if (invoice.billTo) {
        return {
            name: invoice.billTo.name ?? invoice.billTo.email ?? "Unknown",
            email: invoice.billTo.email,
            contactId,
        };
    }
    if (invoice.contact) {
        return {
            name: invoice.contact.name,
            email: invoice.contact.email,
            contactId,
        };
    }
    return { name: "No one chosen", email: null, contactId: null };
}

const SOURCE: Record<InvoiceSource, string> = {
    SUBSCRIPTION: "Membership",
    PACK: "Class pack",
    COURSE: "Course",
    MANUAL: "Entered by hand",
};

export function sourceLabel(source: InvoiceSource): string {
    return SOURCE[source];
}
