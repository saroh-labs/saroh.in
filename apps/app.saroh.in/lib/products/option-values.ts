/**
 * Values typed in the product editor for an option ("S, M, L"), UX-062:
 * split on commas or new lines, trimmed, blanks and repeats dropped (case
 * aside), and none the option already has.
 */
export function parseOptionValues(
    typed: string,
    existing: readonly string[] = [],
): string[] {
    const seen = new Set(existing.map((v) => v.trim().toLowerCase()));
    const out: string[] = [];
    for (const part of typed.split(/[,\n]/)) {
        const value = part.trim().replace(/\s+/g, " ");
        const key = value.toLowerCase();
        if (!value || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}
