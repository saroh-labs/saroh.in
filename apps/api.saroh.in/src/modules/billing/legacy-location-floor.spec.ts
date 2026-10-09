/**
 * The old `storefronts` floor counts places customers visit, as metering
 * does (owner, 8 Oct): one count, `countUsage(…, "shopLocations")`, so an
 * online-only storefront is never one of its locations.
 */
import { ForbiddenException } from "@nestjs/common";

import {
    assertLegacyLocationRoom,
    legacyLocationRefusal,
} from "./legacy-location-floor";
import { countUsage } from "./metering";

function txWith(shops: number) {
    return {
        store: { count: jest.fn().mockResolvedValue(shops) },
        $executeRaw: jest.fn().mockResolvedValue(0),
    };
}

const plan = (entitlements: Record<string, number | boolean>) => ({
    getEntitlements: jest.fn().mockResolvedValue(entitlements),
});

describe("assertLegacyLocationRoom", () => {
    it("asks the database exactly what metering's shopLocations count asks", async () => {
        const floor = txWith(1);
        await assertLegacyLocationRoom(
            floor as never,
            "org_1",
            plan({ storefronts: 5 }),
        );
        const meter = txWith(1);
        await countUsage(meter as never, "org_1", "shopLocations");
        expect(floor.store.count.mock.calls).toEqual(
            meter.store.count.mock.calls,
        );
        // Only SHOP: an online one, or one with no settings, never counts.
        expect(floor.store.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                deletedAt: null,
                settings: { kind: "SHOP" },
            },
        });
    });

    it("takes the shopLocations meter's lock before counting", async () => {
        const tx = txWith(0);
        await assertLegacyLocationRoom(
            tx as never,
            "org_1",
            plan({ storefronts: 5 }),
        );
        expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
        const [, lock] = tx.$executeRaw.mock.calls[0] as [unknown, string];
        expect(lock).toBe("plan-meter:org_1:shopLocations");
        expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
            tx.store.count.mock.invocationCallOrder[0]!,
        );
    });

    it("lets one more shop in under the floor, however many online ones there are", async () => {
        // Metering's count is of shops alone: 4 of 5, whatever else exists.
        await expect(
            assertLegacyLocationRoom(
                txWith(4) as never,
                "org_1",
                plan({ storefronts: 5 }),
            ),
        ).resolves.toBeUndefined();
    });

    it("refuses a shop past the floor in the merchant's words", async () => {
        const p = assertLegacyLocationRoom(
            txWith(2) as never,
            "org_1",
            plan({ storefronts: 2 }),
        );
        await expect(p).rejects.toThrow(ForbiddenException);
        await expect(p).rejects.toMatchObject({
            response: {
                message:
                    "Your plan includes 2 places customers visit. A bigger plan adds more.",
            },
        });
    });

    it("counts nothing on a plan with no number there (uncapped)", async () => {
        const tx = txWith(99);
        await assertLegacyLocationRoom(tx as never, "org_1", plan({}));
        expect(tx.store.count).not.toHaveBeenCalled();
        expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
});

describe("legacyLocationRefusal", () => {
    it("says one, many and none in the catalogue's words for a location", () => {
        const say = (n: number) =>
            (legacyLocationRefusal(n).getResponse() as { message: string })
                .message;
        expect(say(1)).toBe(
            "Your plan includes one place customers visit. A bigger plan adds more.",
        );
        expect(say(3)).toBe(
            "Your plan includes 3 places customers visit. A bigger plan adds more.",
        );
        expect(say(0)).toBe(
            "Your plan doesn't include a place customers visit. A bigger plan adds one.",
        );
    });
});
