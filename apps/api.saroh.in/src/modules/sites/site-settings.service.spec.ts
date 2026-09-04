// DB-free unit tests for a site's search and social settings (#188). The
// database package is mocked so nothing touches Postgres.
//
// The behaviour worth pinning is the absent/null distinction: a settings form
// PATCHes what changed, so an omitted field must be left alone and an explicit
// null must clear. Get that backwards and saving a title silently wipes the
// share image.
jest.mock("@saroh/database", () => {
    const client = {
        site: {
            findFirst: jest.fn(),
            update: jest.fn(),
        },
    };
    return { prisma: client };
});

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const siteUpdate = prisma.site.update as jest.Mock;

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_1",
    role: "OWNER",
};
const MEMBER: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_2",
    role: "MEMBER",
};
const SITE = "site_1";

const service = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

beforeEach(() => {
    jest.clearAllMocks();
    // assertSiteInOrg's lookup, then the update's returning select.
    siteFindFirst.mockResolvedValue({ id: SITE });
    siteUpdate.mockResolvedValue({
        id: SITE,
        seoTitle: null,
        seoDescription: null,
        socialImageUrl: null,
    });
});

describe("SitesService.updateSettings — absent vs null", () => {
    it("writes only the fields the caller actually sent", async () => {
        await service.updateSettings(OWNER, SITE, {
            seoTitle: "Flour & Ferment · Bermondsey",
        });

        expect(siteUpdate).toHaveBeenCalledTimes(1);
        const { data } = siteUpdate.mock.calls[0][0];
        expect(data).toEqual({ seoTitle: "Flour & Ferment · Bermondsey" });
        // The two it did not send must not appear at all — présent-as-undefined
        // would still be a write in some clients, and a wipe in others.
        expect("seoDescription" in data).toBe(false);
        expect("socialImageUrl" in data).toBe(false);
    });

    it("clears a field when it is sent as null", async () => {
        await service.updateSettings(OWNER, SITE, { socialImageUrl: null });

        const { data } = siteUpdate.mock.calls[0][0];
        expect(data).toEqual({ socialImageUrl: null });
    });

    it("distinguishes clearing one field from leaving the others alone", async () => {
        // The exact case that makes this worth a test: a merchant removes the
        // share image and keeps their title.
        await service.updateSettings(OWNER, SITE, {
            socialImageUrl: null,
            seoTitle: "Kept",
        });

        const { data } = siteUpdate.mock.calls[0][0];
        expect(data).toEqual({ socialImageUrl: null, seoTitle: "Kept" });
        expect("seoDescription" in data).toBe(false);
    });

    it("carries the picture's measurements with it, and clears them with it", async () => {
        // WhatsApp draws its large card only when og:image:width/height are
        // present (#220), so the facts travel with the address — and go when
        // the address goes, or the next picture inherits the last one's size.
        await service.updateSettings(OWNER, SITE, {
            socialImageUrl: "https://cdn.example.com/share.png",
            socialImageWidth: 1200,
            socialImageHeight: 630,
            socialImageBytes: 180_000,
        });
        expect(siteUpdate.mock.calls[0][0].data).toEqual({
            socialImageUrl: "https://cdn.example.com/share.png",
            socialImageWidth: 1200,
            socialImageHeight: 630,
            socialImageBytes: 180_000,
        });

        await service.updateSettings(OWNER, SITE, {
            socialImageUrl: null,
            socialImageWidth: null,
            socialImageHeight: null,
            socialImageBytes: null,
        });
        expect(siteUpdate.mock.calls[1][0].data).toEqual({
            socialImageUrl: null,
            socialImageWidth: null,
            socialImageHeight: null,
            socialImageBytes: null,
        });
    });

    it("writes nothing when the body is empty", async () => {
        await service.updateSettings(OWNER, SITE, {});

        const { data } = siteUpdate.mock.calls[0][0];
        expect(data).toEqual({});
    });

    it("scopes the update to the proven site id", async () => {
        await service.updateSettings(OWNER, SITE, { seoTitle: "x" });
        expect(siteUpdate.mock.calls[0][0].where).toEqual({ id: SITE });
    });
});

describe("SitesService.updateSettings — authorization", () => {
    it("requires site:update, so a MEMBER cannot change what the public sees", async () => {
        await expect(
            service.updateSettings(MEMBER, SITE, { seoTitle: "x" }),
        ).rejects.toBeDefined();
        expect(siteUpdate).not.toHaveBeenCalled();
    });

    it("404s a site outside the actor's organization before writing", async () => {
        siteFindFirst.mockResolvedValue(null);
        await expect(
            service.updateSettings(OWNER, "site_elsewhere", { seoTitle: "x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(siteUpdate).not.toHaveBeenCalled();
    });
});
