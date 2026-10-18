jest.mock("@saroh/database", () => ({
    prisma: {
        sarohInvoice: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            aggregate: jest.fn(),
            count: jest.fn(),
            // Prisma's field reference for "less than the total" (R29).
            fields: { totalPaise: "totalPaise" },
        },
        billingRefund: { findMany: jest.fn(() => Promise.resolve([])) },
        subscription: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            count: jest.fn(),
            groupBy: jest.fn(),
        },
        plan: { findMany: jest.fn() },
        billingCheckout: { findMany: jest.fn() },
        billingWebhookEvent: { findMany: jest.fn() },
        pricingCatalogVersion: { findUnique: jest.fn() },
    },
}));
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/platform-admin.guard", () => ({
    PlatformAdminGuard: class PlatformAdminGuard {},
}));

import { ForbiddenException } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { REQUIRE_ADMIN_PERMISSIONS } from "../../common/decorators/require-admin-permission.decorator";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminBillingController } from "./admin-billing.controller";
import {
    AdminBillingService,
    assertSarohBillingReader,
    invoiceWhere,
} from "./admin-billing.service";
import {
    AdminPermission,
    AdminRole,
    permissionsFor,
} from "./admin-permissions";

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */

function staffAs(...roles: AdminRole[]): PlatformAdminInfo {
    return {
        userId: "staff_1",
        platformAdminId: "pa_1",
        roles,
        permissions: permissionsFor(roles),
        viaBootstrap: false,
    };
}

const db = prisma as unknown as {
    sarohInvoice: Record<string, jest.Mock>;
    subscription: Record<string, jest.Mock>;
    plan: Record<string, jest.Mock>;
    billingCheckout: Record<string, jest.Mock>;
    billingWebhookEvent: Record<string, jest.Mock>;
};

beforeEach(() => jest.clearAllMocks());

describe("saroh-billing:read", () => {
    it("is held by Platform Owners and Billing, and by no other role", () => {
        const holders = Object.values(AdminRole)
            .filter((role) =>
                permissionsFor([role]).includes(
                    AdminPermission.SarohBillingRead,
                ),
            )
            .sort();
        expect(holders).toEqual(
            [AdminRole.Billing, AdminRole.PlatformOwner].sort(),
        );
    });

    it("is what every billing route declares, and nothing broader", () => {
        const proto = AdminBillingController.prototype as unknown as Record<
            string,
            unknown
        >;
        const routes = Object.getOwnPropertyNames(proto).filter(
            (name) =>
                name !== "constructor" &&
                Reflect.getMetadata(PATH_METADATA, proto[name] as object) !==
                    undefined,
        );
        expect(routes.sort()).toEqual(
            [
                "counts",
                "exportInvoices",
                "history",
                "invoicePdf",
                "listInvoices",
                "listSubscriptions",
                "subscription",
            ].sort(),
        );
        for (const name of routes) {
            expect(
                Reflect.getMetadata(
                    REQUIRE_ADMIN_PERMISSIONS,
                    proto[name] as object,
                ),
            ).toEqual([AdminPermission.SarohBillingRead]);
        }
    });

    it("puts the export ahead of an invoice's id", () => {
        const proto = AdminBillingController.prototype;
        expect(Reflect.getMetadata(PATH_METADATA, proto.exportInvoices)).toBe(
            "billing/invoices/export",
        );
    });
});

describe("the service checks the permission itself", () => {
    const service = new AdminBillingService();

    it.each([
        AdminRole.Support,
        AdminRole.Operations,
        AdminRole.ReleaseManager,
        AdminRole.Auditor,
    ])(
        "refuses %s on every read before touching the database",
        async (role) => {
            const staff = staffAs(role);
            await expect(
                service.listInvoices(staff, {}),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                service.exportInvoices(staff, { month: "2026-10" }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                service.invoicePdf(staff, "inv_1"),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                service.listSubscriptions(staff, {}),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                service.subscriptionDetail(staff, "sub_1"),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.counts(staff)).rejects.toBeInstanceOf(
                ForbiddenException,
            );
            expect(db.sarohInvoice.findMany).not.toHaveBeenCalled();
            expect(db.sarohInvoice.findUnique).not.toHaveBeenCalled();
            expect(db.subscription.findMany).not.toHaveBeenCalled();
            expect(db.subscription.findUnique).not.toHaveBeenCalled();
        },
    );

    it("refuses no staff context at all", () => {
        expect(() => assertSarohBillingReader(undefined)).toThrow(
            ForbiddenException,
        );
    });

    it("lets Billing read the invoices, with the filtered set's totals", async () => {
        db.sarohInvoice.findMany.mockResolvedValue([]);
        db.sarohInvoice.aggregate.mockResolvedValue({
            _count: { _all: 3 },
            _sum: { taxablePaise: 300, taxPaise: 54, totalPaise: 354 },
        });
        db.sarohInvoice.count.mockResolvedValue(1);
        const page = await service.listInvoices(staffAs(AdminRole.Billing), {
            month: "2026-10",
            gstin: "yes",
            page: 2,
        });
        expect(page.totals).toEqual({
            count: 3,
            taxablePaise: 300,
            taxPaise: 54,
            totalPaise: 354,
        });
        expect(page.statusCounts).toEqual({ paid: 1, unpaid: 1, refunded: 1 });
        expect(db.sarohInvoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 50, take: 50 }),
        );
    });

    it("refuses an export with no month", async () => {
        await expect(
            service.exportInvoices(staffAs(AdminRole.PlatformOwner), {}),
        ).rejects.toMatchObject({ status: 400 });
    });
});

describe("invoiceWhere", () => {
    it("narrows by the IST month, GSTIN and a search across number, buyer and business", () => {
        expect(
            invoiceWhere({ month: "2026-10", gstin: "yes", q: " studio " }),
        ).toEqual({
            AND: [
                {
                    issuedAt: {
                        gte: new Date("2026-09-30T18:30:00.000Z"),
                        lt: new Date("2026-10-31T18:30:00.000Z"),
                    },
                },
                { billToGstin: { not: null } },
                {
                    OR: [
                        { number: { contains: "studio", mode: "insensitive" } },
                        {
                            billToName: {
                                contains: "studio",
                                mode: "insensitive",
                            },
                        },
                        {
                            organization: {
                                name: {
                                    contains: "studio",
                                    mode: "insensitive",
                                },
                            },
                        },
                        {
                            organization: {
                                slug: {
                                    contains: "studio",
                                    mode: "insensitive",
                                },
                            },
                        },
                    ],
                },
            ],
        });
        expect(invoiceWhere({ gstin: "no" })).toEqual({
            AND: [{ billToGstin: null }],
        });
    });
});

describe("AdminBillingController records every read", () => {
    it("audits a PDF read against the invoice and its business", async () => {
        const audit = { recordRead: jest.fn(async () => undefined) };
        const service = new AdminBillingService();
        jest.spyOn(service, "invoicePdf").mockResolvedValue({
            file: Buffer.from("%PDF"),
            fileName: "TST-26-27-0001.pdf",
            organizationId: "org_1",
        });
        const controller = new AdminBillingController(
            service,
            audit as unknown as AdminAuditService,
        );
        await controller.invoicePdf(staffAs(AdminRole.Billing), "inv_1");
        expect(audit.recordRead).toHaveBeenCalledWith(
            expect.objectContaining({
                permission: AdminPermission.SarohBillingRead,
                action: "billing.invoice.pdf",
                targetId: "inv_1",
                organizationId: "org_1",
                outcome: "SUCCESS",
            }),
        );
    });

    it("never writes the search text to the ledger", async () => {
        const audit = { recordRead: jest.fn(async () => undefined) };
        const service = new AdminBillingService();
        jest.spyOn(service, "listInvoices").mockResolvedValue({
            items: [],
            page: 1,
            limit: 50,
            totals: { count: 0, taxablePaise: 0, taxPaise: 0, totalPaise: 0 },
        });
        const controller = new AdminBillingController(
            service,
            audit as unknown as AdminAuditService,
        );
        await controller.listInvoices(staffAs(AdminRole.Billing), {
            q: "Some Person",
            month: "2026-10",
        });
        const entry = audit.recordRead.mock.calls[0]![0] as {
            metadata: Record<string, unknown>;
        };
        expect(entry.metadata).toEqual({
            searched: true,
            month: "2026-10",
            resultCount: 0,
        });
        expect(JSON.stringify(entry)).not.toContain("Some Person");
    });
});
