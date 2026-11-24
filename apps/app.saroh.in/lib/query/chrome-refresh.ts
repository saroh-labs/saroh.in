import { matchRoute } from "@/lib/query/live-routes";

/**
 * React Query routes that still `router.refresh()` on a live refresh,
 * because what changes there is server-rendered chrome: the unread count,
 * the tab title, module badges, the open business's name (DEC-259). At
 * most 6 entries; the last unit of the move retires the list.
 */
export const CHROME_REFRESH_ROUTES: readonly string[] = [
    // Home: the tab title's unread count is the shell's.
    "/",
];

/** The cap on {@link CHROME_REFRESH_ROUTES}. */
export const CHROME_REFRESH_CAP = 6;

export function isChromeRefresh(
    pathname: string | null | undefined,
    routes: readonly string[] = CHROME_REFRESH_ROUTES,
): boolean {
    return !!pathname && routes.some((glob) => matchRoute(glob, pathname));
}
