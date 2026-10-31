import type { ForPageEntry, ToolPageEntry } from "@saroh/search-pages";
import { describe, expect, it } from "vitest";

import type { DocEntry, PageRow, SearchPageRecord } from "./search-page-words";
import {
    badgeOf,
    countBy,
    deployedWords,
    deployWords,
    dialogWords,
    eligible,
    historyWords,
    inFilter,
    kindOf,
    KINDS,
    linkedFromWords,
    matchesQuery,
    mergePages,
    publishLinks,
    rebuildWords,
    refusalWords,
    rowActions,
    siteOf,
    stateNote,
    stateOf,
    successWords,
    whereItShows,
} from "./search-page-words";

const entry = (slug: string, family = "Beauty"): ForPageEntry => ({
    path: `/for/${slug}`,
    slug,
    kind: "for",
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    family: family as ForPageEntry["family"],
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
    releasedStatus: SearchPageRecord["status"] = status,
): SearchPageRecord => ({
    path: `/for/${slug}`,
    status,
    releasedStatus,
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

describe("staged and released (R13)", () => {
    it("is the staged status, and waits for Deploy changes where the site differs", () => {
        expect(stateOf(record("a", "LIVE"))).toBe("live");
        expect(stateOf(record("a", "ARCHIVED"))).toBe("archived");
        expect(stateOf(null)).toBe("draft");
        expect(siteOf(record("a", "LIVE", undefined, "DRAFT"))).toEqual({
            onSite: false,
            pending: "on",
        });
        expect(siteOf(record("a", "ARCHIVED", undefined, "LIVE"))).toEqual({
            onSite: true,
            pending: "off",
        });
        expect(siteOf(record("a", "LIVE"))).toEqual({
            onSite: true,
            pending: null,
        });
        expect(siteOf(null)).toEqual({ onSite: false, pending: null });
    });

    it("labels a row that waits, and says when it changes", () => {
        const [on, off, settled] = mergePages(
            [entry("a"), entry("b"), entry("c")],
            {
                pages: [
                    record("a", "LIVE", undefined, "DRAFT"),
                    record("b", "UNPUBLISHED", undefined, "LIVE"),
                    record("c", "LIVE"),
                ],
                rebuild: idle,
            },
        );
        expect(badgeOf(on)).toEqual({
            label: "Published · not deployed yet",
            variant: "warning",
        });
        expect(badgeOf(off).label).toBe("Taken off · not deployed yet");
        expect(badgeOf(settled)).toEqual({ label: "Live", variant: "success" });
        expect(stateNote(on)).toBe("Goes live when changes are deployed");
        expect(stateNote(off)).toBe("Stays live until changes are deployed");
        // The chips go by the site: waiting to go on is not live yet.
        expect(inFilter(on, "draft")).toBe(true);
        expect(inFilter(on, "live")).toBe(false);
        expect(inFilter(off, "live")).toBe(true);
        // Waiting pages can be changed again before the deploy.
        expect(eligible("unpublish", [on])).toEqual([on]);
        expect(eligible("publish", [off])).toEqual([off]);
    });

    it("counts the deploy bar's changes and words its confirm", () => {
        const w = deployWords(
            [{ pending: "on" }, { pending: "on" }, { pending: "off" }],
            "saroh.in",
        );
        expect(w.title).toBe("3 changes waiting to deploy");
        expect(w.dialogTitle).toBe("Deploy 3 changes to saroh.in?");
        expect(w.points).toEqual([
            "saroh.in rebuilds once with every change below. It takes a few minutes.",
            "2 pages go live, into the sitemap and the lists.",
            "1 page comes off. Old links send people to the page above them, not an error.",
        ]);
        expect(deployWords([{ pending: "on" }], "saroh.in").title).toBe(
            "1 change waiting to deploy",
        );
        expect(deployWords([], "saroh.in").title).toBe(
            "No changes waiting to deploy",
        );
        expect(deployedWords(30, true, "saroh.in")).toEqual({
            title: "Deploying 30 changes.",
            description: "saroh.in is rebuilding.",
        });
        expect(deployedWords(1, false, "saroh.in").description).toMatch(
            /can't rebuild from here/,
        );
    });

    it("says how many pages the rebuild carries, when the API knows", () => {
        expect(
            rebuildWords({ running: true, paths: ["/for/a", "/for/b"] }),
        ).toBe("2 pages change in it.");
        expect(rebuildWords({ running: true })).toBe("");
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
        expect(rowActions("archived", "saroh.in")).toEqual([
            { action: "restore", label: "Restore" },
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
        onSite: state === "live",
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
            "Nothing changes on saroh.in yet. It goes live when changes are deployed, with every other change waiting.",
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
            "1 is live now. It comes off saroh.in when changes are deployed.",
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
    it("says a change waits for Deploy changes", () => {
        expect(successWords("publish", 1, "saroh.io")).toEqual({
            title: "Published the page.",
            description: "Deploy changes to put it on saroh.io.",
        });
        expect(successWords("unpublish", 3, "saroh.io").description).toBe(
            "Deploy changes to take them off saroh.io.",
        );
        expect(successWords("restore", 1, "saroh.io")).toEqual({
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
        expect(w.detail).toBe("Was a draft, now live.");
        const deployed = historyWords(
            {
                action: "deploy",
                fromStatus: "DRAFT",
                toStatus: "LIVE",
                by: { name: "Mohit" },
                at: "2026-10-26T09:00:00.000Z",
            },
            "saroh.in",
        );
        expect(deployed.what).toBe("Deployed by Mohit");
        expect(deployed.detail).toBe("Was a draft, now live. Put on saroh.in.");
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

describe("free tools (#1253)", () => {
    const tool = (slug: string, inApp = false): ToolPageEntry => ({
        path: `/tools/${slug}`,
        slug,
        kind: "tools",
        name: slug,
        group: "Money",
        line: "l",
        inApp,
        search: slug,
        title: "t",
        description: "d",
        updated: "2026-10-26",
    });

    it("merges tools with their records, the section as the family", () => {
        const [row, app] = mergePages(
            [tool("no-show-cost-calculator"), tool("qr-code-maker", true)],
            {
                pages: [
                    {
                        path: "/tools/qr-code-maker",
                        status: "LIVE",
                        releasedStatus: "LIVE",
                        liveSince: "2026-10-16T18:30:00Z",
                        changedAt: "2026-10-26T10:00:00Z",
                        changedBy: null,
                    },
                ],
                rebuild: idle,
            },
        );
        expect(row).toMatchObject({
            kind: "tools",
            family: "Money",
            inApp: false,
            state: "draft",
        });
        expect(app).toMatchObject({ inApp: true, state: "live" });
    });

    it("reads the kind from the address, trade pages by default", () => {
        expect(kindOf("tools")).toBe("tools");
        expect(kindOf(undefined)).toBe("for");
        expect(kindOf("guides")).toBe("guides");
        expect(kindOf("blog")).toBe("for");
    });

    it("chooses between every kind, the new groups with no pages yet (plan 2026-10-31-002)", () => {
        expect(KINDS.map((k) => [k.kind, k.label, k.path])).toEqual([
            ["for", "Trade pages", "/for/"],
            ["tools", "Free tools", "/tools/"],
            ["gst", "GST guides", "/gst/"],
            ["guides", "Guides", "/guides/"],
            ["downloads", "Free downloads", "/downloads/"],
        ]);
        expect(kindOf("gst")).toBe("gst");
        expect(kindOf("downloads")).toBe("downloads");
        // The API may hold a record for a new group's page the code lacks.
        const rows = mergePages([entry("salons")], {
            pages: [
                {
                    ...record("salons", "LIVE"),
                    path: "/gst/composition-scheme",
                },
            ],
            rebuild: idle,
        });
        expect(rows.filter((r) => r.kind === "gst")).toEqual([]);
        expect(rows).toHaveLength(1);
    });

    it("says where a live page of a new group shows", () => {
        expect(
            whereItShows(
                { onSite: true, pending: null },
                "saroh.in",
                "gst",
            ).map((w) => w.label),
        ).toContain("The /gst list, the menu and the footer");
        const on = dialogWords(
            "publish",
            [
                {
                    name: "Composition scheme",
                    slug: "composition-scheme",
                    family: "",
                    state: "draft",
                    kind: "gst",
                },
            ],
            "saroh.in",
            "saroh.io",
        );
        expect(on.points.join(" ")).toContain("the /gst list");
    });

    it("says a tool taken off goes to /tools, and where a live one shows", () => {
        const page = {
            name: "No-show cost calculator",
            slug: "no-show-cost-calculator",
            family: "Money",
            state: "live" as const,
            kind: "tools" as const,
        };
        const off = dialogWords("unpublish", [page], "saroh.in", "saroh.io");
        expect(off.points.join(" ")).toContain("sent to /tools");
        expect(off.points.join(" ")).not.toContain("/for/");
        const on = dialogWords(
            "publish",
            [{ ...page, state: "draft" }],
            "saroh.in",
            "saroh.io",
        );
        expect(on.points.join(" ")).toContain("the /tools list");
        expect(
            whereItShows(
                { onSite: true, pending: null },
                "saroh.in",
                "tools",
            ).map((w) => w.label),
        ).toContain("The /tools list, the menu and the footer");
    });

    it("words the seeded record of the app's two tools", () => {
        expect(
            historyWords(
                {
                    action: "seeded",
                    fromStatus: "DRAFT",
                    toStatus: "LIVE",
                    by: null,
                    at: "2026-10-26T10:00:00Z",
                },
                "saroh.in",
            ).what,
        ).toBe("Live before publish control");
    });
});

describe("links (U12)", () => {
    const doc = (
        slug: string,
        required: string[],
        optional: string[] = [],
    ): DocEntry => ({
        kind: "downloads",
        path: `/downloads/${slug}`,
        slug,
        name: slug,
        search: `${slug} search`,
        updated: "2026-10-26",
        group: "Bills",
        blocked: [],
        links: { required, optional },
    });
    const rows = mergePages(
        [
            doc("receipt", ["/downloads/invoice"]),
            doc(
                "invoice",
                ["/for/salons", "/for/typo"],
                ["/for/not-written-yet"],
            ),
            entry("salons"),
            entry("spas"),
        ],
        { pages: [], rebuild: idle },
    );
    const at = (path: string): PageRow => {
        const r = rows.find((x) => x.path === path);
        if (!r) throw new Error(`no ${path}`);
        return r;
    };

    it("keeps a page's required links, and names a required link to no page in the code as dead", () => {
        expect(at("/downloads/receipt").links).toEqual(["/downloads/invoice"]);
        expect(at("/downloads/invoice").deadLinks).toEqual(["/for/typo"]);
        expect(at("/for/spas").links).toEqual([]);
    });

    it("adds what the added pages link to, as well", () => {
        const { add, blocking } = publishLinks(
            [at("/downloads/receipt")],
            rows,
        );
        expect(add.map((r) => r.path)).toEqual([
            "/downloads/invoice",
            "/for/salons",
        ]);
        expect(blocking).toEqual([
            { path: "/for/typo", row: null, from: ["invoice"] },
        ]);
    });

    it("a page published with what it links to needs nothing more", () => {
        const ok = mergePages(
            [doc("receipt", ["/downloads/invoice"]), doc("invoice", [])],
            { pages: [], rebuild: idle },
        );
        expect(publishLinks(ok, ok)).toEqual({ add: [], blocking: [] });
    });

    it("unpublishing a GST page names the live pages that link to it, and where their links go", () => {
        const live = mergePages(
            [
                {
                    ...doc("guide-a", ["/gst/x"]),
                    kind: "guides",
                    path: "/guides/a",
                },
                {
                    ...doc("guide-b", ["/gst/x"]),
                    kind: "guides",
                    path: "/guides/b",
                },
                {
                    ...doc("guide-c", ["/gst/x"]),
                    kind: "guides",
                    path: "/guides/c",
                },
                { ...doc("x", []), kind: "gst", path: "/gst/x" },
            ],
            {
                pages: ["/guides/a", "/guides/b", "/guides/c", "/gst/x"].map(
                    (path) => ({ ...record("x", "LIVE"), path }),
                ),
                rebuild: idle,
            },
        );
        expect(
            linkedFromWords(
                live.filter((r) => r.kind === "gst"),
                live,
            ),
        ).toBe(
            "3 live pages link here (guide-a, guide-b, guide-c); their links will go to the GST guides list until you publish it again.",
        );
    });
});
