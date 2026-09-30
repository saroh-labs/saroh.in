/**
 * What stays live on a test release (DEC-071, R6), in one place for both
 * sides of it: the Test release bar on the merchant's site (`apps/saroh.app`,
 * T5) and the editor's "Make a test release" sheet (`apps/app.saroh.in`,
 * T11). Both apps depend on this package, so the list is shared, never
 * copied; a subpath export keeps it out of the blocks' own index.
 *
 * These come from the live business, not from the release: they have their
 * own publish, or none, so a test release reads them as the live site does.
 */
export const LIVE_OUTSIDE_RELEASE = [
    "Products, prices and stock",
    "Plans and packs",
    "Opening hours",
    "Where your online shop sells from",
    "Posts",
    "Which parts of your business are switched on",
] as const;
