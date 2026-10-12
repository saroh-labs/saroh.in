import type { BillingAccessView } from "@/lib/billing/access";
import { accessRow } from "@/lib/billing/access";

/**
 * The add-person dialog's line about team seats, said only when a seat
 * would actually be used up: the business's plan counts seats and enforces
 * the count. Someone added with no login uses one (DEC-105). Null
 * otherwise, and whenever the plan couldn't be read: the API still refuses
 * a full team and says why.
 */
export function seatNote(view: BillingAccessView | null): string | null {
    if (view?.source !== "catalogue" || !view.enforced) return null;
    const row = accessRow(view, "members");
    if (row?.state !== "on" || row.limit === null || row.usage === null) {
        return null;
    }
    return `They use a team seat: ${row.usage} of ${row.limit} are taken.`;
}
