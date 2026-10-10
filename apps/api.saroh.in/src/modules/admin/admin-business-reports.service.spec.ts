jest.mock("@saroh/database", () => {
    const prisma = {
        businessReport: {
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
            callback(prisma),
        ),
    };
    return {
        prisma,
        outsideOrgContext: jest.fn((fn: () => unknown) => fn()),
    };
});

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminBusinessReportsService } from "./admin-business-reports.service";
import { AdminPermission } from "./admin-permissions";

const db = prisma as unknown as {
    businessReport: {
        findMany: jest.Mock;
        count: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
    };
};

const staffWith = (...permissions: AdminPermission[]): PlatformAdminInfo => ({
    userId: "staff_1",
    platformAdminId: "pa_1",
    roles: ["SUPPORT"],
    permissions,
    viaBootstrap: false,
});

const ROW = {
    id: "r1",
    siteHost: "kavi.saroh.app",
    message: "Never delivered.",
    status: "OPEN",
    createdAt: new Date("2026-10-09T10:00:00Z"),
    doneAt: null,
    reporterEmail: "me@example.com",
    organization: { id: "org_1", name: "Kavi Studio" },
};

function build() {
    const audit = { write: jest.fn() };
    return {
        service: new AdminBusinessReportsService(
            audit as unknown as AdminAuditService,
        ),
        audit,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    db.businessReport.findMany.mockResolvedValue([ROW]);
    db.businessReport.count.mockResolvedValue(1);
});

describe("AdminBusinessReportsService.list", () => {
    it("hides the reporter's email without organization:pii:read", async () => {
        const { service } = build();
        const page = await service.list(
            staffWith(AdminPermission.OrganizationRead),
            {},
        );
        expect(page.items[0]).toMatchObject({
            id: "r1",
            business: { id: "org_1", name: "Kavi Studio" },
            hasEmail: true,
            reporterEmail: null,
        });
        expect(page.open).toBe(1);
    });

    it("shows it with organization:pii:read", async () => {
        const { service } = build();
        const page = await service.list(
            staffWith(
                AdminPermission.OrganizationRead,
                AdminPermission.OrganizationPiiRead,
            ),
            {},
        );
        expect(page.items[0]?.reporterEmail).toBe("me@example.com");
    });

    it("lists open reports newest first by default, and all on asking", async () => {
        const { service } = build();
        await service.list(staffWith(AdminPermission.OrganizationRead), {});
        expect(db.businessReport.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { status: "OPEN" },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            }),
        );
        await service.list(staffWith(AdminPermission.OrganizationRead), {
            status: "all",
        });
        expect(db.businessReport.findMany).toHaveBeenLastCalledWith(
            expect.objectContaining({ where: {} }),
        );
    });
});

describe("AdminBusinessReportsService.markDone", () => {
    it("marks an open report done and audits it with the reason", async () => {
        const { service, audit } = build();
        db.businessReport.findUnique.mockResolvedValue({
            status: "OPEN",
            organizationId: "org_1",
        });
        await expect(
            service.markDone(
                staffWith(AdminPermission.ReportsResolve),
                "r1",
                " Spoke to the business ",
            ),
        ).resolves.toEqual({ id: "r1", status: "DONE" });
        expect(db.businessReport.update).toHaveBeenCalledWith({
            where: { id: "r1" },
            data: { status: "DONE", doneAt: expect.any(Date) as Date },
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "business-report.done",
                permission: AdminPermission.ReportsResolve,
                organizationId: "org_1",
                reason: "Spoke to the business",
            }),
        );
    });

    it("changes nothing for a report already done", async () => {
        const { service, audit } = build();
        db.businessReport.findUnique.mockResolvedValue({
            status: "DONE",
            organizationId: null,
        });
        await service.markDone(staffWith(), "r1", "again");
        expect(db.businessReport.update).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it("is a 404 for a report that doesn't exist", async () => {
        const { service } = build();
        db.businessReport.findUnique.mockResolvedValue(null);
        await expect(
            service.markDone(staffWith(), "nope", "reason"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
