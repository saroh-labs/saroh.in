/**
 * Whether the person collapsed the rail to icons (2026-09-25). A cookie, not
 * localStorage, so `AppShell` reads it on the server and the rail is drawn at
 * the right width from the first paint rather than jumping after hydration.
 * A per-browser preference: nothing else depends on it.
 */
export const RAIL_COOKIE = "saroh_rail";
export const RAIL_COLLAPSED = "collapsed";

/** Remember the choice for a year, on this browser only. */
export function rememberRail(collapsed: boolean): void {
    document.cookie = `${RAIL_COOKIE}=${collapsed ? RAIL_COLLAPSED : "expanded"}; path=/; max-age=31536000; samesite=lax`;
}
