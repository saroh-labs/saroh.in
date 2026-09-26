// What a settings change may say about itself (#509): business details with
// their values, personal details by name only, and nothing else at all.
import type { FieldChange } from "./audit-changes";
import {
    NAME_ONLY_FIELDS,
    recordableChanges,
    VALUE_FIELDS,
} from "./audit-changes";

const change = (
    field: string,
    before: FieldChange["before"],
    after: FieldChange["after"],
): FieldChange => ({ field, before, after });

describe("recordableChanges", () => {
    it("keeps a business detail with its values", () => {
        expect(
            recordableChanges([change("invoicePrefix", "INV", "RC")]),
        ).toEqual([{ field: "invoicePrefix", before: "INV", after: "RC" }]);
    });

    it.each(NAME_ONLY_FIELDS)(
        "never carries a value for the personal field %s",
        (field) => {
            const kept = recordableChanges([
                change(field, "old@shop.in", "new@shop.in"),
            ]);
            expect(kept).toEqual([]);
            expect(JSON.stringify(kept)).not.toContain("@shop.in");
        },
    );

    it("keeps the personal and the valued lists apart", () => {
        const valued = new Set<string>(VALUE_FIELDS);
        for (const field of NAME_ONLY_FIELDS) {
            expect(valued.has(field)).toBe(false);
        }
    });

    it("drops a field on neither list, whatever it holds", () => {
        expect(
            recordableChanges([change("bankAccount", "1234", "5678")]),
        ).toEqual([]);
    });

    it("drops a field that did not change, blank and null being the same", () => {
        expect(
            recordableChanges([
                change("legalName", "Rye & Co", "Rye & Co"),
                change("type", "", null),
            ]),
        ).toEqual([]);
    });

    it("keeps values small and plain", () => {
        const [kept] = recordableChanges([
            change("legalName", null, `  ${"x".repeat(500)}  `),
            change("gstRegistered", false, true),
        ]);
        expect(typeof kept?.after).toBe("string");
        expect((kept?.after as string).length).toBeLessThanOrEqual(200);
        expect(
            recordableChanges([change("gstRegistered", false, true)]),
        ).toEqual([{ field: "gstRegistered", before: false, after: true }]);
    });
});
