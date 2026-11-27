// The stand-in publish list `check-draft-words.mjs` answers the build with,
// shared with `docs-content.test.ts`, which proves (in CI, on today's
// content) that the build really holds HELD back. A held page that starts
// passing its checks makes that test fail, not the slow check.

export const LIVE_FOR = "/for/salons";
export const LIVE_FOR_TOO = "/for/gyms";
// Its component has words of its own to look for (`codeMarkersOf`).
export const LIVE_TOOL = "/tools/wifi-qr-code-generator";
export const LIVE = [LIVE_FOR, LIVE_FOR_TOO, LIVE_TOOL];
/**
 * Live, but held by its checks: its words link to
 * /tools/cancellation-policy-generator, which isn't live here. Not a GST
 * page held for unconfirmed facts: every fact was confirmed on 15 Nov 2026
 * (ecd6cfcce), so such a page now builds, as it should.
 */
export const HELD = "/guides/reduce-no-shows";
