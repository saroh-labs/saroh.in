import { describe, expect, it } from "vitest";

import { helpArticles, helpFiles, parseHelpFile } from "@/lib/help-docs";

import type { HelpFrontmatter, HelpSummary } from "./help";
import {
    areasWithArticles,
    groupsWithArticles,
    HELP_PUBLISH_ON,
    helpDate,
    helpFrontmatter,
    liveArticles,
    namesPriceOrLimit,
    SEARCH_LIMIT,
    searchArticles,
    summarise,
} from "./help";
import { dayStartsAt } from "./resources";
import { CAPTURED } from "./shots.captured";
import { helpErrors } from "./validate";

const real = helpArticles();
const found = real.find((a) => a.slug === "add-your-first-product");
if (!found) throw new Error("add-your-first-product is missing");
const first = found;

const at = (iso: string) => ({
    now: new Date(iso),
    preview: false,
    routes: null,
});

/** The first article, alone: its Next links point at none of the others. */
function article(over: Partial<HelpFrontmatter> = {}): HelpFrontmatter {
    return { ...first, next: [], ...over };
}

describe("the real Help articles", () => {
    it("are sound: every step captured, no price, Next resolves", () => {
        expect(helpErrors({ articles: real, captured: CAPTURED })).toEqual([]);
    });

    it("Add your first product has its five captured screens, all live on 17 Oct", () => {
        expect(first.steps).toHaveLength(5);
        for (const step of first.steps) {
            expect(CAPTURED[step.shot].src).toMatch(/^\/shots\/help\//);
        }
        expect(first.publishOn).toBe(HELP_PUBLISH_ON);
        expect(first.area).toBe("Products");
        expect(first.group).toBe("Sell products");
    });

    it("say Updated with a real day no later than today", () => {
        for (const a of real) {
            expect(dayStartsAt(a.updated).getTime()).toBeLessThanOrEqual(
                Date.now(),
            );
        }
    });
});

describe("helpErrors catches", () => {
    const errs = (articles: HelpFrontmatter[]) =>
        helpErrors({ articles, captured: CAPTURED });

    it("a step with no screenshot", () => {
        const a = article({
            steps: [{ ...first.steps[0], shot: "help-nothing-1" }],
        });
        expect(errs([a])).toEqual([
            "help add-your-first-product: step 1 has no screenshot (help-nothing-1 is not captured)",
        ]);
    });

    it("a marker on a shot captured without a mark", () => {
        const captured = {
            "help-plain": { src: "/shots/help/help-plain.webp" },
        };
        const a = article({
            steps: [{ ...first.steps[0], shot: "help-plain", marker: "X" }],
        });
        expect(helpErrors({ articles: [a], captured })[0]).toMatch(
            /marks "X" but help-plain was captured without a mark/,
        );
    });

    it("a Next link to a missing, a later or the same article", () => {
        const later = article({
            slug: "later-one",
            publishOn: "2026-11-01",
        });
        expect(errs([article({ next: ["nowhere"] })])).toEqual([
            "help add-your-first-product: next nowhere is missing",
        ]);
        expect(errs([article({ next: ["later-one"] }), later])).toEqual([
            "help add-your-first-product: next later-one publishes 2026-11-01, after this one",
        ]);
        expect(errs([article({ next: ["add-your-first-product"] })])).toEqual([
            "help add-your-first-product: next links to itself",
        ]);
    });

    it("an unknown area or group", () => {
        const a = article({
            area: "Rockets" as HelpFrontmatter["area"],
            group: "Fly" as HelpFrontmatter["group"],
        });
        expect(errs([a])).toEqual([
            "help add-your-first-product: unknown area Rockets",
            "help add-your-first-product: unknown group Fly",
        ]);
    });

    it("a price or a plan limit in any text", () => {
        const a = article({
            steps: [
                {
                    ...first.steps[0],
                    tip: "Free plan: up to 5 products.",
                },
            ],
        });
        expect(errs([a])).toEqual([
            'help add-your-first-product: names a price or limit ("up to 5")',
        ]);
        expect(errs([article({ intro: "Costs ₹10." })])).toHaveLength(1);
    });

    it("two articles with one slug", () => {
        expect(errs([article(), article()])).toEqual([
            "help add-your-first-product: two articles",
        ]);
    });
});

describe("namesPriceOrLimit", () => {
    it.each([
        ["₹480", "₹"],
        ["Rs. 200", "Rs. 2"],
        ["Free plan: up to 5 products", "up to 5"],
        ["The Grow plan has it", "Grow plan"],
        ["50 orders a month", "50 orders a month"],
        ["₹10/month", "₹"],
    ])("finds %s", (text, found) => {
        expect(namesPriceOrLimit(text)).toBe(found);
    });

    it.each([
        "Give it a name and a price.",
        "Leave a price blank and it uses the product's price.",
        "Set up a monthly plan",
        "two sizes with their own SKU and price",
    ])("lets %s through", (text) => {
        expect(namesPriceOrLimit(text)).toBeNull();
    });
});

describe("an article file", () => {
    const source = (fm: string) => `---\n${fm}\n---\n`;
    const good = [
        "title: T",
        "slug: a-thing",
        "area: Products",
        "group: Sell products",
        "intro: I",
        "description: D",
        "readMinutes: 1",
        "updated: '2026-10-06'",
        "steps:",
        "    - { title: S, body: B, shot: help-add-product-1, caption: C }",
    ];

    it("reads, with publishOn defaulting to Help's day", () => {
        const { frontmatter } = parseHelpFile(
            "content/help/a-thing.mdx",
            source(good.join("\n")),
        );
        expect(frontmatter.publishOn).toBe(HELP_PUBLISH_ON);
        expect(frontmatter.next).toEqual([]);
    });

    it("fails without frontmatter, with the wrong slug, or a field wrong", () => {
        expect(() => parseHelpFile("content/help/x.mdx", "# hi")).toThrow(
            "no frontmatter",
        );
        expect(() =>
            parseHelpFile("content/help/other.mdx", source(good.join("\n"))),
        ).toThrow("slug says a-thing");
        expect(() =>
            parseHelpFile(
                "content/help/a-thing.mdx",
                source(
                    good
                        .map((l) => (l.startsWith("group") ? "group: Fly" : l))
                        .join("\n"),
                ),
            ),
        ).toThrow(/group/);
    });

    it("needs a screenshot key on every step", () => {
        const parsed = helpFrontmatter.safeParse({
            ...first,
            steps: [{ title: "S", body: "B", caption: "C" }],
        });
        expect(parsed.success).toBe(false);
    });

    it("the real folder loads as a set", () => {
        expect(helpFiles().map((f) => f.frontmatter.slug)).toContain(
            "add-your-first-product",
        );
    });
});

const sum = (over: Partial<HelpSummary>): HelpSummary => ({
    slug: "s",
    title: "T",
    area: "Products",
    group: "Sell products",
    order: 100,
    publishOn: "2026-10-17",
    ...over,
});

describe("publish by date", () => {
    const list = [
        sum({ slug: "now", publishOn: "2026-10-17" }),
        sum({ slug: "later", publishOn: "2026-10-20" }),
    ];

    it("hides an article until midnight in India on its day", () => {
        expect(liveArticles(list, at("2026-10-16T18:29:59Z"))).toEqual([]);
        expect(
            liveArticles(list, at("2026-10-16T18:30:00Z")).map((a) => a.slug),
        ).toEqual(["now"]);
    });

    it("shows them all on a preview", () => {
        expect(
            liveArticles(list, {
                ...at("2026-10-01T00:00:00Z"),
                preview: true,
            }),
        ).toHaveLength(2);
    });

    it("hides the real article before 17 Oct", () => {
        expect(
            liveArticles(real.map(summarise), at("2026-10-16T12:00:00Z")),
        ).toEqual([]);
    });
});

describe("groups and areas", () => {
    it("draw only those with articles, in the design's order", () => {
        const list = [
            sum({ slug: "b", group: "Get paid", area: "Payments" }),
            sum({ slug: "a", group: "Get set up", area: "Getting started" }),
        ];
        expect(groupsWithArticles(list).map((g) => g.group)).toEqual([
            "Get set up",
            "Get paid",
        ]);
        expect(areasWithArticles(list).map((g) => g.area)).toEqual([
            "Getting started",
            "Payments",
        ]);
        expect(groupsWithArticles([])).toEqual([]);
    });

    it("order articles by `order`, then title", () => {
        const list = [
            sum({ slug: "z", title: "Zed", order: 5 }),
            sum({ slug: "b", title: "Bee" }),
            sum({ slug: "a", title: "Ant" }),
        ];
        expect(groupsWithArticles(list)[0].articles.map((a) => a.slug)).toEqual(
            ["z", "a", "b"],
        );
    });
});

describe("search", () => {
    const list = [
        sum({ slug: "p", title: "Add your first product", area: "Products" }),
        sum({
            slug: "r",
            title: "Connect Razorpay",
            area: "Payments",
            group: "Get paid",
        }),
        sum({
            slug: "d",
            title: "Take a deposit when they book",
            area: "Bookings",
            group: "Take bookings",
        }),
    ];

    it("finds by the start of each word, in title, area or group", () => {
        expect(searchArticles("add prod", list).map((a) => a.slug)).toEqual([
            "p",
        ]);
        expect(searchArticles("payments", list).map((a) => a.slug)).toEqual([
            "r",
        ]);
        expect(searchArticles("get paid", list).map((a) => a.slug)).toEqual([
            "r",
        ]);
        expect(searchArticles("DEPOSIT", list).map((a) => a.slug)).toEqual([
            "d",
        ]);
    });

    it("puts title matches first", () => {
        const more = [
            ...list,
            sum({ slug: "b", title: "Book every visit", area: "Products" }),
        ];
        // "products" is the title word of p only; b matches by area.
        expect(searchArticles("product", more).map((a) => a.slug)).toEqual([
            "p",
            "b",
        ]);
    });

    it("finds nothing for nothing typed or no match, and at most six", () => {
        expect(searchArticles("  ", list)).toEqual([]);
        expect(searchArticles("rocket", list)).toEqual([]);
        const many = Array.from({ length: 10 }, (_, i) =>
            sum({ slug: `p${i}`, title: `Product ${i}` }),
        );
        expect(searchArticles("product", many)).toHaveLength(SEARCH_LIMIT);
    });
});

describe("helpDate", () => {
    it("says the day as the article does", () => {
        expect(helpDate("2026-10-06")).toBe("6 Oct 2026");
    });
});
