import { formatDayHeading, formatTimeRange } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";
import type { HomeModel } from "@/lib/home/service";
import type { OrderListPage, OrderRow } from "@/lib/orders/business-service";
import { orderHref } from "@/lib/orders/links";
import type { BookingWithService } from "@/lib/services/service";

import type { MomentKey, MomentView } from "./keys";

/**
 * When a moment is true (wave G), from reads the screens already make. Pure,
 * so each trigger is tested without a page.
 *
 * A moment marks that something good happened for the business: its first
 * order, its first booking, its tenth and hundredth order. Each is derived,
 * never stored: it IS the first order because the business has exactly one.
 * What is stored is only that someone has seen it (`service.ts`).
 *
 * Three rules hold for every one:
 *
 * - Exactly then. The first order is a moment while there is one order,
 *   not two. Nothing is said about the second.
 * - Recent. A first order from last month is not news. After
 *   {@link MOMENT_FRESH_MS} the moment is over, seen or not.
 * - Only to someone who can open it. The fact names a customer and an
 *   amount, so it needs the read that shows them.
 */
export const MOMENT_FRESH_MS = 7 * 86_400_000;

/** Whether `iso` is within the last week, and not in the future. */
function fresh(iso: string | null | undefined, now: Date): boolean {
    if (!iso) return false;
    const at = new Date(iso).getTime();
    if (Number.isNaN(at)) return false;
    const age = now.getTime() - at;
    // A minute's grace for two clocks.
    return age >= -60_000 && age <= MOMENT_FRESH_MS;
}

/** The order counts that are worth a line, and the words for each. */
const ORDER_MOMENTS = new Map<number, { key: MomentKey; title: string }>([
    [1, { key: "first-order", title: "Your first order" }],
    [10, { key: "orders-10", title: "Your 10th order" }],
    [100, { key: "orders-100", title: "Your 100th order" }],
]);

/** "Asha Rao, ₹1,240." Who and how much, each only when it is known. */
export function orderFact(
    row: Pick<OrderRow, "customer" | "walkIn" | "total" | "currency">,
): string | null {
    const who = row.customer?.name?.trim() || row.walkIn?.name.trim() || null;
    const total =
        row.total === undefined
            ? null
            : formatMoneyMajor(row.total, row.currency);
    const parts = [who, total].filter(Boolean);
    return parts.length > 0 ? `${parts.join(", ")}.` : null;
}

/**
 * The Orders list's moment: the business's first, 10th or 100th order.
 *
 * `page` must be the first page of the whole list (`plain`): its `all`
 * count is then every order the business has, and its first row the newest
 * one, which is the one the count just reached. Under a search, a filter,
 * one location or a later page the count means something else, so nothing
 * is said.
 *
 * `reads` is `order:read`. The kitchen's view (`order:stage` alone) is sent
 * no money and may cover only that person's own locations, so "the
 * business's first" could not be said truthfully there.
 */
export function ordersMoment(
    page: Pick<OrderListPage, "rows" | "counts">,
    {
        plain,
        reads,
        now = new Date(),
    }: { plain: boolean; reads: boolean; now?: Date },
): MomentView | null {
    if (!plain || !reads) return null;
    const words = ORDER_MOMENTS.get(page.counts.all);
    const row = page.rows.at(0);
    if (!words || !row || !fresh(row.placedAt, now)) return null;
    const fact = orderFact(row);
    if (!fact) return null;
    return {
        ...words,
        fact,
        action: {
            label: "Open order",
            href: orderHref(row.store.id, row.id),
        },
    };
}

/** The name the business keeps for whoever booked, else what they typed. */
function bookedBy(booking: BookingWithService): string | null {
    const kept = [booking.contact?.firstName, booking.contact?.lastName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");
    return kept || booking.bookerName?.trim() || null;
}

/**
 * Bookings' moment: the business's first booking. `bookings` is every
 * booking it has, as the list reads them; the moment is true while there is
 * exactly one and it stands (a hold still waiting on its payment, or a
 * booking since cancelled, is not a booking received).
 *
 * Who, what and when, the time on the 12-hour clock in the zone it was
 * booked in. `reads` is `booking:read`.
 */
export function firstBookingMoment(
    bookings: readonly BookingWithService[],
    { reads, now = new Date() }: { reads: boolean; now?: Date },
): MomentView | null {
    if (!reads || bookings.length !== 1) return null;
    const booking = bookings[0];
    if (booking.status !== "CONFIRMED") return null;
    if (!fresh(booking.createdAt, now)) return null;
    const when = `${formatDayHeading(booking.startAt, booking.timezone, now)}, ${formatTimeRange(booking.startAt, booking.endAt, booking.timezone)}`;
    const fact = [bookedBy(booking), booking.service?.name.trim(), when]
        .filter(Boolean)
        .join(" · ");
    return {
        key: "first-booking",
        title: "Your first booking",
        fact: `${fact}.`,
        action: { label: "Open booking", href: `/bookings/${booking.id}` },
    };
}

/** How many of a thing Home's "Last 24 hours" counted; 0 when none. */
function inLastDay(home: HomeModel, kind: "ORDERS" | "BOOKINGS"): number {
    if (!home.lastDay || home.lastDay.fresh) return 0;
    return home.lastDay.items
        .filter((item) => item.kind === kind)
        .reduce((sum, item) => sum + item.count, 0);
}

/**
 * Whether Home should ask if this is the first order. Home's own read has
 * no all-time count, and the Orders list is a page of rows, so it is read
 * only when what Home already knows makes a first order possible: on the
 * business's own Home, exactly one new order in the last 24 hours, and no
 * more than that this week. A shop past its first day never pays for it.
 */
export function homeMayHaveFirstOrder(home: HomeModel): boolean {
    if (home.view !== "business") return false;
    if (inLastDay(home, "ORDERS") !== 1) return false;
    return (home.week?.orders?.count ?? 1) <= 1;
}

/**
 * The same question for a first booking: one new booking in the last 24
 * hours, and at most one still to come.
 */
export function homeMayHaveFirstBooking(home: HomeModel): boolean {
    if (home.view !== "business") return false;
    if (inLastDay(home, "BOOKINGS") !== 1) return false;
    return home.upcoming.length <= 1;
}

/** A moment the business hasn't seen; null when it has, or that's unknown. */
export function unseen(
    moment: MomentView | null,
    seen: ReadonlySet<MomentKey> | null,
): MomentView | null {
    if (!moment || !seen) return null;
    return seen.has(moment.key) ? null : moment;
}
