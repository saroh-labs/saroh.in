import { describe, expect, it } from "vitest";

import nextConfig from "../next.config.js";

/**
 * The router's own copy of a page is kept 30 s (React Query plan U6a). It is
 * experimental, so an upgrade or a tidy-up could drop it quietly; the e2e
 * `router-cache.spec.ts` checks the copy never outlives a switch, a sign-out
 * or a write.
 */
describe("router cache", () => {
    it("keeps a dynamic page's payload for 30 s", () => {
        expect(nextConfig.experimental?.staleTimes?.dynamic).toBe(30);
    });
});
