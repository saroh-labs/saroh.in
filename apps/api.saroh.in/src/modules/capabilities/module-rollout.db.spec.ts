/**
 * DEC-057 (P1) against a real Postgres: what the app hides a module by, and
 * what a refusal says.
 *
 * - `GET /modules` (listViews) still lists a module whose rollout flag is
 *   off, with `ROLLOUT_DISABLED` and readiness DISABLED — the one signal
 *   the app's `rolledOut` reads — and the business's own setting is kept;
 * - a module Saroh has rolled out and the business turned on is ready, with
 *   no gate blocker;
 * - every blocker a gate adds is one of the five known codes, each of which
 *   the app words (`lib/modules/blocker-copy.ts`);
 * - a refusal names the module ("Class packs"), never its key.
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ModuleAvailabilityService } from "./module-availability.service";
import { ModuleLifecycleService } from "./module-lifecycle.service";
import { ModuleReadinessRegistry } from "./readiness/module-readiness.registry";

const tag = `${process.pid}-${Date.now()}`;
const readiness = new ModuleReadinessRegistry();
const availability = new ModuleAvailabilityService(
    new FeatureFlagService(),
    // No module names an entitlement, so this is never asked.
    {} as never,
    readiness,
);
const lifecycle = new ModuleLifecycleService(
    readiness,
    prisma,
    undefined,
    new FeatureFlagService(),
);

const GATES = new Set([
    "UNAUTHORIZED",
    "ROLLOUT_DISABLED",
    "ORG_MODULE_DISABLED",
    "PROJECT_MODULE_UNSELECTED",
    "ENTITLEMENT_REQUIRED",
]);

let org: string;
let ctx: OrganizationContext;

async function flag(key: string, on: boolean) {
    await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabledByDefault: on },
        update: { enabledByDefault: on },
    });
}

beforeAll(async () => {
    // Commerce rolled out; Class packs not (its switch stays as it was).
    await flag("MODULE_COMMERCE", true);
    await flag("MODULE_CLASS_PACKS", false);
    const user = await prisma.user.create({
        data: { email: `p1-${tag}@example.com` },
    });
    org = (
        await prisma.organization.create({
            data: { name: "Rollout Studio", slug: `p1-rollout-${tag}` },
        })
    ).id;
    for (const moduleKey of ["COMMERCE", "CLASS_PACKS"]) {
        await prisma.organizationModule.create({
            data: { organizationId: org, moduleKey, status: "ENABLED" },
        });
    }
    ctx = { organizationId: org, userId: user.id, role: "OWNER" };
});

describe("modules Saroh hasn't rolled out (DEC-057)", () => {
    it("are listed with ROLLOUT_DISABLED, the business's own setting kept", async () => {
        const views = await availability.listViews({
            organizationId: org,
            organizationRole: "OWNER",
        });
        const packs = views.find((v) => v.key === "CLASS_PACKS");
        expect(packs).toMatchObject({
            readiness: "DISABLED",
            lifecycle: "ENABLED",
        });
        expect(packs?.blockers.map((b) => b.code)).toContain(
            "ROLLOUT_DISABLED",
        );
        const commerce = views.find((v) => v.key === "COMMERCE");
        expect(commerce?.blockers.map((b) => b.code)).not.toContain(
            "ROLLOUT_DISABLED",
        );
        expect(commerce?.readiness).not.toBe("DISABLED");
    });

    it("never carries a gate code the app has no words for", async () => {
        const views = await availability.listViews({
            organizationId: org,
            organizationRole: "MEMBER",
        });
        for (const view of views.filter((v) => v.readiness === "DISABLED")) {
            for (const b of view.blockers) {
                expect(GATES.has(b.code)).toBe(true);
                // A gate says no sentence of its own; the app words it.
                expect(b.message).toBeUndefined();
            }
        }
    });

    it("is never turned on: enabling it is refused in words, and nothing is written", async () => {
        await prisma.organizationModule.update({
            where: {
                organizationId_moduleKey: {
                    organizationId: org,
                    moduleKey: "CLASS_PACKS",
                },
            },
            data: { status: "DISABLED" },
        });
        const refused = await lifecycle
            .enable(ctx, "CLASS_PACKS")
            .then(() => null)
            .catch((e: Error) => e.message);
        expect(refused).toBe(
            "Class packs isn't available for your business yet.",
        );
        expect(refused).not.toMatch(/ROLLOUT|MODULE_|CLASS_PACKS/);
        const row = await prisma.organizationModule.findUnique({
            where: {
                organizationId_moduleKey: {
                    organizationId: org,
                    moduleKey: "CLASS_PACKS",
                },
            },
            select: { status: true },
        });
        expect(row?.status).toBe("DISABLED");
        // A rolled-out module still turns on.
        await prisma.organizationModule.update({
            where: {
                organizationId_moduleKey: {
                    organizationId: org,
                    moduleKey: "COMMERCE",
                },
            },
            data: { status: "DISABLED" },
        });
        await lifecycle.enable(ctx, "COMMERCE");
        const commerce = await prisma.organizationModule.findUnique({
            where: {
                organizationId_moduleKey: {
                    organizationId: org,
                    moduleKey: "COMMERCE",
                },
            },
            select: { status: true },
        });
        expect(commerce?.status).toBe("ENABLED");
        // Put Class packs back as the other tests read it.
        await prisma.organizationModule.update({
            where: {
                organizationId_moduleKey: {
                    organizationId: org,
                    moduleKey: "CLASS_PACKS",
                },
            },
            data: { status: "ENABLED" },
        });
    });

    it("a refusal names the module, never its key", async () => {
        const refused = await lifecycle
            .archive(ctx, "CLASS_PACKS")
            .then(() => null)
            .catch((e: Error) => e.message);
        expect(refused).toBe("Turn Class packs off before archiving it.");
    });
});
