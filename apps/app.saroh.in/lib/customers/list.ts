import { NUMBER_LOCALE } from "@/lib/format/locale";
import { formatMoneyMajor } from "@/lib/format/money";

/**
 * The Customers list (DEC-041, round 2 C4): its address, what the API
 * answers, and the words a row says. Pure — the page and the screen share
 * it, and `list.test.ts` pins it.
 *
 * Everything that narrows the list — the search, the chip, the sort, the
 * storefront and the page — lives in the URL, so a narrowed list is a link
 * someone can share, and the server reads it once to ask
 * `GET organizations/:org/customers` (C3) for that page.
 */

export const CUSTOMER_CHIPS = [
    "all",
    "returning",
    "subscribers",
    "open",
    "offers",
    "attention",
] as const;
export type CustomerChip = (typeof CUSTOMER_CHIPS)[number];

export const CUSTOMER_SORTS = ["last", "spent", "name"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

/** The design's chip words, in its order. */
export const CHIP_LABEL: Record<CustomerChip, string> = {
    all: "All",
    returning: "Returning",
    subscribers: "Subscribers",
    open: "Open order",
    offers: "Said yes to offers",
    attention: "Needs attention",
};

export const SORT_LABEL: Record<CustomerSort, string> = {
    last: "Last order, newest",
    spent: "Spent, highest",
    name: "Name, A to Z",
};

/* ---------------------------------------------------------------- API -- */

export interface MoneyTotal {
    currency: string;
    /** Major units as a decimal string ("1250.50"). */
    amount: string;
}

export type AttentionKind = "ALLERGY" | "MEDICAL" | "ACCESS" | "OTHER";

export interface CustomerAttentionTag {
    kind: AttentionKind;
    label: string;
    sensitive: boolean;
}

/**
 * One row, as C3 sends it. A part the viewer may not read is ABSENT, never
 * zero: `orders` and `returning` need `order:read`, `spent` needs
 * `order:read` and `invoice:read`, `subscriber` needs `subscription:read`.
 */
export interface CustomerRow {
    contactId: string;
    name: string | null;
    /** Their email or their site account's; never a placeholder. */
    email: string | null;
    phone: string | null;
    signsIn: boolean;
    possibleDuplicate: boolean;
    offers: boolean;
    /**
     * Added on the list by hand (DEC-056, C14): shown before they have
     * paid. Absent from an API before C14.
     */
    addedByHand?: boolean;
    attention: CustomerAttentionTag[];
    hiddenSensitiveCount: number;
    returning?: boolean;
    orders?: {
        count: number;
        open: number;
        lastAt: string | null;
        lastStorefront: { id: string; name: string } | null;
    };
    spent?: MoneyTotal[];
    subscriber?: boolean;
}

export interface CustomersPage {
    rows: CustomerRow[];
    /** Rows matching the search, storefront and chip. */
    total: number;
    page: number;
    pageSize: number;
    /** Every customer the business has: the header's count. */
    everyone: number;
    /** Per chip; a chip the viewer may not use is absent. */
    counts: Partial<Record<CustomerChip, number>>;
    /** Paying store customers the list can't show yet (C2). */
    unlinkedPaying: number;
    /** With `order:read`: for "Bought at". */
    storefronts?: { id: string; name: string }[];
    sees: { orders: boolean; spent: boolean; subscriptions: boolean };
    sort: CustomerSort;
    chip: CustomerChip;
}

export interface UnlinkedCustomer {
    customerId: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    storefront: { id: string; name: string } | null;
    /** The contact that already holds their email: link them to it. */
    holder: {
        contactId: string;
        name: string | null;
        email: string | null;
    } | null;
    paidOrders?: number;
    lastPaidOrderAt?: string | null;
}

export interface UnlinkedPage {
    rows: UnlinkedCustomer[];
    total: number;
    page: number;
    pageSize: number;
}

/* ------------------------------------------------------------ address -- */

export interface ListQuery {
    q: string;
    chip: CustomerChip;
    /** `null`: the API's default (Last order, or Name without orders). */
    sort: CustomerSort | null;
    /** A storefront id: people who bought there. */
    store: string | null;
    /** 1-based. */
    page: number;
}

type Params = Record<string, string | string[] | undefined>;

/** Longer than any name, phone or email anyone types (the API's limit). */
const SEARCH_MAX = 100;

function one(params: Params, key: string): string | undefined {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() ? value.trim() : undefined;
}

function isChip(v: string | undefined): v is CustomerChip {
    return CUSTOMER_CHIPS.some((c) => c === v);
}

function isSort(v: string | undefined): v is CustomerSort {
    return CUSTOMER_SORTS.some((s) => s === v);
}

/**
 * What the address asks for. Anything unknown is its default, so an old or
 * mistyped link opens the list rather than an error. `?storefront=` (what
 * Products and the old per-storefront links say) reads as `?store=`.
 */
export function readListQuery(params: Params): ListQuery {
    const chip = one(params, "chip");
    const sort = one(params, "sort");
    const page = Number(one(params, "page"));
    return {
        q: (one(params, "q") ?? "").slice(0, SEARCH_MAX),
        chip: isChip(chip) ? chip : "all",
        sort: isSort(sort) ? sort : null,
        store: one(params, "store") ?? one(params, "storefront") ?? null,
        page: Number.isInteger(page) && page >= 1 ? page : 1,
    };
}

/**
 * The list at `query` with `patch` applied; defaults leave the URL. Changing
 * anything but the page starts again on page 1 — page 3 of a new search is
 * somebody else's page 3.
 */
export function listHref(
    query: ListQuery,
    patch: Partial<ListQuery> = {},
): string {
    const narrowing = (Object.keys(patch) as (keyof ListQuery)[]).some(
        (k) => k !== "page" && patch[k] !== query[k],
    );
    const next = {
        ...query,
        ...patch,
        page: narrowing ? 1 : (patch.page ?? query.page),
    };
    const s = new URLSearchParams();
    if (next.q) s.set("q", next.q);
    if (next.chip !== "all") s.set("chip", next.chip);
    if (next.sort) s.set("sort", next.sort);
    if (next.store) s.set("store", next.store);
    if (next.page > 1) s.set("page", String(next.page));
    const str = s.toString();
    return str ? `/commerce/customers?${str}` : "/commerce/customers";
}

/** The API's query string for `query`, leaving out what doesn't narrow. */
export function apiSearch(query: ListQuery): string {
    const s = new URLSearchParams();
    if (query.q) s.set("q", query.q);
    if (query.chip !== "all") s.set("chip", query.chip);
    if (query.sort) s.set("sort", query.sort);
    if (query.store) s.set("store", query.store);
    if (query.page > 1) s.set("page", String(query.page));
    return s.toString();
}

/** What a chip or sort needs beyond `contact:read` (C3's rules). */
const CHIP_NEEDS: Record<CustomerChip, readonly string[]> = {
    all: [],
    returning: ["order:read"],
    subscribers: ["subscription:read"],
    open: ["order:read"],
    offers: [],
    attention: [],
};
const SORT_NEEDS: Record<CustomerSort, readonly string[]> = {
    last: ["order:read"],
    spent: ["order:read", "invoice:read"],
    name: [],
};

/**
 * The address, trimmed to what this viewer may ask. The API answers a chip,
 * sort or storefront the viewer can't use with a 403, and a link someone
 * with more access shared shouldn't turn into an access-denied page — so
 * those fall back to their defaults and the list opens.
 */
export function allowedQuery(
    query: ListQuery,
    may: (action: string) => boolean,
): ListQuery {
    const ok = (needs: readonly string[]) => needs.every(may);
    return {
        ...query,
        chip: ok(CHIP_NEEDS[query.chip]) ? query.chip : "all",
        sort: query.sort && ok(SORT_NEEDS[query.sort]) ? query.sort : null,
        store: query.store && may("order:read") ? query.store : null,
    };
}

/** Whether anything narrows the list (for which empty state to show). */
export function isNarrowed(query: ListQuery): boolean {
    return query.q.length > 0 || query.chip !== "all" || query.store !== null;
}

/* --------------------------------------------------------------- view -- */

/** The chips this viewer has, each with its count; unknown ones are left out. */
export function chipsFor(
    page: CustomersPage,
): { key: CustomerChip; label: string; count: number }[] {
    return CUSTOMER_CHIPS.flatMap((key) => {
        const count = page.counts[key];
        return count === undefined
            ? []
            : [{ key, label: CHIP_LABEL[key], count }];
    });
}

/** The sorts this viewer may pick. Name always; the others by what they read. */
export function sortsFor(page: CustomersPage): CustomerSort[] {
    return CUSTOMER_SORTS.filter((s) =>
        s === "last"
            ? page.sees.orders
            : s === "spent"
              ? page.sees.spent
              : true,
    );
}

/** "1 customer", "1,204 customers". */
export function customersText(n: number): string {
    return `${n.toLocaleString(NUMBER_LOCALE)} ${n === 1 ? "customer" : "customers"}`;
}

/** "Showing 51–100 of 120". */
export function pageText(page: CustomersPage): string {
    const from = (page.page - 1) * page.pageSize + 1;
    const to = Math.min(page.total, page.page * page.pageSize);
    const f = (n: number) => n.toLocaleString(NUMBER_LOCALE);
    return `Showing ${f(from)}–${f(to)} of ${f(page.total)}`;
}

export function pageCount(page: CustomersPage): number {
    return Math.max(1, Math.ceil(page.total / page.pageSize));
}

/** The name a row shows: theirs, else their email, else a plain word. */
export function rowName(row: {
    name: string | null;
    email: string | null;
}): string {
    return row.name ?? row.email ?? "No name given";
}

/**
 * The line under the name: how to reach them (`contact:read`, which the
 * list needs, covers both). The email is left out when it is already the
 * name.
 */
export function rowSub(row: CustomerRow): string {
    const parts = [row.phone, row.name ? row.email : null].filter(
        (p): p is string => Boolean(p),
    );
    return parts.length > 0 ? parts.join(" · ") : "No phone or email";
}

export type TagTone = "bad" | "ok" | "off";

const KIND_WORD: Record<AttentionKind, string> = {
    ALLERGY: "Allergy",
    MEDICAL: "Medical",
    ACCESS: "Access",
    OTHER: "Other",
};

/**
 * A row's tags, in the design's order: Needs attention first ("Allergy:
 * Sesame", red for Allergy and Medical — the word says it, the colour only
 * reinforces), then Subscriber, then New for someone with one order, and a
 * possible duplicate. Only what the API sent: a part the viewer can't read
 * never becomes a tag.
 */
export function rowTags(row: CustomerRow): { label: string; tone: TagTone }[] {
    const tags: { label: string; tone: TagTone }[] = row.attention.map((a) => ({
        label: `${KIND_WORD[a.kind]}: ${a.label}`,
        tone: a.kind === "ALLERGY" || a.kind === "MEDICAL" ? "bad" : "off",
    }));
    if (row.subscriber) tags.push({ label: "Subscriber", tone: "ok" });
    if (row.returning === false && (row.orders?.count ?? 0) > 0) {
        tags.push({ label: "New", tone: "off" });
    }
    if (row.possibleDuplicate) {
        tags.push({ label: "Possible duplicate", tone: "off" });
    }
    return tags;
}

/**
 * The Last order column's second line: open orders first (they need
 * doing), else where the last one was placed. Someone who signs in and has
 * never ordered says so rather than a blank.
 */
export function lastSub(
    row: CustomerRow,
    manyStorefronts: boolean,
): { text: string; open: boolean } | null {
    const o = row.orders;
    if (o && o.open > 0) {
        return {
            text: o.open === 1 ? "1 open" : `${o.open} open`,
            open: true,
        };
    }
    if (o?.lastAt && o.lastStorefront && manyStorefronts) {
        return { text: `At ${o.lastStorefront.name}`, open: false };
    }
    if (!o?.lastAt && row.signsIn) {
        return { text: "Signs in on your website", open: false };
    }
    return null;
}

/**
 * The Last order column for someone with no order yet: "Added by hand" for
 * a person the merchant added on the list (the design's words), else "—".
 */
export function noOrderText(row: CustomerRow): string {
    return row.addedByHand ? "Added by hand" : "—";
}

/**
 * "Spent": each currency they paid in (one, for almost every business);
 * "—" when nothing is paid, which is a state, not a measurement.
 */
export function spentText(spent: MoneyTotal[]): string {
    if (spent.length === 0) return "—";
    return spent
        .map((m) => formatMoneyMajor(m.amount, m.currency) ?? m.amount)
        .join(" + ");
}

/**
 * The unlinked notice: "12 paying customers aren't linked to a contact
 * yet". The list never quietly shows fewer paying customers than there are.
 */
export function unlinkedText(n: number): string {
    return n === 1
        ? "1 paying customer isn't linked to a contact yet"
        : `${n.toLocaleString(NUMBER_LOCALE)} paying customers aren't linked to a contact yet`;
}

/** What a list with no rows says, and whether Clear is the way out. */
export function emptyTitle(query: ListQuery): string {
    return query.q
        ? `No customers match “${query.q}”`
        : "No customers match these filters";
}
