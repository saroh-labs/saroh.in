import { describe, expect, it } from "vitest";

import type { Variant } from "./service";
import type { VariantRow } from "./variant-rows";
import {
    isLegacy,
    legacyNote,
    rowsFrom,
    sameRows,
    variantProblem,
} from "./variant-rows";

const SIZE = {
    values: [
        { id: "ov_s", value: "S", variantCount: 0 },
        { id: "ov_m", value: "M", variantCount: 0 },
    ],
};

function v(id: string, title: string, extra: Partial<Variant> = {}): Variant {
    return {
        id,
        productId: "p1",
        sku: `SKU-${id}`,
        title,
        price: null,
        image: null,
        ...extra,
    };
}

function problems(rows: VariantRow[]) {
    const values = SIZE.values;
    return rows.map((r) =>
        variantProblem(r, rows, {
            opt: "size",
            title: (x) =>
                values.find((o) => o.id === x.valueId)?.value ?? x.legacyTitle,
            overMrp: () => "",
        }),
    );
}

describe("rowsFrom", () => {
    it("matches a title to its option value", () => {
        const [row] = rowsFrom([v("a", "M")], SIZE);
        expect(row.valueId).toBe("ov_m");
        expect(row.legacyTitle).toBe("");
    });

    it("keeps an older variant's own title and where it is sold", () => {
        const [row] = rowsFrom([v("a", "500mm")], SIZE, { a: ["st_1"] });
        expect(row.valueId).toBe("");
        expect(row.legacyTitle).toBe("500mm");
        expect(row.stores).toEqual(["st_1"]);
        expect(isLegacy(row)).toBe(true);
    });
});

describe("variantProblem", () => {
    it("lets a legacy variant keep its label until a size is picked (#525)", () => {
        // Northwind's Stretch Film Hand Dispenser: "500mm", no option value.
        expect(problems(rowsFrom([v("a", "500mm")], SIZE))).toEqual([""]);
        expect(legacyNote("500mm", "size")).toBe(
            "Kept as “500mm” until you pick a size.",
        );
    });

    it("still asks a new row for a size", () => {
        const row: VariantRow = {
            key: "new-1",
            valueId: "",
            legacyTitle: "",
            sku: "X",
            price: "",
            mrp: null,
            image: null,
            imageId: "",
            stores: [],
        };
        expect(problems([row])).toEqual(["Pick a size."]);
    });

    it("says two variants share a value, legacy or not", () => {
        expect(problems(rowsFrom([v("a", "M"), v("b", "M")], SIZE))).toEqual([
            "Two variants are both M.",
            "Two variants are both M.",
        ]);
        expect(
            problems(rowsFrom([v("a", "500mm"), v("b", "500mm")], SIZE)),
        ).toEqual([
            "Two variants are both 500mm.",
            "Two variants are both 500mm.",
        ]);
    });

    it("says a SKU is taken, and a price is not money", () => {
        const rows = rowsFrom(
            [v("a", "S", { sku: "X" }), v("b", "M", { sku: "x" })],
            SIZE,
        );
        expect(problems(rows)[1]).toBe("Another variant already has this SKU.");
        const priced = rowsFrom([v("a", "S")], SIZE).map((r) => ({
            ...r,
            price: "5.499",
        }));
        expect(problems(priced)[0]).toMatch(/^Price: a number/);
    });
});

describe("sameRows", () => {
    it("sees where a variant is sold as a change", () => {
        const a = rowsFrom([v("a", "S")], SIZE, { a: ["st_1", "st_2"] });
        const b = a.map((r) => ({ ...r, stores: ["st_1"] }));
        expect(sameRows(a, b)).toBe(false);
        expect(
            sameRows(
                a,
                a.map((r) => ({ ...r, stores: ["st_2", "st_1"] })),
            ),
        ).toBe(true);
    });
});
