// DB-free unit tests for review (#193). What is proven here is the RULES: what
// a REVIEWER may and may not do, and what happens to a note whose section has
// been deleted under it.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            site: { findFirst: jest.fn() },
            page: { findFirst: jest.fn(), findMany: jest.fn() },
            siteComment: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                count: jest.fn(),
            },
            siteApproval: { create: jest.fn(), findFirst: jest.fn() },
        },
    };
});

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ORG_ROLES } from "../../common/types/organization-context";
import { can } from "../organizations/organization-policy";
import { SitesService } from "./sites.service";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const pageFindFirst = prisma.page.findFirst as jest.Mock;
const pageFindMany = prisma.page.findMany as jest.Mock;
const commentFindMany = prisma.siteComment.findMany as jest.Mock;
const commentFindFirst = prisma.siteComment.findFirst as jest.Mock;
const commentCreate = prisma.siteComment.create as jest.Mock;
const commentUpdate = prisma.siteComment.update as jest.Mock;
const commentCount = prisma.siteComment.count as jest.Mock;
const approvalCreate = prisma.siteApproval.create as jest.Mock;
const approvalFindFirst = prisma.siteApproval.findFirst as jest.Mock;

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
    pageFindFirst.mockResolvedValue({ id: "page_1" });
});

describe("the REVIEWER role", () => {
    it("may see the site, leave a note, and sign it off — and nothing else", () => {
        expect(can("REVIEWER", "site:read")).toBe(true);
        expect(can("REVIEWER", "site:comment")).toBe(true);
        expect(can("REVIEWER", "site:approve")).toBe(true);

        // A reviewer says what they think; the owner decides.
        expect(can("REVIEWER", "section:write")).toBe(false);
        expect(can("REVIEWER", "site:publish")).toBe(false);
        expect(can("REVIEWER", "site:update")).toBe(false);
        expect(can("REVIEWER", "site:delete")).toBe(false);
    });

    it("cannot see the rest of the org a MEMBER can", () => {
        // The point of the role: someone brought in to check the copy is not
        // handed the roster, the stores or the org itself. These four ARE the
        // MEMBER floor, which is exactly why REVIEWER is enumerated separately
        // rather than derived from it.
        for (const action of [
            "org:read",
            "member:read",
            "store:read",
            "media:read",
        ] as const) {
            expect(can("MEMBER", action)).toBe(true);
            expect(can("REVIEWER", action)).toBe(false);
        }
    });

    it("is not simply a narrower MEMBER — it has powers MEMBER lacks", () => {
        expect(can("MEMBER", "site:comment")).toBe(false);
        expect(can("MEMBER", "site:approve")).toBe(false);
    });
});

describe("the REVIEWER role reaching a request", () => {
    it("is narrowable from a Membership row", () => {
        /*
         * Membership.role is a free-form string narrowed against ORG_ROLES, and
         * anything missing is treated as MEMBER and logged. A REVIEWER left out
         * of that list would be downgraded silently — reading LESS than
         * intended (no notes) and MORE (the whole roster). The role only works
         * if it is in both places.
         */
        expect(ORG_ROLES).toContain("REVIEWER");
    });
});

describe("SitesService.createComment", () => {
    it("pins the note to the section key and the acting user", async () => {
        commentCreate.mockResolvedValue({ id: "c1" });

        await service.createComment(ctx({ role: "REVIEWER" }), "site_1", {
            body: "This headline is too long.",
            pageId: "page_1",
            sectionKey: "sec-abc",
        });

        expect(commentCreate.mock.calls[0][0].data).toMatchObject({
            siteId: "site_1",
            pageId: "page_1",
            organizationId: "org_1",
            sectionKey: "sec-abc",
            authorUserId: "user_1",
        });
    });

    it("denies a MEMBER, who may read the site but not annotate it", async () => {
        await expect(
            service.createComment(ctx({ role: "MEMBER" }), "site_1", {
                body: "x",
                pageId: "page_1",
                sectionKey: "k",
            }),
        ).rejects.toThrow(/MEMBER.*site:comment/);
        expect(commentCreate).not.toHaveBeenCalled();
    });
});

describe("SitesService.listComments", () => {
    function withSections(keys: string[]) {
        pageFindMany.mockResolvedValue([
            {
                id: "page_1",
                title: "Home",
                versions: [{ sections: keys.map((key) => ({ key })) }],
            },
        ]);
    }
    function comment(sectionKey: string) {
        return {
            id: "c1",
            pageId: "page_1",
            sectionKey,
            body: "note",
            resolvedAt: null,
            createdAt: new Date("2026-09-01"),
            author: { id: "u1", name: "Priya", email: "p@example.test" },
        };
    }

    it("marks a note whose section still exists as attached", async () => {
        commentFindMany.mockResolvedValue([comment("sec-a")]);
        withSections(["sec-a", "sec-b"]);

        const [note] = await service.listComments(ctx(), "site_1");
        expect(note.orphaned).toBe(false);
        expect(note.pageTitle).toBe("Home");
    });

    it("KEEPS a note whose section was deleted, and says so", async () => {
        commentFindMany.mockResolvedValue([comment("sec-gone")]);
        withSections(["sec-a"]);

        const notes = await service.listComments(ctx(), "site_1");
        // Someone wrote it, nobody acted on it, and the section it was about is
        // gone. Dropping it would lose exactly the feedback that needs seeing.
        expect(notes).toHaveLength(1);
        expect(notes[0].orphaned).toBe(true);
    });

    it("falls back to the author's email when they have no name", async () => {
        commentFindMany.mockResolvedValue([
            {
                ...comment("sec-a"),
                author: { id: "u1", name: null, email: "p@example.test" },
            },
        ]);
        withSections(["sec-a"]);

        const [note] = await service.listComments(ctx(), "site_1");
        expect(note.author.name).toBe("p@example.test");
    });
});

describe("SitesService.setCommentResolved", () => {
    beforeEach(() => commentFindFirst.mockResolvedValue({ id: "c1" }));

    it("is the owner's call, not the reviewer's", async () => {
        // The spec has the owner confirm a note is addressed after editing the
        // section it was about.
        await expect(
            service.setCommentResolved(
                ctx({ role: "REVIEWER" }),
                "site_1",
                "c1",
                true,
            ),
        ).rejects.toThrow(/REVIEWER.*section:write/);
    });

    it("stamps who settled it, and clears both fields on reopen", async () => {
        commentUpdate.mockResolvedValue({ id: "c1", resolvedAt: new Date() });
        await service.setCommentResolved(ctx(), "site_1", "c1", true);
        expect(commentUpdate.mock.calls[0][0].data.resolvedByUserId).toBe(
            "user_1",
        );

        commentUpdate.mockResolvedValue({ id: "c1", resolvedAt: null });
        await service.setCommentResolved(ctx(), "site_1", "c1", false);
        expect(commentUpdate.mock.calls[1][0].data).toEqual({
            resolvedAt: null,
            resolvedByUserId: null,
        });
    });
});

describe("SitesService.getReviewState", () => {
    it("reports approval and open notes together — that is 'approved with notes'", async () => {
        approvalFindFirst.mockResolvedValue({
            outcome: "APPROVED",
            createdAt: new Date("2026-09-01"),
            by: { name: "Priya Raman", email: "p@example.test" },
        });
        commentCount.mockResolvedValue(2);

        const state = await service.getReviewState(ctx(), "site_1");
        // One badge carrying both, rather than a third outcome.
        expect(state.latestApproval?.outcome).toBe("APPROVED");
        expect(state.latestApproval?.by).toBe("Priya Raman");
        expect(state.openNotes).toBe(2);
    });

    it("has no approval before anyone has given one", async () => {
        approvalFindFirst.mockResolvedValue(null);
        commentCount.mockResolvedValue(0);
        const state = await service.getReviewState(ctx(), "site_1");
        expect(state.latestApproval).toBeNull();
    });
});

describe("SitesService.createApproval", () => {
    it("appends rather than updating, so the history reads", async () => {
        approvalCreate.mockResolvedValue({ id: "a1" });
        await service.createApproval(ctx({ role: "REVIEWER" }), "site_1", {
            outcome: "CHANGES_REQUESTED",
        });
        expect(approvalCreate.mock.calls[0][0].data).toMatchObject({
            siteId: "site_1",
            byUserId: "user_1",
            outcome: "CHANGES_REQUESTED",
        });
    });

    it("denies a MEMBER", async () => {
        await expect(
            service.createApproval(ctx({ role: "MEMBER" }), "site_1", {
                outcome: "APPROVED",
            }),
        ).rejects.toThrow(/MEMBER.*site:approve/);
    });
});
