/**
 * Customers' reports (Terms rev 46) against a real Postgres: a report on a
 * platform address or a verified custom domain lands on its business, one on
 * any other address keeps no business, the console lists them newest first
 * with the reporter's email and mobile number only for staff who may read
 * personal data (a report from before DEC-138 has neither), and marking one
 * done is audited once.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../sites/site-origin", () => ({
    rendererHost: () => "saroh.app",
}));

import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditService } from "../admin/admin-audit.service";
import { AdminBusinessReportsService } from "../admin/admin-business-reports.service";
import { AdminPermission } from "../admin/admin-permissions";
import { BusinessReportsService } from "./business-reports.service";

const tag = `${process.pid}-${Date.now()}`;
const service = new BusinessReportsService();
const admin = new AdminBusinessReportsService(new AdminAuditService());

const staff = (...permissions: AdminPermission[]): PlatformAdminInfo => ({
    userId: "support_1",
    platformAdminId: "pa_1",
    roles: ["SUPPORT"],
    permissions,
    viaBootstrap: false,
});

let orgId = "";
const address = `kavi${process.pid}`;
const custom = `glow-${process.pid}.example.com`;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kavi Studio", slug: `kavi-${tag}` },
    });
    orgId = org.id;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Kavi",
            slug: `kavi-${tag}`,
            subdomain: address,
        },
    });
    await prisma.domain.create({
        data: {
            organizationId: org.id,
            hostname: custom,
            siteId: site.id,
            status: "VERIFIED",
            verificationToken: `token-${tag}`,
        },
    });
});

describe("business reports", () => {
    it("lands a report on the business behind the address", async () => {
        await service.submit({
            site: `https://${address}.saroh.app/shop`,
            message: "Paid and nothing came.",
            email: "first.last@example.com",
            phone: "+91 98450 12345",
        });
        await service.submit({
            site: `www.${custom}`,
            message: "Rude about a refund.",
            email: "asha.rao@example.com",
            phone: "98450 67890",
        });
        // A report from before DEC-138, when neither was asked for: the
        // columns stay nullable for these.
        await prisma.businessReport.create({
            data: {
                siteHost: "someone-else.example.org",
                message: "Not a Saroh site at all.",
            },
        });

        const rows = await prisma.businessReport.findMany({
            orderBy: { createdAt: "asc" },
            select: { organizationId: true, siteHost: true },
        });
        expect(rows).toEqual([
            { organizationId: orgId, siteHost: `${address}.saroh.app` },
            { organizationId: orgId, siteHost: `www.${custom}` },
            { organizationId: null, siteHost: "someone-else.example.org" },
        ]);
    });

    it("lists newest first, the email only with personal data", async () => {
        const plain = await admin.list(
            staff(AdminPermission.OrganizationRead),
            {},
        );
        expect(plain.items.map((r) => r.siteHost)).toEqual([
            "someone-else.example.org",
            `www.${custom}`,
            `${address}.saroh.app`,
        ]);
        expect(plain.open).toBe(3);
        const first = plain.items[2];
        expect(first).toMatchObject({
            hasEmail: true,
            reporterEmail: null,
            hasPhone: true,
            reporterPhone: null,
            business: { id: orgId, name: "Kavi Studio" },
        });

        const pii = await admin.list(
            staff(
                AdminPermission.OrganizationRead,
                AdminPermission.OrganizationPiiRead,
            ),
            {},
        );
        expect(pii.items[2]).toMatchObject({
            reporterEmail: "first.last@example.com",
            reporterPhone: "+91 98450 12345",
        });
        // The older report has neither, whoever reads it.
        expect(pii.items[0]).toMatchObject({
            hasEmail: false,
            reporterEmail: null,
            hasPhone: false,
            reporterPhone: null,
        });
    });

    it("marks one done, audited once", async () => {
        const [report] = (
            await admin.list(staff(AdminPermission.OrganizationRead), {})
        ).items;
        if (!report) throw new Error("no report");
        const who = staff(AdminPermission.ReportsResolve);
        await admin.markDone(who, report.id, "Looked into it");
        await admin.markDone(who, report.id, "Looked into it");

        const open = await admin.list(who, { status: "open" });
        const done = await admin.list(who, { status: "done" });
        expect(open.items).toHaveLength(2);
        expect(done.items.map((r) => r.id)).toEqual([report.id]);
        expect(done.items[0]?.doneAt).toBeInstanceOf(Date);
        expect(
            await prisma.adminAuditEvent.count({
                where: { action: "business-report.done", targetId: report.id },
            }),
        ).toBe(1);
    });
});
