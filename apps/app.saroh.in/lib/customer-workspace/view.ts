import { clock } from "@/lib/calendar/layers";
import { goesToAddress } from "@/lib/orders/lifecycle";
import type { Review } from "@/lib/product-reviews/service";
import { dayText, money, shortPrice } from "@/lib/subscriptions/view";

import { addedLine } from "./added";
import type {
    CustomerDetail,
    DetailBooking,
    DetailInvoice,
    DetailOrder,
    DetailPack,
    DetailSubscription,
    MembershipAllowance,
    MoneyTotal,
} from "./detail";
import { packHref } from "./packs";
import type { CustomerThread } from "./thread";
import { monthText, whenText } from "./when";

export { monthText, whenText };

/**
 * How Customer Detail says a customer (plan 2026-09-23-003, U18, after
 * "Saroh Customer Detail"). Pure: `now` and the zone are passed in, so the
 * server and the browser write the same words.
 */

export type Tone = "ok" | "accent" | "bad" | "off";

/**
 * What the business is, for this screen. A business that sells has orders;
 * one that takes bookings and sells nothing is read as a bookings business
 * (a gym has no store customers). One that does both is a shop with a diary.
 */
export type Kind = "commerce" | "bookings";

export function kindOf(d: Pick<CustomerDetail, "orders" | "bookings">): Kind {
    return d.orders === undefined && d.bookings !== undefined
        ? "bookings"
        : "commerce";
}

/**
 * A tab's key in `?tab=`. Leads, Enquiries and Courses are the person
 * page's own (`lib/contacts/person.ts`, #869), not in this read.
 */
export type TabKey =
    | "over"
    | "lead"
    | "enq"
    | "ord"
    | "bk"
    | "pk"
    | "crs"
    | "sub"
    | "inv"
    | "rev"
    | "msg"
    | "notes";

export interface Tab {
    key: TabKey;
    label: string;
    /** The count beside it; null for Overview and a source that failed. */
    count: number | null;
}

/**
 * The tabs by business kind — commerce: Overview, Orders, Subscriptions,
 * Invoices, Notes; bookings: Overview, Bookings, Membership, Invoices, Notes.
 * A block this viewer may not read is absent from the read, so its tab is
 * too: a Member sees no Subscriptions or Invoices. Reviews (C6) follow
 * Invoices, from their own read (`product-review:read`), where they sell.
 */
export function tabsFor(
    d: CustomerDetail,
    thread: ThreadRead = null,
    reviews: ReviewsRead = null,
): Tab[] {
    const kind = kindOf(d);
    const tabs: Tab[] = [{ key: "over", label: "Overview", count: null }];
    if (d.orders !== undefined) {
        tabs.push({
            key: "ord",
            label: "Orders",
            count: d.stats.orders ?? null,
        });
    }
    if (d.bookings !== undefined) {
        tabs.push({
            key: "bk",
            label: "Bookings",
            count: d.bookings ? upcomingOf(d.bookings.upcoming).length : null,
        });
    }
    // Their class packs (C7), where the design's Courses tab sits.
    if (d.packs !== undefined) {
        tabs.push({
            key: "pk",
            label: "Packs",
            count: d.packs ? d.packs.rows.length : null,
        });
    }
    if (d.subscriptions !== undefined) {
        tabs.push({
            key: "sub",
            label: kind === "bookings" ? "Membership" : "Subscriptions",
            count: d.subscriptions ? d.subscriptions.rows.length : null,
        });
    }
    if (d.invoices !== undefined) {
        tabs.push({
            key: "inv",
            label: "Invoices",
            count: d.invoices ? d.invoices.rows.length : null,
        });
    }
    if (reviews !== null) {
        tabs.push({
            key: "rev",
            label: "Reviews",
            count: reviews === "failed" ? null : reviews.length,
        });
    }
    if (showsThread(thread)) {
        tabs.push({
            key: "msg",
            label: "Messages",
            // New from the customer: the tab's count is what's unread.
            count: thread === "failed" ? null : thread.unread || null,
        });
    }
    tabs.push({
        key: "notes",
        label: "Notes",
        count: d.notes ? d.notes.rows.length : null,
    });
    return tabs;
}

/**
 * The Messages tab's read (A13): the thread, "failed" when it couldn't be
 * read, or null when there is nothing to show — the viewer can't read
 * messages, or the account area is still off.
 */
export type ThreadRead = CustomerThread | "failed" | null;

/**
 * The Reviews tab's read (C6): their reviews, "failed" when it couldn't be
 * read, or null when the tab doesn't belong — the viewer can't read reviews
 * or the business doesn't sell.
 */
export type ReviewsRead = Review[] | "failed" | null;

/**
 * Messages shows for someone who can write in (they sign in on the site) or
 * has written already, and when the read failed, so the failure is said.
 */
export function showsThread(
    thread: ThreadRead,
): thread is CustomerThread | "failed" {
    if (thread === null) return false;
    if (thread === "failed") return true;
    return thread.signsIn || thread.messages.length > 0;
}

/** `?tab=` — one of this customer's tabs, else Overview. */
export function tabFromQuery(value: string | undefined, tabs: Tab[]): TabKey {
    return tabs.find((t) => t.key === value)?.key ?? "over";
}

export function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase())
        .join("")
        .slice(0, 2);
}

/** Money per currency, joined: "₹5,370" or "₹5,370 + $40". */
export function totals(list: MoneyTotal[]): string {
    return list.length
        ? list.map((t) => money(t.amount, t.currency)).join(" + ")
        : "—";
}

// ---------------------------------------------------------------- header

export interface Tag {
    label: string;
    tone: Tone;
    /** What the word means, on hover: "Returning: 2 or more orders". */
    title?: string;
}

/**
 * The word by the name. A shop: Returning at two or more orders, else New.
 * A bookings business: Member while a membership runs, else Classes. None
 * when what it rests on is not read for this viewer.
 */
export function tagFor(d: CustomerDetail): Tag | null {
    if (kindOf(d) === "bookings") {
        const member =
            d.subscriptions?.rows.some((s) => s.status !== "CANCELLED") ??
            (d.stats.classesLeft?.allowance ? true : null);
        if (member === null) return null;
        return member
            ? { label: "Member", tone: "ok" }
            : { label: "Classes", tone: "ok" };
    }
    const orders = d.stats.orders;
    if (orders === undefined || orders === null) return null;
    const title = "Returning: 2 or more orders";
    return orders >= 2
        ? { label: "Returning", tone: "ok", title }
        : { label: "New", tone: "off", title };
}

/** The line under the name: since when, and where or how often. */
export function sinceLine(
    d: CustomerDetail,
    bizName: string | null,
    now: Date,
): string {
    const tz = d.timezone;
    if (kindOf(d) === "bookings") {
        const dates = [
            ...(d.bookings
                ? [...d.bookings.past, ...d.bookings.upcoming].map(
                      (b) => b.startAt,
                  )
                : []),
            ...(d.packs?.rows.map((p) => p.boughtAt) ?? []),
            ...(d.subscriptions?.rows.map((s) => s.currentPeriodStart) ?? []),
        ].sort();
        const first = dates[0];
        const attended = d.stats.attended;
        return [
            first
                ? `With ${bizName ?? "you"} since ${dayText(first, tz, now)}`
                : "No bookings yet",
            typeof attended === "number"
                ? `${attended} ${attended === 1 ? "session" : "sessions"} attended`
                : null,
        ]
            .filter(Boolean)
            .join(" · ");
    }
    const added = addedLine(d.contact, tz, now);
    // Orders not read for this viewer, or not read at all, say nothing of
    // orders: "no orders yet" would be a claim the page cannot make.
    if (!d.orders) return added;
    const rows = d.orders.rows;
    if (!rows.length) return `${added} · no orders yet`;
    const first = rows.map((o) => o.placedAt).sort()[0];
    const where = Array.from(new Set(rows.map((o) => o.via.storefront.name)));
    return [
        `Customer since ${monthText(first, tz)}`,
        `buys at ${joinAnd(where)}`,
    ].join(" · ");
}

function joinAnd(list: string[]): string {
    return list.length <= 1
        ? (list[0] ?? "")
        : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

// ---------------------------------------------------------------- orders

/** An order still in the kitchen or on its way. */
export function isOpen(o: Pick<DetailOrder, "status">): boolean {
    return (
        o.status === "PENDING" ||
        o.status === "PROCESSING" ||
        o.status === "SHIPPED"
    );
}

const STAGE: Record<string, string> = {
    NEW: "New",
    PREPARING: "Preparing",
    READY: "Ready",
    COLLECTED: "Collected",
    HANDED_TO_COURIER: "With courier",
    DELIVERED: "Delivered",
    OUT_FOR_DELIVERY: "Out for delivery",
    SENT: "Sent",
};

/** What an order's row calls it: the kitchen stage, or Cancelled. */
export function orderStatus(o: Pick<DetailOrder, "status" | "stage">): string {
    if (o.status === "CANCELLED") return "Cancelled";
    return STAGE[o.stage] ?? o.status;
}

/** "Sourdough loaf × 2, Almond croissant × 1" — what was bought. */
export function orderWhat(o: Pick<DetailOrder, "items" | "itemCount">): string {
    const shown = o.items
        .map(
            (i) =>
                `${i.name}${i.variant ? `, ${i.variant}` : ""} × ${i.quantity}`,
        )
        .join(", ");
    const more = o.itemCount - o.items.length;
    return more > 0 ? `${shown} and ${more} more` : shown;
}

export interface Tile {
    label: string;
    value: string;
    note: string;
    /** Orders filter it opens, when it is a way in. */
    opens: "open" | "all" | null;
}

/**
 * The four figures over a shop customer: orders, spent, average order and
 * last order. Each follows its own read (DEC-039, matrix §1 rule 3): the
 * average comes from the orders themselves, which `order:read` shows whole;
 * Spent sums orders and invoices, so the API sends it only to whoever reads
 * both. A figure whose source failed is not stated.
 */
export function orderTiles(d: CustomerDetail, now: Date): Tile[] {
    const rows = d.orders?.rows ?? [];
    const count = d.stats.orders ?? rows.length;
    const tz = d.timezone;
    const open = rows.filter(isOpen);
    const tiles: Tile[] = [
        {
            label: "Orders",
            value: String(count),
            note: open.length
                ? `${open.length} open, ${Array.from(new Set(open.map((o) => orderStatus(o).toLowerCase()))).join(", ")}`
                : "None open",
            opens: open.length ? "open" : "all",
        },
    ];
    if (d.money && d.stats.spent) {
        const owed = d.stats.owed?.totals ?? [];
        tiles.push({
            label: "Spent",
            value: totals(d.stats.spent),
            // Net of refunds and credit notes (C14); an order's delivery is
            // part of what they paid.
            note: owed.length
                ? `${totals(owed)} still owed`
                : "Including delivery",
            opens: null,
        });
    }
    // An API before C13 sent no totals without a money read.
    const paid = rows.filter(
        (o) =>
            o.paymentStatus === "PAID" &&
            o.total !== undefined &&
            o.currency !== undefined,
    );
    const currency = paid[0]?.currency;
    const same = paid.filter((o) => o.currency === currency);
    if (currency && same.length) {
        const sum = same.reduce((n, o) => n + Number(o.total), 0);
        tiles.push({
            label: "Average order",
            value: money(String(Math.round(sum / same.length)), currency),
            note: `Across ${same.length} ${same.length === 1 ? "order" : "orders"}`,
            opens: null,
        });
    }
    const last = rows.at(0);
    if (last) {
        tiles.push({
            label: "Last order",
            value: whenText(last.placedAt, tz, now),
            note: `${clock(last.placedAt, tz)} at ${last.via.storefront.name}`,
            opens: "all",
        });
    }
    return tiles;
}

export interface Favourite {
    productId: string;
    name: string;
    note: string;
}

/**
 * "Usually buys": the three things in most of their orders, with the size
 * they usually take when they have taken more than one or taken it twice.
 */
export function favourites(rows: DetailOrder[]): Favourite[] {
    const byProduct = new Map<
        string,
        { name: string; orders: number; sizes: Map<string, number> }
    >();
    for (const o of rows) {
        const seen = new Set<string>();
        for (const i of o.items) {
            // A treatment's line (E9) bills a service, not a product.
            if (!i.productId) continue;
            const f = byProduct.get(i.productId) ?? {
                name: i.name,
                orders: 0,
                sizes: new Map<string, number>(),
            };
            if (!seen.has(i.productId)) f.orders += 1;
            seen.add(i.productId);
            if (i.variant) {
                f.sizes.set(i.variant, (f.sizes.get(i.variant) ?? 0) + 1);
            }
            byProduct.set(i.productId, f);
        }
    }
    return Array.from(byProduct.entries())
        .sort((a, b) => b[1].orders - a[1].orders)
        .slice(0, 3)
        .map(([productId, f]) => {
            const sizes = Array.from(f.sizes.entries()).sort(
                (a, b) => b[1] - a[1],
            );
            const usual =
                sizes[0] && (sizes.length > 1 || sizes[0][1] > 1)
                    ? ` · usually ${sizes[0][0]}`
                    : "";
            return {
                productId,
                name: f.name,
                note: `${f.orders} ${f.orders === 1 ? "order" : "orders"}${usual}`,
            };
        });
}

/** "How they get orders", from how each one went. */
export function howTheyGet(rows: DetailOrder[]): string {
    if (!rows.length) return "No orders yet.";
    const collected = rows.filter((o) => !goesToAddress(o));
    const where = mostCommon(collected.map((o) => o.via.storefront.name));
    if (collected.length === rows.length) {
        // "Rye & Co." ends the sentence itself.
        return `Always collects at ${where}${where.endsWith(".") ? "" : "."}`;
    }
    if (!collected.length) return "Always delivered.";
    return `Collects at ${where} — ${collected.length} of ${rows.length} orders. The rest were delivered.`;
}

/**
 * Their delivery address: the one kept on their record (C8, as one line),
 * else where their last delivery went.
 */
export function deliveryAddress(
    rows: DetailOrder[],
    kept: string | null = null,
): string {
    return (
        kept ??
        rows.find((o) => o.delivery)?.delivery ??
        "No address — they have only collected."
    );
}

function mostCommon(list: string[]): string {
    const n = new Map<string, number>();
    for (const x of list) n.set(x, (n.get(x) ?? 0) + 1);
    return Array.from(n.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export type OrderFilter = "all" | "open" | "past";

export function ordersShown(
    rows: DetailOrder[],
    filter: OrderFilter,
): DetailOrder[] {
    return filter === "all"
        ? rows
        : rows.filter((o) => (filter === "open" ? isOpen(o) : !isOpen(o)));
}

// -------------------------------------------------------------- bookings

/** Upcoming means still to happen and still on. */
export function upcomingOf(list: DetailBooking[]): DetailBooking[] {
    return list.filter((b) => b.status !== "CANCELLED");
}

/** A no-show, or a cancel after the free-cancellation window. */
export function isIssue(b: DetailBooking): boolean {
    return b.outcome === "NO_SHOW" || b.cancelledLate;
}

/**
 * Whether the crumbs say Sell › Customers (UX-050): only for someone who
 * buys — a store customer is linked to them — in a business that sells.
 * Someone who only booked, enquired or signed in is under Contacts, not
 * framed as a shop customer with "no orders yet".
 */
export function crumbsUnderSell(
    sells: boolean,
    d: Pick<CustomerDetail, "linkedCustomers">,
): boolean {
    return sells && (d.linkedCustomers?.length ?? 0) > 0;
}

/** A way of paying, in words; online when it wasn't recorded by hand. */
const PAID_BY: Record<string, string> = {
    CASH: "Cash",
    UPI: "UPI",
    CARD: "Card",
    BANK_TRANSFER: "Bank transfer",
    OTHER: "Other",
};

/**
 * Money in for a booking, in words (UX-049): "Paid ₹800 · Cash", or
 * "Paid · Online" to a viewer who doesn't see the amount. Null while
 * nothing is paid.
 */
export function paidText(paid: DetailBooking["paid"]): string | null {
    if (!paid) return null;
    const how = (paid.method && PAID_BY[paid.method]) ?? "Online";
    const amount =
        paid.amount && paid.currency
            ? ` ${money(paid.amount, paid.currency)}`
            : "";
    return `Paid${amount} · ${how}`;
}

/** How it was paid, in the design's words. */
export function payText(b: DetailBooking): string {
    // Money taken since (at the desk, or online) says so: "Pays at the
    // desk" stayed after the desk took it (UX-049).
    const paid = paidText(b.paid);
    if (paid) return paid;
    switch (b.paidWith) {
        case "MEMBERSHIP":
            return "Membership credit";
        case "PACK":
            return b.packName ? `Credit · ${b.packName}` : "Pack credit";
        case "PAID":
            return "Paid";
        case "DESK":
            return "Pays at the desk";
        default:
            return "";
    }
}

export function bookingState(
    b: DetailBooking,
    upcoming: boolean,
): { label: string; tone: Tone } {
    if (b.status === "CANCELLED") {
        return b.cancelledLate
            ? { label: "Late cancel", tone: "bad" }
            : { label: "Cancelled", tone: "off" };
    }
    if (b.outcome === "NO_SHOW") return { label: "No-show", tone: "bad" };
    if (b.outcome === "ATTENDED") return { label: "Attended", tone: "ok" };
    return upcoming
        ? { label: "Booked", tone: "accent" }
        : { label: "Booked", tone: "off" };
}

export interface BookingRow {
    id: string;
    day: string;
    at: string;
    what: string;
    with: string;
    pay: string;
    issue: boolean;
    state: { label: string; tone: Tone };
}

export function bookingRow(
    b: DetailBooking,
    upcoming: boolean,
    now: Date,
): BookingRow {
    const staff = b.staff?.name;
    return {
        id: b.id,
        day: dayText(b.startAt, b.timezone, now, true),
        at: clock(b.startAt, b.timezone),
        what: b.service.name,
        with: b.isClass
            ? staff
                ? `Class with ${staff}`
                : "Class"
            : staff
              ? `With ${staff}`
              : "",
        pay: b.cancelledLate
            ? "Cancelled late — the class stays used"
            : payText(b),
        issue: isIssue(b),
        state: bookingState(b, upcoming),
    };
}

export type BookingFilter = "up" | "past" | "issue";

export function bookingLists(bookings: {
    upcoming: DetailBooking[];
    past: DetailBooking[];
}): Record<BookingFilter, { list: DetailBooking[]; upcoming: boolean }> {
    const all = [...bookings.upcoming, ...bookings.past];
    return {
        up: { list: upcomingOf(bookings.upcoming), upcoming: true },
        past: { list: bookings.past, upcoming: false },
        issue: {
            list: all
                .filter(isIssue)
                .sort((a, b) => (a.startAt < b.startAt ? 1 : -1)),
            upcoming: false,
        },
    };
}

export const BOOKINGS_EMPTY: Record<BookingFilter, string> = {
    up: "Nothing booked from today.",
    past: "No past bookings.",
    issue: "No no-shows or late cancels.",
};

// ----------------------------------------------------------- classes left

export interface CreditLine {
    name: string;
    /** Its Pack Detail (C7). */
    href: string;
    left: string;
    pct: number;
    bar: "ok" | "accent" | "off";
    sub: string;
    warn: boolean;
}

/**
 * Packs worth showing: ones with classes to use, and ones that ran out
 * unused lately (the loss is worth a word) — at most three.
 */
export function packLines(
    packs: DetailPack[],
    timeZone: string,
    now: Date,
): CreditLine[] {
    const DAY = 86_400_000;
    return packs
        .filter((p) => {
            if (p.standing === "ACTIVE") return true;
            const ago = (now.getTime() - Date.parse(p.expiresAt)) / DAY;
            return p.standing === "EXPIRED" && p.left > 0 && ago < 120;
        })
        .sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1))
        .slice(0, 3)
        .map((p) => {
            const expired = p.standing === "EXPIRED";
            const days = Math.ceil(
                (Date.parse(p.expiresAt) - now.getTime()) / DAY,
            );
            const soon = !expired && days <= 14;
            const bought = `bought ${dayText(p.boughtAt, timeZone, now)}${
                p.price && p.currency
                    ? ` for ${money(p.price, p.currency)}`
                    : ""
            }`;
            return {
                name: `${p.pack.name} pack`,
                href: packHref(p.pack.id),
                left: expired ? "Ended" : `${p.left} of ${p.credits}`,
                pct: Math.round((100 * p.left) / Math.max(1, p.credits)),
                bar: expired ? "off" : soon ? "accent" : "ok",
                sub: expired
                    ? `Ran out ${dayText(p.expiresAt, timeZone, now)} with ${p.left} unused`
                    : `Use by ${dayText(p.expiresAt, timeZone, now)}${
                          soon
                              ? ` — ${days} ${days === 1 ? "day" : "days"} left`
                              : ""
                      } · ${bought}`,
                warn: soon,
            };
        });
}

/**
 * "10 a month from 1 Nov": a membership's classes change at its next
 * renewal (D10) — the plan's number changed, or a plan change is booked.
 * Null when nothing changes (or the API doesn't say yet).
 */
export function allowanceChangeLine(
    m: Pick<MembershipAllowance, "nextPeriod">,
    timeZone: string,
    now: Date,
): string | null {
    const next = m.nextPeriod;
    if (!next) return null;
    const from = dayText(next.from, timeZone, now);
    return next.perMonth === null
        ? `Unlimited classes from ${from}`
        : `${next.perMonth} a month from ${from}`;
}

/** "Next class uses: membership" — what the next class is paid with. */
export function nextCredit(d: CustomerDetail): string {
    const cl = d.stats.classesLeft;
    if (!cl) return "";
    if (cl.allowance && cl.allowance.left > 0) {
        return "Next class uses: membership";
    }
    const pack = (d.packs?.rows ?? [])
        .filter((p) => p.standing === "ACTIVE")
        .sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1))
        .at(0);
    if (pack) return `Next class uses: ${pack.pack.name} pack`;
    return cl.total ? "" : "Nothing left to book with";
}

// ----------------------------------------------------- subscriptions, invoices

export interface SubRow {
    id: string;
    plan: string;
    when: string;
    status: string;
    tone: Tone;
    price: string;
}

export function subRow(
    s: DetailSubscription,
    timeZone: string,
    now: Date,
): SubRow {
    const day = (at: string) => dayText(at, timeZone, now);
    const status =
        s.status === "CANCELLED"
            ? "Cancelled"
            : s.status === "PAUSED"
              ? "Paused"
              : "Active";
    const when =
        s.status === "CANCELLED"
            ? `Ended ${day(s.cancelledAt ?? s.currentPeriodEnd)}`
            : s.status === "PAUSED"
              ? `Paused since ${day(s.pausedAt ?? s.currentPeriodStart)}`
              : s.cancelAtPeriodEnd
                ? `Ends ${day(s.currentPeriodEnd)}`
                : s.nextChargeAt
                  ? `Next ${day(s.nextChargeAt)}`
                  : "";
    return {
        id: s.id,
        plan: s.plan.name,
        when,
        status,
        tone: status === "Active" ? "ok" : "off",
        price: shortPrice(s.price, s.currency, s.interval),
    };
}

const INVOICE_WORD: Record<string, string> = {
    DRAFT: "Draft",
    ISSUED: "Due",
    OVERDUE: "Overdue",
    PAID: "Paid",
    VOID: "Void",
    CREDITED: "Credited",
};

export interface InvoiceRow {
    id: string;
    number: string;
    issued: string;
    from: string;
    status: string;
    tone: Tone;
    total: string;
}

export function invoiceRow(
    v: DetailInvoice,
    kind: Kind,
    timeZone: string,
    now: Date,
): InvoiceRow {
    const credit = v.kind === "CREDIT_NOTE";
    return {
        id: v.id,
        number: v.number ?? "Draft",
        issued: v.issuedAt ? dayText(v.issuedAt, timeZone, now) : "Draft",
        from: credit
            ? `Credit note${v.orderNumber ? ` · order #${v.orderNumber}` : ""}`
            : invoiceFrom(v, kind),
        status: credit ? "Credit note" : (INVOICE_WORD[v.standing] ?? v.status),
        tone: v.standing === "PAID" && !credit ? "ok" : "off",
        total: money(v.total, v.currency),
    };
}

/**
 * An invoice still owed — issued or overdue, and not a credit note — on
 * which the Invoices tab offers "Record payment" (#869), as Invoice Detail
 * offers Mark paid.
 */
export function isPayable(
    v: Pick<DetailInvoice, "kind" | "standing">,
): boolean {
    return (
        v.kind !== "CREDIT_NOTE" &&
        (v.standing === "ISSUED" || v.standing === "OVERDUE")
    );
}

function invoiceFrom(v: DetailInvoice, kind: Kind): string {
    switch (v.source) {
        case "ORDER": {
            const order = v.orderNumber ? `Order #${v.orderNumber}` : "Order";
            return v.kind === "SUPPLEMENTARY" ? `${order} · change` : order;
        }
        case "SUBSCRIPTION": {
            const what = kind === "bookings" ? "membership" : "subscription";
            if (!v.planName) return what[0].toUpperCase() + what.slice(1);
            // "Standard membership" already says what it is.
            return v.planName.toLowerCase().endsWith(what)
                ? v.planName
                : `${v.planName} ${what}`;
        }
        case "PACK":
            return "Class pack";
        case "COURSE":
            return "Course";
        case "BOOKING":
            return "Booking";
        default:
            return "Written by hand";
    }
}

/** "2 invoices unpaid · ₹1,200 — some overdue", or null when none are. */
export function owedLine(d: CustomerDetail): string | null {
    const owed = d.stats.owed;
    if (!owed || owed.unpaidCount === 0) return null;
    return `${owed.unpaidCount} ${owed.unpaidCount === 1 ? "invoice" : "invoices"} unpaid · ${totals(owed.totals)}${
        owed.overdueCount ? " — some overdue" : ""
    }`;
}

// ------------------------------------------------------------------ offers

/** What they last said about offers by email. */
export function offersText(
    consent: CustomerDetail["consent"],
    timeZone: string,
    now: Date,
): string {
    if (!consent?.status) return "Nothing recorded yet.";
    const on = consent.at ? ` · ${dayText(consent.at, timeZone, now)}` : "";
    return consent.status === "REVOKED"
        ? `Asked to stop${on}`
        : `Said yes to offers by email${on}`;
}

/**
 * "They asked to stop" is offered only while they have said yes, as the
 * design has it (DEC-073): with nothing recorded no offers go to them, so
 * there is nothing to stop, and the card says only "Nothing recorded yet."
 */
export function canStopOffers(consent: CustomerDetail["consent"]): boolean {
    return consent?.status === "GRANTED";
}
