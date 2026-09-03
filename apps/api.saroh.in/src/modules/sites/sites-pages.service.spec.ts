// DB-free unit tests for the page endpoints. The database package is mocked so
// nothing touches Postgres; what is proven here is the RULES — which paths are
// refused, what the home page is protected from, and that a clash is reported
// against the page that actually holds the path.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            site: { findFirst: jest.fn() },
            page: {
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
        },
    };
});

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const pageFindFirst = prisma.page.findFirst as jest.Mock;
const pageCreate = prisma.page.create as jest.Mock;
const pageUpdate = prisma.page.update as jest.Mock;
const pageDelete = prisma.page.delete as jest.Mock;

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
    siteFindFirst.mockResolvedValue({ id: "site_1" });
});

describe("SitesService.createPage", () => {
    it("creates a non-home page scoped to the org when the path is free", async () => {
        pageFindFirst.mockResolvedValue(null); // no clash
        pageCreate.mockResolvedValue({
            id: "page_2",
            path: "/about",
            title: "About",
            isHome: false,
        });

        const page = await service.createPage(ctx(), "site_1", {
            title: "About",
            path: "/about",
        });

        expect(page.isHome).toBe(false);
        const data = pageCreate.mock.calls[0][0].data as {
            organizationId: string;
            siteId: string;
            isHome: boolean;
        };
        // A second page claiming to be home would make "where do visitors
        // land" unanswerable.
        expect(data.isHome).toBe(false);
        expect(data.organizationId).toBe("org_1");
        expect(data.siteId).toBe("site_1");
    });

    it("refuses / — that path belongs to the home page", async () => {
        await expect(
            service.createPage(ctx(), "site_1", { title: "Hi", path: "/" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(pageCreate).not.toHaveBeenCalled();
    });

    it("refuses a path another page already holds, and names that page", async () => {
        pageFindFirst.mockResolvedValue({ title: "About us" });

        await expect(
            service.createPage(ctx(), "site_1", {
                title: "About",
                path: "/about",
            }),
        ).rejects.toThrow(/About us/);
        expect(pageCreate).not.toHaveBeenCalled();
    });

    it("denies site:update to a MEMBER before touching the database", async () => {
        await expect(
            service.createPage(ctx({ role: "MEMBER" }), "site_1", {
                title: "About",
                path: "/about",
            }),
        ).rejects.toThrow(/MEMBER.*site:update/);
        expect(siteFindFirst).not.toHaveBeenCalled();
        expect(pageCreate).not.toHaveBeenCalled();
    });
});

describe("SitesService.updatePage", () => {
    it("renames without touching the path when only a title is sent", async () => {
        pageFindFirst.mockResolvedValue({
            id: "page_2",
            path: "/about",
            isHome: false,
        });
        pageUpdate.mockResolvedValue({
            id: "page_2",
            path: "/about",
            title: "Our story",
            isHome: false,
        });

        await service.updatePage(ctx(), "site_1", "page_2", {
            title: "Our story",
        });

        // ABSENT must mean "leave alone" — a rename that omitted the path must
        // not move the page to an empty one.
        expect(pageUpdate.mock.calls[0][0].data).toEqual({
            title: "Our story",
        });
    });

    it("lets the home page be renamed but not moved", async () => {
        pageFindFirst.mockResolvedValue({
            id: "page_1",
            path: "/",
            isHome: true,
        });
        pageUpdate.mockResolvedValue({
            id: "page_1",
            path: "/",
            title: "Welcome",
            isHome: true,
        });

        await service.updatePage(ctx(), "site_1", "page_1", {
            title: "Welcome",
        });
        expect(pageUpdate).toHaveBeenCalled();

        await expect(
            service.updatePage(ctx(), "site_1", "page_1", { path: "/welcome" }),
        ).rejects.toThrow(/home page/i);
    });

    it("hides a page without touching anything else about it", async () => {
        pageFindFirst.mockResolvedValue({
            id: "page_2",
            path: "/about",
            isHome: false,
        });
        pageUpdate.mockResolvedValue({
            id: "page_2",
            path: "/about",
            title: "About",
            isHome: false,
            hidden: true,
        });

        await service.updatePage(ctx(), "site_1", "page_2", { hidden: true });

        // Hiding is not an edit to what the page SAYS. Its title and path are
        // untouched, so the merchant gets the page back exactly as they left
        // it — which is the whole difference between hiding and deleting.
        expect(pageUpdate.mock.calls[0][0].data).toEqual({ hidden: true });
    });

    it("leaves visibility alone when the field is absent", async () => {
        pageFindFirst.mockResolvedValue({
            id: "page_2",
            path: "/about",
            isHome: false,
        });
        pageUpdate.mockResolvedValue({
            id: "page_2",
            path: "/about",
            title: "Our story",
            isHome: false,
            hidden: true,
        });

        await service.updatePage(ctx(), "site_1", "page_2", {
            title: "Our story",
        });

        // Absent means leave alone, never "make visible". A client that
        // predates the field must not be able to put a deliberately parked
        // page back on a live site by not mentioning it.
        expect(pageUpdate.mock.calls[0][0].data).toEqual({
            title: "Our story",
        });
    });

    it("refuses to hide the home page", async () => {
        pageFindFirst.mockResolvedValue({
            id: "page_1",
            path: "/",
            isHome: true,
        });

        await expect(
            service.updatePage(ctx(), "site_1", "page_1", { hidden: true }),
        ).rejects.toThrow(/home page/i);
        expect(pageUpdate).not.toHaveBeenCalled();
    });

    it("still lets the home page be UNhidden, so a bad row can be recovered", async () => {
        pageFindFirst.mockResolvedValue({
            id: "page_1",
            path: "/",
            isHome: true,
        });
        pageUpdate.mockResolvedValue({
            id: "page_1",
            path: "/",
            title: "Home",
            isHome: true,
            hidden: false,
        });

        // The guard is on hiding, not on the field. A home page that somehow
        // ended up hidden — an older row, a bad import — must be fixable
        // through the same endpoint rather than needing a database edit.
        await service.updatePage(ctx(), "site_1", "page_1", { hidden: false });
        expect(pageUpdate).toHaveBeenCalled();
    });

    it("allows a no-op path (same value) without checking it for clashes", async () => {
        pageFindFirst.mockResolvedValue({
            id: "page_2",
            path: "/about",
            isHome: false,
        });
        pageUpdate.mockResolvedValue({
            id: "page_2",
            path: "/about",
            title: "About",
            isHome: false,
        });

        await service.updatePage(ctx(), "site_1", "page_2", {
            path: "/about",
        });

        // One lookup (the page itself). A clash check against its own path
        // would reject the page for colliding with itself.
        expect(pageFindFirst).toHaveBeenCalledTimes(1);
        expect(pageUpdate).toHaveBeenCalled();
    });

    it("404s a page that is not in this site", async () => {
        pageFindFirst.mockResolvedValue(null);
        await expect(
            service.updatePage(ctx(), "site_1", "nope", { title: "x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("SitesService.deletePage", () => {
    it("deletes a non-home page", async () => {
        pageFindFirst.mockResolvedValue({ id: "page_2", isHome: false });
        pageDelete.mockResolvedValue({ id: "page_2" });

        await expect(
            service.deletePage(ctx(), "site_1", "page_2"),
        ).resolves.toEqual({ deleted: true });
        expect(pageDelete).toHaveBeenCalledWith({ where: { id: "page_2" } });
    });

    it("refuses to delete the home page", async () => {
        pageFindFirst.mockResolvedValue({ id: "page_1", isHome: true });

        await expect(
            service.deletePage(ctx(), "site_1", "page_1"),
        ).rejects.toBeInstanceOf(BadRequestException);
        // The site's address would have nothing to serve.
        expect(pageDelete).not.toHaveBeenCalled();
    });

    it("denies site:update to a MEMBER", async () => {
        await expect(
            service.deletePage(ctx({ role: "MEMBER" }), "site_1", "page_2"),
        ).rejects.toThrow(/MEMBER.*site:update/);
        expect(pageDelete).not.toHaveBeenCalled();
    });
});
