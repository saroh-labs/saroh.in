/**
 * What the booking peek says about the person (E5, the "Saroh Bookings"
 * design): their phone, and their Needs attention (DEC-040).
 *
 * Pure, so the client peek and tests share it. The person is read on its own
 * (`peek-person.ts`), because `booking:read` carries a booking's name and
 * email only: the phone and Needs attention belong to `contact:read`. Until
 * that read answers, or when it can't, the peek says it doesn't know rather
 * than "No phone yet".
 */

export type AttentionKind = "ALLERGY" | "MEDICAL" | "ACCESS" | "OTHER";

/** One Needs attention entry, as C1's read gives it. */
export interface PeekAttentionEntry {
    id: string;
    kind: AttentionKind;
    label: string;
    sensitive: boolean;
}

/**
 * The entries this viewer may see, and how many sensitive ones they may not
 * (C1's `attentionFor`: those are counted, never shown).
 */
export interface PeekAttention {
    entries: PeekAttentionEntry[];
    hiddenSensitiveCount: number;
}

/** The person behind a booking, as far as this viewer may read them. */
export interface PeekPerson {
    /** The contact's phone; null when they have none. */
    phone: string | null;
    /** Null when Needs attention could not be read. */
    attention: PeekAttention | null;
}

const KIND_WORD: Record<AttentionKind, string> = {
    ALLERGY: "Allergy",
    MEDICAL: "Medical",
    ACCESS: "Access",
    OTHER: "Other",
};

/**
 * "Allergy: Peanuts · Access: Uses a wheelchair", then how many the viewer
 * can't see. Null when there is nothing to say, so the row is left out.
 */
export function attentionText(attention: PeekAttention | null): string | null {
    if (!attention) return null;
    const shown = attention.entries.map(
        (e) => `${KIND_WORD[e.kind]}: ${e.label}`,
    );
    const hidden = attention.hiddenSensitiveCount;
    if (hidden > 0) {
        const notes = hidden === 1 ? "note" : "notes";
        shown.push(
            shown.length
                ? `${hidden} more your role can't see`
                : `${hidden} ${notes} your role can't see`,
        );
    }
    return shown.length ? shown.join(" · ") : null;
}

export const NO_PHONE_ON_PAGE = "No phone yet — add it on their page";
export const NO_PHONE = "No phone yet";

/**
 * The Phone row. The number the booking was made with wins; then the
 * contact's. "No phone yet" only once the person has been read — while it is
 * loading, or when it can't be read, the row says "—".
 */
export function phoneText({
    bookerPhone,
    hasContact,
    person,
}: {
    bookerPhone: string | null;
    hasContact: boolean;
    /** The person's read; undefined while loading or when it failed. */
    person: PeekPerson | undefined;
}): string {
    const typed = bookerPhone?.trim();
    if (typed) return typed;
    if (!hasContact) return NO_PHONE;
    if (!person) return "—";
    const theirs = person.phone?.trim();
    if (theirs) return theirs;
    return NO_PHONE_ON_PAGE;
}
