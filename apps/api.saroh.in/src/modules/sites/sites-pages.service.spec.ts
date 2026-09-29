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
                findMany: jest.fn(),
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
const pageFindMany = prisma.page.findMany as jest.Mock;
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
    // The site's addresses, for a refusal's suggestion.
    pageFindMany.mockResolvedValue([{ path: "/" }, { path: "/about" }]);
});

/** The refusal a promise rejected with, for its message and details. */
async function refusal(promise: Promise<unknown>) {
    const error = await promise.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
        message: string;
        details: { field: string; reason: string; suggestion: string };
    };
}

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

        const body = await refusal(
            service.createPage(ctx(), "site_1", {
                title: "About",
                path: "/about",
            }),
        );
        expect(body.message).toMatch(/About us/);
        // Another address is offered, one no page holds.
        expect(body.details).toMatchObject({ field: "path", reason: "taken" });
        expect(body.details.suggestion).toBe("/about-2");
        expect(pageCreate).not.toHaveBeenCalled();
    });

    it.each([
        ["/book", "your booking page", "/book"],
        ["/book/walkthrough", "your booking page", "/book"],
        ["/shop", "your shop", "/shop"],
        ["/shop/sale", "your shop", "/shop"],
        ["/checkout", "where your customers pay", "/checkout"],
        ["/checkout/thanks", "where your customers pay", "/checkout"],
        // The account area's route wins there, on or off (G15).
        ["/account", "where your customers see their account", "/account"],
        ["/account/help", "where your customers see their account", "/account"],
    ])(
        "refuses a free-form page at %s, saying what it is for, with another address (G14)",
        async (path, purpose, root) => {
            pageFindFirst.mockResolvedValue(null);

            const body = await refusal(
                service.createPage(ctx(), "site_1", {
                    title: "Our range",
                    path,
                }),
            );
            expect(body.message).toContain(`${root} is ${purpose}`);
            expect(body.message).toContain("Pick another address");
            expect(body.details).toMatchObject({
                field: "path",
                reason: "reserved",
            });
            // From the page's own title, which no route owns.
            expect(body.details.suggestion).toBe("/our-range");
            expect(pageCreate).not.toHaveBeenCalled();
        },
    );

    it("leaves addresses that only start with a reserved word alone", async () => {
        pageFindFirst.mockResolvedValue(null);
        pageCreate.mockResolvedValue({ id: "page_3" });

        await service.createPage(ctx(), "site_1", {
            title: "Book a trial",
            path: "/book-a-trial",
        });
        expect(pageCreate).toHaveBeenCalled();
    });

    it("suggests an address that is free, not one another page holds", async () => {
        pageFindFirst.mockResolvedValue(null);
        pageFindMany.mockResolvedValue([
            { path: "/" },
            { path: "/our-range" },
            { path: "/sale" },
        ]);

        const body = await refusal(
            service.createPage(ctx(), "site_1", {
                title: "Our range",
                path: "/shop/sale",
            }),
        );
        // The title's address and the rest of the path are taken.
        expect(body.details.suggestion).toBe("/shop-info");
    });

    it("keeps a new page in the menu unless told otherwise", async () => {
        pageFindFirst.mockResolvedValue(null);
        pageCreate.mockResolvedValue({ id: "page_3" });

        await service.createPage(ctx(), "site_1", {
            title: "Private",
            path: "/private",
            inMenu: false,
        });
        expect(pageCreate.mock.calls[0][0].data).toMatchObject({
            inMenu: false,
        });
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

    it("refuses to move a free-form page to /book (G14)", async () => {
        pageFindFirst.mockResolvedValueOnce({
            id: "page_2",
            path: "/about",
            isHome: false,
            title: "Walkthrough",
            kind: "FREE",
        });

        const body = await refusal(
            service.updatePage(ctx(), "site_1", "page_2", { path: "/book" }),
        );
        expect(body.message).toContain("/book is your booking page");
        expect(body.details.suggestion).toBe("/walkthrough");
        expect(pageUpdate).not.toHaveBeenCalled();
    });

    it("lets a free-form page already at /book keep it while renamed (G14)", async () => {
        pageFindFirst.mockResolvedValue({
            id: "page_2",
            path: "/book",
            isHome: false,
            title: "Book a walkthrough",
            kind: "FREE",
        });
        pageUpdate.mockResolvedValue({ id: "page_2" });

        // Never moved or lost by the rule: only a NEW address is checked.
        await service.updatePage(ctx(), "site_1", "page_2", {
            title: "Walkthrough",
            path: "/book",
        });
        expect(pageUpdate).toHaveBeenCalled();
    });

    it("never moves a Book page off /book, but renames it (G14)", async () => {
        pageFindFirst.mockResolvedValue({
            id: "page_book",
            path: "/book",
            isHome: false,
            title: "Book",
            kind: "BOOK",
        });
        pageUpdate.mockResolvedValue({ id: "page_book", title: "Classes" });

        const body = await refusal(
            service.updatePage(ctx(), "site_1", "page_book", {
                path: "/classes",
            }),
        );
        expect(body.message).toMatch(/always at \/book/);
        expect(body.details).toMatchObject({ field: "path", reason: "fixed" });
        expect(pageUpdate).not.toHaveBeenCalled();

        // Its title is also its menu name, and that can change.
        await service.updatePage(ctx(), "site_1", "page_book", {
            title: "Classes",
        });
        expect(pageUpdate.mock.calls[0][0].data).toEqual({ title: "Classes" });
    });

    it("moves a Contact page to a free address, but not into /shop (G14)", async () => {
        pageFindFirst
            .mockResolvedValueOnce({
                id: "page_contact",
                path: "/contact",
                isHome: false,
                title: "Contact",
                kind: "CONTACT",
            })
            .mockResolvedValueOnce(null);
        pageUpdate.mockResolvedValue({ id: "page_contact" });

        await service.updatePage(ctx(), "site_1", "page_contact", {
            path: "/find-us",
        });
        expect(pageUpdate.mock.calls[0][0].data).toEqual({ path: "/find-us" });

        pageFindFirst.mockResolvedValueOnce({
            id: "page_contact",
            path: "/find-us",
            isHome: false,
            title: "Contact",
            kind: "CONTACT",
        });
        await refusal(
            service.updatePage(ctx(), "site_1", "page_contact", {
                path: "/shop",
            }),
        );
    });

    it("takes a page out of the menu, and leaves it alone when absent (G14)", async () => {
        pageFindFirst.mockResolvedValue({
            id: "page_2",
            path: "/about",
            isHome: false,
            title: "About",
            kind: "FREE",
        });
        pageUpdate.mockResolvedValue({ id: "page_2" });

        await service.updatePage(ctx(), "site_1", "page_2", { inMenu: false });
        expect(pageUpdate.mock.calls[0][0].data).toEqual({ inMenu: false });

        await service.updatePage(ctx(), "site_1", "page_2", { title: "Us" });
        expect(pageUpdate.mock.calls[1][0].data).toEqual({ title: "Us" });
    });

    it("denies site:update to a MEMBER before touching the database", async () => {
        await expect(
            service.updatePage(ctx({ role: "MEMBER" }), "site_1", "page_2", {
                title: "Our story",
            }),
        ).rejects.toThrow(/MEMBER.*site:update/);
        expect(siteFindFirst).not.toHaveBeenCalled();
        expect(pageFindFirst).not.toHaveBeenCalled();
        expect(pageUpdate).not.toHaveBeenCalled();
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
