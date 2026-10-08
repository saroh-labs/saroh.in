/**
 * Module availability's plan step (plans catalogue U12, KTD-8): after the
 * rollout gate (DEC-057 first), a module none of whose catalogue rows the
 * business's plan includes is not entitled — only behind the
 * PLAN_ENFORCEMENT kill switch (OQ-4), and only for a module some catalogue
 * row sits under. What "included" means is EntitlementService's
 * (`entitlement.service.spec.ts`); this is the gate.
 */
import { catalogueModulesFor, MODULE_MAP } from "@saroh/pricing-catalog";

import type { OrgRole } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { ModuleAvailabilityService } from "./module-availability.service";
import type { ModuleKey } from "./module-registry";
import { MODULE_KEYS } from "./module-registry";
import type { ModuleReadinessRegistry } from "./readiness/module-readiness.registry";

function build(opts: {
    rollout?: boolean;
    enforcement?: boolean;
    included?: boolean;
}) {
    const flags = {
        isEnabled: jest.fn((key: string) =>
            Promise.resolve(
                key === FlagKey.PLAN_ENFORCEMENT
                    ? (opts.enforcement ?? true)
                    : (opts.rollout ?? true),
            ),
        ),
    } as unknown as FeatureFlagService;
    const moduleIncluded = jest.fn().mockResolvedValue(opts.included ?? true);
    const entitlements = {
        can: jest.fn().mockResolvedValue(true),
        moduleIncluded,
    } as unknown as EntitlementService;
    const readiness = {
        evaluate: jest
            .fn()
            .mockResolvedValue({ readiness: "ACTIVE", blockers: [] }),
    } as unknown as ModuleReadinessRegistry;
    const db = {
        organizationModule: {
            findUnique: jest.fn().mockResolvedValue({ status: "ENABLED" }),
            findMany: jest.fn().mockResolvedValue([]),
        },
        projectModule: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new ModuleAvailabilityService(
        flags,
        entitlements,
        readiness,
        db as never,
    );
    return { service, moduleIncluded };
}

const input = (moduleKey: ModuleKey) => ({
    organizationId: "org_1",
    moduleKey,
    organizationRole: "OWNER" as OrgRole,
});

describe("module availability: the plan step (U12)", () => {
    it("locks a module the plan leaves out: ENTITLEMENT_REQUIRED", async () => {
        const { service, moduleIncluded } = build({ included: false });

        const r = await service.evaluate(input("APPOINTMENTS"));

        expect(r).toMatchObject({ entitled: false, gatesPassed: false });
        expect(r.blockers.map((b) => b.code)).toEqual(["ENTITLEMENT_REQUIRED"]);
        expect(moduleIncluded).toHaveBeenCalledWith("org_1", "APPOINTMENTS");
    });

    it("lets a module the plan includes through", async () => {
        const { service } = build({ included: true });

        await expect(
            service.evaluate(input("COMMERCE")),
        ).resolves.toMatchObject({
            entitled: true,
            readiness: "ACTIVE",
            gatesPassed: true,
        });
    });

    it("checks the rollout gate first: a module rolled out off is hidden whatever the plan says (DEC-057)", async () => {
        const { service, moduleIncluded } = build({
            rollout: false,
            included: true,
        });

        const r = await service.evaluate(input("COMMERCE"));

        expect(r.blockers.map((b) => b.code)).toEqual(["ROLLOUT_DISABLED"]);
        expect(moduleIncluded).not.toHaveBeenCalled();
    });

    it("locks nothing with the kill switch off (OQ-4)", async () => {
        const { service, moduleIncluded } = build({
            enforcement: false,
            included: false,
        });

        await expect(
            service.evaluate(input("APPOINTMENTS")),
        ).resolves.toMatchObject({ entitled: true });
        expect(moduleIncluded).not.toHaveBeenCalled();
    });

    it("a plan without Saroh's email allowance still lists Communications as available (DEC-086)", async () => {
        // The row counts Saroh's emails but sits under no registry module.
        expect(MODULE_MAP["saroh-emails"].registry).toBeNull();
        const { service, moduleIncluded } = build({ included: false });

        await expect(
            service.evaluate(input("COMMUNICATIONS")),
        ).resolves.toMatchObject({ entitled: true });
        expect(moduleIncluded).not.toHaveBeenCalled();
    });

    it("never asks for a module no catalogue row sits under", async () => {
        const { service, moduleIncluded } = build({ included: false });

        await expect(service.evaluate(input("CRM"))).resolves.toMatchObject({
            entitled: true,
        });
        expect(moduleIncluded).not.toHaveBeenCalled();
    });

    it("leaves PAYMENTS available on a plan without online payments: its rows lock actions, never the module", async () => {
        // Rows sit under PAYMENTS now (`payments`, `subscriptions`); a plan
        // that leaves them off still reaches what the business already
        // owes and is owed — renewals, refunds, invoices (ADR-003).
        expect(catalogueModulesFor("PAYMENTS")).toEqual(
            expect.arrayContaining(["payments", "subscriptions"]),
        );
        const { service, moduleIncluded } = build({ included: false });

        await expect(
            service.evaluate(input("PAYMENTS")),
        ).resolves.toMatchObject({
            entitled: true,
            readiness: "ACTIVE",
            gatesPassed: true,
        });
        expect(moduleIncluded).not.toHaveBeenCalled();
    });

    it("leaves invoicing to no registry module, so no plan lock reaches it (DEC-070)", () => {
        expect(MODULE_MAP.invoicing?.registry).toBeNull();
    });

    it("maps catalogue rows only onto registry modules that exist", () => {
        const known = new Set<string>(MODULE_KEYS);
        for (const e of Object.values(MODULE_MAP)) {
            if (e.registry) expect(known.has(e.registry)).toBe(true);
        }
        for (const key of MODULE_KEYS) {
            // Compiles only while the two key sets agree.
            expect(Array.isArray(catalogueModulesFor(key))).toBe(true);
        }
    });
});
