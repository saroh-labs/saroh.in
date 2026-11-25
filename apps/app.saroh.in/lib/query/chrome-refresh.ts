import { matchRoute } from "@/lib/query/live-routes";

/**
 * React Query routes that still `router.refresh()` on a live refresh,
 * because what changes there is server-rendered chrome: the unread count,
 * the tab title, module badges, the open business's name (DEC-259). At
 * most 6 entries; the last unit of the move retires the list.
 */
export const CHROME_REFRESH_ROUTES: readonly string[] = [
    // Empty since the shell reads its unread count and badges in the
    // browser (`/api/shell/live`, owner 25 Nov 2026): Home no longer needs
    // a server render for the tab title.
];

/** The cap on {@link CHROME_REFRESH_ROUTES}. */
export const CHROME_REFRESH_CAP = 6;

export function isChromeRefresh(
    pathname: string | null | undefined,
    routes: readonly string[] = CHROME_REFRESH_ROUTES,
): boolean {
    return !!pathname && routes.some((glob) => matchRoute(glob, pathname));
}
