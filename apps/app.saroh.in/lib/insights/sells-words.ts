import { personHref } from "@/lib/contacts/person-href";
import { formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import { productHref } from "@/lib/products/links";

import type { CompareChange } from "./compare-words";
import {
    ABOUT_SAME_PERCENT,
    beforePeriod,
    capitalise,
    lastPeriod,
    TIMES_FROM_PERCENT,
} from "./compare-words";
import { rupees } from "./overview-words";
import type {
    BestCustomerRead,
    BusiestRead,
    BusyCellRead,
    SellsRead,
} from "./reads";

/**
 * The words of Insights' What sells tab (DEC-171, plan U13, #1095; boards
 * `IBSellsD`, `IBSellsP`, `IBSellsEmptyD`, `IBSellsEmptyP`, and the counts
 * of `IBMemberD`, the first weeks of `IBThinD`): four questions, each
 * answered in one sentence written from the rows drawn under it.
 *
 * - What sells most? The top five products: sold, brought in, and the
 *   change in units against the period before, or New.
 * - What do people book? The services booked most, and how full a class
 *   was: places taken over places offered.
 * - When is it busiest? Paid orders and attended bookings by weekday and
 *   four parts of the day, as a grid and as a table.
 * - Who are my best customers? Who came back and who came for the first
 *   time, then the top five by what they paid (or, without payments, by how
 *   often they came).
 *
 * Pure: tested in `sells-words.test.ts`. The comparisons follow
 * `compare-words.ts`: zero said in words, a percent only as big as is true,
 * "About the same" for a change of 2% or less. Money only with
 * `payment:read` (`read.money`), names only with `contact:read`
 * (`read.names`), never a ₹0 for money a role can't see.
 */

/** Where the four "See all" links go. */
export const SEE_ALL = {
    products: "/commerce/products",
    services: "/services",
    customers: "/commerce/customers",
    /** The Customers list by what they spent, for someone who sees money. */
    customersBySpent: "/commerce/customers?sort=spent",
    newService: "/services/new",
} as const;

// ---------------------------------------------------------------- sold

/** A change in units, as a cell says it. */
export interface ChangeView {
    kind: "up" | "down" | "same" | "new" | "none";
    /** "8%", "About 3 times", "About the same", "New"; "" for none. */
    text: string;
    /** The whole of it, for a screen reader: "Up 8% on the 4 weeks before". */
    says: string;
}

export interface SoldRowView {
    key: string;
    name: string;
    href: string;
    /** "412". */
    sold: string;
    /** "₹74,160"; null without `payment:read`. */
    amount: string | null;
    change: ChangeView;
}

export interface SoldView {
    answer: string;
    rows: SoldRowView[];
    /** The money column: only with `payment:read`. */
    showAmount: boolean;
    /** The change column: not in the first weeks (nothing to set against). */
    showChange: boolean;
    /** "Against the 4 weeks before". */
    changeHead: string;
    seeAll: { href: string; label: string } | null;
}

/** The change in units against the period before, for one product. */
export function changeView(
    change: CompareChange | undefined,
    isNew: boolean,
    period: SellsRead["period"],
): ChangeView {
    const before = beforePeriod(period);
    if (isNew) {
        return {
            kind: "new",
            text: "New",
            says: `New: none sold in ${before}`,
        };
    }
    if (!change || change.kind === "THIN") {
        return {
            kind: "none",
            text: "",
            says: `Too few sold in ${before} to compare`,
        };
    }
    if (change.kind === "LEVEL" || change.percent <= ABOUT_SAME_PERCENT) {
        return {
            kind: "same",
            text: "About the same",
            says: `About the same as ${before}`,
        };
    }
    if (change.kind === "UP") {
        if (change.percent >= TIMES_FROM_PERCENT) {
            const times = Math.round((100 + change.percent) / 100);
            return {
                kind: "up",
                text: `About ${times} times`,
                says: `About ${times} times as many as ${before}`,
            };
        }
        return {
            kind: "up",
            text: `${change.percent}%`,
            says: `Up ${change.percent}% on ${before}`,
        };
    }
    // Something sold, so it never fell all the way.
    const down = Math.min(change.percent, 99);
    return {
        kind: "down",
        text: `${down}%`,
        says: `Down ${down}% on ${before}`,
    };
}

/** "up 21%", "about 3 times as many": how much a grower grew, mid-sentence. */
function grewBy(change: CompareChange): string {
    if (change.kind !== "UP") return "";
    return change.percent >= TIMES_FROM_PERCENT
        ? `about ${Math.round((100 + change.percent) / 100)} times as many`
        : `up ${change.percent}%`;
}

/**
 * "What sells most?" (`IBSellsD`): "Sourdough loaf sells most: 412 sold.
 * Seeded multigrain loaf grew fastest, up 21%." In the first weeks the
 * leader is named with how many sold, and nothing is compared (`IBThinD`).
 */
export function soldView(read: SellsRead): SoldView {
    const { rows } = read.bestSellers;
    const last = lastPeriod(read.period);
    const showAmount = read.money;
    const view = (answer: string): SoldView => ({
        answer,
        rows: rows.map((r) => ({
            key: r.productId,
            name: r.name,
            href: productHref(null, r.productId),
            sold: formatNumber(r.sold),
            amount:
                showAmount && r.amountMinor !== null
                    ? rupees(r.amountMinor, read.currency)
                    : null,
            change: changeView(r.change, r.isNew, read.period),
        })),
        showAmount,
        showChange: !read.thin,
        changeHead: capitalise(`against ${beforePeriod(read.period)}`),
        seeAll:
            rows.length > 0
                ? {
                      href: SEE_ALL.products,
                      label:
                          read.bestSellers.total > rows.length
                              ? `See all ${formatNumber(read.bestSellers.total)} products`
                              : "See all products",
                  }
                : null,
    });

    const top = rows.length > 0 ? rows[0] : null;
    if (!top) {
        return view(
            `Nothing sold in ${last}. Best sellers show here once something sells.`,
        );
    }
    const sold = `${formatNumber(top.sold)} sold`;
    if (read.thin) {
        return view(
            `${top.name} leads with ${sold}. There's nothing earlier to compare with yet.`,
        );
    }
    const lead = top.isNew
        ? `${top.name} sells most: ${sold}, and it's new.`
        : `${top.name} sells most: ${sold}.`;
    // The one that grew most, if another grew more than "about the same".
    const growers = rows
        .slice(1)
        .filter(
            (r) =>
                !r.isNew &&
                r.change?.kind === "UP" &&
                r.change.percent > ABOUT_SAME_PERCENT,
        )
        .sort(
            (a, b) =>
                (b.change?.kind === "UP" ? b.change.percent : 0) -
                (a.change?.kind === "UP" ? a.change.percent : 0),
        );
    const fastest = growers.length > 0 ? growers[0] : null;
    const topGrew =
        top.change?.kind === "UP" && top.change.percent > ABOUT_SAME_PERCENT
            ? top.change.percent
            : 0;
    if (fastest?.change?.kind === "UP" && fastest.change.percent > topGrew) {
        return view(
            `${lead} ${fastest.name} grew fastest, ${grewBy(fastest.change)}.`,
        );
    }
    return view(lead);
}

// ---------------------------------------------------------------- booked

export interface BookedRowView {
    key: string;
    name: string;
    /** "46 people in 8 classes", "12 bookings". */
    line: string;
    /** Whole percent full; null for one-to-one (it has no places). */
    fullPercent: number | null;
    /** "96% full"; null for one-to-one. */
    fullText: string | null;
}

export interface BookedView {
    answer: string;
    rows: BookedRowView[];
    /** Nothing booked in the period: the empty card with Add a service. */
    empty: boolean;
    seeAll: { href: string; label: string } | null;
}

const people = (n: number) => count(n, "person", "people");
const classes = (n: number) => count(n, "class", "classes");

/** "46 people in 8 classes", "46 bookings in 8 classes, from 30 people". */
function bookedLine(r: SellsRead["booked"]["rows"][number]): string {
    if (r.kind === "CLASS" && r.sessions !== null && r.sessions > 0) {
        return r.people === r.bookings
            ? `${people(r.people)} in ${classes(r.sessions)}`
            : `${count(r.bookings, "booking")} in ${classes(r.sessions)}, from ${people(r.people)}`;
    }
    return r.people > 0 && r.people !== r.bookings
        ? `${count(r.bookings, "booking")}, from ${people(r.people)}`
        : count(r.bookings, "booking");
}

/** At or above this, a class is "nearly always full". */
export const NEARLY_FULL_PERCENT = 90;

/**
 * "What do people book?" (`IBSellsD`): "Sourdough basics class: 46 people,
 * and it is nearly always full." Too few bookings is said, not guessed
 * (`IBThinD`); none is the empty card (`IBSellsEmptyD`).
 */
export function bookedView(read: SellsRead): BookedView {
    const { booked } = read;
    const last = lastPeriod(read.period);
    const rows: BookedRowView[] = booked.rows.map((r) => ({
        key: r.serviceId,
        name: r.name,
        line: bookedLine(r),
        fullPercent: r.kind === "CLASS" ? r.fullPercent : null,
        fullText:
            r.kind === "CLASS" && r.fullPercent !== null
                ? `${r.fullPercent}% full`
                : null,
    }));
    const seeAll =
        rows.length > 0
            ? { href: SEE_ALL.services, label: "See services" }
            : null;

    if (booked.bookings <= 0 || booked.rows.length === 0) {
        return {
            answer: `No bookings in ${last}. Your classes and services show here with how full they were.`,
            rows: [],
            empty: true,
            seeAll: null,
        };
    }
    const anyClass = booked.rows.some((r) => r.kind === "CLASS");
    if (!booked.enough) {
        return {
            answer: anyClass
                ? "Too few bookings yet to say which class is busiest."
                : "Too few bookings yet to say which service is booked most.",
            rows,
            empty: false,
            seeAll,
        };
    }
    const top = booked.rows[0];
    let answer: string;
    if (top.kind === "CLASS" && top.fullPercent !== null) {
        answer =
            top.fullPercent >= NEARLY_FULL_PERCENT
                ? `${top.name}: ${people(top.people)}, and it is nearly always full.`
                : `${top.name} is booked most: ${people(top.people)}, ${top.fullPercent}% full.`;
    } else {
        answer = `${top.name} is booked most: ${count(top.bookings, "booking")}.`;
    }
    return { answer, rows, empty: false, seeAll };
}

// ---------------------------------------------------------------- busiest

/** The four parts of the day, as the grid's rows name them. */
export const DAY_PARTS = ["7 to 10", "10 to 1", "1 to 4", "4 to 8"] as const;

/** The same parts, as a sentence says them: "Saturday mornings". */
const PART_WORDS = [
    "mornings",
    "late mornings",
    "afternoons",
    "evenings",
] as const;

export const WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
] as const;

/** "Mon" … "Sun", the grid's columns. */
export const WEEKDAYS_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));

/** Busiest times need about two weeks of history (`sells.ts`). */
const BUSY_DAYS = 14;

/** Five steps of busy, quieter to busier; 0 is nothing at all. */
export type BusyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface BusyCellView {
    key: string;
    dow: number;
    part: number;
    level: BusyLevel;
    total: number;
    /** "Saturday 7 to 10: 48 orders and 6 bookings". */
    label: string;
}

export interface BusyView {
    answer: string;
    /** Too young, or too few: the answer says so and nothing is drawn. */
    enough: boolean;
    /** 28 cells, a row per part, Monday first in each. */
    rows: BusyCellView[][];
    /** "12 sales and bookings before 7 or after 8 aren't shown."; or null. */
    outside: string | null;
}

/** "Saturday mornings". */
function when(cell: BusyCellRead): string {
    return `${WEEKDAYS[cell.dow - 1]} ${PART_WORDS[cell.part]}`;
}

/** "48 orders and 6 bookings", "nothing". */
function cellWords(cell: BusyCellRead): string {
    const parts = [
        cell.orders > 0 ? count(cell.orders, "order") : null,
        cell.bookings > 0 ? count(cell.bookings, "booking") : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" and ") : "nothing";
}

/** 1 to 5 against the busiest cell; 0 for none. */
export function busyLevel(total: number, most: number): BusyLevel {
    if (total <= 0 || most <= 0) return 0;
    return Math.min(5, Math.max(1, Math.ceil((total / most) * 5))) as BusyLevel;
}

/** "1 in 5", "more than half", "all": the busiest cell's share. */
function shareWords(part: number, whole: number): string {
    if (part >= whole) return "all";
    if (part * 2 > whole) return "more than half";
    return `1 in ${Math.max(2, Math.round(whole / part))}`;
}

/**
 * "When is it busiest?" (`IBSellsD`): "Saturday mornings are busiest: 1 in
 * 5 sales and bookings happen then. Wednesday afternoons are the quietest."
 * Before two weeks, or with too few, it says what it needs
 * (`IBSellsEmptyD`).
 */
export function busyView(read: SellsRead): BusyView {
    const busy: BusiestRead | undefined = read.busiest;
    const last = lastPeriod(read.period);
    const rows: BusyCellView[][] = DAY_PARTS.map((_, part) =>
        WEEKDAYS.map((day, i) => {
            const cell = busy?.cells.find(
                (c) => c.dow === i + 1 && c.part === part,
            ) ?? { dow: i + 1, part, orders: 0, bookings: 0, total: 0 };
            return {
                key: `${i + 1}-${part}`,
                dow: i + 1,
                part,
                level: busyLevel(cell.total, busy?.busiest?.total ?? 0),
                total: cell.total,
                label: `${day} ${DAY_PARTS[part]}: ${cellWords(cell)}`,
            };
        }),
    );
    const notEnough = (answer: string): BusyView => ({
        answer,
        enough: false,
        rows,
        outside: null,
    });
    if (!busy || read.ageDays + 1 < BUSY_DAYS) {
        return notEnough(
            "Busiest days and times need about 2 weeks of sales or bookings.",
        );
    }
    if (!busy.enough || !busy.busiest || busy.total <= 0) {
        return notEnough(
            `Too few sales and bookings in ${last} to say when it's busiest.`,
        );
    }
    const most = busy.busiest;
    const sentences = [
        `${capitalise(when(most))} are busiest: ${shareWords(most.total, busy.total)} sales and bookings happen then.`,
    ];
    const empty = busy.cells.filter((c) => c.total === 0).length;
    const quiet = busy.quietest;
    if (quiet && quiet !== most && quiet.total > 0) {
        sentences.push(`${capitalise(when(quiet))} are the quietest.`);
    } else if (quiet?.total === 0 && empty === 1) {
        sentences.push(`${capitalise(when(quiet))} had none.`);
    }
    return {
        answer: sentences.join(" "),
        enough: true,
        rows,
        outside:
            busy.outside > 0
                ? `${count(busy.outside, "sale or booking", "sales and bookings")} before 7 or after 8 aren't shown.`
                : null,
    };
}

// ---------------------------------------------------------------- customers

export interface CustomerRowView {
    key: string;
    /** Null without `contact:read`. */
    name: string | null;
    /** Their person page; null without `contact:read`. */
    href: string | null;
    /** "Café Bloom · Sourdough loaf", "Shop and online"; or null. */
    sub: string | null;
    /** "₹22,500"; null without `payment:read`. */
    amount: string | null;
    /** "4 orders", "4 deliveries", "3 classes"; null for none. */
    often: string | null;
}

export interface CustomersView {
    answer: string;
    rows: CustomerRowView[];
    empty: boolean;
    seeAll: { href: string; label: string } | null;
}

/** "4 deliveries" when every order was delivered, else what they did most. */
export function oftenWords(c: BestCustomerRead): string | null {
    if (c.orders > 0 && c.deliveries === c.orders) {
        return count(c.deliveries, "delivery", "deliveries");
    }
    const ways: [number, string][] = [
        [c.orders, count(c.orders, "order")],
        [c.classes, count(c.classes, "class", "classes")],
        [c.bookings, count(c.bookings, "booking")],
        [c.bills, count(c.bills, "bill")],
    ];
    let best: [number, string] | null = null;
    for (const way of ways) {
        if (way[0] > 0 && (!best || way[0] > best[0])) best = way;
    }
    return best ? best[1] : null;
}

/** What else is known of them: their company, what they buy most, where. */
function subWords(c: BestCustomerRead): string | null {
    const parts = [
        c.company,
        c.buysMost && c.buysMost !== c.company ? c.buysMost : null,
        c.online && c.inStore ? "Shop and online" : null,
    ].filter((p): p is string => Boolean(p));
    return parts.length > 0 ? parts.slice(0, 2).join(" · ") : null;
}

/**
 * "Who are my best customers?" (`IBSellsD`): "18 customers came back and 9
 * came for the first time in the last 4 weeks. Shruti Menon brought in the
 * most, ₹22,500." Without payments they are ranked by how often they came,
 * and said so; without customers' names, nobody is named.
 */
export function customersView(read: SellsRead): CustomersView {
    const best = read.customers;
    const last = lastPeriod(read.period);
    const names = read.names ?? true;
    if (!best || best.total <= 0 || best.rows.length === 0) {
        return {
            answer: `Nobody paid or booked in ${last}. Your best customers show here once people buy or book.`,
            rows: [],
            empty: true,
            seeAll: null,
        };
    }
    const { total, cameBack, firstTime } = best;
    const customers = (n: number) => count(n, "customer");
    let head: string;
    if (cameBack > 0 && firstTime > 0) {
        head = `${customers(cameBack)} came back and ${formatNumber(firstTime)} came for the first time in ${last}.`;
    } else if (cameBack > 0) {
        head =
            total === 1
                ? `Your one customer in ${last} had come before.`
                : `All ${customers(total)} in ${last} had come before.`;
    } else {
        head =
            total === 1
                ? `Your one customer in ${last} came for the first time.`
                : `All ${customers(total)} in ${last} came for the first time.`;
    }
    const top = best.rows[0];
    let lead = "";
    if (names && top.name) {
        if (read.money && top.amountMinor !== null && top.amountMinor > 0) {
            lead = ` ${top.name} brought in the most, ${rupees(top.amountMinor, read.currency)}.`;
        } else if (!read.money) {
            lead = ` ${top.name} came most often.`;
        }
    }
    const rows: CustomerRowView[] = best.rows.map((c, i) => ({
        key: c.contactId ?? `customer-${i}`,
        name: names ? c.name : null,
        href: names && c.contactId ? personHref(c.contactId) : null,
        sub: names ? subWords(c) : null,
        amount:
            read.money && c.amountMinor !== null
                ? rupees(c.amountMinor, read.currency)
                : null,
        often: oftenWords(c),
    }));
    return {
        answer: `${head}${lead}`,
        rows,
        empty: false,
        seeAll: names
            ? {
                  href: read.money
                      ? SEE_ALL.customersBySpent
                      : SEE_ALL.customers,
                  label: "See all customers",
              }
            : null,
    };
}

// ---------------------------------------------------------------- the tab

/**
 * The one line for what this role doesn't see (DEC-098, "one message"):
 * money, names, or both; null when they see everything.
 */
export function hiddenLine(read: SellsRead): string | null {
    const names = read.names ?? true;
    if (read.money && names) return null;
    if (!read.money && !names) {
        return "Counts only: money is shown to people who can see payments, and customers' names to people who can see customers.";
    }
    if (!read.money) {
        return "Counts only: money is shown to people who can see payments.";
    }
    return "Customers' names are shown to people who can see customers.";
}

/** Which parts the business has: one that only sells sees no bookings. */
export interface SellsParts {
    /** Takes orders (Commerce on). */
    sells: boolean;
    /** Takes bookings (Bookings on). */
    books: boolean;
}

/**
 * The parts to draw. What the business does is what is on; what it did in
 * the period is shown whatever is on now. Not known: both.
 */
export function partsShown(read: SellsRead, on: SellsParts | null): SellsParts {
    if (!on) return { sells: true, books: true };
    const sells = on.sells || read.bestSellers.rows.length > 0;
    const books = on.books || read.booked.bookings > 0;
    // A business with neither on still sees where its first sale will go.
    if (!sells && !books) return { sells: true, books: false };
    return { sells, books };
}
