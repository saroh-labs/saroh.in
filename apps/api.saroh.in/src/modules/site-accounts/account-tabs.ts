/**
 * The account area's tab bar (round-2 plan A, A5; Saroh Customer Site
 * design): only the tabs of what this business offers, and only the ones
 * whose page has shipped.
 *
 * Home and Me always show. Bookings (A6), Orders (A7), Plan (A8) and
 * Messages (A13) each show once their unit adds its key to
 * {@link SHIPPED_ACCOUNT_TABS} and the business offers it: a clinic sees
 * Appointments, a bakery Orders and no Appointments. A tab never points at a
 * page that isn't there.
 */

export type AccountTabKey =
    "home" | "bookings" | "orders" | "plan" | "messages" | "me";

export interface AccountTab {
    key: AccountTabKey;
    label: string;
}

/** What the business offers its customers online, read per request. */
export interface AccountOffers {
    /** Appointments is rolled out and on. */
    appointments: boolean;
    /** Commerce is rolled out and on. */
    orders: boolean;
    /**
     * A plan on sale (never a draft, `PLANS_ON_SALE`), one this customer is
     * on, or a pack of theirs not yet expired: what the Plan tab shows (A8).
     */
    plans: boolean;
    /** The customer can message the business (A13). */
    messages: boolean;
    /**
     * "Bookings" when the business runs classes (a service with more than
     * one place), else "Appointments", as the design names them.
     */
    bookingsLabel: "Bookings" | "Appointments";
}

/**
 * The tabs whose pages exist. A6, A7, A8 and A13 each add theirs, in the
 * same change as the page.
 */
export const SHIPPED_ACCOUNT_TABS: ReadonlySet<AccountTabKey> = new Set([
    "home",
    "orders",
    // A8: the plan and packs.
    "plan",
    // A13: the customer's thread.
    "messages",
    "me",
]);

/** The tab bar, in the design's order. */
export function accountTabs(
    offers: AccountOffers,
    shipped: ReadonlySet<AccountTabKey> = SHIPPED_ACCOUNT_TABS,
): AccountTab[] {
    const all: [AccountTabKey, string, boolean][] = [
        ["home", "Home", true],
        ["bookings", offers.bookingsLabel, offers.appointments],
        ["orders", "Orders", offers.orders],
        ["plan", "Plan", offers.plans],
        ["messages", "Messages", offers.messages],
        ["me", "Me", true],
    ];
    return all
        .filter(([key, , offered]) => offered && shipped.has(key))
        .map(([key, label]) => ({ key, label }));
}
