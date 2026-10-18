/**
 * The business's phone, contact email, social links and the address its
 * site shows are read live by the public contact read (DEC-128). So a save
 * of any of them tells the merchant sites' page cache (#863), or a kept
 * page carries the old footer until its five minutes are up. DB-free.
 */
const mockEnv: Record<string, string | undefined> = { NODE_ENV: "test" };
jest.mock("../../env", () => ({ env: mockEnv, declaredNodeEnv: "test" }));

// The billing customer's sync job (DEC-165) has its own db spec.
const mockEnqueueBillingCustomerSync = jest.fn();
jest.mock("../billing/billing-customer-sync", () => ({
    enqueueBillingCustomerSync: (...args: unknown[]) =>
        mockEnqueueBillingCustomerSync(...args),
}));
jest.mock("@saroh/database", () => {
    const prisma = {
        organization: { findUnique: jest.fn(), update: jest.fn() },
        businessProfile: {
            upsert: jest.fn(),
            findUnique: jest.fn(),
        },
        store: { findMany: jest.fn().mockResolvedValue([]) },
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
        $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
        (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    return { prisma };
});
jest.mock("../billing/online-payments-plan", () => ({
    planTakesOnlinePayment: jest.fn().mockResolvedValue(true),
}));

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { SITE_PAGES_REVALIDATE_TYPE } from "../sites/page-cache-revalidate";
import { OrganizationSettingsService } from "./organization-settings.service";

const orgFindUnique = prisma.organization.findUnique as jest.Mock;
const profileFindUnique = prisma.businessProfile.findUnique as jest.Mock;
const profileUpsert = prisma.businessProfile.upsert as jest.Mock;
const siteFindMany = prisma.site.findMany as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

const record = jest.fn().mockResolvedValue(undefined);
const service = new OrganizationSettingsService(
    { record } as unknown as AuditService,
    {} as MediaService,
);

beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.SITE_PAGE_CACHE = "on";
    orgFindUnique.mockResolvedValue({
        id: "org_1",
        name: "Rye",
        slug: "rye",
        kind: "BUSINESS",
        businessProfile: null,
    });
    profileFindUnique.mockResolvedValue(null);
    profileUpsert.mockResolvedValue({});
    siteFindMany.mockResolvedValue([{ id: "site_1" }]);
});

afterAll(() => {
    mockEnv.SITE_PAGE_CACHE = undefined;
});

const queued = () =>
    jobCreate.mock.calls.map(
        (c) => (c[0] as { data: { type: string; payload: unknown } }).data,
    );

describe("saving what the site shows of the business", () => {
    it("writes social links as canonical addresses, scoped to the caller's business", async () => {
        await service.update(ctx, {
            socialLinks: { instagram: "@rye", whatsapp: "+91 98450 12345" },
        });
        const write = profileUpsert.mock.calls[0][0] as {
            where: unknown;
            update: unknown;
        };
        expect(write.where).toEqual({ organizationId: "org_1" });
        expect(write.update).toEqual({
            socialLinks: {
                instagram: "https://www.instagram.com/rye",
                whatsapp: "https://wa.me/919845012345",
            },
        });
    });

    it("keeps the links already set when one is changed", async () => {
        profileFindUnique.mockResolvedValue({
            socialLinks: { telegram: "https://t.me/rye_co" },
        });
        await service.update(ctx, { socialLinks: { x: "@rye" } });
        const write = profileUpsert.mock.calls[0][0] as { update: unknown };
        expect(write.update).toEqual({
            socialLinks: {
                telegram: "https://t.me/rye_co",
                x: "https://x.com/rye",
            },
        });
    });

    it("refuses an arbitrary address on its field, and writes and queues nothing", async () => {
        const refusal = await service
            .update(ctx, { socialLinks: { facebook: "https://evil.example" } })
            .catch((e: unknown) => e);
        expect(refusal).toBeInstanceOf(BadRequestException);
        expect((refusal as BadRequestException).getResponse()).toMatchObject({
            details: { field: "socialLinks.facebook" },
        });
        expect(profileUpsert).not.toHaveBeenCalled();
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it.each([
        ["social links", { socialLinks: { instagram: "@rye" } }],
        ["the phone", { profile: { phone: "+91 98450 12345" } }],
        [
            "the contact email",
            { profile: { contactEmail: "hi@rye.example.com" } },
        ],
        ["the registered address choice", { siteShowsRegisteredAddress: true }],
        ["the registered address", { registeredAddress: { city: "Mysuru" } }],
        [
            "the registered address's map link",
            { registeredAddressMapUrl: "g.page/rye-bakery" },
        ],
    ])("%s queue the business's published sites", async (_what, dto) => {
        await service.update(ctx, dto);
        expect(siteFindMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                deletedAt: null,
                currentPublicationId: { not: null },
            },
            select: { id: true },
        });
        expect(queued()).toEqual([
            {
                type: SITE_PAGES_REVALIDATE_TYPE,
                payload: { cause: "contact", siteIds: ["site_1"] },
            },
        ]);
    });

    it("keeps a map link as Google's own address, and refuses any other on its field", async () => {
        await service.update(ctx, {
            registeredAddressMapUrl: "https://www.google.co.in/maps/place/Rye",
        });
        const write = profileUpsert.mock.calls[0][0] as { update: unknown };
        expect(write.update).toEqual({
            registeredAddressMapUrl: "https://www.google.com/maps/place/Rye",
        });

        profileUpsert.mockClear();
        const refusal = await service
            .update(ctx, {
                registeredAddressMapUrl: "https://evil.example/maps",
            })
            .catch((e: unknown) => e);
        expect(refusal).toBeInstanceOf(BadRequestException);
        expect((refusal as BadRequestException).getResponse()).toMatchObject({
            details: { field: "registeredAddressMapUrl" },
        });
        expect(profileUpsert).not.toHaveBeenCalled();

        await service.update(ctx, { registeredAddressMapUrl: "" });
        expect(
            (profileUpsert.mock.calls[0][0] as { update: unknown }).update,
        ).toEqual({ registeredAddressMapUrl: null });
    });

    it("queues nothing for a save the site doesn't show", async () => {
        await service.update(ctx, { profile: { legalName: "Rye & Co LLP" } });
        await service.update(ctx, { name: "Rye & Co." });
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("reads and queues nothing while the page cache is off", async () => {
        mockEnv.SITE_PAGE_CACHE = undefined;
        await service.update(ctx, { socialLinks: { instagram: "@rye" } });
        expect(siteFindMany).not.toHaveBeenCalled();
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("records the change by name only", async () => {
        await service.update(ctx, { socialLinks: { instagram: "@rye" } });
        const { metadata } = record.mock.calls[0][0] as {
            metadata: { fields: string[]; changes: unknown[] };
        };
        expect(metadata.fields).toEqual(["socialLinks"]);
        expect(metadata.changes).toEqual([]);
    });

    it("needs the right to change the business", async () => {
        await expect(
            service.update(
                { ...ctx, role: "MEMBER" },
                { socialLinks: { instagram: "@rye" } },
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(profileUpsert).not.toHaveBeenCalled();
    });
});

describe("what the site shows, for the workspace", () => {
    it("is the public contact read of the caller's own business", async () => {
        profileFindUnique.mockResolvedValue({
            phone: "+919845012345",
            contactEmail: null,
            socialLinks: { instagram: "https://www.instagram.com/rye" },
            siteShowsRegisteredAddress: true,
            registeredAddressMapUrl: null,
            addressLine1: null,
            addressLine2: null,
            city: null,
            postalCode: null,
        });
        const view = await service.siteContact({ ...ctx, role: "MEMBER" });
        expect(view).toEqual({
            contact: {
                phone: "+919845012345",
                email: null,
                places: [],
                social: [
                    {
                        network: "instagram",
                        url: "https://www.instagram.com/rye",
                    },
                ],
            },
            registeredAddressChosen: true,
        });
        for (const call of profileFindUnique.mock.calls) {
            expect((call[0] as { where: unknown }).where).toEqual({
                organizationId: "org_1",
            });
        }
    });
});
