/**
 * The staff kill switch for a site's trackers against a real Postgres
 * (#897, plan U9): switched off, the site's public head serves no tracker
 * and the admin ledger says who, when and why; switched back on, the
 * trackers return (the plan permitting).
 *
 * Route permissions are pinned by `admin.controller.permissions.spec.ts`,
 * the guards' refusals by `admin-site-trackers.service.spec.ts`.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type {
    BusinessAccess,
    CatalogueAccessService,
} from "../billing/catalogue-access.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PublicHeadService } from "../sites/public-head.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";
import {
    AdminSiteTrackersService,
    siteTrackerStates,
} from "./admin-site-trackers.service";

const tag = `${process.pid}-${Date.now()}`;
const service = new AdminSiteTrackersService(new AdminAuditService());

/** A plan that includes the merchant's trackers, so only the switch decides. */
const included = {
    source: "catalogue",
    modules: [{ moduleId: "site-trackers", state: "on" }],
} as unknown as BusinessAccess;
const head = new PublicHeadService(
    {
        resolve: () => Promise.resolve(included),
    } as unknown as CatalogueAccessService,
    new FixedWindowRateLimiter(1_000),
    new FixedWindowRateLimiter(1_000),
);

let staffId: string;
let organizationId: string;
let siteId: string;

const command = (reason = "Pixel account reported for misuse") =>
    ({
        staff: {
            userId: staffId,
            platformAdminId: "pa",
            roles: [],
            permissions: [AdminPermission.OrganizationTrackersWrite],
            viaBootstrap: false,
        },
        organizationId,
        siteId,
        reason,
    }) as never;

describe("site trackers kill switch (DB, U9)", () => {
    beforeAll(async () => {
        staffId = (
            await prisma.user.create({
                data: { email: `trackers-${tag}@example.com`, name: "Staff" },
            })
        ).id;
        organizationId = (
            await prisma.organization.create({
                data: { name: "Northwind", slug: `trk-${tag}` },
            })
        ).id;
        siteId = (
            await prisma.site.create({
                data: { organizationId, name: "Northwind", slug: `trk-${tag}` },
            })
        ).id;
        await prisma.siteTracker.create({
            data: {
                siteId,
                organizationId,
                kind: "ga4",
                trackerId: "G-ABC1234",
            },
        });
    });

    it("serves the trackers before anything is switched", async () => {
        const read = await head.read(siteId, "visitor");
        expect(read.trackers).toEqual([
            { kind: "ga4", id: "G-ABC1234", region: null },
        ]);
    });

    it("switched off: no trackers, and who, when and why are kept", async () => {
        await expect(service.switchOff(command())).resolves.toMatchObject({
            changed: true,
        });

        expect((await head.read(siteId, "visitor")).trackers).toEqual([]);

        const settings = await prisma.siteTrackingSettings.findUniqueOrThrow({
            where: { siteId },
        });
        expect(settings).toMatchObject({
            organizationId,
            switchedOffByStaffId: staffId,
            switchedOffReason: "Pixel account reported for misuse",
        });
        expect(settings.switchedOffAt).toBeInstanceOf(Date);

        const ledger = await prisma.adminAuditEvent.findFirstOrThrow({
            where: { organizationId, action: "site.trackers.switched-off" },
        });
        expect(ledger).toMatchObject({
            actorUserId: staffId,
            permission: AdminPermission.OrganizationTrackersWrite,
            targetType: "site",
            targetId: siteId,
            reason: "Pixel account reported for misuse",
            outcome: "SUCCESS",
        });
        await expect(
            prisma.auditEvent.count({
                where: { organizationId, action: "site.trackers.switched-off" },
            }),
        ).resolves.toBe(1);

        const [row] = await siteTrackerStates(organizationId);
        expect(row).toMatchObject({
            id: siteId,
            trackersOn: 1,
            switchedOff: {
                reason: "Pixel account reported for misuse",
                byUserId: staffId,
            },
        });
    });

    it("switched back on: the fields clear and the trackers return", async () => {
        await expect(
            service.switchOn(command("Account owner fixed it")),
        ).resolves.toMatchObject({ changed: true });

        await expect(
            prisma.siteTrackingSettings.findUniqueOrThrow({
                where: { siteId },
            }),
        ).resolves.toMatchObject({
            switchedOffAt: null,
            switchedOffByStaffId: null,
            switchedOffReason: null,
        });
        expect((await head.read(siteId, "visitor")).trackers).toHaveLength(1);
        await expect(
            prisma.adminAuditEvent.count({
                where: { organizationId, action: "site.trackers.switched-on" },
            }),
        ).resolves.toBe(1);
    });

    it("never reaches another business's site through this one's path", async () => {
        const other = await prisma.organization.create({
            data: { name: "Other", slug: `trk-o-${tag}` },
        });
        await expect(
            service.switchOff({
                ...(command() as object),
                organizationId: other.id,
            } as never),
        ).rejects.toThrow("Site not found");
    });
});
