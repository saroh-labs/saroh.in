import { afterEach, describe, expect, it, vi } from "vitest";

describe("Free's price on a Global deployment", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("is said in dollars, never rupees, and still reads as free", async () => {
        vi.stubEnv("NEXT_PUBLIC_EDITION", "GLOBAL");
        vi.resetModules();
        const { priceWords } = await import("./plan-view");
        const { nextParts } = await import("./plan-status");
        const free = priceWords(0, "month");
        expect(free).not.toContain("₹");
        expect(free).toContain("$");
        // A free plan's price is not said before "Nothing to pay".
        const next = { kind: "text", text: "Nothing to pay" } as const;
        expect(nextParts(next, { price: free })).toEqual(nextParts(next));
    });
});
