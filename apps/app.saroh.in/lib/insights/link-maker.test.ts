/**
 * The link maker's rules (DEC-181, #1099): a label made from the name, the
 * label checks the API holds (shape, no record id, under seven digits, no
 * group word), the link as it is copied, and a link's figures with a small
 * count held back.
 */
import { describe, expect, it } from "vitest";

import type { SiteLinkRead } from "./link-maker";
import {
    labelProblem,
    linkFigures,
    linkLabelOf,
    linkUrl,
    NAME_HINT,
    nameProblem,
    typedLabel,
} from "./link-maker";

describe("a label from the name", () => {
    it("is lower case with hyphens, accents dropped", () => {
        expect(linkLabelOf("Diwali post!")).toBe("diwali-post");
        expect(linkLabelOf("  Café — Story ")).toBe("cafe-story");
        expect(linkLabelOf("")).toBe("");
    });

    it("is cut at a hyphen within 32", () => {
        expect(
            linkLabelOf("The big October festival offer for the bakery"),
        ).toBe("the-big-october-festival-offer");
    });

    it("is typed as a label: lower case, spaces as hyphens", () => {
        expect(typedLabel("Diwali Post")).toBe("diwali-post");
    });
});

describe("the label checks, as the API holds them", () => {
    it("keeps a label", () => {
        expect(labelProblem("diwali-post")).toBeNull();
        expect(labelProblem("sale-2026-10")).toBeNull();
    });

    it("refuses a phone number, a record's id, a group's word and a bad shape", () => {
        for (const label of [
            "asha-98765-43210",
            "call-9876543210",
            "cmh2k9x0a0001qz8l3v5d7f9b",
            "has space",
            "-start",
            "x".repeat(33),
        ]) {
            expect([label, labelProblem(label)]).toEqual([
                label,
                "Use lower-case letters, numbers and hyphens, up to 32, and no more than 6 numbers.",
            ]);
        }
        expect(labelProblem("instagram")).toBe(
            "That word already means a place a visit comes from. Choose another label.",
        );
        expect(labelProblem("  ")).toBe("Give the link a label.");
    });

    it("asks for a name, and says the hint under it", () => {
        expect(nameProblem("")).toBe("Name the link.");
        expect(nameProblem("x".repeat(81))).toBe(
            "Keep the name to 80 characters.",
        );
        expect(nameProblem("Diwali post")).toBeNull();
        expect(NAME_HINT).toBe("Name the post, not the person.");
    });
});

describe("the link as it is copied", () => {
    it("is the site's real address with the label", () => {
        expect(linkUrl("https://shop.rye.in", "diwali-post")).toBe(
            "https://shop.rye.in/?ref=diwali-post",
        );
        expect(linkUrl("https://rye.saroh.app/", "bio")).toBe(
            "https://rye.saroh.app/?ref=bio",
        );
        expect(linkUrl(null, "bio")).toBeNull();
    });
});

describe("a link's figures", () => {
    const link: SiteLinkRead = {
        id: "l1",
        siteId: "s1",
        name: "Diwali post",
        label: "diwali-post",
        createdAt: "2026-10-20T10:00:00.000Z",
        visits: 1240,
        paid: 9,
        few: false,
    };

    it("says visits and paid", () => {
        expect(linkFigures(link, 3)).toBe("1,240 visits · 9 paid");
        expect(linkFigures({ ...link, visits: 1, paid: 0 }, 1)).toBe(
            "1 visit · 0 paid",
        );
    });

    it("holds back a small count", () => {
        expect(
            linkFigures({ ...link, visits: null, paid: null, few: true }, 3),
        ).toBe("Fewer than 3 visits");
    });
});
