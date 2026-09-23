/**
 * The SKU pattern (#484): how the editor suggests a SKU. Pure — the app
 * keeps an identical copy (`apps/app.saroh.in/lib/products/sku-pattern.ts`)
 * for the editor's placeholder, and both are tested against the same cases.
 *
 * {NAME3}  first three letters of the name's first word ("SKU" if none)
 * {CAT}    three letters of the category ("GEN" if none)
 * {VALUE}  four characters of the variant's option value
 * {N}      the product's number in the catalogue, two digits: 01, 02…
 */

export const DEFAULT_SKU_PATTERN = "{NAME3}{N}-{VALUE}";
export const SKU_PATTERN_MAX = 40;

const TOKENS = /\{(NAME3|CAT|VALUE|N)\}/g;

const code = (x: string, n: number) =>
    x
        .normalize("NFKD")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, n);

export interface SkuParts {
    name: string;
    category: string;
    value: string;
    /** The product's number in the catalogue, from 1. */
    n: number;
}

export function skuFrom(pattern: string, parts: SkuParts): string {
    return pattern
        .replace(
            /\{NAME3\}/g,
            code(parts.name.split(/\s+/)[0] ?? "", 3) || "SKU",
        )
        .replace(/\{CAT\}/g, code(parts.category, 3) || "GEN")
        .replace(/\{VALUE\}/g, code(parts.value, 4))
        .replace(/\{N\}/g, String(Math.max(1, parts.n)).padStart(2, "0"))
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");
}

/** What is wrong with a pattern on its own, in the order it is checked. */
export function patternProblem(raw: string): string {
    const pattern = raw.trim();
    if (!pattern) return "A pattern needs at least one part.";
    if (pattern.length > SKU_PATTERN_MAX)
        return `Keep it under ${SKU_PATTERN_MAX} characters.`;
    if (!new RegExp(TOKENS.source).test(pattern))
        return "Use at least one part in braces, or every product gets the same SKU.";
    if (/[^A-Za-z0-9{}\-_]/.test(pattern.replace(TOKENS, "")))
        return "Letters, numbers, - and _ only, outside the parts.";
    if (/\{(?!(NAME3|CAT|VALUE|N)\})[^}]*\}/.test(pattern))
        return "Only {NAME3}, {CAT}, {VALUE} and {N} are understood.";
    return "";
}

/**
 * "3 variants would share SER01. Add {VALUE} so each one differs." — or ""
 * when every suggestion is distinct.
 */
export function clashProblem(pattern: string, suggestions: string[]): string {
    const seen: Partial<Record<string, number>> = {};
    for (const s of suggestions) seen[s] = (seen[s] ?? 0) + 1;
    const shared = suggestions.filter((s) => (seen[s] ?? 0) > 1);
    if (shared.length === 0) return "";
    const fix = pattern.includes("{N}") ? "{VALUE}" : "{N}";
    return `${shared.length} variants would share ${shared[0]}. Add ${fix} so each one differs.`;
}
