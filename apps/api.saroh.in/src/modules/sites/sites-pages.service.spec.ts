// DB-free unit tests for the page endpoints. The database package is mocked so
// nothing touches Postgres; what is proven here is the RULES — which paths are
// refused, what the home page is protected from, and that a clash is reported
// against the page that actually holds the path.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const prisma: Record<string, unknown> = {
        site: { findFirst: jest.fn(), findUnique: jest.fn() },
        page: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            // Pages the site already has: one by default, so a new page isn't home.
            count: jest.fn().mockResolvedValue(1),
        },
        // Old page links that forward (KTD-3).
        siteRedirect: {
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn(),
            create: jest.fn(),
        },
        // Where Our team is (ER3Team T4).
        section: { findFirst: jest.fn() },
        // Who deleted a page (change units, U7).
        $executeRaw: jest.fn().mockResolvedValue(1),
        // A page write and its forwards run in one transaction.
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    return { ...actual, prisma };
});

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { roleDenial } from "../organizations/organization-policy";
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

/** Every page settings write says who made it (KTD-4). */
const STAMP = {
    settingsEditedByUserId: "user_1",
    settingsEditedAt: expect.any(Date),
};

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

describe("SitesService.createPage with a page type (A7, DEC-248)", () => {
    const original = env.WEBSITE_AREA;
    afterEach(() => {
        env.WEBSITE_AREA = original;
    });

    it("is refused with the Website area off, writing nothing", async () => {
        env.WEBSITE_AREA = "off";
        await expect(
            service.createPage(ctx(), "site_1", {
                title: "Our team",
                path: "/team",
                starter: "TEAM",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(pageCreate).not.toHaveBeenCalled();
    });

    it("makes the page with its draft sections with the area on", async () => {
        env.WEBSITE_AREA = "on";
        pageFindFirst.mockResolvedValue(null);
        (prisma as unknown as Record<string, unknown>).staffMember = {
            findMany: jest.fn().mockResolvedValue([]),
        };
        pageCreate.mockResolvedValue({ id: "page_3", path: "/team" });
        await service.createPage(ctx(), "site_1", {
            title: "Our team",
            path: "/team",
            starter: "TEAM",
        });
        const data = pageCreate.mock.calls[0][0].data as {
            versions: {
                create: {
                    status: string;
                    sections: { create: { type: string }[] };
                };
            };
        };
        expect(data.versions.create.status).toBe("DRAFT");
        expect(data.versions.create.sections.create.map((s) => s.type)).toEqual(
            ["hero"],
        );
    });
});

describe("SitesService.createPage", () => {
    it("makes a site's first page its home (owner, 22 Nov 2026)", async () => {
        pageFindFirst.mockResolvedValue(null);
        (prisma.page.count as jest.Mock).mockResolvedValueOnce(0);
        pageCreate.mockResolvedValue({
            id: "p1",
            path: "/welcome",
            isHome: true,
        });
        await service.createPage(ctx(), "site_1", {
            title: "Welcome",
            path: "/welcome",
        });
        const data = pageCreate.mock.calls.at(-1)?.[0].data as {
            isHome: boolean;
        };
        expect(data.isHome).toBe(true);
    });

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
        ["/shop", "your online shop", "/shop"],
        ["/shop/sale", "your online shop", "/shop"],
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
            expect(body.message).toContain("Pick another path");
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
        ).rejects.toMatchObject({
            response: roleDenial("site:update"),
        });
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
            ...STAMP,
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
        expect(pageUpdate.mock.calls[0][0].data).toEqual({
            ...STAMP,
            hidden: true,
        });
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
            ...STAMP,
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
        expect(pageUpdate.mock.calls[0][0].data).toEqual({
            ...STAMP,
            title: "Classes",
        });
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
        expect(pageUpdate.mock.calls[0][0].data).toEqual({
            ...STAMP,
            path: "/find-us",
        });

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
        expect(pageUpdate.mock.calls[0][0].data).toEqual({
            ...STAMP,
            inMenu: false,
        });

        await service.updatePage(ctx(), "site_1", "page_2", { title: "Us" });
        expect(pageUpdate.mock.calls[1][0].data).toEqual({
            ...STAMP,
            title: "Us",
        });
    });

    it("denies site:update to a MEMBER before touching the database", async () => {
        await expect(
            service.updatePage(ctx({ role: "MEMBER" }), "site_1", "page_2", {
                title: "Our story",
            }),
        ).rejects.toMatchObject({
            response: roleDenial("site:update"),
        });
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
        ).rejects.toMatchObject({
            response: roleDenial("site:update"),
        });
        expect(pageDelete).not.toHaveBeenCalled();
    });
});

describe("SitesService.duplicatePage (website area U5)", () => {
    const bridal = {
        title: "Bridal",
        path: "/bridal",
        versions: [
            {
                sections: [
                    {
                        type: "hero",
                        contractVersion: 1,
                        content: { heading: "Your day" },
                        hidden: false,
                    },
                    {
                        type: "faq",
                        contractVersion: 2,
                        content: { items: [] },
                        hidden: true,
                    },
                ],
            },
        ],
    };

    it("copies the draft's sections to <link>-copy, hidden and out of the menu", async () => {
        pageFindFirst.mockResolvedValue(bridal);
        pageFindMany.mockResolvedValue([{ path: "/" }, { path: "/bridal" }]);
        pageCreate.mockImplementation(({ data }) => ({
            id: "page_9",
            ...data,
        }));

        await service.duplicatePage(ctx(), "site_1", "page_2");

        const data = pageCreate.mock.calls[0][0].data;
        expect(data).toMatchObject({
            siteId: "site_1",
            organizationId: "org_1",
            path: "/bridal-copy",
            title: "Bridal (copy)",
            isHome: false,
            hidden: true,
            inMenu: false,
            ...STAMP,
        });
        // A free-form page: the copy never claims a module's route.
        expect(data.kind).toBeUndefined();
        const copied = data.versions.create.sections.create;
        expect(copied).toEqual([
            expect.objectContaining({
                type: "hero",
                order: 0,
                hidden: false,
                content: { heading: "Your day" },
            }),
            expect.objectContaining({ type: "faq", order: 1, hidden: true }),
        ]);
        // Fresh keys, so a note stays on the section it was left on.
        expect(copied[0].key).toEqual(expect.any(String));
    });

    it("takes the next free link when -copy is used", async () => {
        pageFindFirst.mockResolvedValue(bridal);
        pageFindMany.mockResolvedValue([
            { path: "/bridal" },
            { path: "/bridal-copy" },
        ]);
        pageCreate.mockImplementation(({ data }) => data);

        await service.duplicatePage(ctx(), "site_1", "page_2");
        expect(pageCreate.mock.calls[0][0].data.path).toBe("/bridal-copy-2");
    });

    it("copies the home page to /home-copy", async () => {
        pageFindFirst.mockResolvedValue({
            ...bridal,
            title: "Home",
            path: "/",
        });
        pageCreate.mockImplementation(({ data }) => data);

        await service.duplicatePage(ctx(), "site_1", "page_1");
        expect(pageCreate.mock.calls[0][0].data.path).toBe("/home-copy");
    });

    it("404s a page of another site, and denies site:update to a MEMBER", async () => {
        pageFindFirst.mockResolvedValue(null);
        await expect(
            service.duplicatePage(ctx(), "site_1", "nope"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.duplicatePage(ctx({ role: "MEMBER" }), "site_1", "page_2"),
        ).rejects.toMatchObject({ response: roleDenial("site:update") });
        expect(pageCreate).not.toHaveBeenCalled();
    });
});

describe("SitesService.updatePage: old links and the page's own head (KTD-3, KTD-7)", () => {
    const siteFindUnique = prisma.site.findUnique as jest.Mock;
    const redirectFindMany = prisma.siteRedirect.findMany as jest.Mock;
    const redirectUpdateMany = prisma.siteRedirect.updateMany as jest.Mock;
    const redirectCreate = prisma.siteRedirect.create as jest.Mock;

    const OLD = "/services/bridal-makeup-packages";

    beforeEach(() => {
        pageFindFirst.mockImplementation(({ where }) =>
            Promise.resolve(
                where.id
                    ? {
                          id: "page_2",
                          path: OLD,
                          isHome: false,
                          title: "Bridal",
                          kind: "FREE",
                      }
                    : null, // the new link is free
            ),
        );
        pageUpdate.mockResolvedValue({ id: "page_2" });
        redirectFindMany.mockResolvedValue([]);
    });

    function liveAt(...paths: string[]) {
        siteFindUnique.mockResolvedValue({
            currentPublication: {
                snapshot: { pages: paths.map((path) => ({ path })) },
            },
        });
    }

    it("keeps a live page's old link forwarding to its new one", async () => {
        liveAt("/", OLD);
        await service.updatePage(ctx(), "site_1", "page_2", {
            path: "/bridal",
        });

        expect(redirectCreate.mock.calls[0][0].data).toEqual({
            organizationId: "org_1",
            siteId: "site_1",
            fromPath: OLD,
            toPath: "/bridal",
            source: "AUTO",
            createdByUserId: "user_1",
        });
        expect(pageUpdate.mock.calls[0][0].data).toMatchObject({
            path: "/bridal",
        });
    });

    it("makes no forward for a page that never went live", async () => {
        siteFindUnique.mockResolvedValue({ currentPublication: null });
        await service.updatePage(ctx(), "site_1", "page_2", {
            path: "/bridal",
        });
        expect(redirectCreate).not.toHaveBeenCalled();
    });

    it("points an earlier forward at the page's newest link", async () => {
        liveAt("/");
        redirectFindMany.mockResolvedValue([
            { id: "r1", fromPath: "/a", toPath: OLD },
        ]);
        await service.updatePage(ctx(), "site_1", "page_2", { path: "/c" });
        expect(redirectUpdateMany).toHaveBeenCalledWith({
            where: { id: { in: ["r1"] } },
            data: { toPath: "/c" },
        });
        expect(redirectCreate).not.toHaveBeenCalled();
    });

    it("touches no forward when the link is not changed", async () => {
        await service.updatePage(ctx(), "site_1", "page_2", {
            title: "Bridal",
        });
        expect(redirectFindMany).not.toHaveBeenCalled();
        expect(redirectCreate).not.toHaveBeenCalled();
    });

    it("saves the page's own Google title and text, and Show on Google", async () => {
        await service.updatePage(ctx(), "site_1", "page_2", {
            seoTitle: "Bridal make-up",
            seoDescription: null,
            noindex: true,
        });
        expect(pageUpdate.mock.calls[0][0].data).toEqual({
            ...STAMP,
            seoTitle: "Bridal make-up",
            seoDescription: null,
            noindex: true,
        });
    });

    it("takes a library photo's address for the share image", async () => {
        const readyObject = jest.fn().mockResolvedValue({
            id: "media_1",
            url: "https://cdn.example.com/org/org_1/a.jpg",
            contentType: "image/jpeg",
            sizeBytes: 1000,
        });
        const withMedia = new SitesService(
            {
                check: jest.fn(),
                can: jest.fn(),
                getEntitlements: jest.fn(),
            } as never,
            undefined,
            { readyObject } as never,
        );
        await withMedia.updatePage(ctx(), "site_1", "page_2", {
            shareImageMediaId: "media_1",
        });
        expect(readyObject).toHaveBeenCalledWith("org_1", "media_1");
        expect(pageUpdate.mock.calls[0][0].data).toMatchObject({
            shareImageMediaId: "media_1",
            shareImageUrl: "https://cdn.example.com/org/org_1/a.jpg",
        });
    });

    it("refuses a share image a share card can't show", async () => {
        const withMedia = new SitesService({} as never, undefined, {
            readyObject: jest.fn().mockResolvedValue({
                id: "media_1",
                url: "https://cdn.example.com/a.svg",
                contentType: "image/svg+xml",
                sizeBytes: 10,
            }),
        } as never);
        await expect(
            withMedia.updatePage(ctx(), "site_1", "page_2", {
                shareImageMediaId: "media_1",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(pageUpdate).not.toHaveBeenCalled();
    });

    it("clears the share image, library photo and address together", async () => {
        await service.updatePage(ctx(), "site_1", "page_2", {
            shareImageMediaId: null,
        });
        expect(pageUpdate.mock.calls[0][0].data).toMatchObject({
            shareImageMediaId: null,
            shareImageUrl: null,
        });
    });
});

describe("SitesService.createPage: a new page wins over an old link", () => {
    it("stops forwarding the old link the new page takes", async () => {
        pageFindFirst.mockResolvedValue(null);
        pageCreate.mockResolvedValue({ id: "page_9", path: "/old-prices" });
        await service.createPage(ctx(), "site_1", {
            title: "Prices",
            path: "/old-prices",
        });
        expect(prisma.siteRedirect.updateMany).toHaveBeenCalledWith({
            where: {
                siteId: "site_1",
                fromPath: "/old-prices",
                removedAt: null,
            },
            data: { removedAt: expect.any(Date) },
        });
    });
});

describe("SitesService.buildSnapshot: old links and a page's own head", () => {
    function draft(
        over: Record<string, unknown> = {},
        page: Record<string, unknown> = {},
    ) {
        return {
            id: "site_1",
            name: "Northwind Supply",
            slug: "northwind",
            postsPrefix: null,
            style: null,
            seoTitle: null,
            seoDescription: null,
            socialImageUrl: null,
            socialImageWidth: null,
            socialImageHeight: null,
            socialImageBytes: null,
            footer: null,
            navigation: null,
            redirects: [],
            pages: [
                {
                    id: "p1",
                    path: "/",
                    title: "Home",
                    isHome: true,
                    kind: "FREE",
                    inMenu: true,
                    versions: [],
                },
                {
                    id: "p2",
                    path: "/bridal",
                    title: "Bridal",
                    isHome: false,
                    kind: "FREE",
                    inMenu: true,
                    seoTitle: null,
                    seoDescription: null,
                    shareImageUrl: null,
                    noindex: false,
                    versions: [],
                    ...page,
                },
            ],
            ...over,
        } as never;
    }

    it("adds nothing for a site without forwards or page head, byte for byte as before", () => {
        const snapshot = service.buildSnapshot(draft(), new Date(0));
        expect(snapshot).not.toHaveProperty("redirects");
        expect(snapshot.pages[1]).toEqual({
            path: "/bridal",
            title: "Bridal",
            isHome: false,
            sections: [],
        });
    });

    it("carries the forwards and the page's own head into what goes live", () => {
        const snapshot = service.buildSnapshot(
            draft(
                {
                    redirects: [
                        {
                            fromPath: "/services/bridal-makeup-packages",
                            toPath: "/bridal",
                        },
                        // Lands on no page this publish serves: left out.
                        { fromPath: "/old", toPath: "/gone" },
                    ],
                },
                {
                    seoTitle: "Bridal make-up",
                    seoDescription: "Trials on weekdays",
                    shareImageUrl: "https://cdn.example.com/bridal.jpg",
                    noindex: true,
                },
            ),
            new Date(0),
        );
        expect(snapshot.redirects).toEqual([
            { from: "/services/bridal-makeup-packages", to: "/bridal" },
        ]);
        expect(snapshot.pages[1]).toMatchObject({
            seoTitle: "Bridal make-up",
            seoDescription: "Trials on weekdays",
            shareImageUrl: "https://cdn.example.com/bridal.jpg",
            noindex: true,
        });
    });
});

describe("teamPage (ER3Team T4)", () => {
    const sectionFindFirst = prisma.section.findFirst as jest.Mock;

    it("names the draft page holding the team look, in this business", async () => {
        sectionFindFirst.mockResolvedValue({
            pageVersion: { page: { id: "page_team", siteId: "site_1" } },
        });
        await expect(service.teamPage(ctx())).resolves.toEqual({
            siteId: "site_1",
            pageId: "page_team",
        });
        expect(sectionFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    organizationId: "org_1",
                    type: "person",
                    content: { path: ["variant"], equals: "team" },
                }),
            }),
        );
    });

    it("is null with no Our team section", async () => {
        sectionFindFirst.mockResolvedValue(null);
        await expect(service.teamPage(ctx())).resolves.toBeNull();
    });
});
