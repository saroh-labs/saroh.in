import type { VerdictRow } from "./test-release-review";
import {
    draftVerdicts,
    isReleaseSectionKey,
    releaseApproved,
    releaseSectionKey,
    releaseStanding,
    releaseVerdicts,
} from "./test-release-review";

/*
 * Review on a test release (DEC-071, KTD-10, T8). Pure: the rule going live,
 * the schedule, its job and the release list all ask.
 */

const R2 = { id: "rel_2", fingerprint: "fp-2" };
const R3 = { id: "rel_3", fingerprint: "fp-3" };

/** Verdict rows, newest first: the first row given is the newest. */
function verdicts(
    ...rows: {
        outcome: "REQUESTED" | "APPROVED" | "CHANGES_REQUESTED";
        by?: string;
        on?: { id: string; fingerprint: string } | "draft";
        fingerprint?: string | null;
    }[]
): VerdictRow[] {
    return rows.map((r, i) => {
        const on = r.on ?? R2;
        return {
            outcome: r.outcome,
            byUserId: r.by ?? "reviewer",
            testReleaseId: on === "draft" ? null : on.id,
            draftFingerprint:
                r.fingerprint !== undefined
                    ? r.fingerprint
                    : on === "draft"
                      ? "fp-draft"
                      : on.fingerprint,
            createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, rows.length - i)),
        };
    });
}

describe("releaseApproved", () => {
    it("is approved by someone else's approval of the release", () => {
        const rows = verdicts(
            { outcome: "APPROVED", by: "reviewer" },
            { outcome: "REQUESTED", by: "owner" },
        );
        expect(releaseApproved(rows, R2, "owner")).toBe(true);
    });

    it("doesn't carry an approval of release 2 to release 3 with other bytes", () => {
        const rows = verdicts({ outcome: "APPROVED", on: R2 });
        expect(releaseApproved(rows, R2, "owner")).toBe(true);
        expect(releaseApproved(rows, R3, "owner")).toBe(false);
    });

    it("settles both when release 2 and 3 froze the same bytes", () => {
        // Same content is the same thing to approve: honest, not a leak.
        const same = { id: "rel_3", fingerprint: R2.fingerprint };
        const rows = verdicts({ outcome: "APPROVED", on: R2 });
        expect(releaseApproved(rows, same, "owner")).toBe(true);
    });

    it("is not approved when changes were asked for after the approval", () => {
        const rows = verdicts(
            { outcome: "CHANGES_REQUESTED", by: "reviewer" },
            { outcome: "APPROVED", by: "reviewer" },
        );
        expect(releaseApproved(rows, R2, "owner")).toBe(false);
        expect(releaseStanding(rows, R2, "owner")).toMatchObject({
            outstanding: true,
            route: "BYPASSED",
        });
    });

    it("is approved again by an approval after the change request", () => {
        const rows = verdicts(
            { outcome: "APPROVED", by: "reviewer" },
            { outcome: "CHANGES_REQUESTED", by: "reviewer" },
        );
        expect(releaseApproved(rows, R2, "owner")).toBe(true);
    });

    it("is not approved by the person going live (#278)", () => {
        const rows = verdicts({ outcome: "APPROVED", by: "owner" });
        expect(releaseApproved(rows, R2, "owner")).toBe(false);
        // Someone else going live finds it approved.
        expect(releaseApproved(rows, R2, "admin")).toBe(true);
    });

    it("is not approved when nobody has looked at it", () => {
        expect(releaseApproved([], R2, "owner")).toBe(false);
        const asked = verdicts({ outcome: "REQUESTED", by: "owner" });
        expect(releaseApproved(asked, R2, "owner")).toBe(false);
    });

    it("never counts the draft's review, even of the same bytes", () => {
        // Approving the draft is not approving a release: a reviewer
        // approves what they looked at.
        const rows = verdicts({
            outcome: "APPROVED",
            on: "draft",
            fingerprint: R2.fingerprint,
        });
        expect(releaseApproved(rows, R2, "owner")).toBe(false);
    });

    it("is not held up by a review asked of the draft", () => {
        const rows = verdicts(
            { outcome: "REQUESTED", by: "owner", on: "draft" },
            { outcome: "APPROVED", by: "reviewer" },
        );
        expect(releaseApproved(rows, R2, "owner")).toBe(true);
    });
});

describe("draftVerdicts and releaseVerdicts", () => {
    it("keep the draft's review and a release's apart", () => {
        const rows = verdicts(
            { outcome: "APPROVED", on: R3 },
            { outcome: "CHANGES_REQUESTED", on: "draft", fingerprint: null },
            { outcome: "REQUESTED", on: R2 },
        );
        expect(draftVerdicts(rows).map((v) => v.outcome)).toEqual([
            "CHANGES_REQUESTED",
        ]);
        expect(releaseVerdicts(rows, R2).map((v) => v.outcome)).toEqual([
            "REQUESTED",
        ]);
    });

    it("reads a row without the column as the draft's, as every row was", () => {
        const legacy = { ...verdicts({ outcome: "APPROVED" })[0] };
        delete legacy.testReleaseId;
        expect(draftVerdicts([legacy])).toHaveLength(1);
        expect(releaseVerdicts([legacy], R2)).toHaveLength(0);
    });
});

describe("going live closes the release's review (DEC-101)", () => {
    /** A go-live's own record, as `putLive` writes it for a release. */
    function closing(
        outcome: "BYPASSED" | "OVERRIDDEN",
        on: { id: string; fingerprint: string },
    ): VerdictRow {
        return {
            outcome,
            byUserId: "owner",
            testReleaseId: on.id,
            draftFingerprint: on.fingerprint,
            createdAt: new Date(Date.UTC(2026, 9, 1, 13)),
        };
    }

    it.each(["BYPASSED", "OVERRIDDEN"] as const)(
        "a %s record with the release's bytes closes its open request",
        (outcome) => {
            const asked = verdicts({ outcome: "REQUESTED", by: "owner" });
            expect(releaseStanding(asked, R2, "owner").outstanding).toBe(true);

            const rows = [closing(outcome, R2), ...asked];
            expect(releaseStanding(rows, R2, "owner").outstanding).toBe(false);
            // Closing is not approving.
            expect(releaseApproved(rows, R2, "owner")).toBe(false);
        },
    );

    it("leaves another release with other bytes in review", () => {
        const rows = [
            closing("BYPASSED", R2),
            ...verdicts({ outcome: "REQUESTED", on: R3 }),
        ];
        expect(releaseStanding(rows, R3, "owner").outstanding).toBe(true);
    });

    it("leaves the draft's own review alone", () => {
        const rows = [
            closing("BYPASSED", R2),
            ...verdicts({ outcome: "REQUESTED", on: "draft" }),
        ];
        expect(draftVerdicts(rows).map((v) => v.outcome)).toEqual([
            "REQUESTED",
        ]);
    });
});

describe("a note's section on a frozen page", () => {
    it("is named by its position", () => {
        expect(releaseSectionKey(0)).toBe("0");
        expect(isReleaseSectionKey("0", 3)).toBe(true);
        expect(isReleaseSectionKey("2", 3)).toBe(true);
    });

    it("refuses a position past the page, or anything else", () => {
        expect(isReleaseSectionKey("3", 3)).toBe(false);
        expect(isReleaseSectionKey("0", 0)).toBe(false);
        for (const key of ["-1", "01", "1.0", "sec-abc", "", " 1"]) {
            expect(isReleaseSectionKey(key, 5)).toBe(false);
        }
    });
});
