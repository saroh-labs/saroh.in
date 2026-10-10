/**
 * Two small rules the Share screen's read leans on, pure so they are
 * tested without a request: which of a business's sites the screen is
 * about, and the initials that stand in for a logo.
 */

/**
 * The business's own site. A business has one website (ADR-006); where it
 * has more, the screen works on the one whose subdomain is the business's
 * web address (the same rule `siteAddressOf` uses to decide which site
 * wears the custom domain), else the first the API lists, which is the one
 * the rail's Website row opens.
 */
export function pickShareSite<T extends { subdomain?: string | null }>(
    sites: readonly T[],
    address: string | null | undefined,
): T | null {
    return (
        (address ? sites.find((s) => s.subdomain === address) : undefined) ??
        sites.at(0) ??
        null
    );
}

/** "Glow Studio" → "GS"; one word gives its first two letters. */
export function initialsOf(name: string): string {
    // A word is anything left once ASCII punctuation is taken away, so "&"
    // is skipped and a name in another script still gives its letters.
    const words = name
        .trim()
        .split(/\s+/)
        .map((w) => w.replace(/[!-/:-@[-`{-~]/g, ""))
        .filter((w) => w !== "");
    const letters =
        words.length > 1
            ? words.slice(0, 2).map((w) => Array.from(w)[0] ?? "")
            : Array.from(words[0] ?? "").slice(0, 2);
    return letters.join("").toUpperCase();
}
