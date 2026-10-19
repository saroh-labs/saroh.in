import { BOOKING_WORDS } from "./booking-words";
import { callName } from "./call-name";
import type { Block } from "./diary";
import { blockTitle, liveSeats } from "./diary";

/**
 * The words of Bookings' List (U6, #1022; BKMBookingsAgenda on a phone,
 * BKDCalendarList on the desk): the Next card, each booked row's line and
 * the free times' tally. Pure, so both sizes and the tests say the same
 * thing.
 */

/** States that still lie ahead of the desk: not marked, not cancelled. */
const AHEAD = new Set<Block["state"]>(["booked", "pending", "open", "full"]);

/**
 * The next thing on today's list: the first booking or class that starts at
 * or after `nowMinute` and nobody has marked yet. Null when nothing is left.
 */
export function nextUp(
    blocks: readonly Block[],
    nowMinute: number,
): Block | null {
    return (
        blocks
            .filter((b) => AHEAD.has(b.state) && b.start >= nowMinute)
            .sort((a, b) => a.start - b.start)
            .at(0) ?? null
    );
}

/** How far off a start is: "now", "in 10 min", "in 1 hr", "in 2 hr 15 min". */
export function startsIn(minutes: number): string {
    if (minutes <= 0) return "now";
    if (minutes < 60) return `in ${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `in ${h} hr ${m} min` : `in ${h} hr`;
}

/** Who takes a block, by the name the business calls them, or null. */
function takerOf(block: Block): string | null {
    const staff =
        block.kind === "one" ? block.booking.staff : block.session.staff;
    return staff ? callName(staff.name) : null;
}

/** "6 of 8 places". */
function placesOf(block: Extract<Block, { kind: "class" }>): string {
    return `${liveSeats(block.session).length} of ${block.session.capacity} places`;
}

/**
 * A booked row's second line: "Physio assessment · Meera · pays at the
 * visit" for one person, "Neha Kapoor · 6 of 8 places" for a class.
 */
export function listLine(block: Block): string {
    if (block.kind === "class") {
        const teacher = block.session.staff?.name;
        return teacher ? `${teacher} · ${placesOf(block)}` : placesOf(block);
    }
    const b = block.booking;
    const parts = [b.service.name];
    const who = takerOf(block);
    if (who) parts.push(who);
    if (b.paidAtDesk) parts.push("paid at the desk");
    else if (b.paidWith === "DESK" && block.state === "booked")
        parts.push(BOOKING_WORDS.paysAtVisit.toLowerCase());
    else if (b.paidWith === "PAID") parts.push("paid");
    else if (b.paidWith === "PACK") parts.push("class pack");
    else if (b.paidWith === "MEMBERSHIP") parts.push("membership");
    return parts.join(" · ");
}

/** The Next card's title: "11:30 am · Kabir Singh". */
export function nextTitle(block: Block, clock: string): string {
    return `${clock} · ${blockTitle(block)}`;
}

/**
 * The Next card's line: "Physio assessment with Meera · in 10 min", or for
 * a class "With Neha · 6 of 8 places · in 25 min".
 */
export function nextLine(block: Block, minutesAway: number): string {
    const who = takerOf(block);
    const when = startsIn(minutesAway);
    if (block.kind === "class") {
        return [who ? `With ${who}` : null, placesOf(block), when]
            .filter(Boolean)
            .join(" · ");
    }
    const what = block.booking.service.name;
    return `${who ? `${what} with ${who}` : what} · ${when}`;
}

/**
 * A class's places, as its badge says them: "2 places left" (or "2 left"
 * where room is short), "Full", or null for a one-to-one.
 */
export function placesLeft(
    block: Block,
): { long: string; short: string } | null {
    if (block.kind !== "class" || block.state !== "open") return null;
    const left = block.session.capacity - liveSeats(block.session).length;
    return {
        long: `${left} ${left === 1 ? "place" : "places"} left`,
        short: `${left} left`,
    };
}

/** "Meera 3 · Arjun 3 · Neha 2": free times per person, in list order. */
export function freeTally(rows: readonly { who: string }[]): string {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.who, (counts.get(r.who) ?? 0) + 1);
    return Array.from(counts, ([who, n]) => `${callName(who)} ${n}`).join(
        " · ",
    );
}
