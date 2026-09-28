/**
 * A business's public phone as a visitor reads it (DEC-053).
 *
 * The API stores and serves it as E.164 ("+918040992210"), which is what a
 * `tel:` link wants and what nobody can read at a glance. On the page an
 * Indian number is grouped the way it is usually written, "+91 80409
 * 92210"; any other number is shown as it came, since grouping differs by
 * country and a wrong guess reads worse than none. A value that isn't E.164
 * at all (a sample typed with spaces) is left alone.
 *
 * One helper for every public surface — the Visit us Call button (G8) and the
 * booking page's header (E6) — so the two never show one number two ways.
 */
const INDIA = /^\+91(\d{5})(\d{5})$/;

export function phoneText(phone: string): string {
    const india = INDIA.exec(phone);
    return india ? `+91 ${india[1]} ${india[2]}` : phone;
}
