/**
 * The business logo is the icon of a site with none of its own (DEC-120),
 * read live by the public site read. So setting or removing it tells the
 * merchant sites' page cache (#863), or a kept page carries the old logo in
 * its head until its five minutes are up. DB-free.
 */
const mockEnv: Record<string, string | undefined> = { NODE_ENV: "test" };
jest.mock("../../env", () => ({ env: mockEnv, declaredNodeEnv: "test" }));

jest.mock("@saroh/database", () => ({
    prisma: {
        organization: { findUnique: jest.fn() },
        businessProfile: {
            upsert: jest.fn(),
            findUnique: jest.fn(),
            updateMany: jest.fn(),
        },
        order: { findFirst: jest.fn().mockResolvedValue(null) },
        invoiceSequence: { findMany: jest.fn().mockResolvedValue([]) },
        product: { count: jest.fn().mockResolvedValue(0) },
        service: { count: jest.fn().mockResolvedValue(0) },
        site: {
            count: jest.fn().mockResolvedValue(0),
            findMany: jest.fn(),
        },
        invoice: { count: jest.fn().mockResolvedValue(0) },
        job: { create: jest.fn().mockResolvedValue({}) },
    },
}));
jest.mock("../billing/online-payments-plan", () => ({
    planTakesOnlinePayment: jest.fn().mockResolvedValue(true),
}));

import { prisma } from "@saroh/database";

import type { AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { SITE_PAGES_REVALIDATE_TYPE } from "../sites/page-cache-revalidate";
import { OrganizationSettingsService } from "./organization-settings.service";

const orgFindUnique = prisma.organization.findUnique as jest.Mock;
const profileFindUnique = prisma.businessProfile.findUnique as jest.Mock;
const profileUpdateMany = prisma.businessProfile.updateMany as jest.Mock;
const siteFindMany = prisma.site.findMany as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;

const ctx = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
} as const;

const readyObject = jest.fn();
const service = new OrganizationSettingsService(
    {
        record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService,
    { readyObject } as unknown as MediaService,
);

beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.SITE_PAGE_CACHE = "on";
    orgFindUnique.mockResolvedValue({
        id: "org_1",
        name: "Acme",
        slug: "acme",
        businessProfile: null,
    });
    profileFindUnique.mockResolvedValue(null);
    readyObject.mockResolvedValue({
        id: "media_1",
        url: "https://media.saroh.test/org/org_1/business-logo/a.png",
        contentType: "image/png",
        sizeBytes: 40_000,
    });
    siteFindMany.mockResolvedValue([{ id: "site_1" }, { id: "site_2" }]);
});

afterAll(() => {
    mockEnv.SITE_PAGE_CACHE = undefined;
});

describe("the business logo and the sites that show it as their icon", () => {
    it("setting it queues the business's published sites", async () => {
        await service.setLogo(ctx, "media_1");

        // The caller's business, live sites only.
        expect(siteFindMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                deletedAt: null,
                currentPublicationId: { not: null },
            },
            select: { id: true },
        });
        expect(jobCreate).toHaveBeenCalledWith({
            data: {
                type: SITE_PAGES_REVALIDATE_TYPE,
                payload: { cause: "icon", siteIds: ["site_1", "site_2"] },
            },
        });
    });

    it("removing it queues them too, and only when there was one", async () => {
        profileUpdateMany.mockResolvedValue({ count: 1 });
        await service.removeLogo(ctx);
        expect(jobCreate).toHaveBeenCalledTimes(1);

        jobCreate.mockClear();
        profileUpdateMany.mockResolvedValue({ count: 0 });
        await service.removeLogo(ctx);
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("queues nothing for a business with no published site", async () => {
        siteFindMany.mockResolvedValue([]);
        await service.setLogo(ctx, "media_1");
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("reads and queues nothing while the page cache is off", async () => {
        mockEnv.SITE_PAGE_CACHE = undefined;
        await service.setLogo(ctx, "media_1");
        expect(siteFindMany).not.toHaveBeenCalled();
        expect(jobCreate).not.toHaveBeenCalled();
    });
});
