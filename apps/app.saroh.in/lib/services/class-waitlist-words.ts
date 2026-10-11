import { formatDate, formatTime } from "@/lib/format/datetime";
/**
 * A class's waitlist as the team reads it (round-2 A12): the row the API
 * answers, and the words the booking's Waitlist card says. Pure, so the
 * card and its tests need no server.
 */

export interface ClassWaitlistRow {
    id: string;
    contactId: string;
    name: string | null;
    email: string | null;
    /** WAITING in line, or OFFERED: a freed place is held for them. */
    status: "WAITING" | "OFFERED";
    offeredUntil: string | null;
    joinedAt: string;
}

/** "Since 28 Sep", in the business's zone. */
export function joinedText(iso: string, timeZone: string): string {
    return `Since ${formatDate(iso, timeZone)}`;
}

/** "Place held until 2:30 pm" for an offer, in the business's zone. */
export function heldText(iso: string, timeZone: string): string {
    return `Place held until ${formatTime(iso, timeZone)}`;
}

/**
 * What the card says under its title: how the line works, in the
 * merchant's words (the Course Detail design's note, for a class).
 */
export const WAITLIST_NOTE =
    "When a place frees up, the first in line has it held for up to 2 hours to book.";
