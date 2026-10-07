import { describe, expect, it } from "vitest";

import { resolveAccess } from "./access";
import { SEED_CATALOG } from "./seed";

/**
 * The plan rules the sample catalogue carries, per plan (DEC-099, DEC-103,
 * DEC-105). The real catalogue lives in the database; this keeps the sample
 * one, which every test and seeded business reads, in the decided shape.
 */
const at = (planId: string, moduleId: string) =>
    resolveAccess(
        { catalog: SEED_CATALOG, planId, now: new Date("2026-10-07") },
        moduleId,
    );

describe("plan rules in the sample catalogue", () => {
    it("custom roles are Pro's; below it they point at Pro (DEC-099)", () => {
        for (const plan of ["free", "grow"]) {
            const roles = at(plan, "roles");
            expect(roles.state).not.toBe("on");
            expect(roles.upgradePlanId).toBe("pro");
        }
        expect(at("pro", "roles").state).toBe("on");
    });

    it("publishing needs approval is Pro's (DEC-103)", () => {
        expect(at("free", "review").state).not.toBe("on");
        expect(at("grow", "review").state).not.toBe("on");
        expect(at("pro", "review").state).toBe("on");
    });

    it("the reviewers row is the view-only people limit, on every plan (DEC-105)", () => {
        const row = SEED_CATALOG.modules.find((m) => m.id === "reviewers");
        expect(row?.name).toBe("View-only people");
        for (const plan of ["free", "grow", "pro"]) {
            expect(at(plan, "reviewers").state).toBe("on");
        }
    });
});
