import {
    freeLinkLabel,
    GROUP_WORDS,
    linkLabelOf,
    linkLabelProblem,
} from "./site-links";
import { siteLinkView } from "./site-links.service";

describe("site links: a label from a name (DEC-181)", () => {
    it("lower-cases, drops accents and joins the words with hyphens", () => {
        expect(linkLabelOf("Diwali post!")).toBe("diwali-post");
        expect(linkLabelOf("  Café — Story  ")).toBe("cafe-story");
        expect(linkLabelOf("Sale 2026")).toBe("sale-2026");
        expect(linkLabelOf("!!!")).toBe("");
    });

    it("cuts a long name at a hyphen, within 32", () => {
        const label = linkLabelOf(
            "The big October festival offer for the bakery",
        );
        expect(label.length).toBeLessThanOrEqual(32);
        expect(label).toBe("the-big-october-festival-offer");
        expect(label.endsWith("-")).toBe(false);
    });

    it("passes the label checks, or says why not", () => {
        expect(linkLabelProblem("diwali-post")).toBeNull();
        expect(linkLabelProblem("")).toBe("empty");
        expect(linkLabelProblem("Diwali")).toBe("shape");
        expect(linkLabelProblem("has space")).toBe("shape");
        // A phone number, a record's id: never a label.
        expect(linkLabelProblem("asha-98765-43210")).toBe("shape");
        expect(linkLabelProblem("cmh2k9x0a0001qz8l3v5d7f9b")).toBe("shape");
        expect(linkLabelProblem("x".repeat(33))).toBe("shape");
        // A word the site reads as a group.
        for (const word of GROUP_WORDS) {
            expect(linkLabelProblem(word)).toBe("group-word");
        }
    });

    it("finds the next free label on the site", () => {
        expect(freeLinkLabel("story", new Set())).toBe("story");
        expect(freeLinkLabel("story", new Set(["story"]))).toBe("story-2");
        expect(
            freeLinkLabel("story", new Set(["story", "story-2", "story-3"])),
        ).toBe("story-4");
        const long = "x".repeat(32);
        const free = freeLinkLabel(long, new Set([long]));
        expect(free).toBe(`${"x".repeat(30)}-2`);
    });
});

describe("site links: what the list shows", () => {
    const row = {
        id: "l1",
        siteId: "s1",
        name: "Diwali post",
        label: "diwali-post",
        createdAt: new Date("2026-10-20T10:00:00Z"),
    };

    it("says the visits and paid from three visits", () => {
        expect(siteLinkView(row, { visits: 12, paid: 2 })).toMatchObject({
            visits: 12,
            paid: 2,
            few: false,
        });
    });

    it("holds back fewer than three visits, as the sources table folds them", () => {
        expect(siteLinkView(row, { visits: 2, paid: 1 })).toMatchObject({
            visits: null,
            paid: null,
            few: true,
        });
        expect(siteLinkView(row, undefined)).toMatchObject({
            visits: null,
            paid: null,
            few: true,
        });
    });
});
