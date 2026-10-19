import { formatClock, formatClockRange } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";

import type { BookingsCalendar } from "./booking-calendar";
import { BOOKING_WORDS } from "./booking-words";
import { callName } from "./call-name";
import type { Block, Column, PersonDay } from "./diary";
import { isLive, liveSeats, mergeSpans } from "./diary";
import { toPay, toPayText } from "./diary-view";

/**
 * What the Day calendar says on each thing it draws (U4, #1020; boards
 * BKMBookingsDay and BKDCalendarDay): the pill a booking wears, its one
 * line, a column's count and hours, Everyone's day as one list on a phone,
 * and when the first-day help shows.
 *
 * Pure: no clock, no markup. The words come from `booking-words.ts`.
 */

/**
 * The one pill a booking on the day wears, or null: how it went (Came,
 * Didn't come), else that it is held while the customer pays, else what is
 * still to take, else that it is paid. A class says how many places owe.
 */
export function dayPill(block: Block): string | null {
    if (!isLive(block)) return null;
    if (block.kind === "class") return toPayText(block);
    const b = block.booking;
    const owes = toPay(b);
    if (block.state === "noshow") return BOOKING_WORDS.didntCome;
    // Someone who came and still owes: the money is what is left to do.
    if (block.state === "in") return owes ? "To pay" : BOOKING_WORDS.came;
    if (block.state === "pending") return BOOKING_WORDS.awaitingPayment;
    if (owes) {
        return b.paidWith === "DESK" ? BOOKING_WORDS.paysAtVisit : "To pay";
    }
    if (b.paidAtDesk || b.paidWith === "PAID") return "Paid";
    return null;
}

/**
 * What a booking is, after its time: "Physio assessment", "Sports
 * massage · class pack", or a class's places, "6 of 8 places" and "8 of 8
 * · full". How it is paid is the pill's, so it is not said twice.
 */
export function dayWhat(block: Block): string {
    if (block.kind === "class") {
        const taken = liveSeats(block.session).length;
        const of = block.session.capacity;
        return taken >= of
            ? `${taken} of ${of} · full`
            : `${taken} of ${of} places`;
    }
    const b = block.booking;
    const how =
        b.paidWith === "PACK"
            ? " · class pack"
            : b.paidWith === "MEMBERSHIP"
              ? " · membership"
              : "";
    return `${b.service.name}${how}`;
}

/** "9:00 to 9:45 am · Physio assessment". */
export function dayLine(block: Block): string {
    return `${formatClockRange(block.start, block.end)} · ${dayWhat(block)}`;
}

/**
 * A column's count, beside its name: "5 booked", "2 classes" when all it
 * holds are classes, or "Nothing booked".
 */
export function columnCount(blocks: readonly Block[]): string {
    const live = blocks.filter(isLive);
    if (live.length === 0) return "Nothing booked";
    if (live.every((b) => b.kind === "class")) {
        return count(live.length, "class", "classes");
    }
    return `${live.length} booked`;
}

/**
 * A column's hours under its name: "9 am to 7 pm", from when the day opens
 * to when it closes (a break inside is drawn, not said); "Not working
 * today" when it has none; null when the hours are not known.
 */
export function columnHours(day: PersonDay | null): string | null {
    if (!day) return null;
    const open = mergeSpans(day.windows);
    const first = open.at(0);
    const last = open.at(-1);
    if (!first || !last) return "Not working today";
    return `${formatClock(first[0], { short: true })} to ${formatClock(last[1], { short: true })}`;
}

/** "Physiotherapist · 9 am to 7 pm". */
export function columnSubline(column: Column): string {
    return [column.title, columnHours(column.day)].filter(Boolean).join(" · ");
}

/** A block on Everyone's day on a phone, with whose it is. */
export interface EveryoneBlock {
    block: Block;
    /** "Meera": said after the title, "Ananya Desai · Meera". */
    who: string;
}

/**
 * Everyone's day as one list on a phone (BKMBookingsDay, Everyone): every
 * column's blocks together, in time order, each saying whose it is.
 */
export function everyoneBlocks(columns: readonly Column[]): EveryoneBlock[] {
    return columns
        .flatMap((c) =>
            c.blocks.map((block) => ({ block, who: callName(c.name) })),
        )
        .sort(
            (a, b) =>
                a.block.start - b.block.start ||
                a.block.key.localeCompare(b.block.key),
        );
}

/**
 * The first day (BKMBookingsDayEmpty): nothing has ever been booked in
 * what the calendar read, and the day shown has free time to book. The
 * help that teaches what to tap shows then, until it is put away.
 */
export function isFirstDay(
    calendar: Pick<BookingsCalendar, "diaries">,
    columns: readonly Column[],
): boolean {
    const nothing = calendar.diaries.every(
        (d) => d.bookings.length === 0 && d.classes.length === 0,
    );
    return nothing && columns.some((c) => (c.day?.free.length ?? 0) > 0);
}

/**
 * Whose day the first-day help names: the one person shown, by the name
 * the business calls them; null for several.
 */
export function firstDayName(columns: readonly Column[]): string | null {
    const people = columns.filter((c) => c.day !== null);
    return people.length === 1 && people[0] ? callName(people[0].name) : null;
}
