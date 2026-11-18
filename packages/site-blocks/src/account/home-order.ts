import type { AccountChange } from "./details-model";
import type { AccountHome, AccountView } from "./model";

/**
 * What Home shows, and in what order (DEC-229, plan U13; first DEC-142).
 * One fixed order for every business, trade and look, each block left out
 * when it has nothing to say:
 *
 * 1. **Waiting on you:** a place held for them in a class (it runs out
 *    within hours), then a bill to pay.
 * 2. **What's next:** a booking coming up, then a line they are waiting in.
 * 3. **New since your last visit:** what changed, then a message they
 *    haven't opened (unless the changes already say so).
 * 4. **Plan and packs:** classes left, their plan, their courses.
 * 5. **Latest order.**
 * 6. "Book a time" and "Go to the shop", last, each only when the business
 *    offers it and the customer has none of it under way. With nothing at
 *    all, one welcome block that carries them instead.
 *
 * A block whose read failed sits where it would have, and says so. Pure, so
 * every combination is tested without drawing anything; the page draws the
 * keys in this order, which is the DOM's at every width.
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

/** The one order (DEC-229). */
export const HOME_ORDER: readonly HomeBlock[] = [
    "place-held",
    "to-pay",
    "booking",
    "waiting",
    "changes",
    "messages",
    "classes",
    "plan",
    "courses",
    "orders",
];

/** The blocks Home groups as "Waiting on you". */
export const WAITING_ON_YOU: ReadonlySet<HomeBlock> = new Set<HomeBlock>([
    "place-held",
    "to-pay",
]);

export function homeLayout(
    account: Pick<AccountView, "tabs" | "unreadMessages">,
    home: AccountHome,
    doors: HomeDoors,
): HomeLayout {
    const shown = new Set<HomeBlock>();

    const messagesTab = account.tabs.some((t) => t.key === "messages");
    const changes = home.changes?.ok
        ? home.changes.value.filter(
              // A line with nowhere to lead is left out.
              (c) => c.kind !== "messages" || messagesTab,
          )
        : [];
    if (changes.length > 0 || home.changes?.ok === false) shown.add("changes");

    // A place held for them, or a line they are waiting in.
    const waitlist = home.waitlist ?? null;
    if (waitlist) {
        if (!waitlist.ok) shown.add("waiting");
        else {
            if (waitlist.value.some((p) => p.status === "OFFERED")) {
                shown.add("place-held");
            }
            if (waitlist.value.some((p) => p.status === "WAITING")) {
                shown.add("waiting");
            }
        }
    }

    const invoices = home.invoicesDue;
    if (invoices && (!invoices.ok || invoices.value.length > 0)) {
        shown.add("to-pay");
    }

    const booked = home.nextBooking?.ok === true && home.nextBooking.value;
    if ((home.nextBooking && !home.nextBooking.ok) || booked) {
        shown.add("booking");
    }

    const orders = home.orders;
    const orderOpen = orders?.ok === true && orders.value.some((o) => o.open);
    if (orders && (!orders.ok || orders.value.length > 0)) shown.add("orders");

    // Unread, unless "since you were last here" already says so.
    const unread = messagesTab && (account.unreadMessages ?? 0) > 0;
    if (unread && !changes.some((c) => c.kind === "messages")) {
        shown.add("messages");
    }

    if (!home.classes.ok || home.classes.value) shown.add("classes");
    if (!home.plan.ok || home.plan.value) shown.add("plan");
    const courses = home.courses;
    if (courses && (!courses.ok || courses.value.length > 0)) {
        shown.add("courses");
    }

    const offers: HomeOffers = {
        // Offered only for what they have none of under way.
        book: doors.canBook && home.nextBooking !== null && !booked,
        shop: doors.canShop && orders !== null && !orderOpen,
    };

    const blocks = HOME_ORDER.filter((key) => shown.has(key));
    if (blocks.length === 0) {
        // One friendly block; it carries the offers itself.
        blocks.push("welcome");
    } else if (offers.book || offers.shop) {
        blocks.push("offers");
    }
    return { blocks, offers, changes };
}
