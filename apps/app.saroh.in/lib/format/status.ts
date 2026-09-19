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
