/**
 * A section's own words that Ask AI may change (owner, 21 Nov; plan U42,
 * narrow): its heading, the line under it and its main button's label,
 * wherever the section's type keeps them. Pure, so a test reads it.
 */

export const SECTION_WORD_FIELDS = [
    "heading",
    "subheading",
    "button_label",
] as const;
export type SectionWordField = (typeof SECTION_WORD_FIELDS)[number];

/** Where each field lives in a section's content, first match wins. */
const PATHS: Record<SectionWordField, readonly (readonly string[])[]> = {
    heading: [["heading"], ["title"]],
    subheading: [["subheading"], ["intro"], ["lede"], ["subtitle"]],
    // A hero's button, or a Big button section's own label.
    button_label: [["cta", "label"], ["button", "label"], ["label"]],
};

function at(content: unknown, path: readonly string[]): unknown {
    let v: unknown = content;
    for (const k of path) {
        if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
        v = (v as Record<string, unknown>)[k];
    }
    return v;
}

/** The path a field is kept at in this content, or null when it has none. */
export function wordPath(
    content: unknown,
    field: SectionWordField,
): readonly string[] | null {
    return PATHS[field].find((p) => typeof at(content, p) === "string") ?? null;
}

/** The section's words, by field; a field it doesn't have is left out. */
export function sectionWords(
    content: unknown,
): Partial<Record<SectionWordField, string>> {
    const out: Partial<Record<SectionWordField, string>> = {};
    for (const field of SECTION_WORD_FIELDS) {
        const path = wordPath(content, field);
        if (path) out[field] = at(content, path) as string;
    }
    return out;
}

/** The content with these words set, each where the section keeps it. */
export function withWords(
    content: Record<string, unknown>,
    words: Partial<Record<SectionWordField, string>>,
): { content: Record<string, unknown>; missing: SectionWordField[] } {
    const next = structuredClone(content);
    const missing: SectionWordField[] = [];
    for (const field of SECTION_WORD_FIELDS) {
        const value = words[field];
        if (value === undefined) continue;
        const path = wordPath(next, field);
        if (!path) {
            missing.push(field);
            continue;
        }
        let parent = next;
        for (const k of path.slice(0, -1)) {
            parent = parent[k] as Record<string, unknown>;
        }
        parent[path[path.length - 1]] = value;
    }
    return { content: next, missing };
}
