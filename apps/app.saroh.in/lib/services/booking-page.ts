/**
 * A booking's page (U12, #1028; BKMBookingDetail, BKDBooking) as plain
 * rules, so the page, its pinned actions and its tests agree:
 *
 * - **The heading** is the day and time, in the business's zone (Q10):
 *   "Today, Mon 19 Oct" and "11:30 am to 12:15 pm".
 * - **One main action**, pinned: Take ₹X while there is money to take
 *   (locked, saying why, for a role that can't take it), then Book their
 *   next visit once they came, Book them again after they didn't, and
 *   Book a new time once it is cancelled. Move and More sit beside it;
 *   Cancel is last in More, in red.
 * - **"Did Kabir come?"** from an hour before the start (the API's rule),
 *   for whoever may change bookings.
 *
 * Pure and import-light: no React, no API.
 */
import type { CustomerPick } from "@/lib/customers/picker";
import { formatDate, formatTimeRange } from "@/lib/format/datetime";
import { firstName } from "@/lib/names";
import type {
    BookingOutcome,
    BookingStatus,
} from "@/lib/services/booking-state";
import {
    canCheckIn,
    canMarkNoShow,
    hasEnded,
} from "@/lib/services/booking-state";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import type { DeskTake } from "@/lib/services/desk-pay";
import type { BookingDetail } from "@/lib/services/service";

/**
 * The booking as the page reads it: the API's detail, with who takes it
 * (U3) and the booker's note (E7, only for someone who may see it).
 */
export type PageBooking = BookingDetail & {
    staff?: { id: string; name: string } | null;
    intakeNote?: string | null;
};

/** The contact's name if the CRM knows them, else whatever was typed in. */
export function bookerLabel(
    b: Pick<BookingDetail, "contact" | "bookerName" | "bookerEmail">,
): string {
    const contact = b.contact;
    if (contact) {
        const name = [contact.firstName, contact.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        if (name) return name;
        return contact.email;
    }
    return b.bookerName ?? b.bookerEmail ?? "Unknown booker";
}

/** The badge under the heading's line: always the word, the hue helps. */
export type PageBadgeTone =
    "active" | "success" | "error" | "warning" | "neutral";

export function pageBadge(f: {
    status: BookingStatus;
    outcome: BookingOutcome | null;
    ended: boolean;
}): { label: string; tone: PageBadgeTone } {
    if (f.status === "CANCELLED")
        return { label: "Cancelled", tone: "neutral" };
    if (f.outcome === "ATTENDED")
        return { label: BOOKING_WORDS.came, tone: "success" };
    if (f.outcome === "NO_SHOW")
        return { label: BOOKING_WORDS.didntCome, tone: "error" };
    if (f.status === "PENDING")
        return { label: BOOKING_WORDS.awaitingPayment, tone: "active" };
    if (f.ended) return { label: BOOKING_WORDS.notMarked, tone: "warning" };
    return { label: "Booked", tone: "active" };
}

/** What the page knows that decides what it offers. */
export interface PageFacts {
    status: BookingStatus;
    /** How it went, with a mark still held for its Undo shown as made. */
    outcome: BookingOutcome | null;
    /** `booking:write`: marks, moves, cancels and books. */
    canBook: boolean;
    /** New booking can be opened here (a host, and who it was for). */
    canLaunch: boolean;
    /** A group class or a visit of a treatment: booked another way. */
    bookedElsewhere: boolean;
    /** What "Take ₹X" takes now; null when there's nothing. */
    take: DeskTake | null;
    /**
     * Taking payment at the desk: true may, false sees it locked, null
     * when the page wasn't told (nothing is drawn).
     */
    canTake: boolean | null;
    /** The slot has ended. */
    ended: boolean;
    /** The service is archived: its bookings can't be moved. */
    retired: boolean;
}

/** The one pinned action. */
export type PageMain =
    /** "Take ₹500". */
    | "take"
    /** "Take ₹500", shown locked with why (DEC-098). */
    | "take-locked"
    /** "Book their next visit", once they came. */
    | "next"
    /** "Book Kabir again", after they didn't come. */
    | "again"
    /** "Book a new time", once cancelled. */
    | "rebook";

export function pageMain(f: PageFacts): PageMain | null {
    const book = f.canBook && f.canLaunch && !f.bookedElsewhere;
    if (f.status === "CANCELLED") return book ? "rebook" : null;
    if (f.take && f.canTake !== null) return f.canTake ? "take" : "take-locked";
    if (f.outcome === "ATTENDED") return book ? "next" : null;
    if (f.outcome === "NO_SHOW") return book ? "again" : null;
    return null;
}

/** Move: still to come, not marked, and on a service that is still live. */
export function pageCanMove(f: PageFacts): boolean {
    return (
        f.canBook &&
        f.status !== "CANCELLED" &&
        !f.ended &&
        f.outcome === null &&
        !f.retired
    );
}

/** Cancel, last in More: anything not cancelled and not yet marked. */
export function pageCanCancel(f: PageFacts): boolean {
    return f.canBook && f.status !== "CANCELLED" && f.outcome === null;
}

/** "Book their next visit" in More: once it isn't the main action. */
export function pageCanBookNext(f: PageFacts): boolean {
    const main = pageMain(f);
    return (
        f.canBook &&
        f.canLaunch &&
        !f.bookedElsewhere &&
        f.status !== "CANCELLED" &&
        main !== "next" &&
        main !== "again"
    );
}

/**
 * "Did Kabir come?": for who may say, from an hour before the start (the
 * API's rule) and once it has been said, so it can be changed. Didn't
 * come waits for the start.
 */
export function outcomeAsk(
    b: { status: BookingStatus; startAt: string },
    outcome: BookingOutcome | null,
    canBook: boolean,
    now: number,
): { came: boolean; didnt: boolean } | null {
    if (!canBook || b.status === "CANCELLED") return null;
    const came = canCheckIn(b, now);
    if (!came && outcome === null) return null;
    return { came: true, didnt: canMarkNoShow(b, now) };
}

/** The card's line under "Did Kabir come?". */
export function outcomeLine(
    outcome: BookingOutcome | null,
    by: string | null,
): string {
    if (outcome === "ATTENDED") {
        return by ? `Came. Marked by ${firstName(by)}.` : "Came.";
    }
    if (outcome === "NO_SHOW") {
        return `${BOOKING_WORDS.didntCome}. Press ${BOOKING_WORDS.came} to change it.`;
    }
    return "Nobody has marked it yet.";
}

/**
 * The heading: "Today, Mon 19 Oct" (or "Sat 17 Oct") and "11:30 am to
 * 12:15 pm", in the business's zone.
 */
export function pageHeading(
    b: { startAt: string; endAt: string },
    timeZone: string,
    now: number,
): { day: string; time: string } {
    const plain = formatDate(b.startAt, timeZone, {
        weekday: "short",
        now,
    });
    const near = formatDate(b.startAt, timeZone, {
        weekday: "short",
        relative: true,
        now,
    });
    return {
        day: near === plain ? plain : `${near}, ${plain}`,
        time: formatTimeRange(b.startAt, b.endAt, timeZone),
    };
}

/**
 * "Moved once · booked by Meera": how it came to be as it is, under the
 * badge. Null when it was booked online and never moved.
 */
export function pageOrigin(events: BookingDetail["events"]): string | null {
    const moves = events.filter((e) => e.type === "RESCHEDULED").length;
    const madeBy = events.find((e) => e.type === "BOOKED")?.actor?.name;
    const moved =
        moves === 0
            ? null
            : moves === 1
              ? "Moved once"
              : `Moved ${moves} times`;
    const booked = madeBy ? `booked by ${firstName(madeBy)}` : "booked online";
    if (!moved) return madeBy ? `Booked by ${firstName(madeBy)}` : null;
    return `${moved} · ${booked}`;
}

/** "Physio assessment with Meera Iyer · 45 min", or a class's words. */
export function pageWhat(b: PageBooking): string {
    const service = b.service.name;
    const isClass = b.service.capacity > 1;
    const who = b.staff?.name ?? null;
    const what = isClass
        ? who
            ? `${service}, a group class with ${who}`
            : `${service}, a group class`
        : who
          ? `${service} with ${who}`
          : service;
    const minutes = b.service.durationMinutes;
    return typeof minutes === "number" ? `${what} · ${minutes} min` : what;
}

/**
 * Who New booking opens with for this booker (U8): their contact, or a
 * walk-in by name and phone, or someone new by email; null when nothing
 * is known to book them by.
 */
export function bookerPick(
    b: Pick<
        BookingDetail,
        "contact" | "bookerName" | "bookerEmail" | "bookerPhone"
    >,
): CustomerPick | null {
    if (b.contact) {
        const name = [b.contact.firstName, b.contact.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        return {
            kind: "contact",
            id: b.contact.id,
            name: name || null,
            email: b.contact.email || null,
            phone: b.contact.phone ?? null,
        };
    }
    const name = b.bookerName?.trim() ?? "";
    const phone = b.bookerPhone?.trim() ?? "";
    if (name && phone) return { kind: "walk-in", name, phone };
    const email = b.bookerEmail?.trim() ?? "";
    if (email) return { kind: "new", name, email, phone };
    return null;
}

/** A row of More, in the boards' order. */
export interface PageMoreItem {
    action: "day" | "next" | "person" | "move" | "cancel";
    label: string;
    /** Red: Cancel, always last. */
    danger?: boolean;
}

/**
 * More (BKMBookingDetail's sheet, BKDBooking's menu): See the day, Book
 * their next visit, their page, Move to another time and, last in red,
 * Cancel booking — each where it can be done.
 */
export function pageMoreItems(
    f: PageFacts,
    words: { first: string; hasPerson: boolean },
): PageMoreItem[] {
    const items: (PageMoreItem | false)[] = [
        { action: "day", label: "See the day" },
        pageCanBookNext(f) && {
            action: "next",
            label: "Book their next visit",
        },
        words.hasPerson && {
            action: "person",
            label: words.first
                ? `Open ${words.first}'s page`
                : "Open their page",
        },
        pageCanMove(f) && { action: "move", label: "Move to another time" },
        pageCanCancel(f) && {
            action: "cancel",
            label: "Cancel booking",
            danger: true,
        },
    ];
    return items.filter((i): i is PageMoreItem => Boolean(i));
}

/** Whether the slot has ended, read with the page's clock. */
export function endedAt(b: { endAt: string }, now: number): boolean {
    return hasEnded(b, now);
}
