import type { PageKind, Section, SectionType } from "@/lib/sites/service";

/**
 * "Suggested for this page" in Rail › Add (U46e, `fix/WXBAdd`): a fixed
 * table of what a page of each kind usually has, less what this page
 * already has and what this business can't add. No guessing: a free page
 * gets the table's general row, and only a module page's row is said as
 * "<kind> pages often have these".
 */
const USUAL: Record<PageKind, readonly SectionType[]> = {
    FREE: ["booking", "faq", "testimonials", "cta"],
    SHOP: ["productGrid", "testimonials", "faq"],
    BOOK: ["booking", "servicesList", "faq", "hours"],
    PRICES: ["plans", "faq", "testimonials"],
    JOURNAL: ["journal", "enquiry"],
    CONTACT: ["visitUs", "enquiry", "hours"],
};

/** At most this many, as the board draws. */
const MAX = 3;

export function suggestedSections(
    kind: PageKind,
    sections: readonly Pick<Section, "type">[],
    addable: readonly SectionType[],
): { types: SectionType[]; matched: boolean } {
    const has = new Set(sections.map((s) => s.type));
    const can = new Set(addable);
    const types = USUAL[kind]
        .filter((t) => can.has(t) && !has.has(t))
        .slice(0, MAX);
    return { types, matched: kind !== "FREE" && types.length > 0 };
}

const RECENT_KEY = "saroh.editor.recentSections";

/** The sections this browser added last, newest first; [] when storage throws. */
export function readRecent(): SectionType[] {
    try {
        const raw = window.localStorage.getItem(RECENT_KEY);
        const list: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(list)
            ? list.filter((t): t is SectionType => typeof t === "string")
            : [];
    } catch {
        return [];
    }
}

export function rememberRecent(type: SectionType): void {
    try {
        const next = [type, ...readRecent().filter((t) => t !== type)];
        window.localStorage.setItem(
            RECENT_KEY,
            JSON.stringify(next.slice(0, MAX)),
        );
    } catch {
        // A browser that keeps nothing simply has no Recent.
    }
}
