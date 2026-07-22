/**
 * DB-backed integration tests for the Organization module persistence + backfill
 * (ADR-003 / #113). Runs only in the integration project (real Postgres via the
 * S0-003 harness). Verifies: evidence → enablement with dependency closure, the
 * all-DISABLED default, idempotency (no overwrite of an explicit row), the
 * unique (org, module) constraint, and the org-consistency compound FK that
 * makes a cross-Organization Project selection structurally impossible.
 *
 * Note: the lifecycle CHECK constraint lives in migration.sql; the integration
 * harness provisions schema with `prisma db push`, so the CHECK is exercised on
 * the migrate/deploy path, not here.
 */
import { prisma } from "@saroh/database";

import { backfillOrganizationModules } from "./module-backfill";
import { MODULE_KEYS } from "./module-registry";

let seq = 0;
const uniq = () => `${process.pid}-${seq++}`;

async function makeOrg(name: string): Promise<string> {
    const org = await prisma.organization.create({
        data: { name, slug: `mod-${uniq()}` },
    });
    return org.id;
}

async function statuses(
    organizationId: string,
): Promise<Record<string, string>> {
    const rows = await prisma.organizationModule.findMany({
        where: { organizationId },
        select: { moduleKey: true, status: true },
    });
    return Object.fromEntries(rows.map((r) => [r.moduleKey, r.status]));
}

describe("Organization module backfill (dev DB)", () => {
    afterEach(async () => {
        await prisma.projectModule.deleteMany({});
        await prisma.organizationModule.deleteMany({});
        await prisma.auditEvent.deleteMany({
            where: { action: "organization.modules.backfill" },
        });
    });

    it("enables a module from evidence and records the rest DISABLED", async () => {
        const orgId = await makeOrg("Website Co");
        await prisma.site.create({
            data: { organizationId: orgId, name: "Home", slug: `s-${uniq()}` },
        });

        await backfillOrganizationModules();

        const s = await statuses(orgId);
        expect(Object.keys(s)).toHaveLength(MODULE_KEYS.length);
        expect(s.WEBSITE).toBe("ENABLED");
        expect(s.CRM).toBe("DISABLED");
        expect(s.COMMERCE).toBe("DISABLED");
    });

    it("pulls in hard dependencies (Appointments → CRM)", async () => {
        const orgId = await makeOrg("Salon");
        await prisma.service.create({
            data: {
                organizationId: orgId,
                name: "Haircut",
                durationMinutes: 30,
                timezone: "Asia/Kolkata",
            },
        });

        await backfillOrganizationModules();

        const s = await statuses(orgId);
        expect(s.APPOINTMENTS).toBe("ENABLED");
        expect(s.CRM).toBe("ENABLED"); // dependency closure
        expect(s.COMMERCE).toBe("DISABLED");
    });

    it("gives an Organization with no evidence every module DISABLED", async () => {
        const orgId = await makeOrg("Empty");

        await backfillOrganizationModules();

        const s = await statuses(orgId);
        expect(Object.keys(s)).toHaveLength(MODULE_KEYS.length);
        expect(Object.values(s).every((v) => v === "DISABLED")).toBe(true);
    });

    it("is idempotent and never overwrites an explicit status", async () => {
        const orgId = await makeOrg("Idempotent");
        await prisma.contact.create({
            data: { organizationId: orgId, email: `c-${uniq()}@x.test` },
        });

        await backfillOrganizationModules();
        // Operator explicitly turns CRM back off after the backfill enabled it.
        await prisma.organizationModule.update({
            where: {
                organizationId_moduleKey: {
                    organizationId: orgId,
                    moduleKey: "CRM",
                },
            },
            data: { status: "DISABLED" },
        });

        // Re-running must not flip it back on, and must not duplicate rows.
        await backfillOrganizationModules();

        const rows = await prisma.organizationModule.findMany({
            where: { organizationId: orgId },
        });
        expect(rows).toHaveLength(MODULE_KEYS.length);
        expect((await statuses(orgId)).CRM).toBe("DISABLED");
    });

    it("rejects a duplicate (organization, module) row", async () => {
        const orgId = await makeOrg("Dupe");
        await prisma.organizationModule.create({
            data: {
                organizationId: orgId,
                moduleKey: "CRM",
                status: "ENABLED",
            },
        });
        await expect(
            prisma.organizationModule.create({
                data: {
                    organizationId: orgId,
                    moduleKey: "CRM",
                    status: "DISABLED",
                },
            }),
        ).rejects.toThrow();
    });

    it("makes a cross-Organization Project selection impossible", async () => {
        const orgA = await makeOrg("Org A");
        const orgB = await makeOrg("Org B");
        const moduleA = await prisma.organizationModule.create({
            data: { organizationId: orgA, moduleKey: "CRM", status: "ENABLED" },
        });
        const projectB = await prisma.project.create({
            data: { organizationId: orgB, name: "B", slug: `p-${uniq()}` },
        });

        // Project in Org B tries to select Org A's module → org-consistency FK.
        await expect(
            prisma.projectModule.create({
                data: {
                    organizationId: orgB,
                    projectId: projectB.id,
                    organizationModuleId: moduleA.id,
                },
            }),
        ).rejects.toThrow();
    });

    it("allows a same-Organization Project selection", async () => {
        const orgId = await makeOrg("Org Same");
        const mod = await prisma.organizationModule.create({
            data: {
                organizationId: orgId,
                moduleKey: "CRM",
                status: "ENABLED",
            },
        });
        const project = await prisma.project.create({
            data: { organizationId: orgId, name: "P", slug: `p-${uniq()}` },
        });

        const link = await prisma.projectModule.create({
            data: {
                organizationId: orgId,
                projectId: project.id,
                organizationModuleId: mod.id,
            },
        });
        expect(link.id).toBeTruthy();
    });
});
