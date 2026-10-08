/**
 * The draft preview's moving parts (plans catalogue U24, KTD-10): the
 * cookie `/pricing/preview` swaps the staff token into, and the headers every
 * preview response carries.
 */

/** HttpOnly; holds the API's preview token, never read by the browser. */
export const PREVIEW_COOKIE = "saroh_pricing_preview";

/** The draft page, and the only path the cookie is sent to. */
export const PREVIEW_COOKIE_PATH = "/pricing/draft";

/** A token lives at most 15 minutes (the API's rule); the cookie no longer. */
export const PREVIEW_MAX_AGE_SECONDS = 15 * 60;

/** Never cached, never indexed, never sent on as a referrer. */
export const PREVIEW_HEADERS = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
} as const;

/** Paths where Google Analytics does not load: a preview is not a visit. */
export function isPreviewPath(pathname: string | null): boolean {
    return (
        pathname === PREVIEW_COOKIE_PATH ||
        pathname === "/pricing/preview" ||
        (pathname?.startsWith(`${PREVIEW_COOKIE_PATH}/`) ?? false)
    );
}
