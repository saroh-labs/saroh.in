// #277: a note names a section that exists, says where it was when the page is
// gone, and a reviewer can learn the keys without the editor's write role.
jest.mock("@saroh/database", () => ({
    prisma: {
        site: { findFirst: jest.fn() },
        page: { findFirst: jest.fn(), findMany: jest.fn() },
        pageVersion: { findFirst: jest.fn() },
        siteComment: { create: jest.fn(), findMany: jest.fn() },
    },
}));

import { prisma } from "@saroh/database";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { SitesService } from "./sites.service";

const db = prisma as unknown as {
    site: { findFirst: jest.Mock };
    page: { findFirst: jest.Mock; findMany: jest.Mock };
    pageVersion: { findFirst: jest.Mock };
    siteComment: { create: jest.Mock; findMany: jest.Mock };
};

const service = new SitesService({
    check: jest.fn(),
    can: jest.fn(),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

const ctx = (role: OrgRole = "OWNER"): OrganizationContext => ({
    organizationId: "org_1",
    userId: "user_1",
    role,
});

const note = {
    pageId: "page_1",
    sectionKey: "sec_live",
    body: "The opening line undersells you.",
};

beforeEach(() => {
    jest.clearAllMocks();
    db.site.findFirst.mockResolvedValue({
        id: "site_1",
        currentPublicationId: null,
    });
    // assertPageInSite, then the draft-key lookup.
    db.page.findFirst
        .mockResolvedValueOnce({ id: "page_1" })
        .mockResolvedValue({
            title: "About",
            versions: [{ sections: [{ key: "sec_live" }] }],
        });
    db.siteComment.create.mockResolvedValue({ id: "note_1" });
});

describe("createComment pins to a section that exists (#277)", () => {
    it("stores a note on a live section, with the page's title", async () => {
        const created = await service.createComment(ctx(), "site_1", note);

        expect(created).toEqual({ id: "note_1" });
        expect(db.siteComment.create.mock.calls[0][0].data).toMatchObject({
            siteId: "site_1",
            pageId: "page_1",
            sectionKey: "sec_live",
            // Kept so the note can still say where it was once the page is
            // deleted.
            pageTitle: "About",
        });
    });

    it("refuses a key that is not on the page's draft, rather than storing an orphan", async () => {
        await expect(
            service.createComment(ctx(), "site_1", {
                ...note,
                sectionKey: "sec_gone",
            }),
        ).rejects.toThrow(/no longer on the page/);
        expect(db.siteComment.create).not.toHaveBeenCalled();
    });

    it("is open to a REVIEWER and closed to a MEMBER", async () => {
        await expect(
            service.createComment(ctx("MEMBER"), "site_1", note),
        ).rejects.toThrow(/may not perform/);

        db.page.findFirst.mockReset();
        db.page.findFirst
            .mockResolvedValueOnce({ id: "page_1" })
            .mockResolvedValue({
                title: "About",
                versions: [{ sections: [{ key: "sec_live" }] }],
            });
        await expect(
            service.createComment(ctx("REVIEWER"), "site_1", note),
        ).resolves.toEqual({ id: "note_1" });
    });
});

describe("a note outlives its page (#277)", () => {
    it("reads as orphaned and names where it was", async () => {
        db.siteComment.findMany.mockResolvedValue([
            {
                id: "note_1",
                pageId: null,
                pageTitle: "About",
                sectionKey: "sec_live",
                body: "Still worth reading.",
                resolvedAt: null,
                createdAt: new Date(),
                author: { id: "u1", name: "Priya", email: "p@example.test" },
            },
        ]);
        db.page.findMany.mockResolvedValue([]);

        const [listed] = await service.listComments(ctx(), "site_1");

        expect(listed).toMatchObject({
            pageId: null,
            pageTitle: "About",
            orphaned: true,
        });
    });

    it("prefers the live page title while the page exists", async () => {
        db.siteComment.findMany.mockResolvedValue([
            {
                id: "note_1",
                pageId: "page_1",
                pageTitle: "Its old name",
                sectionKey: "sec_live",
                body: "…",
                resolvedAt: null,
                createdAt: new Date(),
                author: { id: "u1", name: null, email: "p@example.test" },
            },
        ]);
        db.page.findMany.mockResolvedValue([
            {
                id: "page_1",
                title: "About us",
                versions: [{ sections: [{ key: "sec_live" }] }],
            },
        ]);

        const [listed] = await service.listComments(ctx(), "site_1");

        expect(listed.pageTitle).toBe("About us");
        expect(listed.orphaned).toBe(false);
        // No name, so the email stands in.
        expect(listed.author.name).toBe("p@example.test");
    });
});

describe("getPageOutline gives a reviewer the keys (#277)", () => {
    beforeEach(() => {
        db.pageVersion.findFirst.mockResolvedValue({
            sections: [
                {
                    key: "sec_1",
                    type: "hero",
                    content: { heading: "Northwind" },
                },
                {
                    key: "sec_2",
                    type: "richText",
                    content: { value: "<p>…</p>" },
                },
                { key: "sec_3", type: "cta", content: { label: "Call us" } },
            ],
        });
    });

    it("returns key, type and a label, and no content", async () => {
        const outline = await service.getPageOutline(
            ctx("REVIEWER"),
            "site_1",
            "page_1",
        );

        expect(outline).toEqual([
            { key: "sec_1", type: "hero", label: "Northwind" },
            // Nothing this block calls a heading: named by its type in the UI.
            { key: "sec_2", type: "richText", label: null },
            { key: "sec_3", type: "cta", label: "Call us" },
        ]);
        expect(JSON.stringify(outline)).not.toContain("<p>");
    });

    it("is empty for a page with no draft sections", async () => {
        db.pageVersion.findFirst.mockResolvedValue(null);

        await expect(
            service.getPageOutline(ctx(), "site_1", "page_1"),
        ).resolves.toEqual([]);
    });
});
