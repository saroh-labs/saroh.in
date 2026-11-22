/** `path` with a page's `searchParams` kept, for a forward that loses nothing. */
export function withQuery(
    path: string,
    query: Record<string, string | string[] | undefined>,
): string {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        for (const v of Array.isArray(value) ? value : [value]) {
            if (v !== undefined) q.append(key, v);
        }
    }
    const s = q.toString();
    return s ? `${path}?${s}` : path;
}
