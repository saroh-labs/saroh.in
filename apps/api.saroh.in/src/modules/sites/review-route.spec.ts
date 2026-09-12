import { draftFingerprint, ReviewRoute, reviewStanding } from "./review-route";

/**
 * #278: what "approved" is worth, and which route a publish took.
 *
 * The rules under test are #193's as amended, plus the self-approval decision
 * recorded on the issue.
 */

const DRAFT = "fingerprint-of-the-current-draft";
const OLDER = "fingerprint-of-an-earlier-draft";

let clock = 0;
/** Rows in the order the service passes them: newest first. */
function rows(
    ...entries: {
        outcome: string;
        by?: string;
        fingerprint?: string | null;
    }[]
) {
    return entries
        .map((e) => ({
            outcome: e.outcome,
            byUserId: e.by ?? "reviewer",
            draftFingerprint: e.fingerprint ?? null,
            createdAt: new Date(Date.UTC(2026, 8, 12, 0, 0, clock++)),
        }))
        .reverse();
}

beforeEach(() => {
    clock = 0;
});

describe("nobody was asked", () => {
    it("is not outstanding, and the route is NONE", () => {
        expect(reviewStanding([], DRAFT, "owner")).toEqual({
            outstanding: false,
            route: ReviewRoute.None,
            approvedBy: null,
            approvalIsStale: false,
        });
    });

    it("stays NONE for a merchant who never requests one, whatever they publish", () => {
        const standing = reviewStanding(
            rows({ outcome: "BYPASSED" }),
            DRAFT,
            "owner",
        );
        // A BYPASSED row is publish's own record and never a verdict — the
        // service does not even select it, and it would not change this.
        expect(standing.route).toBe(ReviewRoute.None);
    });
});

describe("a review that was asked for", () => {
    it("is outstanding until someone answers", () => {
        const standing = reviewStanding(
            rows({ outcome: "REQUESTED", by: "owner", fingerprint: DRAFT }),
            DRAFT,
            "owner",
        );
        expect(standing.outstanding).toBe(true);
        expect(standing.route).toBe(ReviewRoute.Bypassed);
    });

    it("is settled by an approval of the same draft from someone else", () => {
        const standing = reviewStanding(
            rows(
                { outcome: "REQUESTED", by: "owner", fingerprint: DRAFT },
                { outcome: "APPROVED", by: "reviewer", fingerprint: DRAFT },
            ),
            DRAFT,
            "owner",
        );
        expect(standing).toMatchObject({
            outstanding: false,
            route: ReviewRoute.Approved,
            approvedBy: "reviewer",
            approvalIsStale: false,
        });
    });

    it("does not survive later edits to the draft", () => {
        // Approve, change three sections, publish. This used to read
        // "Approved"; #193 says an approval does not survive the edits.
        const standing = reviewStanding(
            rows(
                { outcome: "REQUESTED", by: "owner", fingerprint: OLDER },
                { outcome: "APPROVED", by: "reviewer", fingerprint: OLDER },
            ),
            DRAFT,
            "owner",
        );
        expect(standing.outstanding).toBe(true);
        expect(standing.route).toBe(ReviewRoute.Bypassed);
        expect(standing.approvalIsStale).toBe(true);
    });

    it("is outstanding again when changes are asked for after an approval", () => {
        const standing = reviewStanding(
            rows(
                { outcome: "APPROVED", by: "reviewer", fingerprint: DRAFT },
                { outcome: "CHANGES_REQUESTED", by: "reviewer" },
            ),
            DRAFT,
            "owner",
        );
        expect(standing.outstanding).toBe(true);
        expect(standing.route).toBe(ReviewRoute.Bypassed);
    });
});

describe("approving your own work", () => {
    it("does not settle the review, and the publish records as a bypass", () => {
        const standing = reviewStanding(
            rows(
                { outcome: "REQUESTED", by: "owner", fingerprint: DRAFT },
                { outcome: "APPROVED", by: "owner", fingerprint: DRAFT },
            ),
            DRAFT,
            // The same person is publishing.
            "owner",
        );
        expect(standing.outstanding).toBe(true);
        expect(standing.route).toBe(ReviewRoute.Bypassed);
        expect(standing.approvedBy).toBeNull();
    });

    it("counts when somebody ELSE publishes it", () => {
        // An admin signing off a colleague's work is a second pair of eyes,
        // which is why OWNER and ADMIN keep site:approve.
        const standing = reviewStanding(
            rows(
                { outcome: "REQUESTED", by: "writer", fingerprint: DRAFT },
                { outcome: "APPROVED", by: "admin", fingerprint: DRAFT },
            ),
            DRAFT,
            "writer",
        );
        expect(standing).toMatchObject({
            outstanding: false,
            route: ReviewRoute.Approved,
            approvedBy: "admin",
        });
    });
});

describe("draftFingerprint", () => {
    it("ignores the publish timestamp and nothing else", () => {
        const a = { publishedAt: "2026-09-12T00:00:00Z", site: { name: "N" } };
        const b = { publishedAt: "2026-09-13T09:30:00Z", site: { name: "N" } };
        const c = { publishedAt: "2026-09-12T00:00:00Z", site: { name: "M" } };

        expect(draftFingerprint(a)).toBe(draftFingerprint(b));
        expect(draftFingerprint(a)).not.toBe(draftFingerprint(c));
    });

    it("does not depend on the order keys were built in", () => {
        expect(draftFingerprint({ a: 1, b: { c: 2, d: 3 } })).toBe(
            draftFingerprint({ b: { d: 3, c: 2 }, a: 1 }),
        );
    });

    it("changes when sections are reordered, because that is an edit", () => {
        expect(draftFingerprint({ sections: [1, 2] })).not.toBe(
            draftFingerprint({ sections: [2, 1] }),
        );
    });

    it("handles a null or empty snapshot without throwing", () => {
        expect(draftFingerprint(null)).toBe(draftFingerprint({}));
    });
});
