/**
 * `list_section_types` groups blocks by family (U3, KD5) and keeps the
 * flat list, so old type names still add as before.
 */
import { listSectionTypesTool } from "@saroh/api-contract";

import { sectionTypeListing } from "./section-types";

describe("list_section_types' catalogue", () => {
    const listing = sectionTypeListing();

    it("lists one entry per family, Visit us with its three layouts", () => {
        expect(listing.families).toHaveLength(17);
        const visit = listing.families.filter((f) => f.family === "Visit us");
        expect(visit).toHaveLength(1);
        expect(visit[0].layouts.map((l) => [l.type, l.label])).toEqual([
            ["visitUs", "Address and hours"],
            ["contact", "Talk to us"],
            ["hours", "Hours"],
        ]);
        const plans = listing.families.find((f) => f.family === "Plans");
        expect(plans?.layouts.map((l) => l.type)).toEqual(["plans", "packs"]);
        expect(listing.text).toContain("- Visit us:");
        expect(listing.text).toContain("hours (Hours;");
    });

    it("keeps every old type in the flat list, labelled by family", () => {
        const hours = listing.types.find((t) => t.type === "hours");
        expect(hours?.label).toBe("Visit us · Hours");
        expect(listing.types.map((t) => t.type)).toEqual(
            expect.arrayContaining(["contact", "hours", "packs"]),
        );
    });

    it("never offers Subscribe", () => {
        expect(listing.text.toLowerCase()).not.toContain("subscribe");
    });

    it("fits the tool's output contract", () => {
        const parsed = listSectionTypesTool.output.safeParse({
            types: listing.types,
            families: listing.families,
            schema: null,
            example: null,
        });
        expect(parsed.success).toBe(true);
    });
});
