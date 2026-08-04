/**
 * The `?view=` contract, read once on the server.
 *
 * This is the other half of {@link DataFilter}: the API emits links like
 * `/leads?view=open` on Home, and every list screen resolves them the same way.
 * Reading it here rather than with `useSearchParams` inside `DataView` keeps the
 * primitive out of a Suspense boundary it does not otherwise need.
 *
 * Arrays collapse to the first entry rather than being rejected: `?view=a&view=b`
 * is a malformed URL, not an attack, and a screen that 500s on one is worse than
 * one that picks a sensible reading. An unknown id is handled downstream by
 * DataView, which falls back to the default filter rather than showing nothing.
 */
export type SearchParams = Record<string, string | string[] | undefined>;

export function viewParam(
    params: SearchParams | undefined,
): string | undefined {
    const raw = params?.view;
    return Array.isArray(raw) ? raw[0] : raw;
}
