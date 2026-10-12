import type { AccountChange } from "./details-model";
import type { AccountHome, AccountView } from "./model";

/**
 * What Home shows, and in what order (DEC-142): what this customer has in
 * progress first, then what is recent, then what else they can do here —
 * and only for what the business offers. With nothing at all, one welcome
 * block instead of a column of empty cards.
 *
 * Pure, so every combination is tested without drawing anything. The page
 * draws the keys in this order; the same order is the DOM's at every width.
 *
 * - **In progress:** a place held for them in a class (it runs out within
 *   hours), an invoice to pay, a booking coming up, an order on its way, a
 *   message they haven't opened.
 * - **Recent:** their latest orders once none is on its way, classes left,
 *   their plan, their courses, a line they are waiting in — and any block
 *   whose read failed, which says so there rather than vanish.
 * - **Offers:** "Book a time" and "Go to the shop", last, each only when
 *   the business offers it and the customer has none of it under way.
 */

export type HomeBlock =
    | "changes"
    | "place-held"
    | "to-pay"
    | "booking"
    | "orders"
    | "messages"
    | "classes"
    | "plan"
    | "courses"
    | "waiting"
    | "offers"
    | "welcome";

export interface HomeOffers {
    /** The booking page, when the business takes bookings online. */
    book: boolean;
    /** The shop, while it takes orders. */
    shop: boolean;
}

export interface HomeLayout {
    /** The blocks to draw, in order. */
    blocks: HomeBlock[];
    /** What the offers block (or the welcome block) may offer. */
    offers: HomeOffers;
    /** The changes worth a line, already filtered. */
    changes: AccountChange[];
}

/** What the page knows beyond the API's Home: which doors are open. */
export interface HomeDoors {
    /** `/book` is there to send them to. */
    canBook: boolean;
    /** The shop takes orders now. */
    canShop: boolean;
}

export function homeLayout(
    account: Pick<AccountView, "tabs" | "unreadMessages">,
    home: AccountHome,
    doors: HomeDoors,
): HomeLayout {
    const progress: HomeBlock[] = [];
    const recent: HomeBlock[] = [];

    const messagesTab = account.tabs.some((t) => t.key === "messages");
    const changes = home.changes?.ok
        ? home.changes.value.filter(
              // A line with nowhere to lead is left out.
              (c) => c.kind !== "messages" || messagesTab,
          )
        : [];

    // A place held for them, or a line they are waiting in.
    const waitlist = home.waitlist ?? null;
    if (waitlist) {
        if (!waitlist.ok) recent.push("waiting");
        else {
            if (waitlist.value.some((p) => p.status === "OFFERED")) {
                progress.push("place-held");
            }
            if (waitlist.value.some((p) => p.status === "WAITING")) {
                recent.push("waiting");
            }
        }
    }

    const invoices = home.invoicesDue;
    if (invoices) {
        if (!invoices.ok) recent.push("to-pay");
        else if (invoices.value.length > 0) progress.push("to-pay");
    }

    const booked = home.nextBooking?.ok === true && home.nextBooking.value;
    if (home.nextBooking && !home.nextBooking.ok) recent.push("booking");
    else if (booked) progress.push("booking");

    const orders = home.orders;
    const orderOpen = orders?.ok === true && orders.value.some((o) => o.open);
    if (orders) {
        if (!orders.ok) recent.push("orders");
        else if (orderOpen) progress.push("orders");
        else if (orders.value.length > 0) recent.push("orders");
    }

    // Unread, unless "since you were last here" already says so.
    const unread = messagesTab && (account.unreadMessages ?? 0) > 0;
    if (unread && !changes.some((c) => c.kind === "messages")) {
        progress.push("messages");
    }

    if (!home.classes.ok || home.classes.value) recent.push("classes");
    if (!home.plan.ok || home.plan.value) recent.push("plan");
    const courses = home.courses;
    if (courses && (!courses.ok || courses.value.length > 0)) {
        recent.push("courses");
    }

    // Recent keeps the page's reading order: orders, then what they hold,
    // then what couldn't be read sits where it would have.
    const RECENT_ORDER: HomeBlock[] = [
        "booking",
        "orders",
        "to-pay",
        "classes",
        "plan",
        "courses",
        "waiting",
    ];
    recent.sort((a, b) => RECENT_ORDER.indexOf(a) - RECENT_ORDER.indexOf(b));

    const offers: HomeOffers = {
        // Offered only for what they have none of under way.
        book: doors.canBook && home.nextBooking !== null && !booked,
        shop: doors.canShop && orders !== null && !orderOpen,
    };

    const blocks: HomeBlock[] = [];
    if (changes.length > 0 || home.changes?.ok === false)
        blocks.push("changes");
    blocks.push(...progress, ...recent);

    const nothing = progress.length === 0 && recent.length === 0;
    if (nothing && changes.length === 0) {
        // One friendly block; it carries the offers itself.
        blocks.push("welcome");
    } else if (offers.book || offers.shop) {
        blocks.push("offers");
    }
    return { blocks, offers, changes };
}
