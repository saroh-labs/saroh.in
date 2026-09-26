import { describe, expect, it } from "vitest";

import {
    descriptionFootnote,
    descriptionNote,
    detailsCopy,
    markupCount,
    maySection,
    noAccessLine,
    readCount,
    readOnlyBanner,
    roleName,
    sectionJumps,
    sectionNames,
} from "./editor-labels";

describe("roleName", () => {
    it("uses the business's own label for a role it invented", () => {
        expect(roleName({ role: "MEMBER", roleLabel: "Packer" })).toBe(
            "Packer",
        );
    });

    it("names a built-in role", () => {
        expect(roleName({ role: "REVIEWER" })).toBe("Reviewer");
        expect(roleName({ role: "MEMBER", roleLabel: " " })).toBe("Member");
    });
});

describe("readOnlyBanner", () => {
    it("tells a reader who can change their role", () => {
        expect(readOnlyBanner("Member", false)).toBe(
            "You're viewing as Member. You can read this product but not change it — an owner or admin can change your role in Team.",
        );
    });

    it("tells a stock-only role the one section it can change", () => {
        expect(readOnlyBanner("Packer", true)).toMatch(
            /^You're viewing as Packer\. .* Only the Stock section below can be changed\.$/,
        );
    });
});

describe("noAccessLine", () => {
    it("says who they are, where, and who can change it", () => {
        expect(noAccessLine("Reviewer", "Northwind Supply")).toBe(
            "You're signed in as Reviewer in Northwind Supply. That role doesn't include seeing products. An owner or admin can give you access in Team.",
        );
    });
});

describe("maySection", () => {
    it("lets a stock-only role change Stock and nothing else", () => {
        const stockOnly = { canWrite: false, canStock: true };
        expect(maySection("stock", stockOnly)).toBe(true);
        expect(maySection("basics", stockOnly)).toBe(false);
        expect(maySection("variants", stockOnly)).toBe(false);
    });

    it("lets a writer change everything, and a reader nothing", () => {
        expect(maySection("basics", { canWrite: true, canStock: true })).toBe(
            true,
        );
        expect(maySection("stock", { canWrite: false, canStock: false })).toBe(
            false,
        );
    });
});

describe("details by business type", () => {
    it("reads as the ready line and allergens for a food business", () => {
        const food = detailsCopy(true);
        expect(food.title).toBe("Ready time and allergens");
        expect(food.how.label).toBe("When it is ready");
        expect(sectionNames(true).details).toBe("Ready time and allergens");
        expect(sectionJumps(true).details).toBe("Ready and allergens");
    });

    it("reads as how to use and ingredients for anything else", () => {
        expect(detailsCopy(false).title).toBe("How to use and ingredients");
        expect(sectionNames(false).details).toBe("How to use and ingredients");
        expect(sectionJumps(false).details).toBe("How to use");
    });
});

describe("the description's footer", () => {
    it("counts what customers read and what the limit counts", () => {
        expect(readCount(1)).toBe("1 character");
        expect(readCount(1240)).toBe("1,240 characters");
        expect(markupCount(1240)).toBe("1,240 of 5,000 characters");
    });

    it("says why the toolbar is short, and what counts when over", () => {
        expect(descriptionFootnote(false)).toBe(
            "The shop keeps only this formatting, so it's all the toolbar offers.",
        );
        expect(descriptionFootnote(true)).toBe(
            "Over the limit. Formatting counts towards it too.",
        );
        expect(descriptionNote(true)).toBe(
            "Longer than the 5,000 characters a description can be.",
        );
    });
});
