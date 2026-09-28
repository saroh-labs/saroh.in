/**
 * How long a pack lasts from the day it is sold. A week is the least the API
 * takes (round-2 E13, default 46), so a form says so before it saves rather
 * than meeting a 400.
 */
export const MIN_VALIDITY_DAYS = 7;
export const MAX_VALIDITY_DAYS = 3650;

/** The API's own words for a validity under a week. */
export const VALIDITY_TOO_SHORT = "A pack is valid for at least 7 days";

/** What is wrong with a validity typed as text, or null when it will do. */
export function validityProblem(text: string): string | null {
    const trimmed = text.trim();
    if (!/^\d{1,4}$/.test(trimmed)) return "A whole number of days";
    const days = Number(trimmed);
    if (days < MIN_VALIDITY_DAYS) return VALIDITY_TOO_SHORT;
    if (days > MAX_VALIDITY_DAYS) return "At most 3650 days";
    return null;
}
