/**
 * An API status as the words a pill says: `NO_SHOW` → "No show".
 *
 * Status pills say their state in words, in sentence case (brand file §7, §15)
 * — "Confirmed", not "CONFIRMED". The colour only reinforces the word, so the
 * word has to read as one.
 */
export function formatStatus(status: string): string {
    const words = status.toLowerCase().replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A booking's status as its pill says it (UX-078, owner 9 Oct): a confirmed
 * booking is "Booked" and a pending one "To confirm" — one word each, never
 * "Confirmed" or "Pending". Any other status reads as `formatStatus` does.
 */
export function bookingStatus(status: string): string {
    if (status === "CONFIRMED") return "Booked";
    if (status === "PENDING") return "To confirm";
    return formatStatus(status);
}
