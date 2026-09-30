import { describe, expect, it } from "vitest";

import {
    frozenSections,
    releaseTitle,
    releaseVerdictLine,
    RESTORE_NEEDS_OWNER,
    restoreGate,
    reviewSubject,
    versionRowCopy,
} from "./release-review";
import type { SitePublication } from "./service";

/**
 * Reviewing test releases, and version history naming them (DEC-071, T12).
 */

const version = (over: Partial<SitePublication> = {}): SitePublication => ({
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

const labels = (p: SitePublication) =>
    versionRowCopy(p).badges.map((b) => b.label);
const lines = (p: SitePublication) =>
    versionRowCopy(p).lines.map((l) => l.text);

describe("what a review is about", () => {
    it("names a release by number and name, once when it kept its default", () => {
        expect(releaseTitle({ number: 2, name: "Diwali menu" })).toBe(
            "Test release 2 · Diwali menu",
        );
        expect(releaseTitle({ number: 3, name: "Test release 3" })).toBe(
            "Test release 3",
        );
    });

    it("says Draft, or the release", () => {
        expect(reviewSubject(null)).toBe("Draft");
        expect(
            reviewSubject({ id: "rel_1", number: 2, name: "Diwali menu" }),
        ).toBe("Test release 2 · Diwali menu");
    });

    it("words a release's newest verdict as a reviewer reads it", () => {
        expect(releaseVerdictLine(null)).toBe(
            "Nobody has reviewed this test release yet.",
        );
        expect(releaseVerdictLine({ outcome: "APPROVED", by: "Meera" })).toBe(
            "Meera approved this test release.",
        );
        expect(
            releaseVerdictLine({ outcome: "CHANGES_REQUESTED", by: "Meera" }),
        ).toBe("Meera asked for changes.");
        expect(releaseVerdictLine({ outcome: "REQUESTED", by: null })).toBe(
            "Someone asked for a review.",
        );
        expect(releaseVerdictLine({ outcome: "OVERRIDDEN", by: "Asha" })).toBe(
            "Asha went live without approval.",
        );
    });
});

describe("a version's row in the history", () => {
    it("APPROVED: an Approved badge and the line", () => {
        const p = version({ reviewRoute: "APPROVED" });
        expect(labels(p)).toEqual(["Approved"]);
        expect(lines(p)).toContain("A reviewer approved this version");
    });

    it("BYPASSED: a Bypassed badge, and who went past the request", () => {
        const p = version({
            reviewRoute: "BYPASSED",
            bypass: { at: "2026-09-30T10:40:00Z", by: "Asha" },
        });
        expect(labels(p)).toEqual(["Bypassed"]);
        expect(lines(p)).toContain(
            "Published without approval by Asha — a reviewer had asked for changes.",
        );
        expect(versionRowCopy(p).lines.at(-1)?.tone).toBe("warning");
    });

    it("OVERRIDDEN: “Overridden by ‹owner›”, beside Bypassed when both happened", () => {
        const p = version({
            reviewRoute: "OVERRIDDEN",
            override: { at: "2026-09-30T10:40:00Z", by: "Asha" },
        });
        expect(labels(p)).toEqual(["Overridden by Asha"]);
        expect(lines(p)).toContain(
            "Asha went live without approval. Publishing needs approval on this site, and an owner overrode it.",
        );

        const both = version({
            reviewRoute: "OVERRIDDEN",
            bypass: { at: "2026-09-30T10:40:00Z", by: "Asha" },
            override: { at: "2026-09-30T10:40:00Z", by: "Asha" },
        });
        expect(labels(both)).toEqual(["Bypassed", "Overridden by Asha"]);
    });

    it("NONE, or a route never recorded: no badge, no route line", () => {
        for (const reviewRoute of ["NONE", null]) {
            const p = version({ reviewRoute });
            expect(labels(p)).toEqual([]);
            expect(lines(p)).toEqual(["Published by Asha"]);
        }
    });

    it("marks the live one first", () => {
        expect(
            labels(version({ isCurrent: true, reviewRoute: "APPROVED" })),
        ).toEqual(["Live", "Approved"]);
    });

    it("says which test release a go-live came from, linked", () => {
        const p = version({
            testRelease: { id: "rel_1", number: 2, name: "Diwali menu" },
        });
        const copy = versionRowCopy(p);
        expect(copy.lines.map((l) => l.text)).toEqual([
            "Went live by Asha",
            "From test release 2 · Diwali menu",
        ]);
        expect(copy.lines[1].releaseId).toBe("rel_1");

        expect(
            lines(
                version({
                    testRelease: {
                        id: "rel_3",
                        number: 3,
                        name: "Test release 3",
                    },
                }),
            ),
        ).toContain("From test release 3");
    });

    it("reads an older API without the new fields as before", () => {
        const p = version();
        delete p.override;
        delete p.testRelease;
        expect(labels(p)).toEqual([]);
        expect(lines(p)).toEqual(["Published by Asha"]);
    });
});

describe("a frozen page's sections", () => {
    const page = {
        path: "/",
        title: "Home",
        isHome: true,
        sections: [
            { type: "hero", content: { heading: "Hi" } },
            { type: "retired", content: {} },
            { type: "richText", content: { value: "<p>x</p>" } },
        ],
    };

    it("keys each by its position on the frozen page (T8)", () => {
        expect(frozenSections(page, []).map((s) => s.key)).toEqual([
            "0",
            "1",
            "2",
        ]);
    });

    it("leaves out one it can't draw without moving the rest", () => {
        const sections = frozenSections(page, [
            { path: "/", index: 1, type: "retired" },
            { path: "/about", index: 0, type: "retired" },
        ]);
        expect(sections.map((s) => [s.key, s.type])).toEqual([
            ["0", "hero"],
            ["2", "richText"],
        ]);
    });
});

describe("restore while publishing needs approval (Q3)", () => {
    it("is open as before while the setting is off", () => {
        expect(restoreGate({})).toEqual({ kind: "go" });
        expect(
            restoreGate({ publishNeedsApproval: false, canOverride: true }),
        ).toEqual({ kind: "go" });
    });

    it("is an owner's override while it is on, and blocked with the reason for anyone else", () => {
        expect(
            restoreGate({ publishNeedsApproval: true, canOverride: true }),
        ).toEqual({ kind: "override" });
        expect(restoreGate({ publishNeedsApproval: true })).toEqual({
            kind: "blocked",
            why: RESTORE_NEEDS_OWNER,
        });
    });
});
