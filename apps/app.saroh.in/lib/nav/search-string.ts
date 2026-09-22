/** A page's search params back as `?a=1&b=2`, or "" when there are none. */
export function searchString(
    query: Record<string, string | string[] | undefined>,
): string {
    const out = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        for (const v of Array.isArray(value) ? value : [value]) {
            if (v !== undefined) out.append(key, v);
        }
    }
    const s = out.toString();
    return s ? `?${s}` : "";
}
