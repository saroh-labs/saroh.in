/**
 * A cap inside one thing (DEC-158: a product's variants), without a
 * database: which rows are one, what a resolved row caps, what is refused
 * and in which words, that nothing metered ever names the row, and
 * `MeteringService.itemCap` behind its kill switch. The write paths
 * against a real Postgres: `products/variant-cap.db.spec.ts`.
 *
 * Catalogue numbers are made up (`fakeVariantCatalog`).
 */
jest.mock("@saroh/database", () => ({
    prisma: {},
    liveCatalogueVersion: jest.fn(),
}));

import { ForbiddenException } from "@nestjs/common";
import type { Catalog, ModuleAccess } from "@saroh/pricing-catalog";
import { resolveAllAccess } from "@saroh/pricing-catalog";

import {
    fakeMeteredCatalog,
    fakeVariantCatalog,
} from "../../../test/fixtures/pricing-catalog";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { moduleAccessViews } from "./catalogue-access";
import type { CatalogueAccessService } from "./catalogue-access.service";
import type { ItemCap } from "./item-limits";
import {
    assertItemRoom,
    ITEM_LIMIT_KEYS,
    itemCapOf,
    itemKeyOf,
} from "./item-limits";
import type { MeterDb } from "./metering";
import { meteredKeyOf, meteredModules, usageByModule } from "./metering";
import { MeteringService, rowGate } from "./metering.service";

const now = new Date("2026-10-13T06:00:00Z");

const rows = (
    planId: string,
    catalog: Catalog = fakeVariantCatalog(),
): ModuleAccess[] => resolveAllAccess({ catalog, planId, now });

const variantsRow = (planId: string, catalog?: Catalog): ModuleAccess | null =>
    rows(planId, catalog).find((m) => m.moduleId === "variants") ?? null;

/** The cap of `limit` on Plan A, with Plan B above it. */
function capOf(limit: number): ItemCap {
    const row = variantsRow("free");
    if (!row) throw new Error("no variants row");
    return { row: { ...row, limit }, key: "variantsPerProduct", limit };
}

function responseOf(err: unknown) {
    expect(err).toBeInstanceOf(ForbiddenException);
    return (err as ForbiddenException).getResponse() as {
        message: string;
        details: Record<string, unknown>;
    };
}

function caught(fn: () => void): unknown {
    try {
        fn();
    } catch (err) {
        return err;
    }
    return null;
}

function meterFor(
    answer: () => Promise<unknown>,
    enforcing = true,
): MeteringService {
    return new MeteringService(
        { resolve: answer } as unknown as CatalogueAccessService,
        {
            isEnabled: () => Promise.resolve(enforcing),
        } as unknown as FeatureFlagService,
    );
}

describe("which rows cap inside one thing", () => {
    it("is the variants row, and no other", () => {
        expect(ITEM_LIMIT_KEYS).toEqual(["variantsPerProduct"]);
        expect(itemKeyOf("variants")).toBe("variantsPerProduct");
        for (const id of ["products", "orders", "members", "roles", "nope"]) {
            expect(itemKeyOf(id)).toBeNull();
        }
    });

    it("is never a meter: no count, no usage, no gate of its own", async () => {
        expect(meteredKeyOf("variants")).toBeNull();
        expect([...meteredModules().keys()]).not.toContain("variants");
        // Nothing is read for it, so the access view's `usage` is null:
        // no "used X of Y", no 80% notice, nothing to be over in total.
        const db = {} as MeterDb;
        await expect(usageByModule(db, "org_1", ["variants"])).resolves.toEqual(
            {},
        );
        const view = moduleAccessViews(fakeVariantCatalog(), rows("free"), {});
        expect(view.find((m) => m.moduleId === "variants")).toMatchObject({
            state: "on",
            limit: 3,
            usage: null,
        });
        // The business-wide check never counts or refuses on it.
        const row = variantsRow("free");
        expect(row && rowGate(row, false)).toBe("open");
    });
});

describe("what a resolved row caps", () => {
    it("is the plan's number, and nothing where the plan has none", () => {
        expect(itemCapOf(variantsRow("free"))).toMatchObject({
            key: "variantsPerProduct",
            limit: 3,
        });
        expect(itemCapOf(variantsRow("grow"))?.limit).toBe(5);
        expect(itemCapOf(variantsRow("pro"))).toBeNull();
        expect(itemCapOf(null)).toBeNull();
    });

    it("takes a per-business limit and a raise, as any limit", () => {
        const at = (kind: "limit" | "raise", value: number) =>
            resolveAllAccess({
                catalog: fakeVariantCatalog(),
                planId: "free",
                now,
                overrides: [
                    {
                        kind,
                        key: "variants",
                        moduleKey: "variants",
                        value,
                        createdAt: new Date(now.getTime() - 60_000),
                    },
                ],
            }).find((m) => m.moduleId === "variants") ?? null;
        expect(itemCapOf(at("limit", 44))?.limit).toBe(44);
        expect(itemCapOf(at("raise", 44))?.limit).toBe(44);
        // A raise never lowers the plan's own.
        expect(itemCapOf(at("raise", 1))?.limit).toBe(3);
    });

    it("is a limit and never a lock: a cell that leaves it out caps nothing", () => {
        const off = fakeVariantCatalog((c) => {
            const m = c.modules.find((x) => x.id === "variants");
            if (m) m.cells.free = { inc: false, off: "locked" };
        });
        expect(variantsRow("free", off)?.state).toBe("locked");
        expect(itemCapOf(variantsRow("free", off))).toBeNull();
    });

    it("caps nothing on a version published before the row existed", () => {
        // `fakeMeteredCatalog` has no `variants` row at all.
        expect(variantsRow("free", fakeMeteredCatalog())).toBeNull();
        expect(itemCapOf(variantsRow("free", fakeMeteredCatalog()))).toBeNull();
    });
});

describe("what is refused", () => {
    it("lets the last one in, and refuses the next", () => {
        const cap = capOf(20);
        expect(() => assertItemRoom(cap, 19, 1)).not.toThrow();
        expect(() => assertItemRoom(cap, 20, 1)).toThrow(ForbiddenException);
        expect(() => assertItemRoom(cap, 0, 21)).toThrow(ForbiddenException);
    });

    it("has 30, cap 20: saving without adding passes, adding one is refused", () => {
        const cap = capOf(20);
        // An edit (price, stock, photos, a rename) adds nothing.
        expect(() => assertItemRoom(cap, 30, 0)).not.toThrow();
        // After removing one it holds 29: still nothing added.
        expect(() => assertItemRoom(cap, 29, 0)).not.toThrow();
        // Adding is the one thing refused while it is past the cap.
        expect(() => assertItemRoom(cap, 30, 1)).toThrow(ForbiddenException);
        expect(() => assertItemRoom(cap, 29, 1)).toThrow(ForbiddenException);
    });

    it("refuses nothing with no cap", () => {
        expect(() => assertItemRoom(null, 500, 500)).not.toThrow();
    });

    it("answers in the plan-limit shape, in per-product words", () => {
        const body = responseOf(caught(() => assertItemRoom(capOf(20), 20, 1)));
        expect(body.message).toBe(
            "You can have up to 20 variants a product on Plan A",
        );
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            moduleId: "variants",
            limitKey: "variantsPerProduct",
            limit: 20,
            used: 20,
            per: "",
            plan: { id: "free", name: "Plan A" },
            upgradeTo: { planId: "grow", name: "Plan B" },
            notice: {
                title: "You can have up to 20 variants a product on Plan A",
                body: "No more can be added to this one. Plan B allows more.",
                cta: "See plans",
            },
        });
    });

    it("says a product past the cap keeps what it has", () => {
        const body = responseOf(caught(() => assertItemRoom(capOf(20), 30, 1)));
        expect(body.details).toMatchObject({
            used: 30,
            notice: {
                body: "No more can be added to this one. It keeps the 30 it has. Plan B allows more.",
            },
        });
    });

    it("takes a copy's own sentence", () => {
        const body = responseOf(
            caught(() =>
                assertItemRoom(
                    capOf(20),
                    0,
                    30,
                    "A copy would have 30, so it can't be made.",
                ),
            ),
        );
        expect(body.details.notice).toMatchObject({
            body: "A copy would have 30, so it can't be made. Plan B allows more.",
        });
    });
});

describe("MeteringService.itemCap", () => {
    const onCatalogue = (planId: string, catalog?: Catalog) => () =>
        Promise.resolve({
            source: "catalogue",
            modules: rows(planId, catalog),
        });

    it("is the business's cap while enforcement is on", async () => {
        const cap = await meterFor(onCatalogue("free")).itemCap(
            "org_1",
            "variants",
        );
        expect(cap).toMatchObject({ key: "variantsPerProduct", limit: 3 });
    });

    it("is nothing behind the kill switch, and reads nothing", async () => {
        const resolve = jest.fn(onCatalogue("free"));
        await expect(
            meterFor(resolve, false).itemCap("org_1", "variants"),
        ).resolves.toBeNull();
        expect(resolve).not.toHaveBeenCalled();
    });

    it("is nothing for a business the catalogue doesn't reach", async () => {
        const legacy = () =>
            Promise.resolve({ source: "legacy", reason: "no-plan" });
        await expect(
            meterFor(legacy).itemCap("org_1", "variants"),
        ).resolves.toBeNull();
    });

    it("is nothing on a version without the row: not excluded, not locked", async () => {
        const meter = meterFor(onCatalogue("free", fakeMeteredCatalog()));
        await expect(meter.itemCap("org_1", "variants")).resolves.toBeNull();
        // The switch check agrees: a row the version lacks is included.
        await expect(meter.isIncluded("org_1", "variants")).resolves.toBe(true);
    });

    it("is nothing when the plan can't be read (fail open)", async () => {
        const broken = () => Promise.reject(new Error("down"));
        await expect(
            meterFor(broken).itemCap("org_1", "variants"),
        ).resolves.toBeNull();
    });

    it("is nothing for a row that is a count across the business", async () => {
        await expect(
            meterFor(onCatalogue("free")).itemCap("org_1", "products"),
        ).resolves.toBeNull();
    });
});
