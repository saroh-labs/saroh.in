/**
 * The routes on React Query that live refresh reads again by invalidating
 * their queries instead of `router.refresh()` (DEC-259), and the domains
 * each one shows. A route is added here in the unit that moves it to React
 * Query; a route not listed keeps today's `router.refresh()`.
 *
 * Keys are route globs: an exact path, with `[param]` for one segment
 * (`/commerce/orders/[orderId]`). Pure and client-safe.
 */
export const LIVE_QUERY_ROUTES: Readonly<Record<string, readonly string[]>> =
    {};

/** Whether `pathname` is the route `glob` names. */
export function matchRoute(glob: string, pathname: string): boolean {
    const want = trim(glob).split("/");
    const got = trim(pathname).split("/");
    return (
        want.length === got.length &&
        want.every(
            (part, i) =>
                part === got[i] || (/^\[[^/\]]+\]$/.test(part) && !!got[i]),
        )
    );
}

/** The domains a live refresh invalidates on this page, or null: not on React Query. */
export function liveDomains(
    pathname: string | null | undefined,
    routes: Readonly<Record<string, readonly string[]>> = LIVE_QUERY_ROUTES,
): readonly string[] | null {
    if (!pathname) return null;
    const hit = Object.keys(routes).find((glob) => matchRoute(glob, pathname));
    return hit ? (routes[hit] ?? null) : null;
}

function trim(path: string): string {
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}
