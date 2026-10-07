/**
 * E12 — Class packs as its own module, against a real Postgres:
 *
 * - the backfill (`packages/database/src/backfill/class-packs-module.ts`)
 *   registers `MODULE_CLASS_PACKS` with Appointments' value and overrides,
 *   turns the module on where packs were sold, holds it off where
 *   Appointments is off, leaves a business without packs off, and never
 *   overwrites a row that is there; run twice, the second run writes nothing;
 * - class packs aren't offered on any plan for now (DEC-099): after the
 *   backfill no business has Class packs available, a business that sold
 *   packs keeps its setting and every pack, and Class packs never holds
 *   Appointments on;
 * - turning Class packs off refuses new sales and keeps every pack,
 *   purchase and class spent; turning it on again is refused in a sentence.
 */
import { backfillClassPacksModule, prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ClassPacksService } from "../class-packs/class-packs.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { InvoicesService } from "../invoices/invoices.service";
import { ModuleAvailabilityService } from "./module-availability.service";
import { ModuleLifecycleService } from "./module-lifecycle.service";
import { ModuleReadinessRegistry } from "./readiness/module-readiness.registry";

const tag = `${process.pid}-${Date.now()}`;
const readiness = new ModuleReadinessRegistry();
const availability = new ModuleAvailabilityService(
    new FeatureFlagService(),
    // Class packs names no entitlement, so this is never asked.
    {} as never,
    readiness,
);
const lifecycle = new ModuleLifecycleService(readiness);
const packs = new ClassPacksService(new InvoicesService());

let userId: string;
const orgs: Record<
    "pulse" | "kavi" | "appointmentsOff" | "chose" | "none",
    string
> = {
    pulse: "",
    kavi: "",
    appointmentsOff: "",
    chose: "",
    none: "",
};
let pulsePackId: string;
let pulseContactId: string;

async function business(name: string, appointments?: string) {
    const org = await prisma.organization.create({
        data: {
            name,
            slug: `e12-${name.toLowerCase().replace(/\W+/g, "-")}-${tag}`,
        },
    });
    await giveBusinessDetails(org.id);
    if (appointments) {
        await prisma.organizationModule.create({
            data: {
                organizationId: org.id,
                moduleKey: "APPOINTMENTS",
                status: appointments,
            },
        });
    }
    return org.id;
}

async function pack(organizationId: string, status = "ACTIVE") {
    return (
        await prisma.classPack.create({
            data: {
                organizationId,
                name: "10-class pack",
                credits: 10,
                validityDays: 90,
                price: "4500.00",
                currency: "INR",
                status,
            },
        })
    ).id;
}

const owner = (organizationId: string): OrganizationContext => ({
    organizationId,
    userId,
    role: "OWNER",
});

async function status(organizationId: string, moduleKey: string) {
    const row = await prisma.organizationModule.findUnique({
        where: { organizationId_moduleKey: { organizationId, moduleKey } },
        select: { status: true },
    });
    return row?.status ?? null;
}

/** Everything the backfill writes, to prove a second run writes nothing. */
async function footprint() {
    const [modules, flags, overrides, flagAudits, audits] = await Promise.all([
        prisma.organizationModule.findMany({
            where: { moduleKey: "CLASS_PACKS" },
            select: { organizationId: true, status: true, updatedAt: true },
            orderBy: { organizationId: "asc" },
        }),
        prisma.featureFlag.findMany({
            where: { key: "MODULE_CLASS_PACKS" },
            select: { enabledByDefault: true, updatedAt: true },
        }),
        prisma.featureFlagOverride.findMany({
            where: { flagKey: "MODULE_CLASS_PACKS" },
            select: { organizationId: true, enabled: true },
            orderBy: { organizationId: "asc" },
        }),
        prisma.featureFlagAudit.count({
            where: { flagKey: "MODULE_CLASS_PACKS" },
        }),
        prisma.auditEvent.count({
            where: { actorUserId: "system:class-packs-backfill" },
        }),
    ]);
    return { modules, flags, overrides, flagAudits, audits };
}

beforeAll(async () => {
    await prisma.featureFlag.deleteMany({
        where: { key: { in: ["MODULE_CLASS_PACKS", "MODULE_APPOINTMENTS"] } },
    });
    userId = (
        await prisma.user.create({ data: { email: `e12-${tag}@example.com` } })
    ).id;

    // Pulse: sold packs under Appointments.
    orgs.pulse = await business("Pulse Fitness", "ENABLED");
    pulsePackId = await pack(orgs.pulse);
    pulseContactId = (
        await prisma.contact.create({
            data: {
                organizationId: orgs.pulse,
                email: `asha-${tag}@example.com`,
                firstName: "Asha",
            },
        })
    ).id;
    await prisma.packPurchase.create({
        data: {
            organizationId: orgs.pulse,
            packId: pulsePackId,
            contactId: pulseContactId,
            credits: 10,
            price: "4500.00",
            currency: "INR",
            expiresAt: new Date(Date.now() + 90 * 86_400_000),
        },
    });
    // Kavi Dental: a clinic that takes bookings and never sold a pack.
    orgs.kavi = await business("Kavi Dental", "ENABLED");
    await prisma.service.create({
        data: {
            organizationId: orgs.kavi,
            name: "Check-up",
            durationMinutes: 30,
            timezone: "Asia/Kolkata",
        },
    });
    // Sold packs once, then switched Appointments off.
    orgs.appointmentsOff = await business("Studio Off", "DISABLED");
    await pack(orgs.appointmentsOff, "ARCHIVED");
    // Already chose: a CLASS_PACKS row switched off by hand.
    orgs.chose = await business("Chose Off", "ENABLED");
    await pack(orgs.chose);
    await prisma.organizationModule.create({
        data: {
            organizationId: orgs.chose,
            moduleKey: "CLASS_PACKS",
            status: "DISABLED",
        },
    });
    // No Appointments row at all, and no packs.
    orgs.none = await business("Bakery");

    // Appointments is on for everyone, and off for Kavi by override.
    await prisma.featureFlag.create({
        data: { key: "MODULE_APPOINTMENTS", enabledByDefault: true },
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: "MODULE_APPOINTMENTS",
            organizationId: orgs.kavi,
            enabled: false,
        },
    });
});

describe("the E12 Class packs backfill (real database)", () => {
    it("registers the flag from Appointments and turns packs on where they were sold", async () => {
        const report = await backfillClassPacksModule(prisma);

        expect(report.flag).toEqual({
            registered: true,
            enabledByDefault: true,
            overridesCopied: 1,
        });
        const flag = await prisma.featureFlag.findUnique({
            where: { key: "MODULE_CLASS_PACKS" },
            include: { overrides: true },
        });
        expect(flag?.enabledByDefault).toBe(true);
        expect(
            flag?.overrides.map((o) => [o.organizationId, o.enabled]),
        ).toEqual([[orgs.kavi, false]]);
        // Every write is on the flag's audit trail, as the console's are.
        expect(
            await prisma.featureFlagAudit.count({
                where: {
                    flagKey: "MODULE_CLASS_PACKS",
                    actorUserId: "system:class-packs-backfill",
                },
            }),
        ).toBe(2);

        expect(await status(orgs.pulse, "CLASS_PACKS")).toBe("ENABLED");
        expect(await status(orgs.kavi, "CLASS_PACKS")).toBe("DISABLED");
        expect(await status(orgs.appointmentsOff, "CLASS_PACKS")).toBe(
            "DISABLED",
        );
        expect(await status(orgs.chose, "CLASS_PACKS")).toBe("DISABLED");
        expect(await status(orgs.none, "CLASS_PACKS")).toBe("DISABLED");
        // Other test files' businesses may share the database, so the
        // counts are at least this run's.
        expect(report.enabled).toBeGreaterThanOrEqual(1);
        expect(report.heldOff).toBeGreaterThanOrEqual(1);
        expect(report.kept).toBeGreaterThanOrEqual(1);
    });

    it("changes nothing when run a second time", async () => {
        const before = await footprint();
        const report = await backfillClassPacksModule(prisma);
        expect(report.flag.registered).toBe(false);
        expect(report.enabled + report.heldOff + report.disabled).toBe(0);
        expect(report.kept).toBe(report.organizations);
        expect(await footprint()).toEqual(before);
    });

    it("leaves a flag an operator already set alone", async () => {
        await prisma.featureFlag.update({
            where: { key: "MODULE_CLASS_PACKS" },
            data: { enabledByDefault: false },
        });
        try {
            const report = await backfillClassPacksModule(prisma);
            expect(report.flag.registered).toBe(false);
            const flag = await prisma.featureFlag.findUnique({
                where: { key: "MODULE_CLASS_PACKS" },
            });
            expect(flag?.enabledByDefault).toBe(false);
        } finally {
            await prisma.featureFlag.update({
                where: { key: "MODULE_CLASS_PACKS" },
                data: { enabledByDefault: true },
            });
        }
    });
});

describe("Class packs after the backfill, now not offered (DEC-099)", () => {
    const evaluate = (organizationId: string) =>
        availability.evaluate({
            organizationId,
            moduleKey: "CLASS_PACKS",
            organizationRole: "OWNER",
        });
    const NOT_OFFERED = "Class packs isn't available for your business yet.";

    it("Pulse, which sold packs, keeps its setting and packs, but Class packs isn't offered to it or to Kavi Dental", async () => {
        // The backfill's choice stands: data is kept (DEC-099).
        expect(await status(orgs.pulse, "CLASS_PACKS")).toBe("ENABLED");
        const pulse = await evaluate(orgs.pulse);
        expect(pulse.gatesPassed).toBe(false);
        expect(pulse.readiness).toBe("DISABLED");
        expect(pulse.blockers.map((b) => b.code)).toEqual(["ROLLOUT_DISABLED"]);

        const kavi = await evaluate(orgs.kavi);
        expect(kavi.gatesPassed).toBe(false);
        expect(kavi.readiness).toBe("DISABLED");
        expect(kavi.blockers.map((b) => b.code)).toEqual([
            "ROLLOUT_DISABLED",
            "ORG_MODULE_DISABLED",
        ]);
    });

    it("never holds Appointments on: Class packs isn't named, and keeps its own setting and packs", async () => {
        const ctx = owner(orgs.pulse);
        await lifecycle.disable(ctx, "APPOINTMENTS");
        try {
            expect(await status(orgs.pulse, "APPOINTMENTS")).toBe("DISABLED");
            expect(await status(orgs.pulse, "CLASS_PACKS")).toBe("ENABLED");
            expect(
                await prisma.packPurchase.count({
                    where: { organizationId: orgs.pulse },
                }),
            ).toBe(1);
        } finally {
            // Back as the fixture had it (this business has no CRM row, so
            // it is put back directly rather than through enable).
            await prisma.organizationModule.update({
                where: {
                    organizationId_moduleKey: {
                        organizationId: orgs.pulse,
                        moduleKey: "APPOINTMENTS",
                    },
                },
                data: { status: "ENABLED" },
            });
        }
    });

    it("turned off, refuses new sales and keeps every pack and purchase; can't be turned on again", async () => {
        const ctx = owner(orgs.pulse);
        const purchasesBefore = await prisma.packPurchase.count({
            where: { organizationId: orgs.pulse },
        });

        await lifecycle.disable(ctx, "CLASS_PACKS");
        expect(await status(orgs.pulse, "CLASS_PACKS")).toBe("DISABLED");
        await expect(
            packs.sell(ctx, pulsePackId, { contactId: pulseContactId }),
        ).rejects.toThrow("Class packs is switched off");
        // Nothing sold is lost (DEC-016).
        expect(
            await prisma.packPurchase.count({
                where: { organizationId: orgs.pulse },
            }),
        ).toBe(purchasesBefore);
        expect(
            await prisma.classPack.count({
                where: { organizationId: orgs.pulse },
            }),
        ).toBe(1);

        // Not offered, so it can't be switched back on (DEC-099).
        await expect(lifecycle.enable(ctx, "CLASS_PACKS")).rejects.toThrow(
            NOT_OFFERED,
        );
        expect(await status(orgs.pulse, "CLASS_PACKS")).toBe("DISABLED");
    });

    it("can't be turned on while Appointments is off either — and says it isn't offered", async () => {
        await expect(
            lifecycle.enable(owner(orgs.appointmentsOff), "CLASS_PACKS"),
        ).rejects.toThrow(NOT_OFFERED);
        expect(await status(orgs.appointmentsOff, "CLASS_PACKS")).toBe(
            "DISABLED",
        );
    });
});
