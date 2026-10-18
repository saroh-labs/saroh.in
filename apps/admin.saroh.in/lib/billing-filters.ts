/**
 * Billing's filters as addresses (R25, admin plan "Billing filters"). A
 * filter is the page's query string: every card, chip, dropdown and the
 * search builds the address it leads to from the one it is on, so a filter
 * applies the moment it is picked, a link to it can be shared, and Back
 * undoes it. Client-safe: no server imports.
 *
 * The query keys are the ones the API already takes: `q` (on every tab),
 * `status`, `view` and `plan` (Subscriptions), `month` and `gstin`
 * (Invoices), `state` (Needs action), `filter` (Provider events). Any
 * change of filter goes back to the first page and closes an open sheet.
 */

import type { SubscriptionStatus, SubscriptionView } from "./billing-words";

/** The four tabs, as routes. */
export const BILLING_TABS = [
    { value: "subscriptions", href: "/billing/subscriptions" },
    { value: "invoices", href: "/billing/invoices" },
    { value: "actions", href: "/billing/actions" },
    { value: "events", href: "/billing/events" },
] as const;
export type BillingTab = (typeof BILLING_TABS)[number]["value"];

/** Which tab a path is on; Subscriptions, where `/billing` lands, else. */
export function tabOf(pathname: string): BillingTab {
    const found = BILLING_TABS.find(
        (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
    );
    return found?.value ?? "subscriptions";
}

/** The query as a plain record: what the page's `searchParams` holds. */
export type Query = Record<string, string | undefined>;

/**
 * Keys that are where you are in a list, not what it is narrowed to: the
 * page, and an open sheet with its tab, History chip and page (U15).
 */
export const PLACE = ["page", "open", "sheet", "history", "hpage"] as const;

/** An address from a path and a query, leaving out what says nothing. */
export function hrefOf(path: string, query: Query): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === "") continue;
        search.set(key, value);
    }
    const text = search.toString();
    return text ? `${path}?${text}` : path;
}

/**
 * The address with some keys set (or, as `undefined`, taken off), back on
 * the first page with no sheet open.
 */
export function withFilter(path: string, query: Query, change: Query): string {
    const next: Query = { ...query, ...change };
    for (const key of PLACE) delete next[key];
    return hrefOf(path, next);
}

/** The search, kept as it is, or changed: the same `q` on every tab. */
export function searchHref(path: string, query: Query, term: string): string {
    return withFilter(path, query, { q: term.trim() || undefined });
}

/** Another tab, carrying the search across and nothing else. */
export function tabHref(tab: BillingTab, query: Query): string {
    const href = BILLING_TABS.find((t) => t.value === tab)?.href ?? "/billing";
    return hrefOf(href, { q: query.q });
}

// ── Subscriptions ────────────────────────────────────────────────────────

/**
 * The five status cards (R26). Each is one of the API's filters: a status,
 * or the "ending soon" view. One is on at a time.
 */
export const STATUS_CARDS = [
    { key: "paying", label: "Paying", status: "ACTIVE" },
    { key: "failed", label: "Payment failed", status: "PAST_DUE" },
    { key: "trial", label: "In trial", status: "TRIALING" },
    { key: "ending", label: "Ending soon", view: "ending-soon" },
    { key: "ended", label: "Ended", status: "CANCELLED" },
] as const satisfies readonly {
    key: string;
    label: string;
    status?: SubscriptionStatus;
    view?: SubscriptionView;
}[];
export type StatusCardKey = (typeof STATUS_CARDS)[number]["key"];

/** The views that are a status by another name (older links). */
const VIEW_AS_STATUS: Partial<Record<string, SubscriptionStatus>> = {
    "past-due": "PAST_DUE",
    "first-month": "TRIALING",
};

/** Which card the query has on, if any. */
export function activeCard(query: Query): StatusCardKey | undefined {
    const status = query.status ?? VIEW_AS_STATUS[query.view ?? ""];
    for (const card of STATUS_CARDS) {
        if ("view" in card && query.view === card.view) return card.key;
        if ("status" in card && status === card.status) return card.key;
    }
    return undefined;
}

/**
 * Where a card leads: on, it sets its filter in place of any other card's;
 * pressed again, it takes the filter off. The search and the plan stay.
 */
export function cardHref(
    path: string,
    query: Query,
    key: StatusCardKey,
): string {
    if (activeCard(query) === key) {
        return withFilter(path, query, { status: undefined, view: undefined });
    }
    const card = STATUS_CARDS.find((c) => c.key === key);
    return withFilter(path, query, {
        status: card && "status" in card ? card.status : undefined,
        view: card && "view" in card ? card.view : undefined,
    });
}

/** Where a plan chip leads: that plan, or, pressed again, any plan. */
export function planHref(path: string, query: Query, plan: string): string {
    return withFilter(path, query, {
        plan: query.plan === plan ? undefined : plan,
    });
}

// ── Every tab ────────────────────────────────────────────────────────────

/** The keys each tab narrows by, beside the search. */
const TAB_FILTERS: Record<BillingTab, readonly string[]> = {
    subscriptions: ["status", "view", "plan"],
    invoices: ["month", "gstin"],
    actions: ["state"],
    events: ["filter"],
};

/** Whether anything narrows this tab: the search, or one of its filters. */
export function isNarrowed(tab: BillingTab, query: Query): boolean {
    return ["q", ...TAB_FILTERS[tab]].some((key) => Boolean(query[key]));
}

/** The tab with nothing narrowing it. */
export function clearHref(tab: BillingTab): string {
    return tabHref(tab, {});
}
