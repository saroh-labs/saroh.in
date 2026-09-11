/**
 * Where the public API lives.
 *
 * These blocks read `apps/saroh.app`'s typed env directly when they lived
 * there. A package cannot do that, and should not: the same components now
 * render in the site editor's preview and in the ui.saroh.in catalog, which
 * have different answers — and, in the catalog's case, no answer at all,
 * because nothing there submits anything.
 *
 * So it arrives as a prop, defaulted to production. That default is not a
 * convenience: it is exactly what the old `?? "https://api.saroh.in"` fallback
 * did, so a consumer that forgets to pass one behaves as the live site always
 * has, rather than posting to `undefined/public/...`.
 */
export const DEFAULT_API_URL = "https://api.saroh.in";
