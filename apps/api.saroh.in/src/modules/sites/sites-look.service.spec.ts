// DB-free unit tests for the site-wide look: style (#189), footer (#202) and
// menu (#206). The database package is mocked so nothing touches Postgres; the
// parsers are the real ones, because what is proven here is the endpoint's own
// contract — permission first, validation before any write, and a cleared
// footer or menu stored as a database NULL rather than a JSON null.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            site: { findFirst: jest.fn(), update: jest.fn() },
        },
    };
});

import { BadRequestException } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { defaultSiteStyle } from "./site-style";
import { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const siteUpdate = prisma.site.update as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        ...over,
    };
}

const service = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as import("../billing/entitlement.service").EntitlementService);

beforeEach(() => {
    jest.clearAllMocks();
    siteFindFirst.mockResolvedValue({
        id: "site_1",
        currentPublicationId: null,
    });
    siteUpdate.mockResolvedValue({ id: "site_1" });
});

describe("SitesService.updateStyle", () => {
    it("stores the whole look the parser produced, on the org's own site", async () => {
        const res = await service.updateStyle(ctx(), "site_1", {
            colours: { accent: "teal" },
        });

        expect(siteFindFirst.mock.calls[0][0].where).toEqual({
            id: "site_1",
            organizationId: "org_1",
            deletedAt: null,
        });
        // Replaces rather than merges: what is written is a complete look, the
        // choice made plus the defaults for everything not chosen.
        expect(res.style.colours.accent).toBe("teal");
        expect(res.style.scalars).toEqual(defaultSiteStyle().scalars);
        expect(siteUpdate).toHaveBeenCalledWith({
            where: { id: "site_1" },
            data: { style: res.style },
            select: { id: true },
        });
    });

    it("refuses a colour that is not on offer, and writes nothing", async () => {
        await expect(
            service.updateStyle(ctx(), "site_1", {
                colours: { accent: "#ff0000" },
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(siteUpdate).not.toHaveBeenCalled();
    });

    it("denies site:update to a MEMBER before touching the database", async () => {
        await expect(
            service.updateStyle(ctx({ role: "MEMBER" }), "site_1", {
                colours: { accent: "teal" },
            }),
        ).rejects.toThrow(/MEMBER.*site:update/);
        expect(siteFindFirst).not.toHaveBeenCalled();
        expect(siteUpdate).not.toHaveBeenCalled();
    });
});

describe("SitesService.updateFooter", () => {
    it("stores the footer the merchant wrote", async () => {
        const res = await service.updateFooter(ctx(), "site_1", {
            format: "markdown",
            value: "Northwind Supply",
        });

        expect(res).toEqual({
            id: "site_1",
            footer: { format: "markdown", value: "Northwind Supply" },
        });
        expect(siteUpdate.mock.calls[0][0].data).toEqual({
            footer: { format: "markdown", value: "Northwind Supply" },
        });
    });

    it("clears the column when the box is emptied — there is no separate delete", async () => {
        const res = await service.updateFooter(ctx(), "site_1", {
            value: "   ",
        });

        expect(res.footer).toBeNull();
        // A database NULL, not a JSON null — the two are different values in a
        // Json column, and clearing means the column holds nothing at all.
        expect(siteUpdate.mock.calls[0][0].data.footer).toBe(Prisma.DbNull);
    });

    it("denies site:update to a MEMBER before touching the database", async () => {
        await expect(
            service.updateFooter(ctx({ role: "MEMBER" }), "site_1", {
                value: "Northwind Supply",
            }),
        ).rejects.toThrow(/MEMBER.*site:update/);
        expect(siteFindFirst).not.toHaveBeenCalled();
        expect(siteUpdate).not.toHaveBeenCalled();
    });
});

describe("SitesService.updateNavigation", () => {
    it("stores the menu in the merchant's order, labels trimmed", async () => {
        const res = await service.updateNavigation(ctx(), "site_1", {
            items: [
                { pageId: "page_2", label: " Our story " },
                { pageId: "page_1" },
            ],
        });

        const navigation = {
            items: [
                { pageId: "page_2", label: "Our story" },
                { pageId: "page_1" },
            ],
        };
        expect(res).toEqual({ id: "site_1", navigation });
        expect(siteUpdate.mock.calls[0][0].data).toEqual({ navigation });
    });

    it("clears the column for an empty menu", async () => {
        const res = await service.updateNavigation(ctx(), "site_1", {
            items: [],
        });

        expect(res.navigation).toBeNull();
        expect(siteUpdate.mock.calls[0][0].data.navigation).toBe(Prisma.DbNull);
    });

    it("denies site:update to a MEMBER before touching the database", async () => {
        await expect(
            service.updateNavigation(ctx({ role: "MEMBER" }), "site_1", {
                items: [{ pageId: "page_1" }],
            }),
        ).rejects.toThrow(/MEMBER.*site:update/);
        expect(siteFindFirst).not.toHaveBeenCalled();
        expect(siteUpdate).not.toHaveBeenCalled();
    });
});
