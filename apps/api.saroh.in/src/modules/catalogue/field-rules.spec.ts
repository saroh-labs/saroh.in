import { checkFieldValue, fieldNameProblem } from "./field-rules";

describe("custom field rules", () => {
    it("clears on empty, for every type", () => {
        for (const type of ["TEXT", "NUMBER", "DATE", "YES_NO"] as const) {
            expect(checkFieldValue(type, "X", "  ")).toEqual({
                ok: true,
                value: null,
            });
        }
    });

    it("keeps a number a number", () => {
        expect(checkFieldValue("NUMBER", "Shelf life", "12")).toEqual({
            ok: true,
            value: "12",
        });
        expect(checkFieldValue("NUMBER", "Shelf life", "12 months")).toEqual({
            ok: false,
            error: "Shelf life is a number.",
        });
    });

    it("refuses a date that is not a calendar day", () => {
        expect(checkFieldValue("DATE", "Best before", "2026-09-24").ok).toBe(
            true,
        );
        expect(checkFieldValue("DATE", "Best before", "tomorrow-ish")).toEqual({
            ok: false,
            error: "Best before is a date, like 2026-09-24.",
        });
        expect(checkFieldValue("DATE", "Best before", "2026-02-30").ok).toBe(
            false,
        );
    });

    it("stores yes / no as true or false", () => {
        expect(checkFieldValue("YES_NO", "Vegan", "true")).toEqual({
            ok: true,
            value: "true",
        });
        expect(checkFieldValue("YES_NO", "Vegan", "yes").ok).toBe(false);
    });

    it("refuses a duplicate name ignoring case", () => {
        expect(fieldNameProblem("skin type", ["Skin type"])).toBe(
            "There is already a field called skin type.",
        );
        expect(fieldNameProblem("", [])).toBe("A field needs a name.");
        expect(fieldNameProblem("Fabric care", ["Skin type"])).toBe("");
    });
});
