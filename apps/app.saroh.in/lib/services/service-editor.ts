/**
 * The Services editor's rules (U16, the design's `?view=services`): what a
 * service needs before it can be saved, and what a change does to bookings
 * already made. Pure, so the dialog and its tests agree.
 */

export type ServiceKind = "one" | "class";

/** The dialog's fields, as typed. */
export interface ServiceDraft {
    kind: ServiceKind;
    name: string;
    minutes: string;
    gap: string;
    /** Rupees as typed: "1200", "1,200", "499.50" or blank for free. */
    price: string;
    places: string;
    staffIds: string[];
}

/** Whole minutes from a field, or 0. */
export function wholeNumber(value: string): number {
    const n = Number(value.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

/**
 * Rupees as typed to paise, without floating point: "1,200.5" → 120050.
 * Blank is null (free); anything else that is not an amount is NaN.
 */
export function toMinor(value: string): number | null {
    const clean = value.replace(/[,\s₹]/g, "");
    if (!clean) return null;
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
    if (!match) return Number.NaN;
    const [, whole = "0", fraction = ""] = match;
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Paise back to what the field shows: 120050 → "1200.50", 120000 → "1200". */
export function fromMinor(minor: number | null): string {
    if (minor === null) return "";
    const whole = Math.floor(minor / 100);
    const paise = minor % 100;
    return paise ? `${whole}.${String(paise).padStart(2, "0")}` : String(whole);
}

/**
 * Why the draft cannot be saved, or null. Nobody taking it is refused only
 * when the business has people on the diary; with none, a service keeps its
 * own weekly hours, as before staff existed.
 */
export function serviceRefusal(
    draft: ServiceDraft,
    hasStaff: boolean,
): string | null {
    if (!draft.name.trim()) return "A service needs a name.";
    if (wholeNumber(draft.minutes) < 15) return "Make it at least 15 minutes.";
    if (Number.isNaN(toMinor(draft.price))) {
        return "Write the price as a number of rupees, like 1200.";
    }
    if (hasStaff && draft.staffIds.length === 0) return "Pick who takes it.";
    if (draft.kind === "class" && wholeNumber(draft.places) < 2) {
        return "A class needs at least 2 places.";
    }
    return null;
}

/**
 * What saving a change means for bookings already made, in words — or ""
 * when nothing about them changes. Prices and lengths apply to new bookings
 * only; a booking keeps the terms it was made on.
 */
export function changeNote(
    before: { priceCents: number | null; durationMinutes: number } | null,
    draft: ServiceDraft,
    comingUp: number,
): string {
    if (!before) return "";
    const notes: string[] = [];
    const price = toMinor(draft.price);
    if (!Number.isNaN(price) && price !== before.priceCents) {
        notes.push(
            comingUp
                ? `The new price applies to bookings made from now; ${comingUp === 1 ? "the 1 already booked keeps the price it was booked at" : `the ${comingUp} already booked keep the price they were booked at`}.`
                : "The new price applies to bookings made from now.",
        );
    }
    if (wholeNumber(draft.minutes) !== before.durationMinutes) {
        notes.push(
            "A new length only changes new bookings; free times on the calendar update when you save.",
        );
    }
    return notes.join(" ");
}
