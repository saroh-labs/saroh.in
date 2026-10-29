// #277: a note names a section that exists, says where it was when the page is
// gone, and a reviewer can learn the keys without the editor's write role.
jest.mock("@saroh/database", () => {
    const db: Record<string, unknown> = {
        site: { findFirst: jest.fn() },
        page: { findFirst: jest.fn(), findMany: jest.fn() },
        pageVersion: { findFirst: jest.fn() },
        siteComment: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findFirstOrThrow: jest.fn(),
            updateMany: jest.fn(),
            deleteMany: jest.fn(),
        },
        // The latest approval a note's edit window is measured from (R13).
        siteApproval: { findFirst: jest.fn() },
        // A reviewer's note queues its alert on the same transaction (UX-043).
        job: { create: jest.fn() },
        siteReviewer: { count: jest.fn().mockResolvedValue(0) },
    };
    db.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(db));
    return {
        // The real contract helpers: the service sanitizes what it hands a
        // reviewer (#275), and a bare mock would leave getSectionContract
        // undefined.
        ...jest.requireActual("@saroh/database"),
        prisma: db,
    };
});

import { prisma } from "@saroh/database";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { SitesService } from "./sites.service";

const siteFindFirst = (prisma as unknown as { site: { findFirst: jest.Mock } })
    .site.findFirst;

const db = prisma as unknown as {
    site: { findFirst: jest.Mock };
    page: { findFirst: jest.Mock; findMany: jest.Mock };
    pageVersion: { findFirst: jest.Mock };
    siteComment: {
        create: jest.Mock;
        findMany: jest.Mock;
        findFirst: jest.Mock;
        findFirstOrThrow: jest.Mock;
        updateMany: jest.Mock;
        deleteMany: jest.Mock;
    };
    siteApproval: { findFirst: jest.Mock };
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
    db.siteApproval.findFirst.mockResolvedValue(null);
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
        ).rejects.toThrow(/Your role can't do this/);

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

describe("getPageForReview is what a reviewer reads (#275, #277)", () => {
    beforeEach(() => {
        db.pageVersion.findFirst.mockResolvedValue({
            sections: [
                {
                    key: "sec_1",
                    type: "hero",
                    contractVersion: 1,
                    hidden: false,
                    content: { heading: "Northwind" },
                },
                {
                    key: "sec_2",
                    type: "richText",
                    contractVersion: 1,
                    hidden: true,
                    content: {
                        format: "html",
                        value: '<p onclick="steal()">Racking</p>',
                    },
                },
            ],
        });
    });

    it("returns the sections with their keys, so a note has something to pin to", async () => {
        const page = await service.getPageForReview(
            ctx("REVIEWER"),
            "site_1",
            "page_1",
        );

        expect(page.sections.map((s) => [s.key, s.type, s.label])).toEqual([
            ["sec_1", "hero", "Northwind"],
            // Nothing this block calls a heading: the UI names it by type.
            ["sec_2", "richText", null],
        ]);
    });

    it("sanitizes the content it hands over, as the draft load does", async () => {
        const page = await service.getPageForReview(ctx(), "site_1", "page_1");

        expect(JSON.stringify(page.sections)).not.toContain("onclick");
        expect(JSON.stringify(page.sections)).toContain("Racking");
    });

    it("shows a hidden section, marked — it is part of the draft", async () => {
        const page = await service.getPageForReview(ctx(), "site_1", "page_1");

        expect(page.sections.map((s) => s.hidden)).toEqual([false, true]);
    });

    it("reads without writing: no draft is created for a page that has none", async () => {
        db.pageVersion.findFirst.mockResolvedValue(null);

        await expect(
            service.getPageForReview(ctx(), "site_1", "page_1"),
        ).resolves.toEqual({ sections: [] });
    });

    it("is closed to someone outside the organization's roles", async () => {
        // Every role in ORG_ROLES may read a site they can reach; the per-site
        // grant (#276) is what narrows a REVIEWER, and it is applied by
        // assertSiteInOrg rather than here.
        siteFindFirst.mockResolvedValue(null);

        await expect(
            service.getPageForReview(ctx("REVIEWER"), "site_other", "page_1"),
        ).rejects.toThrow(/not found/);
    });
});

describe("which notes the caller may still change (R13)", () => {
    const row = (over: Record<string, unknown>) => ({
        id: "note_1",
        pageId: "page_1",
        pageTitle: "About",
        sectionKey: "sec_live",
        body: "…",
        resolvedAt: null,
        createdAt: new Date("2026-10-20T10:00:00Z"),
        author: { id: "user_1", name: "Meera", email: "m@example.com" },
        ...over,
    });

    beforeEach(() => {
        db.page.findMany.mockResolvedValue([
            {
                id: "page_1",
                title: "About",
                versions: [{ sections: [{ key: "sec_live" }] }],
            },
        ]);
    });

    it("marks your own open notes editable, and nobody else's or a settled one", async () => {
        db.siteComment.findMany.mockResolvedValue([
            row({ id: "mine" }),
            row({
                id: "theirs",
                author: { id: "u2", name: "Asha", email: "a@example.com" },
            }),
            row({ id: "settled", resolvedAt: new Date() }),
        ]);

        const notes = await service.listComments(ctx("REVIEWER"), "site_1");

        expect(notes.map((n) => [n.id, n.editable])).toEqual([
            ["mine", true],
            ["theirs", false],
            ["settled", false],
        ]);
    });

    it("locks notes written before the latest approval; later ones stay open", async () => {
        db.siteApproval.findFirst.mockResolvedValue({
            createdAt: new Date("2026-10-21T00:00:00Z"),
        });
        db.siteComment.findMany.mockResolvedValue([
            row({ id: "before" }),
            row({ id: "after", createdAt: new Date("2026-10-22T00:00:00Z") }),
        ]);

        const notes = await service.listComments(ctx("REVIEWER"), "site_1");

        expect(notes.map((n) => [n.id, n.editable])).toEqual([
            ["before", false],
            ["after", true],
        ]);
        // The draft's approvals only: a release's never lock a draft note.
        expect(db.siteApproval.findFirst.mock.calls[0][0].where).toMatchObject({
            outcome: "APPROVED",
            testReleaseId: null,
        });
    });

    it("a MEMBER, who can't leave notes, can't change one either", async () => {
        db.siteComment.findMany.mockResolvedValue([row({})]);

        const [note] = await service.listComments(ctx("MEMBER"), "site_1");

        expect(note.editable).toBe(false);
    });
});

describe("a settle that lands first wins (R13)", () => {
    beforeEach(() => {
        // Open when read; settled by the time the guarded write runs.
        db.siteComment.findFirst
            .mockResolvedValueOnce({
                authorUserId: "user_1",
                resolvedAt: null,
                testReleaseId: null,
                createdAt: new Date(),
            })
            .mockResolvedValueOnce({ resolvedAt: new Date() });
        db.siteComment.updateMany.mockResolvedValue({ count: 0 });
        db.siteComment.deleteMany.mockResolvedValue({ count: 0 });
    });

    it("refuses the edit with words, not a silent no-op", async () => {
        await expect(
            service.updateCommentBody(
                ctx("REVIEWER"),
                "site_1",
                "note_1",
                "Shorter",
            ),
        ).rejects.toMatchObject({
            status: 409,
            message: "This note has been settled, so it's kept as it was.",
        });
        // The write carried every guard in its one where-clause.
        expect(db.siteComment.updateMany.mock.calls[0][0].where).toEqual({
            id: "note_1",
            siteId: "site_1",
            organizationId: "org_1",
            authorUserId: "user_1",
            resolvedAt: null,
            testReleaseId: null,
        });
    });

    it("refuses the delete the same way", async () => {
        await expect(
            service.deleteComment(ctx("REVIEWER"), "site_1", "note_1"),
        ).rejects.toMatchObject({ status: 409 });
    });
});
