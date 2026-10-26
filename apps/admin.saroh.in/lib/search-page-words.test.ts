import type { SearchPageEntry } from "@saroh/search-pages";
import { describe, expect, it } from "vitest";

import type { PageRow, SearchPageRecord } from "./search-page-words";
import {
    countBy,
    dialogWords,
    eligible,
    historyWords,
    inFilter,
    matchesQuery,
    mergePages,
    refusalWords,
    rowActions,
    stateNote,
    stateOf,
    successWords,
} from "./search-page-words";

const entry = (slug: string, family = "Beauty"): SearchPageEntry => ({
    path: `/for/${slug}`,
    slug,
    kind: "for",
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    family: family as SearchPageEntry["family"],
    familySlug: "x",
    search: `${slug} software`,
    title: "t",
    description: "d",
    updated: "2026-10-26",
});

const record = (
    slug: string,
    status: SearchPageRecord["status"],
    changedAt = "2026-10-25T10:00:00.000Z",
): SearchPageRecord => ({
    path: `/for/${slug}`,
    status,
    liveSince: status === "LIVE" ? changedAt : null,
    changedAt,
    changedBy: { name: "Mohit" },
});

const idle = { running: false };

describe("mergePages (DEC-193)", () => {
    it("keeps the manifest's order, a page with no record is a draft, a record for a page gone from the code is left out", () => {
        const rows = mergePages([entry("salons"), entry("spas")], {
            pages: [record("spas", "LIVE"), record("gone", "LIVE")],
            rebuild: idle,
        });
        expect(rows.map((r) => [r.slug, r.state])).toEqual([
            ["salons", "draft"],
            ["spas", "live"],
        ]);
        expect(stateNote(rows[0])).toBe("Never published");
        expect(stateNote(rows[1])).toMatch(/^Live since 25 Oct/);
    });

    it("works for any number of pages", () => {
        const many = Array.from({ length: 40 }, (_, i) => entry(`p${i}`));
        const rows = mergePages(many, { pages: [], rebuild: idle });
        expect(rows).toHaveLength(40);
        expect(countBy(rows).draft).toBe(40);
    });
});

describe("stateOf", () => {
    const rebuild = { running: true, startedAt: "2026-10-26T09:00:00.000Z" };
    it("says Publishing… and Coming off… for a change in the rebuild under way", () => {
        expect(
            stateOf(record("a", "LIVE", "2026-10-26T08:59:30.000Z"), rebuild),
        ).toBe("publishing");
        expect(
            stateOf(
                record("a", "UNPUBLISHED", "2026-10-26T09:01:00.000Z"),
                rebuild,
            ),
        ).toBe("unpublishing");
    });
    it("keeps the saved status for an older change, or when nothing rebuilds", () => {
        expect(
            stateOf(record("a", "LIVE", "2026-10-20T09:00:00.000Z"), rebuild),
        ).toBe("live");
        expect(
            stateOf(record("a", "LIVE", "2026-10-26T09:01:00.000Z"), idle),
        ).toBe("live");
        expect(
            stateOf(
                record("a", "ARCHIVED", "2026-10-26T09:01:00.000Z"),
                rebuild,
            ),
        ).toBe("archived");
        expect(stateOf(record("a", "DRAFT"), idle)).toBe("draft");
    });
});

describe("filters and counts", () => {
    const rows = mergePages(
        ["a", "b", "c", "d", "e"].map((s) => entry(s)),
        {
            pages: [
                record("a", "LIVE"),
                record("b", "UNPUBLISHED"),
                record("c", "ARCHIVED"),
                record("d", "DRAFT"),
            ],
            rebuild: idle,
        },
    );
    it("counts All without the archive, and each status", () => {
        expect(countBy(rows)).toEqual({
            all: 4,
            live: 1,
            draft: 2,
            unpublished: 1,
            archived: 1,
        });
        expect(inFilter("publishing", "draft")).toBe(true);
        expect(inFilter("unpublishing", "live")).toBe(true);
    });
    it("searches the name and the search phrase", () => {
        expect(
            rows.filter((r) => matchesQuery(r, "B SOFT")).map((r) => r.slug),
        ).toEqual(["b"]);
        expect(rows.filter((r) => matchesQuery(r, "")).length).toBe(5);
    });
    it("offers only what the API allows from each state", () => {
        expect(eligible("publish", rows).map((r) => r.slug)).toEqual([
            "b",
            "d",
            "e",
        ]);
        expect(eligible("unpublish", rows).map((r) => r.slug)).toEqual(["a"]);
        expect(eligible("restore", rows).map((r) => r.slug)).toEqual(["c"]);
        expect(eligible("archive", rows).map((r) => r.slug)).toEqual([
            "a",
            "b",
            "d",
            "e",
        ]);
        expect(rowActions("live", "saroh.in").map((a) => a.label)).toEqual([
            "Unpublish",
            "Archive",
        ]);
        expect(rowActions("draft", "saroh.in")[0]?.label).toBe(
            "Publish on saroh.in",
        );
        expect(rowActions("publishing", "saroh.in")).toEqual([
            { action: null, label: "Wait for the rebuild" },
        ]);
    });
});

describe("dialog words", () => {
    const page = (
        slug: string,
        state: PageRow["state"],
        family = "Health",
    ) => ({
        name: slug,
        slug,
        family,
        state,
    });
    it("asks one page's publish with the tick", () => {
        const w = dialogWords(
            "publish",
            [page("Physio", "draft")],
            "saroh.in",
            "saroh.io",
        );
        expect(w.title).toBe("Publish Physio on saroh.in?");
        expect(w.confirm).toBe("Publish page");
        expect(w.tick).toBe("I've read this page on saroh.io");
        expect(w.points[0]).toBe(
            "saroh.in rebuilds with this page. It takes a few minutes.",
        );
    });
    it("says when checks need the operator", () => {
        const w = dialogWords(
            "publish",
            [page("Physio", "draft")],
            "saroh.in",
            "saroh.io",
            2,
        );
        expect(w.points[2]).toBe(
            '2 checks need you: see "Checked before you publish".',
        );
    });
    it("counts several pages", () => {
        const w = dialogWords(
            "publish",
            [page("a", "draft"), page("b", "unpublished")],
            "saroh.in",
            "saroh.io",
        );
        expect(w.title).toBe("Publish 2 pages on saroh.in?");
        expect(w.confirm).toBe("Publish 2 pages");
        expect(w.tick).toBe("I've read these pages on saroh.io");
    });
    it("names where an unpublished page's link goes", () => {
        expect(
            dialogWords(
                "unpublish",
                [page("physio", "live")],
                "saroh.in",
                "saroh.io",
            ).points[1],
        ).toBe(
            "Anyone opening the old link is sent to /for/clinics (or Home while that isn't live), not an error.",
        );
        expect(
            dialogWords(
                "unpublish",
                [page("clinics", "live")],
                "saroh.in",
                "saroh.io",
            ).points[1],
        ).toBe("Anyone opening the old link is sent to Home, not an error.");
    });
    it("says archiving a live page takes it off first, and is the destructive one", () => {
        const live = dialogWords(
            "archive",
            [page("a", "live"), page("b", "draft")],
            "saroh.in",
            "saroh.io",
        );
        expect(live.points[0]).toBe(
            "1 is live now. saroh.in rebuilds and takes it off first.",
        );
        expect(live.destructive).toBe(true);
        expect(live.tick).toBeNull();
        expect(
            dialogWords("archive", [page("b", "draft")], "saroh.in", "saroh.io")
                .points[0],
        ).toBe("Nothing changes on saroh.in. It isn't live.");
    });
});

describe("after the API answers", () => {
    it("names the refused pages in words", () => {
        expect(
            refusalWords(
                "publish",
                ["/for/spas"],
                [{ path: "/for/spas", name: "Spas" }],
            ),
        ).toBe(
            "Spas can't be published from where it is now. Someone may have just changed it. Nothing was changed: close this to see the list as it is.",
        );
    });
    it("says the site rebuilds, or that it can't from here", () => {
        expect(successWords("publish", 1, true, "saroh.io")).toEqual({
            title: "Publishing the page.",
            description: "saroh.io is rebuilding.",
        });
        expect(
            successWords("unpublish", 3, false, "saroh.io").description,
        ).toMatch(/can't rebuild from here/);
        expect(successWords("restore", 1, false, "saroh.io")).toEqual({
            title: "Restored the page as a draft.",
        });
    });
    it("says a history row in words", () => {
        const w = historyWords(
            {
                action: "publish",
                fromStatus: "DRAFT",
                toStatus: "LIVE",
                by: { name: "Mohit" },
                at: "2026-10-26T09:00:00.000Z",
            },
            "saroh.in",
        );
        expect(w.what).toBe("Published by Mohit");
        expect(w.detail).toBe("Was a draft, now live. Put on saroh.in.");
        expect(
            historyWords(
                {
                    action: "archive",
                    fromStatus: "LIVE",
                    toStatus: "ARCHIVED",
                    by: null,
                    at: "2026-10-26T09:00:00.000Z",
                },
                "saroh.in",
            ).what,
        ).toBe("Archived by a former staff member");
    });
});
