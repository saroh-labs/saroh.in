import { askAiAppHref } from "@saroh/api-contract";
import { DateTime } from "luxon";

/**
 * Every app page an Ask AI card links to, and the query keys each may
 * carry: a closed list. `scripts/check-app-routes.mjs` reads each `route:`
 * here and fails the build when the app has no page for it, so a card's
 * link can't land on a 404. A link to anything else throws.
 *
 * The lists' date filter (`lib/views/date-range.ts` in the app):
 * `date=today|yesterday|7d|month|custom`, `custom` with `from`/`to` as
 * YYYY-MM-DD in the business's zone, both days included.
 */
export const APP_LINKS = {
    orders: { route: "/commerce/orders", params: ["date", "from", "to"] },
    order: { route: "/commerce/orders/:id", params: [] },
    invoices: {
        route: "/billing/invoices",
        params: ["date", "from", "to", "tab", "view"],
    },
    invoice: { route: "/billing/invoices/:id", params: [] },
    bookingsDay: { route: "/bookings", params: ["date"] },
    bookings: {
        route: "/bookings/all",
        params: ["date", "from", "to", "view"],
    },
    booking: { route: "/bookings/:id", params: [] },
    customers: { route: "/contacts", params: [] },
    customer: { route: "/contacts/:id", params: [] },
    products: { route: "/commerce/products", params: [] },
    product: { route: "/commerce/products/:id", params: [] },
    stock: { route: "/commerce/stock", params: ["tab", "date", "from", "to"] },
    insights: { route: "/analytics", params: ["tab", "period"] },
    calendar: { route: "/calendar", params: ["view", "day"] },
    classPacks: { route: "/class-packs/purchases", params: [] },
} as const satisfies Record<
    string,
    { route: `/${string}`; params: readonly string[] }
>;

export type AppLink = keyof typeof APP_LINKS;
type ParamOf<K extends AppLink> = (typeof APP_LINKS)[K]["params"][number];

/**
 * The address of one of {@link APP_LINKS}: `id` fills `:id` (encoded, so
 * an id can't leave the page), empty params are left out. Null for a
 * record link without an id.
 */
export function appLink<K extends AppLink>(
    key: K,
    params: Partial<Record<ParamOf<K>, string | null | undefined>> = {},
    id?: string | null,
): string | null {
    const { route, params: allowed } = APP_LINKS[key];
    const needsId = route.includes(":id");
    if (needsId && !id) return null;
    const path = needsId
        ? route.replace(":id", encodeURIComponent(id ?? ""))
        : route;
    const q = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
        if (!(allowed as readonly string[]).includes(name)) {
            throw new Error(`appLink: ${route} takes no "${name}"`);
        }
        if (typeof value === "string" && value) q.set(name, value);
    }
    const href = q.size ? `${path}?${q.toString()}` : path;
    return askAiAppHref.safeParse(href).success ? href : null;
}

/** Named periods with a list preset of their own; the rest are a custom range. */
const PRESET: Record<string, string> = {
    today: "today",
    last_7_days: "7d",
    this_month: "month",
};

/** A list's date filter for a period's exact days (`from`, `to` both included). */
export function dateFilter(span: {
    period?: string;
    from?: string | null;
    to?: string | null;
}): { date?: string; from?: string; to?: string } {
    const preset = span.period ? PRESET[span.period] : undefined;
    if (preset) return { date: preset };
    if (!span.from && !span.to) return {};
    return {
        date: "custom",
        ...(span.from ? { from: span.from } : {}),
        ...(span.to ? { to: span.to } : {}),
    };
}

/**
 * A list tool's `from`/`to` instants as the days a list's filter takes:
 * `to` is "before", the filter's days include both ends, so the last day
 * is the one before `to`. Each read on its own offset (the model sends the
 * business's).
 */
export function instantSpan(
    input: { from?: string; to?: string } | undefined,
): { from: string | null; to: string | null } {
    const dayOf = (iso: string | undefined, back = 0) => {
        if (!iso) return null;
        const at = DateTime.fromISO(iso, { setZone: true });
        return at.isValid ? at.minus({ milliseconds: back }).toISODate() : null;
    };
    return { from: dayOf(input?.from), to: dayOf(input?.to, 1) };
}

/** Insights' own periods (`?period=7d|4w|3m`); others open its default. */
export const INSIGHTS_PERIOD: Record<string, string> = {
    last_7_days: "7d",
    last_4_weeks: "4w",
    last_3_months: "3m",
};

/** {@link appLink} for a page with no id: always an address. */
export function pageLink<K extends AppLink>(
    key: K,
    params: Partial<Record<ParamOf<K>, string | null | undefined>> = {},
): string {
    const href = appLink(key, params);
    if (!href) throw new Error(`pageLink: ${APP_LINKS[key].route}`);
    return href;
}
