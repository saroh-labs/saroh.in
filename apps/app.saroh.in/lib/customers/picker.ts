/**
 * The customer picker's rules (E4), pure so the client component and tests
 * share them. Nothing here normalises a phone or an email for matching: the
 * API does, with C2's `duplicates.ts`, so bookings and orders can't drift.
 * What is here only reads what was typed into the fields it belongs in.
 */

/** Why a search result is exactly what was typed (C2's rules, on the API). */
export type ExactOn = "email" | "phone";

/** One person the search found, as `GET contacts/search` answers. */
export interface CustomerSearchResult {
    id: string;
    name: string | null;
    /** Never a placeholder. */
    email: string | null;
    phone: string | null;
    /** The last booking or payment, ISO. */
    lastSeenAt: string | null;
    exactOn: ExactOn[];
}

/** A search, or why there is none: not allowed, or it failed. */
export type CustomerSearch =
    | { ok: true; results: CustomerSearchResult[] }
    | { ok: false; forbidden: boolean };

/** Who the picker settled on. */
export type CustomerPick =
    | {
          kind: "contact";
          id: string;
          name: string | null;
          email: string | null;
          phone: string | null;
      }
    /** Someone new: made a contact by whatever saves the booking or order. */
    | { kind: "new"; name: string; email: string; phone: string }
    /** No record at all (B13's walk-in): a name, and a phone if given. */
    | { kind: "walk-in"; name: string; phone: string };

/** The fields "add new" opens with. */
export interface NewCustomerDraft {
    name: string;
    phone: string;
    email: string;
}

/** Shortest query that offers "+ Add". */
export const MIN_ADD_LENGTH = 2;

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only what a phone number is written with. */
const PHONE_ONLY = /^[\d\s+().-]+$/;

/**
 * What was typed, put in the field it belongs in: an email to Email, a
 * number to Phone, anything else to Name (each word capitalised, as people
 * type names in a hurry).
 */
export function draftFromTyped(typed: string): NewCustomerDraft {
    const text = typed.trim();
    if (text.includes("@")) return { name: "", phone: "", email: text };
    if (PHONE_ONLY.test(text) && text.replace(/\D/g, "").length >= 5) {
        return { name: "", phone: text, email: "" };
    }
    return {
        name: text.replace(
            /(^|\s)([a-z])/g,
            (_, gap: string, c: string) => `${gap}${c.toUpperCase()}`,
        ),
        phone: "",
        email: "",
    };
}

/**
 * Offer "+ Add ‹typed›" once two characters are typed and nobody found has
 * exactly that name.
 */
export function offerAdd(
    typed: string,
    results: readonly CustomerSearchResult[],
): boolean {
    const text = typed.trim();
    if (text.length < MIN_ADD_LENGTH) return false;
    const lower = text.toLowerCase();
    return !results.some((r) => r.name?.toLowerCase() === lower);
}

export function addLabel(typed: string): string {
    return `+ Add “${typed.trim()}” as a new customer`;
}

/** The first result that is exactly this email or phone, if any. */
export function exactly(
    results: readonly CustomerSearchResult[],
    on: ExactOn,
): CustomerSearchResult | undefined {
    return results.find((r) => r.exactOn.includes(on));
}

/** What a chip says for someone found. */
export function resultLabel(r: {
    name: string | null;
    email: string | null;
    phone: string | null;
}): string {
    return r.name ?? r.email ?? r.phone ?? "No name yet";
}

/** A result as a pick. */
export function pickOf(r: CustomerSearchResult): CustomerPick {
    return {
        kind: "contact",
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
    };
}

/** What the picked person is called. */
export function pickName(pick: CustomerPick): string {
    if (pick.kind === "contact") return resultLabel(pick);
    return pick.name.trim() || ("email" in pick ? pick.email : "") || "them";
}
