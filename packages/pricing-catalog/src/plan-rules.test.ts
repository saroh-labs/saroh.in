import { describe, expect, it } from "vitest";

import { resolveAccess } from "./access";
import { SEED_CATALOG } from "./seed";

/**
 * The plan rules the sample catalogue carries, per plan (DEC-099, DEC-103,
 * DEC-155). The real catalogue lives in the database; this keeps the sample
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

    it("has one team row for everyone, and none for people who only look (DEC-155)", () => {
        const ids = SEED_CATALOG.modules.map((m) => m.id);
        expect(ids).toContain("members");
        expect(ids).not.toContain("reviewers");
        for (const plan of ["free", "grow", "pro"]) {
            expect(at(plan, "members").limit).toBeGreaterThan(0);
        }
    });
});
