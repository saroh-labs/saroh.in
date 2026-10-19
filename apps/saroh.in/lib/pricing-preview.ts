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

/**
 * How the draft preview is looked at (admin redesign U13, R24): the draft
 * or what is live now, at desktop or phone width, with what changed marked
 * or not. It lives in the address so the server draws it; `frame` is the
 * phone-width page drawn inside the preview's own phone frame.
 */
export interface PreviewView {
    show: "draft" | "live";
    width: "desktop" | "phone";
    marks: boolean;
    frame: boolean;
}

type Params = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
    return Array.isArray(v) ? v[0] : v;
}

export function previewViewFrom(params: Params): PreviewView {
    return {
        show: one(params.show) === "live" ? "live" : "draft",
        width: one(params.width) === "phone" ? "phone" : "desktop",
        marks: one(params.marks) !== "off",
        frame: one(params.frame) === "1",
    };
}

/** The address for a view; the defaults are left out. */
export function previewHref(view: PreviewView): string {
    const q = new URLSearchParams();
    if (view.show === "live") q.set("show", "live");
    if (view.width === "phone") q.set("width", "phone");
    if (!view.marks) q.set("marks", "off");
    if (view.frame) q.set("frame", "1");
    const s = q.toString();
    return s ? `${PREVIEW_COOKIE_PATH}?${s}` : PREVIEW_COOKIE_PATH;
}
