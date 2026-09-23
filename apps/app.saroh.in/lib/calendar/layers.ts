import { fromMajor, toMajor } from "./money";
import type {
    CalendarDay,
    CalendarItem,
    CalendarLink,
    CalendarMonth,
    LayerKey,
} from "./types";

/**
 * The Business Calendar's shaping, after the "Saroh Business Calendar"
 * design: which layers a business gets and in what order and colour, what a
 * day's chips say, and how each dated thing reads in the day panel. Pure, so
 * the rules are tested without a browser; the screen only draws them.
 */

/** A layer fill, one of the `--layer-*` tokens (globals.css). */
export type LayerTone = 1 | 2 | 3 | 4 | 5 | 6;

export interface LayerStyle {
    key: LayerKey;
    label: string;
    /** What one chip counts: "1 order", "2 pickups". */
    one: string;
    many: string;
    tone: LayerTone;
}

/**
 * The order a business reads its month in: what it mostly does first (the
 * lead layer, whose takings draw the bar), then what it collects, renews and
 * bills. A shop leads with Orders; a gym with Bookings then Classes.
 */
const ORDER: LayerKey[] = [
    "orders",
    "bookings",
    "classes",
    "collections",
    "subscriptions",
    "invoices",
];

/**
 * Colours as the design gives them per business. A shop: Orders umber,
 * Collections green, Subscriptions slate, Invoices clay. A business that
 * takes bookings and sells no orders: Bookings umber, Classes slate, its
 * memberships green, Invoices clay. Both kinds at once keep the shop's and
 * give the diary the two fills left, so no two layers share one.
 */
function toneOf(key: LayerKey, shop: boolean): LayerTone {
    switch (key) {
        case "orders":
            return 1;
        case "collections":
            return shop ? 2 : 5;
        case "subscriptions":
            return shop ? 3 : 2;
        case "invoices":
            return 4;
        case "bookings":
            return shop ? 5 : 1;
        case "classes":
            return shop ? 6 : 3;
    }
}

/**
 * The layers a business gets on its calendar: every one the API sent (the
 * modules it runs and what this person may read), in reading order.
 *
 * A layer with nothing all month is left out unless it leads, or could not be
 * read — a gym that sells no weekly collections should not carry a
 * "Collections 0" switch it can never use, and a failed layer must still be
 * named rather than vanish.
 */
export function layersFor(month: Pick<CalendarMonth, "layers" | "totals">) {
    const shop = month.layers.includes("orders");
    const sent = ORDER.filter((k) => month.layers.includes(k));
    const lead = sent[0] ?? null;
    return sent
        .filter((k) => k === lead || month.totals[k] !== 0)
        .map((key): LayerStyle => ({
            key,
            ...LABELS[key](shop),
            tone: toneOf(key, shop),
        }));
}

const LABELS: Record<
    LayerKey,
    (shop: boolean) => Pick<LayerStyle, "label" | "one" | "many">
> = {
    orders: () => ({ label: "Orders", one: "order", many: "orders" }),
    collections: () => ({
        label: "Collections",
        one: "pickup",
        many: "pickups",
    }),
    // A gym sells memberships; a bakery, subscriptions. Same records.
    subscriptions: (shop) => ({
        label: shop ? "Subscriptions" : "Memberships",
        one: "renewal",
        many: "renewals",
    }),
    invoices: () => ({ label: "Invoices", one: "invoice", many: "invoices" }),
    bookings: () => ({ label: "Bookings", one: "booking", many: "bookings" }),
    classes: () => ({ label: "Classes", one: "class", many: "classes" }),
};

/** The layers switched off, by key. */
export type Off = Partial<Record<LayerKey, boolean>>;

/** How many things on a day need acting on, among the layers switched on. */
export function actOnCount(day: CalendarDay, off: Off): number {
    const failed = off.subscriptions
        ? 0
        : (day.layers.subscriptions?.kinds.failed ?? 0);
    const overdue = off.invoices
        ? 0
        : (day.layers.invoices?.kinds.overdue ?? 0);
    return failed + overdue;
}

export interface DayChip {
    key: LayerKey | "act";
    text: string;
    tone: LayerTone | "act";
}

/**
 * A day's chips: what needs acting on first, then a count per layer that has
 * anything. The desk shows the first three; the phone draws each as a dot.
 */
export function dayChips(
    day: CalendarDay,
    layers: LayerStyle[],
    off: Off,
): DayChip[] {
    const chips: DayChip[] = [];
    const act = actOnCount(day, off);
    if (act > 0)
        chips.push({ key: "act", text: `${act} to act on`, tone: "act" });
    for (const layer of layers) {
        if (off[layer.key]) continue;
        const n = day.layers[layer.key]?.count ?? 0;
        if (n === 0) continue;
        chips.push({
            key: layer.key,
            text: `${n} ${n === 1 ? layer.one : layer.many}`,
            tone: layer.tone,
        });
    }
    return chips;
}

/** Everything on a day among the layers switched on. */
export function dayCount(
    day: CalendarDay,
    layers: LayerStyle[],
    off: Off,
): number {
    return layers
        .filter((l) => !off[l.key])
        .reduce((n, l) => n + (day.layers[l.key]?.count ?? 0), 0);
}

/**
 * The currency the calendar speaks in: the takings' first, else the first
 * amount any item carries. Totals are per currency and never added across
 * them; a business trading in two shows its first in the cells.
 */
export function mainCurrency(month: CalendarMonth): string | null {
    const fromTakings = month.takings?.total?.[0]?.currency;
    if (fromTakings) return fromTakings;
    for (const day of month.days) {
        for (const layer of Object.values(day.layers)) {
            const hit = layer.items.find((i) => i.currency);
            if (hit?.currency) return hit.currency;
        }
    }
    return null;
}

/** A day's takings in the main currency, in major units (0 when none). */
export function dayTakings(day: CalendarDay, currency: string | null): number {
    if (!currency || !day.takings) return 0;
    const hit = day.takings.find((t) => t.currency === currency);
    return hit ? toMajor(hit.amount) : 0;
}

/** Where a dated thing opens. */
export function linkHref(link: CalendarLink): string {
    switch (link.type) {
        case "order":
            return `/commerce/orders/${link.id}`;
        case "invoice":
            return `/billing/invoices/${link.id}`;
        case "booking":
            return `/bookings/${link.id}`;
        case "service":
            return `/services/${link.id}`;
        case "subscription":
            // No page of its own yet (U13 builds Subscription Detail): the
            // list, where it is one row.
            return "/billing/subscriptions";
    }
}

export type FlagTone = "bad" | "accent";

export interface ItemLine {
    title: string;
    sub: string;
    flag: { label: string; tone: FlagTone } | null;
    href: string;
}

/** "06:00", "18:30" in the business's zone — the design's day panel clock. */
export function clock(at: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(at));
}

/** A bare order number reads as one: "1017" → "#1017". */
function orderRef(ref: string): string {
    return /^\d+$/.test(ref) ? `#${ref}` : ref;
}

const joined = (...parts: (string | null | undefined)[]) =>
    parts.filter(Boolean).join(" · ");

/**
 * How one dated thing reads in the day panel: what happened and to whom,
 * where it opens, and a flag when it needs attention. `ahead` says the day is
 * still to come, so a renewal "Renews" rather than "Renewed".
 */
export function describeItem(
    layer: LayerKey,
    item: CalendarItem,
    { timeZone, ahead }: { timeZone: string; ahead: boolean },
): ItemLine {
    const at = item.at ? clock(item.at, timeZone) : null;
    const href = linkHref(item.link);
    const line = (
        title: string,
        sub: string | null,
        flag: ItemLine["flag"] = null,
    ): ItemLine => ({
        title,
        sub: joined(sub, ahead ? "coming up" : null),
        flag,
        href,
    });
    switch (layer) {
        case "orders":
            return line(
                joined(`Order ${orderRef(item.title)}`, item.subtitle),
                at ? `Placed ${at}` : null,
                item.kind === "cancelled"
                    ? { label: "Cancelled", tone: "bad" }
                    : null,
            );
        case "collections":
            return line(`Collects · ${item.title}`, item.subtitle);
        case "subscriptions":
            if (item.kind === "failed") {
                return line(`Renewal failed · ${item.title}`, item.subtitle, {
                    label: "Failed",
                    tone: "bad",
                });
            }
            if (item.kind === "ended") {
                return line(
                    `${ahead ? "Ends" : "Ended"} · ${item.title}`,
                    item.subtitle,
                );
            }
            return line(
                `${ahead ? "Renews" : "Renewed"} · ${item.title}`,
                item.subtitle,
            );
        case "invoices":
            if (item.kind === "overdue") {
                return line(`Was due · ${item.title}`, item.subtitle, {
                    label: "Overdue",
                    tone: "bad",
                });
            }
            return line(
                `${item.kind === "paid" ? "Paid" : "Due"} · ${item.title}`,
                item.subtitle,
            );
        case "bookings":
            return line(
                at ? `${at} ${item.title}` : item.title,
                item.subtitle,
                item.kind === "no_show"
                    ? { label: "No-show", tone: "bad" }
                    : null,
            );
        case "classes":
            return line(
                at ? `${at} ${item.title}` : item.title,
                item.subtitle,
                item.kind === "full" ? { label: "Full", tone: "accent" } : null,
            );
    }
}

/** The sum of items' amounts in one currency, or null when any is missing. */
export function itemsTotal(
    items: CalendarItem[],
    count: number,
    currency: string | null,
): number | null {
    // A capped list does not add up to the day.
    if (!currency || items.length < count) return null;
    let minor = 0;
    let any = false;
    for (const item of items) {
        if (item.amount === undefined) return null;
        if (item.currency !== currency) continue;
        minor += fromMajor(item.amount);
        any = true;
    }
    return any ? minor / 100 : null;
}

/** "2026-09" → the one before or after. */
export function shiftMonth(month: string, by: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "September 2026". */
export function monthTitle(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
    }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** "Fri 18 Sep", with the year when it is not this one. */
export function dayTitle(date: string, today: string): string {
    const [y, m, d] = date.split("-").map(Number);
    return (
        new Intl.DateTimeFormat("en-GB", {
            timeZone: "UTC",
            weekday: "short",
            day: "numeric",
            month: "short",
            ...(date.slice(0, 4) === today.slice(0, 4)
                ? {}
                : { year: "numeric" }),
        })
            .format(new Date(Date.UTC(y, m - 1, d)))
            .replace(",", "")
            // The design writes "Sep"; newer ICU writes "Sept" for en-GB.
            .replace("Sept", "Sep")
    );
}

/** Blank cells before the 1st, weeks starting on Monday. */
export function leadingBlanks(month: string): number {
    const [y, m] = month.split("-").map(Number);
    return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}

/**
 * The line beside the month's title. With the lead layer on: how many of it
 * so far, what was taken, and the renewals still to come this month. With it
 * off: a count per layer that is on.
 */
export function monthSummary({
    month,
    layers,
    off,
    today,
    money,
}: {
    month: CalendarMonth;
    layers: LayerStyle[];
    off: Off;
    today: string;
    /** Formats a major-unit amount in a currency. */
    money: (amount: number, currency: string) => string;
}): string {
    const lead = layers.at(0);
    if (!lead) return "";
    if (off[lead.key]) {
        const on = layers
            .filter((l) => !off[l.key])
            .map((l) => `${l.label} ${month.totals[l.key] ?? "—"}`);
        return on.length ? on.join(" · ") : "Every layer is off";
    }
    const soFar = month.days
        .filter((d) => d.date <= today)
        .reduce((n, d) => n + (d.layers[lead.key]?.count ?? 0), 0);
    const parts = [`${lead.label}: ${soFar} so far`];
    const taken = month.takings?.total?.[0];
    if (taken) parts.push(money(toMajor(taken.amount), taken.currency));
    if (!off.subscriptions && month.layers.includes("subscriptions")) {
        const ahead = renewalsAhead(month, today);
        if (ahead)
            parts.push(
                `${money(ahead.amount, ahead.currency)} in renewals to come`,
            );
    }
    return parts.join(" · ");
}

/** Renewals dated after today this month, in the first currency they use. */
function renewalsAhead(
    month: CalendarMonth,
    today: string,
): { amount: number; currency: string } | null {
    let currency: string | null = null;
    let minor = 0;
    for (const day of month.days) {
        if (day.date <= today) continue;
        for (const item of day.layers.subscriptions?.items ?? []) {
            if (item.kind !== "renewal" || item.amount === undefined) continue;
            currency ??= item.currency ?? null;
            if (item.currency !== currency) continue;
            minor += fromMajor(item.amount);
        }
    }
    return currency && minor > 0 ? { amount: minor / 100, currency } : null;
}
