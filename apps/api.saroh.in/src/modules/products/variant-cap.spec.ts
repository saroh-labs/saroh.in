/**
 * The plan's cap on a product's variants where the writes ask it (DEC-158),
 * without a database: adding a variant and copying a product. The cap is
 * handed in, so the plan read is never touched; the same rules through the
 * real services are in `variant-cap.db.spec.ts`. Numbers are made up.
 */
jest.mock("@saroh/database", () => ({ prisma: {} }));
jest.mock("../billing/metering.service", () => ({
    planMeter: { itemCap: jest.fn() },
}));

import { ForbiddenException } from "@nestjs/common";
import type { ModuleAccess } from "@saroh/pricing-catalog";

import type { ItemCap } from "../billing/item-limits";
import { planMeter } from "../billing/metering.service";
import {
    assertCopyFits,
    assertVariantRoom,
    variantCap,
    VARIANTS_ROW,
} from "./variant-cap";

const row = {
    moduleId: "variants",
    state: "on",
    limit: 20,
    per: "",
    plan: "Plan A",
    planId: "a",
    upgradeTo: "Plan B",
    upgradePlanId: "b",
    upgradePricePaise: 11_100,
    upgradeUncapped: false,
} as ModuleAccess;
const cap: ItemCap = { row, key: "variantsPerProduct", limit: 20 };

function txHolding(count: number) {
    return { productVariant: { count: jest.fn(() => Promise.resolve(count)) } };
}

async function refusal(p: Promise<unknown> | (() => void)) {
    let err: unknown = null;
    try {
        await (typeof p === "function" ? p() : p);
    } catch (e) {
        err = e;
    }
    expect(err).toBeInstanceOf(ForbiddenException);
    return (err as ForbiddenException).getResponse() as {
        message: string;
        details: { used: number; notice: { body: string } };
    };
}

describe("the plan's cap on a product's variants", () => {
    it("is read from the variants row", async () => {
        (planMeter.itemCap as jest.Mock).mockResolvedValue(cap);
        await expect(variantCap("org_1")).resolves.toBe(cap);
        expect(planMeter.itemCap).toHaveBeenCalledWith("org_1", VARIANTS_ROW);
    });
});

describe("adding a variant", () => {
    it("counts the product's own variants, and lets the last one in", async () => {
        const tx = txHolding(19);
        await expect(
            assertVariantRoom(tx as never, cap, "prod_1"),
        ).resolves.toBeUndefined();
        expect(tx.productVariant.count).toHaveBeenCalledWith({
            where: { productId: "prod_1" },
        });
    });

    it("refuses the one past the cap", async () => {
        const body = await refusal(
            assertVariantRoom(txHolding(20) as never, cap, "prod_1"),
        );
        expect(body.message).toBe(
            "You can have up to 20 variants a product on Plan A",
        );
    });

    it("has 30, cap 20: one more is refused, and it is told it keeps its 30", async () => {
        const body = await refusal(
            assertVariantRoom(txHolding(30) as never, cap, "prod_1"),
        );
        expect(body.details.used).toBe(30);
        expect(body.details.notice.body).toContain("It keeps the 30 it has.");
    });

    it("counts nothing and refuses nothing with no cap", async () => {
        const tx = txHolding(500);
        await expect(
            assertVariantRoom(tx as never, null, "prod_1"),
        ).resolves.toBeUndefined();
        expect(tx.productVariant.count).not.toHaveBeenCalled();
    });
});

describe("copying a product", () => {
    it("copies one that fits, at the cap too", () => {
        expect(() => assertCopyFits(cap, 0)).not.toThrow();
        expect(() => assertCopyFits(cap, 20)).not.toThrow();
        expect(() => assertCopyFits(null, 500)).not.toThrow();
    });

    it("refuses a copy that would start past the cap, in its own words", async () => {
        const body = await refusal(() => assertCopyFits(cap, 30));
        expect(body.details.notice.body).toBe(
            "A copy would have 30, so it can't be made. Plan B allows more.",
        );
    });
});
