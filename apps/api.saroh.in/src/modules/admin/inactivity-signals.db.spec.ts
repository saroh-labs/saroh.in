/**
 * Inactivity signals (R13, #1199) against a real Postgres: the sweep opens
 * a signal while its condition holds and clears it on the next run after it
 * doesn't, and a manager's page shows only their own businesses' signals.
 *
 * Every sweep is limited to this file's businesses, so it runs beside the
 * rest of the suite. Integration project (TEST_DATABASE_URL), plain and
 * `TEST_RLS=on`.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditService } from "./admin-audit.service";
import type { AdminRole } from "./admin-permissions";
import { AdminRole as Roles, permissionsFor } from "./admin-permissions";
import { AdminStaffService } from "./admin-staff.service";
import {
    openSignalsByOrganization,
    sweepInactivitySignals,
    unemailedSignals,
} from "./inactivity-signals";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => (seq += 1);

async function business(days: number, modules: string[] = []): Promise<string> {
    const org = await prisma.organization.create({
        data: {
            name: `Quiet ${next()}`,
            slug: `inactivity-${next()}-${tag}`,
            lifecycleStatus: "ACTIVE",
            createdAt: ago(days),
            organizationModules: {
                create: modules.map((moduleKey) => ({
                    moduleKey,
                    status: "ENABLED",
                })),
            },
        },
    });
    return org.id;
}

async function acted(organizationId: string, daysAgo: number) {
    await prisma.auditEvent.create({
        data: {
            action: "product.update",
            actorUserId: `owner-${tag}`,
            organizationId,
            targetType: "product",
            targetId: `p-${next()}`,
            outcome: "SUCCESS",
            createdAt: ago(daysAgo),
        },
    });
}

async function ordered(organizationId: string, daysAgo: number) {
    const store = await prisma.store.create({
        data: {
            name: "Counter",
            slug: `inactivity-store-${next()}-${tag}`,
            organizationId,
        },
    });
    await prisma.order.create({
        data: {
            storeId: store.id,
            organizationId,
            orderId: `IN-${next()}-${tag}`,
            subtotal: "100",
            total: "100",
            currency: "INR",
            createdAt: ago(daysAgo),
        },
    });
}

const sweep = (...organizationIds: string[]) =>
    sweepInactivitySignals({ organizationIds });

async function open(organizationId: string) {
    const signals = await openSignalsByOrganization([organizationId]);
    return (signals.get(organizationId) ?? []).map((signal) => signal.kind);
}

describe("Inactivity signals (DB, #1199)", () => {
    it("opens NO_ACTIVITY after 8 quiet days, and clears it on new activity", async () => {
        const org = await business(60);
        await acted(org, 8);
        await sweep(org);
        expect(await open(org)).toEqual(["NO_ACTIVITY"]);

        // A second run opens nothing more.
        expect(await sweep(org)).toEqual({ opened: 0, cleared: 0 });

        await acted(org, 0);
        expect(await sweep(org)).toEqual({ opened: 0, cleared: 1 });
        expect(await open(org)).toEqual([]);
    });

    it("flags only the business an owner of two left quiet", async () => {
        const busy = await business(60);
        const quiet = await business(60);
        await acted(busy, 1);
        await acted(quiet, 10);
        await sweep(busy, quiet);
        expect(await open(busy)).toEqual([]);
        expect(await open(quiet)).toEqual(["NO_ACTIVITY"]);
    });

    it("opens NO_TRADING after 15 days with no order, and a new order clears it", async () => {
        const org = await business(60, ["COMMERCE"]);
        await acted(org, 1);
        await ordered(org, 15);
        await sweep(org);
        expect(await open(org)).toEqual(["NO_TRADING"]);

        await ordered(org, 0);
        await sweep(org);
        expect(await open(org)).toEqual([]);
    });

    it("leaves trading alone when bookings and selling are both off", async () => {
        const org = await business(60, ["CRM"]);
        await acted(org, 1);
        await sweep(org);
        expect(await open(org)).toEqual([]);
    });

    it("opens PAYMENT_DISCONNECTED while the provider is off, and clears it reconnected", async () => {
        const org = await business(60);
        await acted(org, 1);
        const provider = await prisma.merchantPaymentProvider.create({
            data: {
                organizationId: org,
                provider: "CASHFREE",
                status: "DISABLED",
                encryptedCredentials: "x",
                credentialsIv: "x",
                credentialsAuthTag: "x",
            },
        });
        await sweep(org);
        expect(await open(org)).toEqual(["PAYMENT_DISCONNECTED"]);
        expect(
            (await unemailedSignals()).filter((s) => s.organizationId === org),
        ).toEqual([expect.objectContaining({ kind: "PAYMENT_DISCONNECTED" })]);

        await prisma.merchantPaymentProvider.update({
            where: { id: provider.id },
            data: { status: "CONNECTED" },
        });
        await sweep(org);
        expect(await open(org)).toEqual([]);
    });

    it("never flags a 3-day-old business", async () => {
        const org = await business(3, ["APPOINTMENTS"]);
        await sweep(org);
        expect(await open(org)).toEqual([]);
    });
});

describe("A manager's businesses' signals (DB, #1199)", () => {
    const staffService = new AdminStaffService(new AdminAuditService());

    async function manager(name: string) {
        const user = await prisma.user.create({
            data: { email: `signals-${next()}-${tag}@example.com`, name },
        });
        const admin = await prisma.platformAdmin.create({
            data: {
                userId: user.id,
                roleAssignments: {
                    create: { role: Roles.AccountManager, reason: "test" },
                },
            },
        });
        const roles: AdminRole[] = [Roles.AccountManager];
        const info: PlatformAdminInfo = {
            userId: user.id,
            platformAdminId: admin.id,
            roles,
            permissions: permissionsFor(roles),
            viaBootstrap: false,
        };
        return info;
    }

    it("shows a manager their own businesses' signals, and nobody else's", async () => {
        const asha = await manager("Asha Signals");
        const ravi = await manager("Ravi Signals");
        const ashaShop = await business(60);
        const raviShop = await business(60);
        for (const [organizationId, platformAdminId] of [
            [ashaShop, asha.platformAdminId],
            [raviShop, ravi.platformAdminId],
        ] as const) {
            await prisma.accountManagerLink.create({
                data: {
                    organizationId,
                    platformAdminId: platformAdminId as string,
                    source: "ASSIGNED",
                    kind: "ASSIGNED",
                },
            });
        }
        await sweep(ashaShop, raviShop);

        const page = await staffService.member({
            staff: asha,
            platformAdminId: asha.platformAdminId as string,
        });
        expect(
            page.businesses.map((b) => [
                b.organizationId,
                b.signals.map((s) => s.kind),
            ]),
        ).toEqual([[ashaShop, ["NO_ACTIVITY"]]]);

        await expect(
            staffService.member({
                staff: asha,
                platformAdminId: ravi.platformAdminId as string,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
