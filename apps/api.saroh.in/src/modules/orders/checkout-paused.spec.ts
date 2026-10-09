// A website or location past the plan's limit after a move to a lower plan
// stops taking orders and bookings; a paused product isn't sold (#800).
// DB-free: the over-limit read is mocked.
jest.mock("../billing/over-limit.service", () => ({
    overLimit: { pausedNow: jest.fn() },
}));

import { ConflictException } from "@nestjs/common";

import { overLimit } from "../billing/over-limit.service";
import { PAUSED_BY_PLAN } from "../billing/paused-errors";
import {
    assertLocationTakingOrders,
    shopPause,
    siteTakingBookings,
} from "./checkout-paused";

const pausedNow = overLimit.pausedNow as jest.Mock;

const CUT = { createdAt: new Date("2026-06-01T00:00:00Z"), id: "p_m" };

function paused(over: {
    siteIds?: string[];
    storeIds?: string[];
    products?: unknown;
}) {
    return {
        products: over.products ?? null,
        posts: null,
        siteIds: new Set(over.siteIds ?? []),
        storeIds: new Set(over.storeIds ?? []),
    };
}

beforeEach(() => pausedNow.mockReset());

describe("shopPause (#800)", () => {
    it("takes orders and keeps every product when nothing is paused (enforcement off too)", async () => {
        pausedNow.mockResolvedValue(null);
        await expect(shopPause("org_1", "site_1", "store_1")).resolves.toEqual({
            kept: {},
            takingOrders: true,
        });
    });

    it("stops a paused website taking orders", async () => {
        pausedNow.mockResolvedValue(paused({ siteIds: ["site_2"] }));
        await expect(
            shopPause("org_1", "site_2", "store_1"),
        ).resolves.toMatchObject({ takingOrders: false });
        await expect(
            shopPause("org_1", "site_1", "store_1"),
        ).resolves.toMatchObject({ takingOrders: true });
    });

    it("stops a site whose location is paused taking orders", async () => {
        pausedNow.mockResolvedValue(paused({ storeIds: ["store_2"] }));
        await expect(
            shopPause("org_1", "site_1", "store_2"),
        ).resolves.toMatchObject({ takingOrders: false });
        await expect(shopPause("org_1", "site_1", null)).resolves.toMatchObject(
            { takingOrders: true },
        );
    });

    it("keeps only the products the cut keeps: a paused one reads as no longer sold", async () => {
        pausedNow.mockResolvedValue(paused({ products: CUT }));
        const { kept, takingOrders } = await shopPause(
            "org_1",
            "site_1",
            "store_1",
        );
        expect(takingOrders).toBe(true);
        expect(kept).toEqual({
            OR: [
                { createdAt: { gt: CUT.createdAt } },
                { createdAt: CUT.createdAt, id: { gte: CUT.id } },
            ],
        });
    });
});

describe("assertLocationTakingOrders (#800)", () => {
    it("refuses a team's new order at a paused location", async () => {
        pausedNow.mockResolvedValue(paused({ storeIds: ["store_2"] }));
        const err = await assertLocationTakingOrders("org_1", "store_2").catch(
            (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(ConflictException);
        expect(
            (
                (err as ConflictException).getResponse() as {
                    details: { code: string; kind: string };
                }
            ).details,
        ).toEqual({ code: PAUSED_BY_PLAN, kind: "location" });
    });

    it("lets the kept location, and every location with nothing paused, take orders", async () => {
        pausedNow.mockResolvedValue(paused({ storeIds: ["store_2"] }));
        await expect(
            assertLocationTakingOrders("org_1", "store_1"),
        ).resolves.toBeUndefined();
        pausedNow.mockResolvedValue(null);
        await expect(
            assertLocationTakingOrders("org_1", "store_2"),
        ).resolves.toBeUndefined();
    });
});

describe("siteTakingBookings (#800)", () => {
    it("is false only for a paused website: bookings aren't tied to a location", async () => {
        pausedNow.mockResolvedValue(
            paused({ siteIds: ["site_2"], storeIds: ["store_1"] }),
        );
        await expect(siteTakingBookings("org_1", "site_2")).resolves.toBe(
            false,
        );
        await expect(siteTakingBookings("org_1", "site_1")).resolves.toBe(true);
        pausedNow.mockResolvedValue(null);
        await expect(siteTakingBookings("org_1", "site_2")).resolves.toBe(true);
    });
});
