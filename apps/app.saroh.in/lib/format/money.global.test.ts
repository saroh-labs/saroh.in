import { afterEach, describe, expect, it, vi } from "vitest";

describe("a Global deployment", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("groups in thousands, in the business's currency", async () => {
        vi.stubEnv("NEXT_PUBLIC_EDITION", "GLOBAL");
        vi.resetModules();
        const { formatMoney, formatNumber } = await import("./money");
        expect(formatMoney(204497100, "USD")).toBe("$2,044,971");
        expect(formatNumber(2044971)).toBe("2,044,971");
    });
});
