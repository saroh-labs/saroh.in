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

/** The variant's value as {VALUE} shortens it: "Hindi · Paperback" is HIND. */
export function valueCode(value: string): string {
    return code(value, 4);
}

/**
 * The SKU the pattern gives. With `taken` (the SKUs already in use, any
 * case), a SKU that is taken gets -2, -3… until it is free, so two values
 * that shorten alike ("Hindi · Paperback", "Hindi · Hardcover") still get
 * two SKUs.
 */
export function skuFrom(
    pattern: string,
    parts: SkuParts,
    taken?: Iterable<string>,
): string {
    const base = pattern
        .replace(
            /\{NAME3\}/g,
            code(parts.name.split(/\s+/)[0] ?? "", 3) || "SKU",
        )
        .replace(/\{CAT\}/g, code(parts.category, 3) || "GEN")
        .replace(/\{VALUE\}/g, valueCode(parts.value))
        .replace(/\{N\}/g, String(Math.max(1, parts.n)).padStart(2, "0"))
        .replace(/--+/g, "-")
        .replace(/^-|-$/g, "");
    if (!taken) return base;
    const used = new Set<string>();
    for (const t of taken) used.add(t.toLowerCase());
    return freeSku(base, used);
}

function freeSku(base: string, used: Set<string>): string {
    if (!base || !used.has(base.toLowerCase())) return base;
    let i = 2;
    while (used.has(`${base}-${i}`.toLowerCase())) i += 1;
    return `${base}-${i}`;
}

/**
 * The same SKUs, each one once: the first keeps its SKU and every later
 * one that shares it gets -2, -3… — what the editor would suggest.
 */
export function distinctSkus(skus: string[]): string[] {
    const used = new Set<string>();
    return skus.map((s) => {
        const free = freeSku(s, used);
        if (free) used.add(free.toLowerCase());
        return free;
    });
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

/** One variant (or a product with none) as the pattern would name it. */
export interface SkuClashRow {
    productId: string;
    product: string;
    /** The variant's value; "" for a product with no variants. */
    variant: string;
    /** The SKU the pattern gives, before any -2, -3. */
    sku: string;
}

/**
 * Advice when two variants would share a SKU, said from what is actually
 * missing — or "" when every SKU differs. Never a block: the editor adds
 * -2, -3 to tell them apart (`skuFrom` with `taken`).
 *
 *  - {VALUE} is there, and two values shorten alike: "Hindi · Paperback and
 *    Hindi · Hardcover both shorten to HIND. The editor will add -2, -3 to
 *    tell them apart."
 *  - Two products share it and there is no {N}: add {N}, or take -2, -3.
 *  - Two variants of one product share it and there is no {VALUE}: add
 *    {VALUE}, or take -2, -3.
 */
export function clashAdvice(pattern: string, rows: SkuClashRow[]): string {
    // A string by type, and checked again here: every route passes the
    // query through `single()`, which refuses an array, but this is where an
    // array would change what `includes` means (CodeQL
    // js/type-confusion-through-parameter-tampering, release #772).
    const p = typeof pattern === "string" ? pattern : "";
    const groups = new Map<string, SkuClashRow[]>();
    for (const r of rows) {
        if (!r.sku) continue;
        const key = r.sku.toLowerCase();
        groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const shared = [...groups.values()].find((g) => g.length > 1);
    if (!shared) return "";
    const [a, b] = shared as [SkuClashRow, SkuClashRow];
    const apart = "The editor will add -2, -3 to tell them apart";
    const label = (r: SkuClashRow) =>
        r.variant ? `${r.product} · ${r.variant}` : r.product;

    if (
        p.includes("{VALUE}") &&
        a.variant &&
        b.variant &&
        a.variant.toLowerCase() !== b.variant.toLowerCase()
    ) {
        return `${a.variant} and ${b.variant} both shorten to ${valueCode(a.variant)}. ${apart}.`;
    }
    if (a.productId !== b.productId && !p.includes("{N}")) {
        return `${a.product} and ${b.product} both get ${a.sku}. ${apart}, or add {N} to number each product.`;
    }
    if (a.productId === b.productId && !p.includes("{VALUE}")) {
        return `${label(a)} and ${label(b)} both get ${a.sku}. ${apart}, or add {VALUE} to use each variant's name.`;
    }
    return `${label(a)} and ${label(b)} both get ${a.sku}. ${apart}.`;
}
