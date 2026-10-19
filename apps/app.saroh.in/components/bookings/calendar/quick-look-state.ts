/**
 * What the quick look offers for a booking, as plain rules (U7, #1023,
 * BKMQuickLook, BKDQuickLook), so the sheet and its tests agree:
 *
 * - **One main action at a time**: Mark arrived, then Take ₹X, then Book
 *   their next visit. Didn't come: Book them again. Cancelled: Book a new
 *   time.
 * - **More** holds the rest, Cancel last in red.
 * - The words for a change being told to the customer, and whether a
 *   refused move means the time was just taken.
 *
 * Pure and import-light: no React, no API.
 */
import type { NoticeReach } from "@/lib/messages/notice-reach";
import type { DiaryState, LocalDate } from "@/lib/services/diary";
import { addDays } from "@/lib/services/diary";

/** Where the quick look is: the booking, or one of its panel steps. */
export type QuickLookStep = "look" | "choose" | "move" | "cancel" | "next";

/** The one main button, by what has happened so far. */
export type PrimaryAction =
    /** "Mark Kabir arrived". */
    | "arrive"
    /** "Take ₹500". */
    | "take"
    /** "Book their next visit". */
    | "next"
    /** "Book Vikram again", after they didn't come. */
    | "again"
    /** "Book a new time", after a cancel. */
    | "rebook";

export interface QuickLookFacts {
    state: DiaryState;
    /** `booking:write`: marks, moves, cancels and books. */
    canBook: boolean;
    /** Close enough to its start to mark them here. */
    canArrive: boolean;
    /** Close enough (or past) to say they didn't come. */
    canNoShow: boolean;
    /** May take it at the desk, and there is something to take. */
    canTakeNow: boolean;
    /** The next visit can be booked from here (who and what are known). */
    canNext: boolean;
    /** A change to this booking is held, with its Undo. */
    held: boolean;
    /** Their customer page exists. */
    hasPerson: boolean;
}

export function primaryAction(f: QuickLookFacts): PrimaryAction | null {
    if (!f.canBook) return null;
    switch (f.state) {
        case "booked":
        case "pending":
            return f.canArrive ? "arrive" : null;
        case "in":
            if (f.canTakeNow) return "take";
            return f.canNext ? "next" : null;
        case "noshow":
            return f.canNext ? "again" : null;
        case "cancelled":
            return f.canNext ? "rebook" : null;
        default:
            return null;
    }
}

/** What a More row does. */
export type MoreAction =
    | "take"
    | "noshow"
    | "came"
    | "undo"
    | "person"
    | "full"
    | "next"
    | "move"
    | "cancel";

export interface MoreItem {
    action: MoreAction;
    label: string;
    /** Red: the one that can't be taken back without Undo. */
    danger?: boolean;
}

/**
 * More, in the order the boards draw it, for a one-to-one booking. Cancel
 * is always last and red. `amount` is "₹500" when the viewer reads money.
 */
export function moreItems(
    f: QuickLookFacts,
    words: { first: string; amount: string | null },
): MoreItem[] {
    const first = words.first || "their";
    const page: MoreItem = {
        action: "person",
        label: words.first ? `Open ${words.first}'s page` : "Open their page",
    };
    const full: MoreItem = {
        action: "full",
        label: "The full booking and its history",
    };
    const take: MoreItem = {
        action: "take",
        label: words.amount ? `Take ${words.amount} now` : "Take payment now",
    };
    const next: MoreItem = { action: "next", label: "Book their next visit" };
    // Booking the next one is a booking: only for who may book.
    const canNext = f.canBook && f.canNext;
    const items: (MoreItem | false)[] = [];
    const primary = primaryAction(f);
    switch (f.state) {
        case "booked":
        case "pending":
            items.push(
                f.canTakeNow && primary !== "take" && take,
                f.canBook &&
                    f.canNoShow && {
                        action: "noshow",
                        label: "Mark as didn't come",
                    },
                f.hasPerson && page,
                full,
                canNext && next,
                f.canBook && { action: "move", label: "Move to another time" },
                f.canBook && {
                    action: "cancel",
                    label: "Cancel booking",
                    danger: true,
                },
            );
            break;
        case "in":
            items.push(
                f.canTakeNow && primary !== "take" && take,
                f.hasPerson && page,
                full,
                canNext && primary !== "next" && next,
                f.canBook &&
                    f.held && {
                        action: "undo",
                        label: "Undo: not arrived yet",
                    },
                f.canBook &&
                    !f.held &&
                    f.canNoShow && {
                        action: "noshow",
                        label: "Mark as didn't come",
                    },
            );
            break;
        case "noshow":
            items.push(
                f.canBook && { action: "came", label: "Mark as came" },
                f.canBook &&
                    f.held && {
                        action: "undo",
                        label: `Undo: ${first === "their" ? "they" : first} didn't come`,
                    },
                f.hasPerson && page,
                full,
            );
            break;
        case "cancelled":
            items.push(
                f.canBook &&
                    f.held && { action: "undo", label: "Undo the cancel" },
                f.hasPerson && page,
                full,
            );
            break;
        default:
            items.push(f.hasPerson && page, full);
    }
    return items.filter((i): i is MoreItem => Boolean(i));
}

/**
 * The Move or cancel step's line on who hears of it (BKMQuickLookStep2):
 * from how a change reaches them (A14), never a promise Saroh can't keep.
 */
export function changeToldText(
    reach: NoticeReach | null | undefined,
    first: string,
): string {
    const who = first || "They";
    // "They are", "They see": the verb agrees when there is no name.
    const is = first ? "is" : "are";
    const sees = first ? "sees" : "see";
    switch (reach) {
        case "EMAIL_AND_ACCOUNT":
            return `${who} ${is} emailed either way and ${sees} the change in their account on your site.`;
        case "EMAIL":
            return `${who} ${is} emailed either way.`;
        case "ACCOUNT":
            return `Either way, it shows in ${first ? `${first}'s` : "their"} account on your site.`;
        case "ON_SIGN_IN":
            return `${who} ${sees} it when they sign in on your site. Tell them yourself if it's soon.`;
        default:
            return `Saroh doesn't message ${first || "them"}. Tell them yourself either way.`;
    }
}

/** "Kabir is emailed." after a move, when a move reaches them by email. */
export function movedToldText(
    reach: NoticeReach | null | undefined,
    first: string,
): string | null {
    if (reach === "EMAIL_AND_ACCOUNT" || reach === "EMAIL") {
        return `${first || "They"} ${first ? "is" : "are"} emailed.`;
    }
    return null;
}

/**
 * A refused move or booking that means the time went meanwhile ("Meera
 * is already booked then", "That time is fully booked"), so the picker
 * says so and reads the times again rather than showing an error.
 */
export function isTakenRefusal(error: string): boolean {
    return /already booked|fully booked|just went|just booked|no longer free|taken/i.test(
        error,
    );
}

/** The Next visit step's three ways to a day (Q16): never a fixed week on. */
export type NextDayChoice = "tomorrow" | "next-week" | "pick";

export function nextVisitDay(
    choice: Exclude<NextDayChoice, "pick">,
    today: LocalDate,
): LocalDate {
    return addDays(today, choice === "tomorrow" ? 1 : 7);
}
