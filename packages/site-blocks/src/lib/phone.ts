import { phoneLabel } from "@saroh/block-contract";

/**
 * A business's public phone as a visitor reads it (DEC-053).
 *
 * The API stores and serves it as E.164 ("+918040992210"), which is what a
 * `tel:` link wants and what nobody can read at a glance. On the page it
 * is grouped as everywhere in Saroh (#1036, `phoneLabel` in
 * `@saroh/block-contract`): "+91 80409 92210", "+1 415 555 0100". A value
 * that can't be read as a number is shown as it came.
 *
 * One helper for every public surface — the Visit us Call button (G8) and the
 * booking page's header (E6) — so the two never show one number two ways.
 */

/**
 * A phone a customer types (the bag's delivery address, the booking page):
 * digits with the spaces, brackets and dashes people write them with, an
 * optional leading +, and six digits at least. The API's rule, word for
 * word (`common/customer-phone.ts`), so the page never lets through what
 * the server then refuses.
 */
export function phoneOk(value: string): boolean {
    const phone = value.trim();
    return (
        /^\+?[\d\s()-]{6,24}$/.test(phone) &&
        phone.replace(/\D/g, "").length >= 6
    );
}

export function phoneText(phone: string): string {
    return phoneLabel(phone);
}
