import type { AccountView } from "./model";

/**
 * Home's own sentences (DEC-142): what the offers card and the welcome
 * block say, in the words of what this business offers. Pure, so a server
 * page and a test read them without drawing anything.
 */

/** What the offers card says, by what it offers. */
export function offersLead(offers: { book: boolean; shop: boolean }): string {
    if (offers.book && offers.shop) {
        return "Book a time, or see what's on sale and order online.";
    }
    return offers.book
        ? "Pick a time that suits you."
        : "See what's on sale and order online.";
}

/**
 * What an account with nothing in it says: what will show here, in the
 * words of what this business offers.
 */
export function welcomeLead(
    account: Pick<AccountView, "businessName" | "offers" | "tabs">,
): string {
    const { appointments, orders } = account.offers;
    const business = account.businessName;
    const messages = account.tabs.some((t) => t.key === "messages");
    const shown = [
        appointments ? "what you've booked" : null,
        orders ? "where your order is" : null,
        "your receipts",
        messages ? "your messages" : null,
    ].filter((part): part is string => part !== null);
    const list =
        shown.length > 1
            ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1) ?? ""}`
            : (shown[0] ?? "");
    const when =
        appointments && orders
            ? "book or order"
            : appointments
              ? "book"
              : orders
                ? "order"
                : null;
    return when
        ? `Once you ${when} with ${business}, you'll find it here: ${list}.`
        : `This is where you'll find ${list} with ${business}.`;
}

/**
 * Said on an empty Home when the account stands on a record of its own
 * (DEC-049): what is true, and what to do about it. Nothing of the other
 * record is shown, or said to exist for certain.
 */
export function linkPendingLine(
    business: string,
    messagesHref: string | null,
): string {
    const ask = messagesHref
        ? "Send them a message to ask."
        : "Ask them next time you're in touch.";
    return `Been a customer before? Earlier bookings and orders aren't on this account until ${business} has checked it's you. ${ask}`;
}
