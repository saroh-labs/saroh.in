import { count } from "@/lib/format/plural";

import type { DiaryBooking } from "./booking-calendar";
import type { Block } from "./diary";
import { isLive, liveSeats } from "./diary";

/**
 * How Bookings counts (DEC-260): in sessions and people, both, on the
 * Calendar and the List alike. A one-to-one is one session and one person;
 * a class start is one session and as many people as hold a place. So a
 * day with one yoga class of 7 and two appointments is "3 sessions · 9
 * people" in every view, never 3 in one and 9 in the other.
 */
export interface Counted {
    sessions: number;
    people: number;
}

/** Sessions and people from each session's head count. */
export function counted(heads: readonly number[]): Counted {
    let sessions = 0;
    let people = 0;
    for (const n of heads) {
        sessions += 1;
        people += n;
    }
    return { sessions, people };
}

/** How many hold a place on a block: 1, or a class's live places. */
export function peopleOn(block: Block): number {
    return block.kind === "class" ? liveSeats(block.session).length : 1;
}

/** The live blocks of a day or a week, counted. */
export function countBlocks(blocks: readonly Block[]): Counted {
    return counted(blocks.filter(isLive).map(peopleOn));
}

/** "3 sessions · 9 people", "1 session · 1 person", or "Nothing booked". */
export function countedWords(c: Counted): string {
    if (c.sessions === 0) return "Nothing booked";
    return `${count(c.sessions, "session")} · ${count(c.people, "person", "people")}`;
}

/** The key a class start goes by: its service and its start (the API's). */
const sessionKey = (b: DiaryBooking) => `${b.serviceId}@${b.startAt}`;

/** A row of the List: one booking, or a class start with its people. */
export type ListItem =
    | { kind: "one"; key: string; booking: DiaryBooking }
    | {
          kind: "class";
          key: string;
          /** Everyone on it shown in this list, in the order given. */
          bookings: DiaryBooking[];
      };

/**
 * The List's rows with each class start as one row ("Yoga flow · 7 of
 * 15"), in the order the bookings came; a one-to-one stays its own row.
 * Only the bookings given are grouped, so a view or a filter that leaves
 * someone out leaves them out of the class row too.
 */
export function listItems(rows: readonly DiaryBooking[]): ListItem[] {
    const out: ListItem[] = [];
    const classes = new Map<string, DiaryBooking[]>();
    for (const b of rows) {
        if (b.service.capacity <= 1) {
            out.push({ kind: "one", key: b.id, booking: b });
            continue;
        }
        const key = sessionKey(b);
        const seen = classes.get(key);
        if (seen) {
            seen.push(b);
            continue;
        }
        const bookings = [b];
        classes.set(key, bookings);
        out.push({ kind: "class", key, bookings });
    }
    return out;
}

/** The List's rows counted: a class row is one session of its live people. */
export function countItems(items: readonly ListItem[]): Counted {
    return counted(
        items.flatMap((i) => {
            if (i.kind === "one") {
                return i.booking.status === "CANCELLED" ? [] : [1];
            }
            const live = i.bookings.filter((b) => b.status !== "CANCELLED");
            return live.length ? [live.length] : [];
        }),
    );
}

/**
 * How a finished class went (DEC-274): who came, who didn't, who still has
 * to pay (the one payment word, DEC-273), and who nobody marked. Cancelled
 * places aren't counted. The List's class row and the diary's block both
 * say it, in {@link classCloseWords}.
 */
export interface ClassClose {
    came: number;
    didnt: number;
    toPay: number;
    unmarked: number;
}

export function classClose(bookings: readonly DiaryBooking[]): ClassClose {
    const live = bookings.filter((b) => b.status !== "CANCELLED");
    return {
        came: live.filter((b) => b.outcome === "ATTENDED").length,
        didnt: live.filter((b) => b.outcome === "NO_SHOW").length,
        toPay: live.filter((b) => b.pay?.word === "AWAITING_PAYMENT").length,
        unmarked: live.filter((b) => b.outcome === null).length,
    };
}

/**
 * "8 came", "1 didn't", "3 to pay", as separate words for separate badges,
 * and "Not marked" while nobody has marked anyone.
 */
export function classCloseWords(
    c: ClassClose,
): { label: string; tone: "success" | "error" | "warning" | "neutral" }[] {
    const words: {
        label: string;
        tone: "success" | "error" | "warning" | "neutral";
    }[] = [];
    if (c.came > 0) words.push({ label: `${c.came} came`, tone: "success" });
    if (c.didnt > 0) words.push({ label: `${c.didnt} didn't`, tone: "error" });
    if (c.toPay > 0)
        words.push({ label: `${c.toPay} to pay`, tone: "warning" });
    if (c.came === 0 && c.didnt === 0) {
        words.unshift({ label: "Not marked", tone: "neutral" });
    }
    return words;
}
