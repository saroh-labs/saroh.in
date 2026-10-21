/**
 * The owner's own cut-off line for the shop ("Order by 9 pm", DEC-172,
 * U11): the words they wrote on a Product grid section, the first one on
 * the site that has any. Plain text, theirs, shown only when written; Saroh
 * never works it out or enforces it (a real cut-off is Phase 2).
 *
 * The built-in shop at `/shop` has no sections of its own, so it says the
 * line the owner wrote on their shop's grid elsewhere on the site.
 */
export function shopCutOff(snapshot: {
    pages: readonly {
        isHome?: boolean;
        sections: readonly { type: string; content: unknown }[];
    }[];
}): string | null {
    // The home page first: it is where a shop's grid usually sits.
    const pages = [...snapshot.pages].sort(
        (a, b) => Number(b.isHome === true) - Number(a.isHome === true),
    );
    for (const page of pages) {
        for (const section of page.sections) {
            if (section.type !== "productGrid") continue;
            const content = section.content;
            if (typeof content !== "object" || content === null) continue;
            const cutOff = (content as { cutOff?: unknown }).cutOff;
            if (typeof cutOff === "string" && cutOff.trim()) {
                return cutOff.trim();
            }
        }
    }
    return null;
}
