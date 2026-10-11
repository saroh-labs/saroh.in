import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
    listStorefronts: vi.fn(),
    getStorefront: vi.fn(),
    listServices: vi.fn(),
}));

vi.mock("@/lib/stores/storefronts", () => ({
    listStorefronts: reads.listStorefronts,
    getStorefront: reads.getStorefront,
}));
vi.mock("@/lib/services/service", () => ({
    listServices: reads.listServices,
}));
vi.mock("@/lib/services/editor-data", () => ({
    businessCurrencyOf: (services: { currency: string | null }[]) =>
        services.find((s) => s.currency)?.currency ?? "INR",
}));

import { formatMoney } from "@/lib/format/money";

import { DEFAULT_CURRENCY, readBusinessCurrency } from "./business-currency";

/** A lead's Worth is in the business's currency (owner, 11 Oct 2026). */
describe("readBusinessCurrency", () => {
    beforeEach(() => {
        for (const read of Object.values(reads)) read.mockReset();
        reads.listStorefronts.mockResolvedValue([]);
        reads.getStorefront.mockResolvedValue(null);
        reads.listServices.mockResolvedValue([]);
    });

    it("is a location's currency, which every location shares", async () => {
        reads.listStorefronts.mockResolvedValue([{ id: "s_1" }, { id: "s_2" }]);
        reads.getStorefront.mockResolvedValue({ currency: "AED" });
        expect(await readBusinessCurrency()).toBe("AED");
        expect(reads.getStorefront).toHaveBeenCalledWith("s_1");
        expect(reads.listServices).not.toHaveBeenCalled();
    });

    it("is what its services are priced in for a business with no location", async () => {
        reads.listServices.mockResolvedValue([
            { currency: null },
            { currency: "USD" },
        ]);
        expect(await readBusinessCurrency()).toBe("USD");
    });

    it("is the default for a business with nothing priced yet", async () => {
        expect(await readBusinessCurrency()).toBe(DEFAULT_CURRENCY);
        expect(DEFAULT_CURRENCY).toBe("INR");
    });

    it("still answers when a read fails or is refused", async () => {
        reads.listStorefronts.mockRejectedValue(new Error("403"));
        reads.listServices.mockRejectedValue(new Error("down"));
        expect(await readBusinessCurrency()).toBe("INR");

        reads.listStorefronts.mockResolvedValue([{ id: "s_1" }]);
        reads.getStorefront.mockRejectedValue(new Error("403"));
        reads.listServices.mockResolvedValue([{ currency: "USD" }]);
        expect(await readBusinessCurrency()).toBe("USD");
    });

    it("signs a lead's Worth, which is kept in minor units", async () => {
        const currency = await readBusinessCurrency();
        expect(formatMoney(150000, currency)).toBe("₹1,500");
        expect(formatMoney(null, currency)).toBeNull();
    });
});
