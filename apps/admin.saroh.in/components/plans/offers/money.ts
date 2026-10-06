/**
 * Rupees as the operator types them, to and from the catalogue's integer
 * paise (KTD-18). Parsed as text, never through floating point, so "12.10"
 * is 1210 paise and not 1209.
 */

const RUPEES = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

/** "1200" or "12.5" → paise; null for anything that isn't an amount. */
export function rupeesToPaise(text: string): number | null {
    const m = RUPEES.exec(text.trim().replace(/,/g, ""));
    if (!m) return null;
    const whole = Number(m[1]);
    const frac = Number((m.at(2) ?? "").padEnd(2, "0"));
    return whole * 100 + frac;
}

/** Paise → the field's text: whole rupees plain, paise only when there are some. */
export function paiseToRupees(paise: number): string {
    const whole = Math.floor(paise / 100);
    const frac = paise % 100;
    return frac === 0
        ? String(whole)
        : `${whole}.${String(frac).padStart(2, "0")}`;
}
