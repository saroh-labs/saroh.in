/**
 * The public contact read (DEC-125): the business is derived from the site,
 * never from the caller, and a missing site or a flood is refused. DB-free.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        site: { findFirst: jest.fn() },
        businessProfile: { findUnique: jest.fn() },
        store: { findMany: jest.fn() },
    },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));

import { HttpException, NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PublicContactService } from "./public-contact.service";

const siteFind = prisma.site.findFirst as jest.Mock;
const profileFind = prisma.businessProfile.findUnique as jest.Mock;
const storesFind = prisma.store.findMany as jest.Mock;
const inOrg = runInOrgContext as jest.Mock;

const service = (limit = 1_000) =>
    new PublicContactService(new FixedWindowRateLimiter(limit));

beforeEach(() => {
    jest.clearAllMocks();
    siteFind.mockResolvedValue({ organizationId: "org_1" });
    profileFind.mockResolvedValue({
        phone: "+919845012345",
        contactEmail: "hello@rye.example.com",
        socialLinks: { instagram: "https://www.instagram.com/rye" },
        siteShowsRegisteredAddress: false,
        addressLine1: "14 Hill Road",
        addressLine2: null,
        city: "Bengaluru",
        postalCode: "560038",
    });
    storesFind.mockResolvedValue([]);
});

describe("PublicContactService", () => {
    it("serves the site's own business, in that business's context", async () => {
        const contact = await service().read("site_1", "visitor");

        expect(siteFind).toHaveBeenCalledWith({
            where: { id: "site_1", deletedAt: null },
            select: { organizationId: true },
        });
        expect(inOrg).toHaveBeenCalledWith("org_1", expect.any(Function));
        expect(profileFind).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: "org_1" } }),
        );
        expect(contact).toEqual({
            phone: "+919845012345",
            email: "hello@rye.example.com",
            // The registered address is on file and was not chosen.
            places: [],
            social: [
                { network: "instagram", url: "https://www.instagram.com/rye" },
            ],
        });
    });

    it("is a 404 for a site that isn't there, and reads no business", async () => {
        siteFind.mockResolvedValue(null);
        await expect(service().read("nope", "v")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(profileFind).not.toHaveBeenCalled();
    });

    it("is a 429 past the visitor's limit", async () => {
        const contacts = service(1);
        await contacts.read("site_1", "v");
        await expect(contacts.read("site_1", "v")).rejects.toBeInstanceOf(
            HttpException,
        );
    });
});
