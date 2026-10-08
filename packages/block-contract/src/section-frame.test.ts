import { describe, expect, it } from "vitest";

import { parseSectionContent } from "./section-contract";
import {
    anchorFromLabel,
    anchorProblem,
    IN_PAGE_NAV_MAX,
    inPageNavigation,
    mergeInPageNavigation,
    parseSectionFrame,
    repeatedAnchor,
    sectionFrameOf,
    withoutShadowedInPageEntries,
} from "./section-frame";

const text = (extra: Record<string, unknown>) => ({
    format: "html",
    value: "<p>Hello</p>",
    ...extra,
});

describe("parseSectionContent keeps a section's frame", () => {
    it("carries anchor, menu label and band through any block's schema", () => {
        const result = parseSectionContent(
            "richText",
            1,
            text({ anchor: "visit", navLabel: "Visit", band: "inverse" }),
        );
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data).toMatchObject({
            anchor: "visit",
            navLabel: "Visit",
            band: "inverse",
        });
    });

    it("adds nothing to a section that sets none of it", () => {
        const result = parseSectionContent("richText", 1, text({}));
        expect(result.success && Object.keys(result.data as object)).toEqual(
            expect.not.arrayContaining(["anchor", "navLabel", "band"]),
        );
    });

    it("stores band none as no band", () => {
        const result = parseSectionContent("faq", 1, {
            items: [{ question: "Q", answer: "A" }],
            band: "none",
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).not.toHaveProperty("band");
        }
    });

    it("refuses a bad anchor on its field", () => {
        const result = parseSectionContent(
            "richText",
            1,
            text({ anchor: "Visit Us" }),
        );
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.code).toBe("INVALID_CONTENT");
        expect(
            result.error.code === "INVALID_CONTENT" &&
                result.error.issues[0].path,
        ).toEqual(["anchor"]);
    });
});

describe("parseSectionFrame", () => {
    it("trims, and treats blank as absent", () => {
        expect(
            parseSectionFrame({ anchor: " visit ", navLabel: "  " }),
        ).toEqual({ ok: true, frame: { anchor: "visit" } });
    });

    it("refuses a menu label with no anchor to jump to", () => {
        const result = parseSectionFrame({ navLabel: "Visit" });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.issues[0].path).toEqual(["navLabel"]);
    });

    it("refuses an unknown band and a long label", () => {
        const result = parseSectionFrame({
            anchor: "a",
            navLabel: "x".repeat(31),
            band: "neon",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.issues.map((i) => i.path[0]).sort()).toEqual([
                "band",
                "navLabel",
            ]);
        }
    });
});

describe("anchorProblem", () => {
    it("accepts lower-case words joined by dashes", () => {
        for (const ok of ["visit", "todays-bread", "a1", "first-visit-2"]) {
            expect(anchorProblem(ok)).toBeNull();
        }
    });

    it("refuses other shapes and the site's own ids", () => {
        for (const bad of [
            "Visit",
            "1st",
            "two--dashes",
            "trailing-",
            "has space",
            "#visit",
            "x".repeat(41),
            "enquiry",
            "main",
            "site-header",
        ]) {
            expect(anchorProblem(bad)).not.toBeNull();
        }
    });
});

describe("sectionFrameOf", () => {
    it("drops anything that would not pass, never throws", () => {
        expect(
            sectionFrameOf({
                anchor: '"><script>',
                navLabel: 3,
                band: "neon",
            }),
        ).toEqual({});
        expect(sectionFrameOf(null)).toEqual({});
        expect(
            sectionFrameOf({
                anchor: "visit",
                navLabel: "Visit",
                band: "accent",
            }),
        ).toEqual({ anchor: "visit", navLabel: "Visit", band: "accent" });
    });
});

describe("repeatedAnchor", () => {
    it("points at the first section that repeats an anchor", () => {
        expect(
            repeatedAnchor([
                { content: { anchor: "visit" } },
                { content: { anchor: "bread" } },
                { content: {} },
                { content: { anchor: "visit" } },
            ]),
        ).toEqual({ index: 3, anchor: "visit" });
        expect(
            repeatedAnchor([
                { content: { anchor: "a" } },
                { content: { anchor: "b" } },
            ]),
        ).toBeNull();
    });
});

describe("inPageNavigation", () => {
    it("lists labelled, anchored sections in page order, as /#anchor", () => {
        expect(
            inPageNavigation([
                { content: { anchor: "today", navLabel: "Today's bread" } },
                { content: { anchor: "story" } },
                { content: { navLabel: "No anchor" } },
                { content: { anchor: "visit", navLabel: "Visit" } },
            ]),
        ).toEqual([
            { label: "Today's bread", href: "/#today" },
            { label: "Visit", href: "/#visit" },
        ]);
    });

    it(`stops at ${IN_PAGE_NAV_MAX}`, () => {
        const many = Array.from({ length: 12 }, (_, i) => ({
            content: { anchor: `s${i}`, navLabel: `S${i}` },
        }));
        expect(inPageNavigation(many)).toHaveLength(IN_PAGE_NAV_MAX);
    });
});

describe("mergeInPageNavigation", () => {
    const inPage = [
        { label: "First visit", href: "/#first-visit" },
        { label: "Timetable", href: "/#timetable" },
        { label: " membership ", href: "/#membership" },
        { label: "Trainers", href: "/#trainers" },
    ];
    const pages = [
        { label: "Timetable", href: "/timetable" },
        { label: "Trainers", href: "/trainers" },
        { label: "Membership", href: "/membership" },
    ];

    it("keeps the page entry where a section has the same label, in order", () => {
        expect(mergeInPageNavigation(inPage, pages)).toEqual([
            { label: "First visit", href: "/#first-visit" },
            ...pages,
        ]);
    });

    it("keeps every entry when no labels repeat", () => {
        const about = [{ label: "About", href: "/about" }];
        expect(mergeInPageNavigation(inPage, about)).toEqual([
            ...inPage,
            ...about,
        ]);
    });

    it("lets only an always-shown page take a section's place when asked", () => {
        const book = [{ label: "Book", href: "/book", kind: "BOOK" }];
        const section = [{ label: "Book", href: "/#book" }];
        expect(
            mergeInPageNavigation(section, book, { shadowsOnlyAlways: true }),
        ).toEqual([...section, ...book]);
        expect(mergeInPageNavigation(section, book)).toEqual(book);
    });

    it("still drops a page entry that is a section's own address", () => {
        expect(
            mergeInPageNavigation(
                [{ label: "Visit", href: "/#visit" }],
                [{ label: "Find us", href: "/#visit" }],
            ),
        ).toEqual([{ label: "Visit", href: "/#visit" }]);
    });
});

describe("withoutShadowedInPageEntries", () => {
    it("drops a section entry a page entry in the menu names", () => {
        expect(
            withoutShadowedInPageEntries([
                { label: "Book", href: "/#book" },
                { label: "Visit", href: "/#visit" },
                { label: "book", href: "/book", kind: "BOOK" },
            ]),
        ).toEqual([
            { label: "Visit", href: "/#visit" },
            { label: "book", href: "/book", kind: "BOOK" },
        ]);
    });
});

describe("anchorFromLabel", () => {
    it("makes a link name from a label", () => {
        expect(anchorFromLabel("Today's bread")).toBe("todays-bread");
        expect(anchorFromLabel("  First   visit! ")).toBe("first-visit");
        expect(anchorFromLabel("24 hours")).toBe("section-24-hours");
        expect(anchorFromLabel("Café")).toBe("cafe");
        expect(anchorFromLabel("!!!")).toBe("");
    });
});
