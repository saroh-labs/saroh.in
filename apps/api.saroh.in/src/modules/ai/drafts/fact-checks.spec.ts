jest.mock("@saroh/database", () => ({ prisma: {} }));

import type { ReadContext } from "./draft-targets";
import { DRAFT_SPECS } from "./draft-targets";
import { basedOnFor, checksFor, factsIn, unconfirmed } from "./fact-checks";

/**
 * Check this (RULES §5, U43): the facts in a section's new words, which of
 * them the business never gave, and Confirm's rule that each is confirmed.
 * `givenFacts` reads Services, Discounts and hours; here the given keys are
 * stated directly.
 */
describe("Check this", () => {
    it("finds prices, offers, times, free, phone numbers and claims", () => {
        const keys = factsIn(
            "Get 20% off, free delivery over ₹1,500. Order by 2pm or call +91 98450 12345. 20 years in Peenya.",
        ).map((f) => f.key);
        expect(keys).toEqual(
            expect.arrayContaining([
                "money:1500",
                "percent:20",
                "free",
                "time:840",
                "phone:9845012345",
                "claim:20 year",
            ]),
        );
        expect(factsIn("Packaging that arrives in one piece")).toEqual([]);
    });

    it("marks only the facts the business never gave, by field", () => {
        const given = {
            keys: new Set(
                factsIn("Order by 2pm and it goes out the same day.").map(
                    (f) => f.key,
                ),
            ),
        };
        given.keys.add("money:180");
        const checks = checksFor(
            [
                { field: "heading", new: "Order by 2 pm, from ₹180" },
                { field: "subheading", new: "Now 20% off every carton" },
            ],
            given,
        );
        expect(checks.map((c) => [c.field, c.words])).toEqual([
            ["subheading", "20% off"],
        ]);
        expect(checks[0].why).toContain("Discounts");
    });

    it("Confirm leaves nothing open only when every check is confirmed", () => {
        const checks = checksFor(
            [{ field: "heading", new: "20% off, free delivery" }],
            { keys: new Set() },
        );
        expect(checks).toHaveLength(2);
        expect(unconfirmed(checks)).toHaveLength(2);
        expect(unconfirmed(checks, [checks[0].id])).toEqual([checks[1]]);
        expect(
            unconfirmed(
                checks,
                checks.map((c) => c.id),
            ),
        ).toEqual([]);
        // An id the card never had confirms nothing.
        expect(unconfirmed(checks, ["heading:percent:99"])).toHaveLength(2);
    });
});

/** "Based on" names only what the new words used (editor audit, 21 Nov). */
describe("basedOnFor", () => {
    const given = {
        keys: new Set(["money:180", "time:600"]),
        from: new Map([["money:180", "your Services"]]),
    };

    it("names no Services for words typed out", () => {
        expect(
            basedOnFor(
                [{ field: "heading", new: "Packaging made easy" }],
                given,
            ),
        ).toBe("What you asked and this section's words now");
    });

    it("names Services when a price came from them", () => {
        expect(
            basedOnFor([{ field: "heading", new: "Fitting from ₹180" }], given),
        ).toBe("What you asked, this section's words now and your Services");
    });
});

/**
 * Review 07 B-L1: a "free" planted in another section of the page made
 * "All boxes free this week" given. Only the edited section's words count.
 */
describe("Check this reads only the edited section", () => {
    const section = (key: string, words: Record<string, string>) => ({
        section_key: key,
        type: "hero",
        content: { text: JSON.stringify(words) },
    });
    const reader = {
        ctx: {},
        read: async () => ({
            title: { text: "Home" },
            sections: [
                section("hero", { heading: "Boxes, 20 years in Peenya" }),
                section("planted", {
                    body: "Everything FREE today - 100% guaranteed refund",
                }),
            ],
        }),
    } as unknown as ReadContext;
    const input = { site_id: "s", page_id: "p" };
    const checks = async (section_key: string, words: string) => {
        const text = await DRAFT_SPECS.edit_section.pageText!(reader, {
            ...input,
            section_key,
        });
        return checksFor([{ field: "subheading", new: words }], {
            keys: new Set(factsIn(text).map((f) => f.key)),
        }).map((c) => c.words.toLowerCase());
    };

    it("flags a claim said only in another section", async () => {
        expect(await checks("hero", "All boxes free this week")).toEqual([
            "free",
        ]);
    });

    it("doesn't flag what the edited section already says", async () => {
        expect(await checks("hero", "20 years of boxes")).toEqual([]);
        expect(await checks("planted", "Still free this week")).toEqual([]);
    });
});
