import { ForbiddenException } from "@nestjs/common";
import type { Catalog } from "@saroh/pricing-catalog";
import { resolveAllAccess } from "@saroh/pricing-catalog";
import { SEED_CATALOG } from "@saroh/pricing-catalog/seed";

import type { BusinessAccess } from "./catalogue-access.service";
import { planMeter } from "./metering.service";
import { assertPlanIncludesModule, modulePlanAccess } from "./module-plan";

const NOW = new Date("2026-11-18");

/** The sample catalogue as a version published before the two rows existed. */
const WITHOUT_ROWS: Catalog = {
    ...SEED_CATALOG,
    modules: SEED_CATALOG.modules.filter(
        (m) => m.id !== "courses" && m.id !== "class-packs",
    ),
};

function on(catalog: Catalog, planId: string): BusinessAccess {
    const plan = catalog.plans.find((p) => p.id === planId)!;
    return {
        source: "catalogue",
        catalog,
        planId,
        planName: plan.name,
        modules: resolveAllAccess({ catalog, planId, now: NOW }),
    } as unknown as BusinessAccess;
}

async function refusal(p: Promise<void>) {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    return (err as ForbiddenException).getResponse() as {
        details: { code: string; moduleId: string };
    };
}

describe("assertPlanIncludesModule (05-P-02)", () => {
    let enforcing: jest.SpyInstance;
    let resolve: jest.SpyInstance;
    beforeEach(() => {
        enforcing = jest.spyOn(planMeter, "enforcing").mockResolvedValue(true);
        resolve = jest.spyOn(modulePlanAccess, "resolve");
    });
    afterEach(() => jest.restoreAllMocks());

    it.each(["COURSES", "CLASS_PACKS"] as const)(
        "refuses Free %s where the row is locked",
        async (module) => {
            resolve.mockResolvedValue(on(SEED_CATALOG, "free"));
            const body = await refusal(
                assertPlanIncludesModule("org", module, NOW),
            );
            expect(body.details).toMatchObject({
                code: "MODULE_LOCKED",
                moduleId: module === "COURSES" ? "courses" : "class-packs",
            });
        },
    );

    it("refuses Free on a version with no row at all: a paid-only module never opens by default", async () => {
        resolve.mockResolvedValue(on(WITHOUT_ROWS, "free"));
        const body = await refusal(
            assertPlanIncludesModule("org", "CLASS_PACKS", NOW),
        );
        expect(body.details).toMatchObject({
            code: "MODULE_LOCKED",
            moduleId: "class-packs",
        });
    });

    it("lets a paid plan through, with the row or without it", async () => {
        resolve.mockResolvedValue(on(SEED_CATALOG, "grow"));
        await expect(
            assertPlanIncludesModule("org", "COURSES", NOW),
        ).resolves.toBeUndefined();
        resolve.mockResolvedValue(on(WITHOUT_ROWS, "grow"));
        await expect(
            assertPlanIncludesModule("org", "COURSES", NOW),
        ).resolves.toBeUndefined();
    });

    it("asks nothing behind the PLAN_ENFORCEMENT kill switch, and fails open on a failed read", async () => {
        enforcing.mockResolvedValue(false);
        await expect(
            assertPlanIncludesModule("org", "COURSES", NOW),
        ).resolves.toBeUndefined();
        expect(resolve).not.toHaveBeenCalled();

        enforcing.mockResolvedValue(true);
        resolve.mockRejectedValue(new Error("db down"));
        await expect(
            assertPlanIncludesModule("org", "COURSES", NOW),
        ).resolves.toBeUndefined();
    });
});
