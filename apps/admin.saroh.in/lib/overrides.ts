/**
 * Client-safe words and conversions for a business's catalogue overrides
 * (pricing U11). The API decides and validates; these only shape what an
 * operator types into what it takes, and say an override back in words.
 */

/**
 * Rupees as typed ("1,250" or "1250.5") to whole paise, without floating
 * point. Null when it isn't an amount (more than two decimals, a sign, a
 * letter).
 */
export function rupeesToPaise(text: string): number | null {
    const t = text.replace(/[,\s₹]/g, "");
    const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(t);
    if (!m) return null;
    const fraction = m[2] as string | undefined;
    const paise = (fraction ?? "").padEnd(2, "0");
    return Number(m[1]) * 100 + Number(paise);
}

/**
 * The end of a date-only value ("2026-12-31") in India time, as ISO: an
 * override "until" a date lasts through that day.
 */
export function endOfDayIso(date: string): string | undefined {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
    const at = new Date(`${date}T23:59:59.999+05:30`);
    return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

const KIND_WORDS: Record<string, string> = {
    grant: "Granted",
    remove: "Removed",
    limit: "Limit set",
    price: "Custom price",
    plan: "On a plan",
    raise: "Limit raised",
};

/** "Granted", "Limit set", … for an override's kind. */
export function overrideKindWords(kind: string): string {
    return KIND_WORDS[kind] ?? kind;
}
