/**
 * The one list of titles that come before a name and aren't what anyone
 * is called by (lower case, without the full stop), and the one rule for
 * a name's initials. The avatar draws with it, and the apps' `initials()`
 * delegate to it, so "Dr. Arun Kumar Pillai" is "AP" everywhere.
 *
 * Pure: no React, no DOM.
 */
export const NAME_TITLES: ReadonlySet<string> = new Set([
    "dr",
    "mr",
    "mrs",
    "ms",
    "mx",
    "miss",
    "prof",
    "shri",
    "sri",
    "smt",
]);

/** "Dr." and "dr" are titles; "Drew" is not. */
export function isNameTitle(word: string): boolean {
    return NAME_TITLES.has(word.replace(/\.$/, "").toLowerCase());
}

/**
 * Two letters from a name: the first and last words past any title
 * ("Dr. Arun Kumar Pillai" is "AP"), the first two letters of one word
 * ("Zara" is "ZA"), or the first of an email when there is no name, else
 * "?".
 */
export function nameInitials(
    name: string | null | undefined,
    email?: string,
): string {
    // Words that start with a letter: "Priya (reviewer)" is "PR", not "P(".
    const words = (name ?? "")
        .trim()
        .split(/[\s&]+/)
        .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w));
    // A title isn't what anyone is called by: "Dr. Arun Pillai" is "AP".
    const named = words.filter((w) => !isNameTitle(w));
    if (named.length > 0 && named.length < words.length) {
        words.splice(0, words.length, ...named);
    }
    const first = words.at(0) ?? "";
    const last = words.at(-1) ?? "";
    if (words.length >= 2) return `${first[0]}${last[0]}`.toUpperCase();
    if (first) return first.slice(0, 2).toUpperCase();
    return (email ?? "?").slice(0, 1).toUpperCase();
}
