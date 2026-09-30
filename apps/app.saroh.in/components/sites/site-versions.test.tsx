import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReviewPanel } from "@/components/sites/review-panel";
import { RESTORE_NEEDS_OWNER } from "@/lib/sites/release-review";
import type { ReviewState, SitePublication } from "@/lib/sites/service";
import type { TestRelease } from "@/lib/sites/test-releases";

import { SiteVersions } from "./site-versions";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// Server-only: nothing here calls them.
vi.mock("@/lib/sites/actions", () => ({
    restorePublication: vi.fn(),
    createApproval: vi.fn(),
    requestReview: vi.fn(),
    setCommentResolved: vi.fn(),
    listPreviewLinks: vi.fn(),
    createPreviewLink: vi.fn(),
    revokePreviewLink: vi.fn(),
}));

/**
 * Version history naming test releases, and the review panel saying what it
 * reviews (DEC-071, T12).
 */

const version = (over: Partial<SitePublication>): SitePublication => ({
    id: "pub_1",
    publishedAt: "2026-09-30T10:40:00Z",
    publishedByUserId: "user_asha",
    publishedBy: "Asha",
    templateId: "starter",
    templateVersion: 1,
    isCurrent: false,
    bypass: null,
    override: null,
    reviewRoute: "NONE",
    testRelease: null,
    ...over,
});

const history: SitePublication[] = [
    version({
        id: "pub_live",
        isCurrent: true,
        reviewRoute: "OVERRIDDEN",
        override: { at: "2026-09-30T10:40:00Z", by: "Asha" },
        testRelease: { id: "rel_2", number: 2, name: "Diwali menu" },
    }),
    version({
        id: "pub_bypass",
        reviewRoute: "BYPASSED",
        bypass: { at: "2026-09-29T10:40:00Z", by: "Ravi" },
    }),
    version({ id: "pub_approved", reviewRoute: "APPROVED" }),
    version({ id: "pub_none" }),
];

const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, " ");

function render(
    over: Partial<Parameters<typeof SiteVersions>[0]> = {},
): string {
    return renderToStaticMarkup(
        <SiteVersions
            siteId="site_1"
            publications={history}
            changesRequested={false}
            canRestore
            {...over}
        />,
    );
}

describe("version history (T12)", () => {
    it("badges each route: Live, Overridden by the owner, Bypassed, Approved; NONE says nothing", () => {
        const html = render();
        const out = text(html);
        expect(out).toContain("Live");
        expect(out).toContain("Overridden by Asha");
        expect(out).toContain("Bypassed");
        expect(out).toContain("Approved");
        expect(out).toContain(
            "Asha went live without approval. Publishing needs approval on this site, and an owner overrode it.",
        );
        expect(out).toContain(
            "Published without approval by Ravi — a reviewer had asked for changes.",
        );
        // Four versions, three routes worth a badge.
        expect(html.match(/Overridden by|Bypassed<|>Approved</g)).toHaveLength(
            3,
        );
    });

    it("links a go-live to the test release it came from", () => {
        const html = render();
        expect(text(html)).toContain("From test release 2 · Diwali menu");
        expect(html).toContain('href="/sites/site_1/releases/rel_2"');
        expect(text(html)).toContain("Went live by Asha");
    });

    it("keeps Restore for an owner, and says why it's off for anyone else, while approval is needed", () => {
        const owner = text(render({ needsApproval: true, canOverride: true }));
        expect(owner).toContain("Restore");
        expect(owner).not.toContain(RESTORE_NEEDS_OWNER);

        const admin = render({ needsApproval: true, canOverride: false });
        expect(text(admin)).toContain(RESTORE_NEEDS_OWNER);
        expect(admin).toMatch(/<button[^>]*disabled[^>]*>Restore<\/button>/);

        // Off: as before.
        expect(text(render())).not.toContain(RESTORE_NEEDS_OWNER);
    });

    it("lists a scheduled go-live above the versions, and says when it couldn't check", () => {
        const scheduled: TestRelease = {
            id: "rel_3",
            number: 3,
            name: "Weekend menu",
            note: null,
            status: "scheduled",
            createdAt: "2026-09-30T04:40:00Z",
            createdBy: { name: "Asha" },
            draftChangedSince: false,
            standing: {
                outstanding: false,
                route: "NONE",
                approved: false,
                latest: null,
            },
            schedule: {
                goLiveAt: "2026-10-03T12:30:00Z",
                zone: "Asia/Kolkata",
                by: { name: "Asha" },
            },
            wentLiveAt: null,
            livePublicationId: null,
            discardedAt: null,
            lastGoLive: null,
            links: [],
        };
        const html = render({
            scheduled: {
                state: "on",
                releases: [scheduled],
                zone: "Asia/Kolkata",
            },
        });
        expect(text(html)).toContain("Test release 3 · Weekend menu");
        expect(text(html)).toContain("Scheduled");
        expect(text(html)).toMatch(/Goes live .* by Asha/);
        expect(html).toContain('href="/sites/site_1/releases/rel_3"');

        expect(text(render({ scheduled: { state: "failed" } }))).toContain(
            "Couldn't check for scheduled go-lives.",
        );
    });
});

describe("the review panel says what it reviews (T12)", () => {
    const review: ReviewState = {
        openNotes: 0,
        latestApproval: null,
        outstanding: false,
        pending: false,
        approvalIsStale: false,
    };

    const panel = (over: Partial<Parameters<typeof ReviewPanel>[0]>) =>
        renderToStaticMarkup(
            <ReviewPanel
                siteId="site_1"
                pages={[]}
                comments={[]}
                review={review}
                onChanged={() => undefined}
                onJump={() => undefined}
                {...over}
            />,
        );

    it("reads Draft in the editor", () => {
        expect(text(panel({}))).toContain("Reviewing Draft");
    });

    it("names the test release, and leaves the draft's preview links out", () => {
        const html = panel({
            release: { id: "rel_2", number: 2, name: "Diwali menu" },
        });
        expect(text(html)).toContain("Reviewing Test release 2 · Diwali menu");
        expect(text(html)).toContain("No notes on this test release yet.");
        expect(text(html)).not.toContain("preview");
    });

    it("offers a verdict only to someone who can give one", () => {
        const html = panel({
            release: { id: "rel_2", number: 2, name: "Diwali menu" },
            can: { approve: false, ask: false, settle: false },
        });
        expect(text(html)).not.toContain("Approve");
        expect(text(html)).not.toContain("Ask for a review");
    });
});
