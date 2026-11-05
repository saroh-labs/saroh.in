import { describe, expect, it, vi } from "vitest";

const active = vi.hoisted(() => vi.fn());
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: active,
}));
vi.mock("react", async (actual) => ({
    ...(await actual<typeof import("react")>()),
    cache: <T>(fn: T) => fn,
}));

import { startingCurrency } from "./starting-currency";

describe("startingCurrency", () => {
    it("is what a Global business chose", async () => {
        active.mockResolvedValue({ currency: "GBP" });
        await expect(startingCurrency()).resolves.toBe("GBP");
    });

    it("is rupees for a business that chose none", async () => {
        active.mockResolvedValue({ currency: null });
        await expect(startingCurrency()).resolves.toBe("INR");
        active.mockResolvedValue(null);
        await expect(startingCurrency()).resolves.toBe("INR");
    });
});
