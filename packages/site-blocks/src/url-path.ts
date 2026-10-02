/**
 * Path helpers that stay linear on any input. `s.replace(/\/+$/, "")` reads
 * the same but backtracks quadratically on a long run of slashes that isn't
 * at the end, and a path or link is something a visitor or a merchant can
 * make as long as they like (CodeQL js/polynomial-redos, release #772).
 */

/** `s` without the slashes it ends with. */
export function trimTrailingSlashes(s: string): string {
    let end = s.length;
    while (end > 0 && s.charCodeAt(end - 1) === 47) end--;
    return end === s.length ? s : s.slice(0, end);
}
