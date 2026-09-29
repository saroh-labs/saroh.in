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
    return `Since ${new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone,
    })
        .format(new Date(iso))
        .replace("Sept", "Sep")}`;
}

/** "Place held until 14:30" for an offer, in the business's zone. */
export function heldText(iso: string, timeZone: string): string {
    return `Place held until ${new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone,
    }).format(new Date(iso))}`;
}

/**
 * What the card says under its title: how the line works, in the
 * merchant's words (the Course Detail design's note, for a class).
 */
export const WAITLIST_NOTE =
    "When a place frees up, the first in line has it held for up to 2 hours to book.";
