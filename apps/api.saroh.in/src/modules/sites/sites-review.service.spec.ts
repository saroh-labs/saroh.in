// DB-free unit tests for review (#193). What is proven here is the RULES: what
// a REVIEWER may and may not do, and what happens to a note whose section has
// been deleted under it.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const db: Record<string, unknown> = {
        site: { findFirst: jest.fn() },
        page: { findFirst: jest.fn(), findMany: jest.fn() },
        siteComment: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        siteApproval: {
            create: jest.fn(),
            findFirst: jest.fn(),
            // #278 reads every verdict, not just the latest one.
            findMany: jest.fn(),
        },
        siteTestRelease: { findFirst: jest.fn() },
        // Review alerts go on the review write's transaction (UX-043).
        job: { create: jest.fn() },
        siteReviewer: { count: jest.fn().mockResolvedValue(1) },
    };
    db.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(db));
    return { ...actual, prisma: db };
});

// Test releases on or off for the business (KTD-16).
const mockFlagOn = jest.fn();
jest.mock("../feature-flags/feature-flags.service", () => ({
    FeatureFlagService: jest.fn().mockImplementation(() => ({
        isEnabled: (...args: unknown[]) => mockFlagOn(...args),
    })),
}));

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
const approvalFindMany = prisma.siteApproval.findMany as jest.Mock;

/** The verdict rows #278 reasons over, newest first. */
function verdicts(
    ...rows: { outcome: string; byUserId?: string; fingerprint?: string }[]
) {
    let tick = 0;
    return rows.map((r) => ({
        outcome: r.outcome,
        byUserId: r.byUserId ?? "reviewer",
        draftFingerprint: r.fingerprint ?? null,
        createdAt: new Date(Date.UTC(2026, 8, 12, 0, 0, rows.length - tick++)),
    }));
}

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

const releaseFindFirst = prisma.siteTestRelease.findFirst as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    siteFindFirst.mockResolvedValue({ id: "site_1" });
    pageFindFirst.mockResolvedValue({ id: "page_1" });
    mockFlagOn.mockResolvedValue(true);
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
        // The key must be on the page's draft (#277): assertPageInSite first,
        // then the draft lookup createComment checks it against.
        (prisma.page.findFirst as jest.Mock)
            .mockResolvedValueOnce({ id: "page_1" })
            .mockResolvedValueOnce({
                title: "Home",
                versions: [{ sections: [{ key: "sec-abc" }] }],
            });

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
        // Nothing was asked for and nobody objected: not outstanding.
        approvalFindMany.mockResolvedValue([]);
        commentCount.mockResolvedValue(2);

        const state = await service.getReviewState(ctx(), "site_1");
        // One badge carrying both, rather than a third outcome.
        expect(state.latestApproval?.outcome).toBe("APPROVED");
        expect(state.outstanding).toBe(false);
        expect(state.latestApproval?.by).toBe("Priya Raman");
        expect(state.openNotes).toBe(2);
    });

    it("has no approval before anyone has given one", async () => {
        approvalFindFirst.mockResolvedValue(null);
        approvalFindMany.mockResolvedValue([]);
        commentCount.mockResolvedValue(0);
        const state = await service.getReviewState(ctx(), "site_1");
        expect(state.latestApproval).toBeNull();
    });
});

describe("SitesService.getReviewState — outstanding (#199)", () => {
    it("is outstanding while the latest verdict asks for changes", async () => {
        approvalFindFirst.mockResolvedValue({
            outcome: "CHANGES_REQUESTED",
            createdAt: new Date("2026-09-03T10:00:00Z"),
            by: { name: "Priya Raman", email: "priya@example.com" },
        });
        approvalFindMany.mockResolvedValue(
            verdicts({ outcome: "CHANGES_REQUESTED" }),
        );
        commentCount.mockResolvedValue(0);
        const state = await service.getReviewState(ctx(), "site_1");
        expect(state.outstanding).toBe(true);
        expect(state.latestApproval?.outcome).toBe("CHANGES_REQUESTED");
    });

    it("is closed by going live past it (UX-068): the editor stops saying In review", async () => {
        approvalFindFirst.mockResolvedValue({
            outcome: "BYPASSED",
            createdAt: new Date("2026-09-04T10:00:00Z"),
            by: { name: "Demo Owner", email: "demo@saroh.dev" },
        });
        // Publish's own record closes the request it went past. It is not
        // an approval: the bypass stays in version history.
        approvalFindMany.mockResolvedValue(
            verdicts({ outcome: "BYPASSED" }, { outcome: "CHANGES_REQUESTED" }),
        );
        commentCount.mockResolvedValue(1);
        const state = await service.getReviewState(ctx(), "site_1");
        expect(state.latestApproval?.outcome).toBe("BYPASSED");
        expect(state.outstanding).toBe(false);
        expect(state.pending).toBe(false);
    });

    it("opens again when someone asks after the publish", async () => {
        approvalFindFirst.mockResolvedValue(null);
        approvalFindMany.mockResolvedValue(
            verdicts(
                { outcome: "REQUESTED", byUserId: "user_1" },
                { outcome: "BYPASSED" },
                { outcome: "CHANGES_REQUESTED" },
            ),
        );
        commentCount.mockResolvedValue(0);
        const state = await service.getReviewState(ctx(), "site_1");
        expect(state.pending).toBe(true);
    });
});

describe("SitesService.getReviewState — whose request (UX-068)", () => {
    it("says the open request is the caller's own, so they aren't offered Approve", async () => {
        approvalFindFirst.mockResolvedValue({
            outcome: "REQUESTED",
            byUserId: "user_1",
            createdAt: new Date("2026-09-04T10:00:00Z"),
            by: { name: "Owner", email: "o@example.test" },
        });
        approvalFindMany.mockResolvedValue(
            verdicts({ outcome: "REQUESTED", byUserId: "user_1" }),
        );
        commentCount.mockResolvedValue(0);
        const mine = await service.getReviewState(ctx(), "site_1");
        expect(mine.askedByYou).toBe(true);
        // A reviewer reads the same request as someone else's.
        const theirs = await service.getReviewState(
            ctx({ userId: "reviewer", role: "REVIEWER" }),
            "site_1",
        );
        expect(theirs.askedByYou).toBe(false);
    });
});

describe("SitesService.withdrawReview (UX-068)", () => {
    it("writes WITHDRAWN when a request is open", async () => {
        jest.spyOn(service, "currentDraftFingerprint").mockResolvedValue("fp");
        approvalFindMany.mockResolvedValue(
            verdicts({ outcome: "REQUESTED", byUserId: "user_1" }),
        );
        approvalCreate.mockResolvedValue({ id: "w1" });
        await service.withdrawReview(ctx(), "site_1");
        expect(approvalCreate.mock.calls[0][0].data).toMatchObject({
            siteId: "site_1",
            byUserId: "user_1",
            outcome: "WITHDRAWN",
        });
    });

    it("refuses when nothing is open, and closes what it withdrew", async () => {
        jest.spyOn(service, "currentDraftFingerprint").mockResolvedValue("fp");
        approvalFindMany.mockResolvedValue(
            verdicts(
                { outcome: "WITHDRAWN", byUserId: "user_1" },
                { outcome: "REQUESTED", byUserId: "user_1" },
            ),
        );
        await expect(service.withdrawReview(ctx(), "site_1")).rejects.toThrow(
            "no open review request",
        );
        expect(approvalCreate).not.toHaveBeenCalled();
    });

    it("is not a reviewer's to take back", async () => {
        await expect(
            service.withdrawReview(ctx({ role: "REVIEWER" }), "site_1"),
        ).rejects.toThrow();
        expect(approvalCreate).not.toHaveBeenCalled();
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

/*
 * Review on a test release (DEC-071, T8). A request, a verdict and a note
 * can name a release: they are then bound to its frozen bytes, and the
 * draft's own review never reads them.
 */
describe("review on a test release (T8)", () => {
    const RELEASE = {
        id: "rel_2",
        number: 2,
        name: "Diwali menu",
        fingerprint: "fp-release",
        discardedAt: null as Date | null,
        wentLiveAt: null as Date | null,
    };
    /** The frozen snapshot: Home with two sections, About with one. */
    const SNAPSHOT = {
        pages: [
            { path: "/", sections: [{ type: "hero" }, { type: "richText" }] },
            { path: "/about", sections: [{ type: "richText" }] },
        ],
    };

    function withRelease(over: Partial<typeof RELEASE> | null = {}) {
        releaseFindFirst.mockImplementation(
            (args: { select: Record<string, unknown> }) =>
                Promise.resolve(
                    over === null
                        ? null
                        : args.select.publication
                          ? { publication: { snapshot: SNAPSHOT } }
                          : { ...RELEASE, ...over },
                ),
        );
    }

    function releaseRow(
        outcome: string,
        byUserId: string,
        fingerprint = RELEASE.fingerprint,
        seconds = 0,
    ) {
        return {
            outcome,
            byUserId,
            draftFingerprint: fingerprint,
            testReleaseId: RELEASE.id,
            createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, seconds)),
        };
    }

    describe("a verdict", () => {
        it("is bound to the release's fingerprint, not the draft's", async () => {
            withRelease();
            approvalCreate.mockResolvedValue({ id: "a1" });
            const draft = jest.spyOn(service, "currentDraftFingerprint");

            await service.createApproval(ctx({ role: "REVIEWER" }), "site_1", {
                outcome: "APPROVED",
                testReleaseId: "rel_2",
            });

            expect(approvalCreate.mock.calls[0][0].data).toMatchObject({
                outcome: "APPROVED",
                draftFingerprint: "fp-release",
                testReleaseId: "rel_2",
            });
            // The moving draft is never consulted.
            expect(draft).not.toHaveBeenCalled();
            draft.mockRestore();
        });

        it("binds a change request too, so it is about that release", async () => {
            withRelease();
            approvalCreate.mockResolvedValue({ id: "a1" });
            await service.createApproval(ctx({ role: "REVIEWER" }), "site_1", {
                outcome: "CHANGES_REQUESTED",
                testReleaseId: "rel_2",
            });
            expect(approvalCreate.mock.calls[0][0].data).toMatchObject({
                outcome: "CHANGES_REQUESTED",
                draftFingerprint: "fp-release",
                testReleaseId: "rel_2",
            });
        });

        it("is refused on a discarded release (409)", async () => {
            withRelease({ discardedAt: new Date() });
            const verdict = service.createApproval(
                ctx({ role: "REVIEWER" }),
                "site_1",
                { outcome: "APPROVED", testReleaseId: "rel_2" },
            );
            await expect(verdict).rejects.toMatchObject({ status: 409 });
            await expect(verdict).rejects.toThrow(
                "This test release was discarded.",
            );
            expect(approvalCreate).not.toHaveBeenCalled();
        });

        it("is refused on a release that is live now (409)", async () => {
            withRelease({ wentLiveAt: new Date() });
            await expect(
                service.createApproval(ctx({ role: "REVIEWER" }), "site_1", {
                    outcome: "APPROVED",
                    testReleaseId: "rel_2",
                }),
            ).rejects.toMatchObject({ status: 409 });
            expect(approvalCreate).not.toHaveBeenCalled();
        });

        it("is 404 for a release of another site, or with test releases off", async () => {
            withRelease(null);
            await expect(
                service.createApproval(ctx(), "site_1", {
                    outcome: "APPROVED",
                    testReleaseId: "rel_other",
                }),
            ).rejects.toMatchObject({ status: 404 });

            withRelease();
            mockFlagOn.mockResolvedValue(false);
            await expect(
                service.createApproval(ctx(), "site_1", {
                    outcome: "APPROVED",
                    testReleaseId: "rel_2",
                }),
            ).rejects.toMatchObject({ status: 404 });
            expect(approvalCreate).not.toHaveBeenCalled();
        });

        it("still needs site:approve", async () => {
            withRelease();
            await expect(
                service.createApproval(ctx({ role: "MEMBER" }), "site_1", {
                    outcome: "APPROVED",
                    testReleaseId: "rel_2",
                }),
            ).rejects.toThrow(/MEMBER.*site:approve/);
        });
    });

    describe("asking for a review", () => {
        it("puts the release's bytes up for review", async () => {
            withRelease();
            approvalCreate.mockResolvedValue({ id: "r1" });
            await service.requestReview(ctx(), "site_1", "rel_2");
            expect(approvalCreate.mock.calls[0][0].data).toMatchObject({
                outcome: "REQUESTED",
                byUserId: "user_1",
                draftFingerprint: "fp-release",
                testReleaseId: "rel_2",
            });
        });

        it("is refused on a discarded release (409)", async () => {
            withRelease({ discardedAt: new Date() });
            await expect(
                service.requestReview(ctx(), "site_1", "rel_2"),
            ).rejects.toMatchObject({ status: 409 });
        });
    });

    describe("the review state", () => {
        it("reads the release's verdicts, bound to its fingerprint", async () => {
            withRelease();
            approvalFindFirst.mockResolvedValue({
                outcome: "APPROVED",
                createdAt: new Date("2026-10-01T12:00:05Z"),
                by: { name: "Meera", email: "m@example.test" },
            });
            approvalFindMany.mockResolvedValue([
                releaseRow("APPROVED", "reviewer", RELEASE.fingerprint, 5),
                // The draft's own request doesn't hold the release up.
                {
                    ...releaseRow("REQUESTED", "user_1", "fp-draft", 4),
                    testReleaseId: null,
                },
                releaseRow("REQUESTED", "user_1", RELEASE.fingerprint, 3),
            ]);
            commentCount.mockResolvedValue(1);

            const state = await service.getReviewState(
                ctx(),
                "site_1",
                "rel_2",
            );

            expect(state.testRelease).toEqual({
                id: "rel_2",
                number: 2,
                name: "Diwali menu",
            });
            expect(state.outstanding).toBe(false);
            expect(state.pending).toBe(false);
            expect(state.latestApproval?.by).toBe("Meera");
            // Its own notes, not the draft's.
            expect(commentCount.mock.calls[0][0].where).toMatchObject({
                testReleaseId: "rel_2",
                resolvedAt: null,
            });
        });

        it("is in review while a request on the release is unanswered", async () => {
            withRelease();
            approvalFindFirst.mockResolvedValue(null);
            approvalFindMany.mockResolvedValue([
                releaseRow("REQUESTED", "user_1"),
            ]);
            commentCount.mockResolvedValue(0);
            const state = await service.getReviewState(
                ctx(),
                "site_1",
                "rel_2",
            );
            expect(state.outstanding).toBe(true);
            expect(state.pending).toBe(true);
        });

        it("leaves the draft's review as it was when a release is reviewed", async () => {
            // A release was put up for review and approved; the draft's own
            // review has nothing asked of it.
            approvalFindFirst.mockResolvedValue(null);
            approvalFindMany.mockResolvedValue([
                releaseRow("APPROVED", "reviewer", RELEASE.fingerprint, 2),
                releaseRow("REQUESTED", "user_1", RELEASE.fingerprint, 1),
            ]);
            commentCount.mockResolvedValue(0);
            const draft = jest
                .spyOn(service, "currentDraftFingerprint")
                .mockResolvedValue("fp-draft");

            const state = await service.getReviewState(ctx(), "site_1");

            expect(state.testRelease).toBeNull();
            expect(state.outstanding).toBe(false);
            expect(state.approvalIsStale).toBe(false);
            expect(approvalFindFirst.mock.calls[0][0].where).toMatchObject({
                testReleaseId: null,
            });
            expect(commentCount.mock.calls[0][0].where).toMatchObject({
                testReleaseId: null,
            });
            expect(releaseFindFirst).not.toHaveBeenCalled();
            draft.mockRestore();
        });
    });

    describe("a note", () => {
        /** assertPageInSite's lookup, then the page the note is on. */
        function onHome() {
            pageFindFirst
                .mockResolvedValueOnce({ id: "page_1" })
                .mockResolvedValueOnce({
                    title: "Home",
                    path: "/",
                    // The draft has moved on: one section, keyed.
                    versions: [{ sections: [{ key: "sec-new" }] }],
                });
        }

        beforeEach(() => commentCreate.mockResolvedValue({ id: "c1" }));

        it("is pinned to a section of the frozen page, by position", async () => {
            withRelease();
            onHome();
            await service.createComment(ctx({ role: "REVIEWER" }), "site_1", {
                body: "The second block reads oddly.",
                pageId: "page_1",
                sectionKey: "1",
                testReleaseId: "rel_2",
            });
            expect(commentCreate.mock.calls[0][0].data).toMatchObject({
                pageId: "page_1",
                sectionKey: "1",
                testReleaseId: "rel_2",
            });
        });

        it("is checked against the release, not the draft", async () => {
            withRelease();
            // The draft's key is no section of the frozen page, and the
            // frozen page has only two sections.
            for (const sectionKey of ["sec-new", "2"]) {
                onHome();
                await expect(
                    service.createComment(ctx({ role: "REVIEWER" }), "site_1", {
                        body: "x",
                        pageId: "page_1",
                        sectionKey,
                        testReleaseId: "rel_2",
                    }),
                ).rejects.toThrow("That section isn't on this page");
            }
            expect(commentCreate).not.toHaveBeenCalled();
        });

        it("is refused on a discarded release (409)", async () => {
            withRelease({ discardedAt: new Date() });
            onHome();
            await expect(
                service.createComment(ctx({ role: "REVIEWER" }), "site_1", {
                    body: "x",
                    pageId: "page_1",
                    sectionKey: "0",
                    testReleaseId: "rel_2",
                }),
            ).rejects.toMatchObject({ status: 409 });
            expect(commentCreate).not.toHaveBeenCalled();
        });
    });

    describe("the notes", () => {
        function note(id: string, pageId: string, sectionKey: string) {
            return {
                id,
                pageId,
                sectionKey,
                body: "note",
                resolvedAt: null,
                createdAt: new Date("2026-10-01"),
                author: { id: "u1", name: "Meera", email: "m@x.test" },
            };
        }

        it("lists the release's own, against its frozen pages", async () => {
            withRelease();
            commentFindMany.mockResolvedValue([
                note("c1", "page_home", "1"),
                // About froze with one section.
                note("c2", "page_about", "1"),
            ]);
            pageFindMany.mockResolvedValue([
                {
                    id: "page_home",
                    title: "Home",
                    path: "/",
                    // The draft dropped a section since: the note stays on.
                    versions: [{ sections: [{ key: "sec-a" }] }],
                },
                {
                    id: "page_about",
                    title: "About",
                    path: "/about",
                    versions: [{ sections: [{ key: "sec-b" }] }],
                },
            ]);

            const notes = await service.listComments(ctx(), "site_1", "rel_2");

            expect(commentFindMany.mock.calls[0][0].where).toMatchObject({
                testReleaseId: "rel_2",
            });
            expect(notes.map((n) => [n.id, n.orphaned])).toEqual([
                ["c1", false],
                ["c2", true],
            ]);
        });

        it("lists only the draft's without a release", async () => {
            commentFindMany.mockResolvedValue([]);
            pageFindMany.mockResolvedValue([]);
            await service.listComments(ctx(), "site_1");
            expect(commentFindMany.mock.calls[0][0].where).toMatchObject({
                testReleaseId: null,
            });
        });
    });
});

describe("Ask for changes says what (UX-043)", () => {
    it("keeps the reason on a change request, and none on an approval", async () => {
        approvalCreate.mockResolvedValue({ id: "a1" });
        await service.createApproval(ctx({ role: "REVIEWER" }), "site_1", {
            outcome: "CHANGES_REQUESTED",
            reason: "The hero photo is last year's.",
        });
        expect(approvalCreate.mock.calls[0][0].data).toMatchObject({
            outcome: "CHANGES_REQUESTED",
            reason: "The hero photo is last year's.",
        });

        jest.spyOn(service, "currentDraftFingerprint").mockResolvedValue("fp");
        await service.createApproval(ctx({ role: "REVIEWER" }), "site_1", {
            outcome: "APPROVED",
            reason: "ignored",
        });
        expect(approvalCreate.mock.calls[1][0].data.reason).toBeNull();
    });

    it("refuses a change request without one", async () => {
        const { plainToInstance } = await import("class-transformer");
        const { validate } = await import("class-validator");
        const { CreateApprovalDto } = await import("./dto");
        const errorsFor = async (body: object) =>
            (await validate(plainToInstance(CreateApprovalDto, body))).map(
                (e) => e.property,
            );
        expect(await errorsFor({ outcome: "CHANGES_REQUESTED" })).toContain(
            "reason",
        );
        expect(
            await errorsFor({ outcome: "CHANGES_REQUESTED", reason: "  " }),
        ).toContain("reason");
        expect(
            await errorsFor({
                outcome: "CHANGES_REQUESTED",
                reason: "Fix the hours",
            }),
        ).toEqual([]);
        expect(await errorsFor({ outcome: "APPROVED" })).toEqual([]);
    });
});

/*
 * UX-043: every review event tells the other side, through a `team.alert`
 * written on the review row's own transaction.
 */
describe("telling the other side (UX-043)", () => {
    const jobCreate = (prisma as unknown as { job: { create: jest.Mock } }).job
        .create;
    const reviewerCount = (
        prisma as unknown as { siteReviewer: { count: jest.Mock } }
    ).siteReviewer.count;
    const alerts = () =>
        jobCreate.mock.calls.map(
            (c: [{ data: { type: string; payload: unknown } }]) => c[0].data,
        );

    function draftWithSection() {
        pageFindFirst.mockReset();
        pageFindFirst
            .mockResolvedValueOnce({ id: "page_1" })
            .mockResolvedValueOnce({
                title: "Home",
                versions: [{ sections: [{ key: "sec-abc" }] }],
            });
    }

    it("a reviewer's note tells the people who publish", async () => {
        commentCreate.mockResolvedValue({ id: "c9" });
        draftWithSection();
        await service.createComment(ctx({ role: "REVIEWER" }), "site_1", {
            body: "Too long.",
            pageId: "page_1",
            sectionKey: "sec-abc",
        });
        expect(alerts()).toEqual([
            {
                organizationId: "org_1",
                type: "team.alert",
                payload: { event: "review", about: "note", commentId: "c9" },
            },
        ]);
    });

    it("a note by someone who publishes tells nobody", async () => {
        commentCreate.mockResolvedValue({ id: "c9" });
        draftWithSection();
        await service.createComment(ctx({ role: "OWNER" }), "site_1", {
            body: "Reply.",
            pageId: "page_1",
            sectionKey: "sec-abc",
        });
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("a verdict tells the people who publish, whoever reviews the site", async () => {
        approvalCreate.mockResolvedValue({ id: "a9" });
        await service.createApproval(ctx({ role: "REVIEWER" }), "site_1", {
            outcome: "APPROVED",
        });
        expect(reviewerCount).not.toHaveBeenCalled();
        expect(alerts()).toEqual([
            {
                organizationId: "org_1",
                type: "team.alert",
                payload: {
                    event: "review",
                    about: "approval",
                    approvalId: "a9",
                },
            },
        ]);
    });

    it("asking for a review tells the site's reviewers", async () => {
        approvalCreate.mockResolvedValue({ id: "a10" });
        const fingerprint = jest
            .spyOn(service, "currentDraftFingerprint")
            .mockResolvedValue("fp");
        await service.requestReview(ctx(), "site_1");
        expect(reviewerCount).toHaveBeenCalledWith({
            where: { organizationId: "org_1", siteId: "site_1" },
        });
        expect(alerts()).toEqual([
            {
                organizationId: "org_1",
                type: "team.alert",
                payload: {
                    event: "review",
                    about: "approval",
                    approvalId: "a10",
                },
            },
        ]);
        fingerprint.mockRestore();
    });

    it("asking with no reviewer on the site queues nothing", async () => {
        approvalCreate.mockResolvedValue({ id: "a11" });
        reviewerCount.mockResolvedValueOnce(0);
        const fingerprint = jest
            .spyOn(service, "currentDraftFingerprint")
            .mockResolvedValue("fp");
        await service.requestReview(ctx(), "site_1");
        expect(approvalCreate).toHaveBeenCalledTimes(1);
        expect(jobCreate).not.toHaveBeenCalled();
        fingerprint.mockRestore();
    });
});
