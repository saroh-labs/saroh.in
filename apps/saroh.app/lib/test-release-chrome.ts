/**
 * What the Test release bar (`components/test-release-bar.tsx`) and the
 * tenant layout share (DEC-071, T5). In a module of its own, with no
 * "use client": a server file that imports a value from a client module
 * gets a client reference, not the value (`lib/server-imports.test.ts`).
 */

/** What stays live on a test release (R6), in the words the sheet uses. */
export const LIVE_OUTSIDE_RELEASE = [
    "Products, prices and stock",
    "Plans and packs",
    "Opening hours",
    "Where your online shop sells from",
    "Posts",
    "Which parts of your business are switched on",
] as const;

/** The CSS variable the bar keeps at its own height. */
export const BAR_HEIGHT_VAR = "--test-release-bar-h";

/**
 * The one rule that keeps the site's sticky header below the bar rather
 * than under it. The fallback is the bar's one-line height, for the moment
 * before the bar has measured itself.
 */
export const HEADER_BELOW_BAR = `[data-test-release] header.sticky{top:var(${BAR_HEIGHT_VAR},2.25rem)}`;
