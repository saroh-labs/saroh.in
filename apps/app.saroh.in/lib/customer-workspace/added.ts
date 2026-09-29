import { dayText } from "@/lib/subscriptions/view";

import type { CustomerDetail } from "./detail";
import { whenText } from "./when";

/**
 * Someone added on the Customers list by hand (DEC-056, C14): a contact, and
 * the words Customer Detail says of them before their first order.
 */

/** Where such a contact came from: the API's `ADDED_AS_CUSTOMER`. */
export const ADDED_BY_HAND = "customers:added";

/** Whether they were added on the Customers list by hand. */
export function addedByHand(d: Pick<CustomerDetail, "contact">): boolean {
    return d.contact.source === ADDED_BY_HAND;
}

/**
 * "Added by hand today" for someone added on the Customers list, else
 * "Added 1 Jul".
 */
export function addedLine(
    contact: Pick<CustomerDetail["contact"], "source" | "createdAt">,
    timeZone: string,
    now: Date,
): string {
    if (contact.source !== ADDED_BY_HAND) {
        return `Added ${dayText(contact.createdAt, timeZone, now)}`;
    }
    const when = whenText(contact.createdAt, timeZone, now);
    return when === "Today" || when === "Yesterday"
        ? `Added by hand ${when.toLowerCase()}`
        : `Added by hand on ${when}`;
}
