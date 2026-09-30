/**
 * What the Test release bar (`components/test-release-bar.tsx`) and the
 * tenant layout share (DEC-071, T5). In a module of its own, with no
 * "use client": a server file that imports a value from a client module
 * gets a client reference, not the value (`lib/server-imports.test.ts`).
 */

/**
 * What stays live on a test release (R6). Shared with the editor's "Make a
 * test release" sheet (T11) through `@saroh/site-blocks`, so the two never
 * say it differently.
 */
export { LIVE_OUTSIDE_RELEASE } from "@saroh/site-blocks/test-release-words";

/** The CSS variable the bar keeps at its own height. */
export const BAR_HEIGHT_VAR = "--test-release-bar-h";

/**
 * The one rule that keeps the site's sticky header below the bar rather
 * than under it. The fallback is the bar's one-line height, for the moment
 * before the bar has measured itself.
 */
export const HEADER_BELOW_BAR = `[data-test-release] header.sticky{top:var(${BAR_HEIGHT_VAR},2.25rem)}`;
