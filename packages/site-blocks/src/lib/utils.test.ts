import { describe, expect, it } from "vitest";

import { trimTrailingSlashes } from "./utils";

describe("trimTrailingSlashes", () => {
    it("drops every trailing slash and keeps the rest", () => {
        expect(trimTrailingSlashes("/journal///")).toBe("/journal");
        expect(trimTrailingSlashes("/a//b")).toBe("/a//b");
        expect(trimTrailingSlashes("/")).toBe("");
    });

    it("stays fast on a long run of slashes that doesn't end the path", () => {
        const input = `${"/".repeat(100_000)}x`;
        const started = Date.now();
        expect(trimTrailingSlashes(input)).toBe(input);
        expect(Date.now() - started).toBeLessThan(50);
    });
});
