// DB-free unit tests: @saroh/database is mocked so nothing touches Postgres.
jest.mock("@saroh/database", () => ({
    MERGE_REPORT_ACTION: "catalogue.products.merged",
    prisma: { auditEvent: { findMany: jest.fn() } },
}));

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { MergeReportService } from "./merge-report.service";

const findMany = prisma.auditEvent.findMany as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        ...over,
    };
}

describe("MergeReportService (#530)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("reads the business's merge reports, newest first", async () => {
        const at = new Date("2026-10-02T10:00:00Z");
        findMany.mockResolvedValue([
            {
                id: "ev_1",
                createdAt: at,
                metadata: {
                    organizationId: "org_1",
                    merged: [
                        {
                            name: "Linen shirt",
                            productId: "a",
                            slug: "linen-shirt",
                            from: [{ productId: "b", slug: "linen-shirt-2" }],
                        },
                    ],
                    keptApart: [],
                    discarded: [],
                },
            },
        ]);
        const reports = await new MergeReportService().list(ctx());
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    action: "catalogue.products.merged",
                },
                orderBy: { createdAt: "desc" },
            }),
        );
        expect(reports).toEqual([
            {
                id: "ev_1",
                at,
                merged: [expect.objectContaining({ name: "Linen shirt" })],
                keptApart: [],
                discarded: [],
            },
        ]);
    });

    it("lets an Admin read it", async () => {
        findMany.mockResolvedValue([]);
        await expect(
            new MergeReportService().list(ctx({ role: "ADMIN" })),
        ).resolves.toEqual([]);
    });

    it.each(["MEMBER", "REVIEWER"] as const)(
        "refuses a %s before reading anything",
        async (role) => {
            await expect(
                new MergeReportService().list(ctx({ role })),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(findMany).not.toHaveBeenCalled();
        },
    );
});
