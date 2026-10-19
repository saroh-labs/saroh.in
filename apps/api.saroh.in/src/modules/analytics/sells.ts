import { toMinor } from "../../common/money";
import { contactEmailForDisplay } from "../contacts/contact-email";
import type { HomeWeekChange } from "../home/home-need-model";
import { compareTakings } from "../home/home-week";
import type {
    BestCustomers,
    BestSeller,
    BestSellers,
    Booked,
    BookedRow,
    BookedService,
    Busiest,
    BusyCell,
    BusyRow,
    CustomerRow,
    Decimalish,
    SoldRow,
} from "./sells-model";

export type {
    BestCustomer,
    BestCustomers,
    BestSeller,
    BestSellers,
    Booked,
    BookedRow,
    BookedService,
    Busiest,
    BusyCell,
    BusyRow,
    CustomerRow,
    SellsRead,
    SoldRow,
} from "./sells-model";

/**
 * Insights' What sells (DEC-171, `GET analytics/sells?period=`): the
 * overview's "What sells, who books?" card and the What sells tab, for one
 * period against the same number of days before it (`period.ts`). Pure:
 * the folds of what `sells.sql.ts` reads. The service reads.
 *
 * - **Best sellers**: per product, its variants rolled up; what was sold
 *   and what it brought in, from the paid orders of the period (a refunded
 *   order never counts; a line refunded in part counts what was kept); the
 *   change in units against the period before, or "New" when it sold none
 *   before. Top five, and how many products sold, for "See all".
 * - **Booked most**: per service, the places taken and the people who took
 *   them, in the period. A class (capacity above one) also says how many
 *   sessions it ran and how full they were: places taken over places
 *   offered. A session is a class time anyone booked, even if every place
 *   was cancelled since; a time nobody ever booked is not known (there is
 *   no class timetable to read), so it is not counted. A one-to-one service
 *   shows bookings and no fill.
 * - **Busiest**: paid orders (when paid) and attended bookings (when they
 *   started) by weekday and four parts of the day in the business's zone:
 *   7 to 10, 10 to 1, 1 to 4 and 4 to 8. Anything outside them is counted
 *   apart. The busiest and the quietest cell.
 * - **Best customers**: the top five people by what they paid in the
 *   period (Customers' "Spent" rule, `spent.sql.ts`), with their orders,
 *   deliveries, bills, classes and bookings and what they buy most; and how
 *   many came back against how many came for the first time. One person is
 *   one contact, however many storefront customers are linked to them.
 *
 * Who sees what: counts with `analytics:read`; amounts only with
 * `payment:read` (DEC-098), and without it the customers are ranked by how
 * often they came, so the order never hints at money; names only with
 * `contact:read`.
 *
 * Thin data is said, not hidden: `thin` (younger than the two periods, as
 * Money says it) makes every change THIN and nothing "New"; `booked.enough`
 * is false below {@link MIN_BOOKINGS}; `busiest.enough` is false before two
 * weeks of history or below {@link MIN_BUSY}.
 */

/** How many rows a list shows before "See all". */
export const TOP = 5;

/** Fewer bookings than this in the period: "too few bookings yet". */
export const MIN_BOOKINGS = 5;

/** Busiest times need about two weeks of history ... */
export const MIN_BUSY_DAYS = 14;
/** ... and at least this many sales and visits in the period. */
export const MIN_BUSY = 10;

/** The four parts of the day, as local hours `[from, to)`. */
export const DAY_PARTS = [
    { from: 7, to: 10 },
    { from: 10, to: 13 },
    { from: 13, to: 16 },
    { from: 16, to: 20 },
] as const;

const THIN: HomeWeekChange = { kind: "THIN" };

/** Minor units with `money` (nothing is 0), else null. */
function minorOrNull(
    value: Decimalish | null | undefined,
    money: boolean,
): number | null {
    if (!money) return null;
    return value != null ? toMinor(value) : 0;
}

/** A count's change: THIN for a young business or too few before. */
export function countChange(
    now: number,
    before: number,
    thin: boolean,
): HomeWeekChange {
    return thin ? THIN : compareTakings(now, before, before);
}

/**
 * Best sellers, most sold first (then most brought in, then by name, so the
 * order never shuffles). Amounts only with `money`.
 */
export function bestSellers(
    rows: readonly SoldRow[],
    opts: { thin: boolean; money: boolean },
): BestSellers {
    const by = new Map<
        string,
        { name: string; now?: SoldRow; was?: SoldRow }
    >();
    for (const row of rows) {
        const entry = by.get(row.productId) ?? { name: row.name };
        if (row.window === "PERIOD") entry.now = row;
        else entry.was = row;
        by.set(row.productId, entry);
    }
    const all: BestSeller[] = [];
    for (const [productId, { name, now, was }] of by) {
        const sold = Number(now?.sold ?? 0);
        if (sold <= 0) continue;
        const soldBefore = Math.max(0, Number(was?.sold ?? 0));
        all.push({
            productId,
            name,
            sold,
            soldBefore,
            amountMinor: minorOrNull(now?.amount, opts.money),
            beforeMinor: minorOrNull(was?.amount, opts.money),
            change: countChange(sold, soldBefore, opts.thin),
            isNew: !opts.thin && soldBefore === 0,
        });
    }
    all.sort(
        (a, b) =>
            b.sold - a.sold ||
            (b.amountMinor ?? 0) - (a.amountMinor ?? 0) ||
            a.name.localeCompare(b.name) ||
            a.productId.localeCompare(b.productId),
    );
    return { rows: all.slice(0, TOP), total: all.length };
}

/** Booked most: most places taken first. */
export function booked(
    rows: readonly BookedRow[],
    opts: { thin: boolean },
): Booked {
    const by = new Map<string, { now?: BookedRow; was?: BookedRow }>();
    for (const row of rows) {
        const entry = by.get(row.serviceId) ?? {};
        if (row.window === "PERIOD") entry.now = row;
        else entry.was = row;
        by.set(row.serviceId, entry);
    }
    const all: BookedService[] = [];
    let bookings = 0;
    for (const [serviceId, { now, was }] of by) {
        if (!now) continue;
        const taken = Number(now.bookings);
        const sessions = Number(now.sessions);
        bookings += taken;
        if (taken <= 0 && sessions <= 0) continue;
        const isClass = now.capacity > 1;
        const seats = isClass ? sessions * now.capacity : null;
        const before = Number(was?.bookings ?? 0);
        all.push({
            serviceId,
            name: now.name,
            kind: isClass ? "CLASS" : "ONE_TO_ONE",
            bookings: taken,
            bookingsBefore: before,
            people: Number(now.people),
            sessions: isClass ? sessions : null,
            seats,
            fullPercent:
                seats !== null && seats > 0
                    ? Math.min(100, Math.round((taken / seats) * 100))
                    : null,
            change: countChange(taken, before, opts.thin),
        });
    }
    all.sort(
        (a, b) =>
            b.bookings - a.bookings ||
            a.name.localeCompare(b.name) ||
            a.serviceId.localeCompare(b.serviceId),
    );
    return {
        rows: all.slice(0, TOP),
        total: all.filter((s) => s.bookings > 0).length,
        bookings,
        enough: bookings >= MIN_BOOKINGS,
    };
}

/** Which part of the day a local hour falls in, or -1 for none. */
export function partOf(hour: number): number {
    return DAY_PARTS.findIndex((p) => hour >= p.from && hour < p.to);
}

/**
 * The week as 28 cells. The busiest is the cell with most (the earlier in
 * the week, then in the day, on a tie); the quietest the one with least,
 * the same way. Neither when nothing happened.
 */
export function busiest(
    rows: readonly BusyRow[],
    opts: { ageDays: number },
): Busiest {
    const cells: BusyCell[] = [];
    for (let dow = 1; dow <= 7; dow += 1) {
        for (let part = 0; part < DAY_PARTS.length; part += 1) {
            cells.push({ dow, part, orders: 0, bookings: 0, total: 0 });
        }
    }
    let outside = 0;
    for (const row of rows) {
        const count = Number(row.count);
        const part = partOf(Number(row.hour));
        if (part < 0 || row.dow < 1 || row.dow > 7) {
            outside += count;
            continue;
        }
        const cell = cells[(row.dow - 1) * DAY_PARTS.length + part];
        if (row.kind === "ORDER") cell.orders += count;
        else cell.bookings += count;
        cell.total += count;
    }
    const total = cells.reduce((sum, c) => sum + c.total, 0);
    let most: BusyCell | null = null;
    let least: BusyCell | null = null;
    if (total > 0) {
        for (const cell of cells) {
            if (!most || cell.total > most.total) most = cell;
            if (!least || cell.total < least.total) least = cell;
        }
    }
    return {
        cells,
        busiest: most,
        quietest: least,
        total,
        outside,
        enough: opts.ageDays + 1 >= MIN_BUSY_DAYS && total >= MIN_BUSY,
    };
}

function nameOf(row: CustomerRow): string | null {
    const full = [row.firstName, row.lastName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");
    if (full) return full;
    const company = filled(row.company);
    return company ?? contactEmailForDisplay(row.email);
}

/** The text, trimmed, or null when there is none. */
function filled(text: string | null): string | null {
    const trimmed = text?.trim();
    if (!trimmed) return null;
    return trimmed;
}

/** The best customers, in the order the query ranked them. */
export function bestCustomers(
    rows: readonly CustomerRow[],
    buysMost: ReadonlyMap<string, string>,
    opts: { money: boolean; names: boolean },
): BestCustomers {
    const total = Number(rows[0]?.total ?? 0);
    const cameBack = Number(rows[0]?.cameBack ?? 0);
    return {
        rows: rows.slice(0, TOP).map((row) => ({
            contactId: opts.names ? row.contactId : null,
            name: opts.names ? nameOf(row) : null,
            company: opts.names ? filled(row.company) : null,
            amountMinor: minorOrNull(row.amount, opts.money),
            orders: Number(row.orders),
            deliveries: Number(row.deliveries),
            bills: Number(row.bills),
            classes: Number(row.classes),
            bookings: Number(row.bookings),
            online: Boolean(row.online),
            inStore: Boolean(row.inStore),
            buysMost: buysMost.get(row.contactId) ?? null,
        })),
        total,
        cameBack,
        firstTime: Math.max(0, total - cameBack),
    };
}
