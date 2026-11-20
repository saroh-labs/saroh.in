import { describe, expect, it } from "vitest";

import { needsDoingItems } from "@/components/sites/overview/overview-words";
import { pendingChangeCount } from "@/lib/sites/pending";
import type { ChangeUnit, SiteOverview, SitePage } from "@/lib/sites/service";

import type { PageFacts } from "./pages-filter";
import {
    cleared,
    filterPages,
    narrowed,
    pageStatus,
    pagesCount,
    readPagesQuery,
    writePagesQuery,
} from "./pages-filter";

const fact = (over: Partial<PageFacts>): PageFacts => ({
    inMenu: true,
    hidden: false,
    needsFix: false,
    status: "live",
    editedBy: null,
    editedAt: null,
    title: "X",
    path: "/x",
    ...over,
});
// In menu order.
const facts = [
    fact({ title: "Home", path: "/", editedAt: "2026-11-10" }),
    fact({
        title: "Bridal",
        path: "/bridal",
        needsFix: true,
        status: "waiting",
        editedBy: "Ritika",
        editedAt: "2026-11-18",
    }),
    fact({ title: "Shop", path: "/shop", status: "new" }),
    fact({
        title: "Diwali offers",
        path: "/diwali",
        inMenu: false,
        hidden: true,
        needsFix: true,
        editedBy: "Mohit",
        editedAt: "2026-11-15",
    }),
];
const q = (s = "") => readPagesQuery(new URLSearchParams(s));
const titles = (s: string) => filterPages(facts, q(s)).map((f) => f.title);

describe("Pages' filters", () => {
    it("shows every page in menu order with nothing chosen", () => {
        expect(titles("")).toEqual(["Home", "Bridal", "Shop", "Diwali offers"]);
    });
    it("In the menu", () => {
        expect(titles("menu=in")).toEqual(["Home", "Bridal", "Shop"]);
        expect(titles("menu=out")).toEqual(["Diwali offers"]);
    });
    it("Who can see it", () => {
        expect(titles("who=public")).toEqual(["Home", "Bridal", "Shop"]);
        expect(titles("who=hidden")).toEqual(["Diwali offers"]);
    });
    it("Status", () => {
        expect(titles("status=live")).toEqual(["Home", "Diwali offers"]);
        expect(titles("status=waiting")).toEqual(["Bridal"]);
        expect(titles("status=new")).toEqual(["Shop"]);
    });
    it("Needs fixing, Edited by and the search", () => {
        expect(titles("view=fix")).toEqual(["Bridal", "Diwali offers"]);
        expect(titles("by=Mohit")).toEqual(["Diwali offers"]);
        expect(titles("q=DIW")).toEqual(["Diwali offers"]);
        expect(titles("q=/shop")).toEqual(["Shop"]);
        expect(titles("view=fix&menu=in")).toEqual(["Bridal"]);
    });
    it("a stray value reads as no filter", () => {
        expect(q("menu=nope&status=x&sort=y")).toEqual(q(""));
    });
});

describe("Pages' sort", () => {
    it("Last edited: newest first, never-edited last in menu order", () => {
        expect(titles("sort=edited")).toEqual([
            "Bridal",
            "Diwali offers",
            "Home",
            "Shop",
        ]);
    });
    it("Name A to Z", () => {
        expect(titles("sort=name")).toEqual([
            "Bridal",
            "Diwali offers",
            "Home",
            "Shop",
        ]);
    });
});

describe("Pages' address", () => {
    it("round-trips every filter and keeps the open page", () => {
        const query = {
            fix: true,
            menu: "out",
            who: "hidden",
            status: "waiting",
            by: "Ritika Sharma",
            sort: "name",
            q: "bridal",
        } as const;
        const params = writePagesQuery(new URLSearchParams("page=p2"), query);
        expect(params.get("page")).toBe("p2");
        expect(params.get("view")).toBe("fix");
        expect(readPagesQuery(params)).toEqual(query);
    });
    it("leaves defaults out of the address, and Clear filters keeps the sort", () => {
        const query = { ...q("view=fix&menu=in&q=x"), sort: "name" as const };
        expect(narrowed(query)).toBe(true);
        expect(narrowed(cleared(query))).toBe(false);
        expect(
            writePagesQuery(new URLSearchParams(), cleared(query)).toString(),
        ).toBe("sort=name");
    });
    it("counts as the list does", () => {
        expect(pagesCount(11, 11)).toBe("11 pages");
        expect(pagesCount(1, 1)).toBe("1 page");
        expect(pagesCount(5, 11)).toBe("5 of 11");
    });
});

describe("the counts match Overview and the status chip", () => {
    const page = (id: string): SitePage => ({
        id,
        path: `/${id}`,
        title: id,
        isHome: false,
        hidden: false,
        kind: "FREE",
        inMenu: true,
    });
    const unit = (over: Partial<ChangeUnit>): ChangeUnit => ({
        key: "k",
        kind: "section",
        change: "changed",
        label: "",
        where: "",
        pageId: null,
        fingerprint: "",
        editedBy: null,
        editedAt: null,
        requires: [],
        approval: { state: "not-needed", voided: false, approvers: [] },
        ...over,
    });
    const units = [
        unit({ key: "section:a:1", pageId: "a" }),
        unit({ key: "section:a:2", pageId: "a" }),
        unit({ key: "page:b", kind: "page", change: "changed", pageId: "b" }),
        unit({ key: "page:c", kind: "page", change: "added", pageId: "c" }),
        unit({ key: "section:c:1", change: "added", pageId: "c" }),
        unit({ key: "site:menu", kind: "site", pageId: null }),
    ];

    it("Changes waiting and Not live yet are the chip's own units, by page", () => {
        const pages = ["a", "b", "c", "d"].map(page);
        const status = pages.map((p) => pageStatus(p, units, true));
        expect(status).toEqual(["waiting", "waiting", "new", "live"]);
        // Every page-scoped unit the chip counts falls on a page the
        // filter shows as Changes waiting or Not live yet.
        const chip = pendingChangeCount(null, null, units.length);
        const onPages = units.filter((u) => u.pageId !== null);
        const site = units.filter((u) => u.pageId === null);
        expect(onPages.length + site.length).toBe(chip);
        for (const u of onPages) {
            expect(status[pages.findIndex((p) => p.id === u.pageId)]).not.toBe(
                "live",
            );
        }
    });

    it("every page is Not live yet before the first publish", () => {
        expect(pageStatus(page("d"), [], false)).toBe("new");
    });

    it("Needs fixing counts the pages Overview's What needs doing names", () => {
        const health: SiteOverview["needsDoing"] = [
            { pageId: "a", title: "A", path: "/a", issues: ["googleText"] },
            {
                pageId: "b",
                title: "B",
                path: "/b",
                issues: ["googleText", "shareImage"],
            },
            { pageId: "c", title: "C", path: "/c", issues: [] },
        ];
        const fixFacts = ["a", "b", "c", "d"].map((id) =>
            fact({
                title: id,
                needsFix:
                    (health.find((h) => h.pageId === id)?.issues.length ?? 0) >
                    0,
            }),
        );
        const named = new Set(
            needsDoingItems(health).flatMap((item) =>
                health
                    .filter((h) => h.issues.includes(item.issue))
                    .map((h) => h.pageId),
            ),
        );
        expect(
            filterPages(fixFacts, q("view=fix")).map((f) => f.title),
        ).toEqual(Array.from(named).sort());
    });
});
