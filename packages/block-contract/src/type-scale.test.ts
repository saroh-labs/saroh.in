import { describe, expect, it } from "vitest";

import {
    parseTypeScale,
    sameTypeScale,
    typeScaleVariables,
} from "./type-scale";

describe("parseTypeScale", () => {
    it("accepts a design's scale, to half a pixel", () => {
        const result = parseTypeScale({
            displaySize: 44,
            bodySize: 18.5,
            measure: 64,
            labelStyle: "eyebrow",
        });
        expect(result).toEqual({
            ok: true,
            type: {
                displaySize: 44,
                bodySize: 18.5,
                measure: 64,
                labelStyle: "eyebrow",
            },
        });
        const rounded = parseTypeScale({ bodySize: 17.3 });
        expect(rounded.ok && rounded.type.bodySize).toBe(17.5);
    });

    it("stores plain as nothing, so plain and unset are one look", () => {
        expect(parseTypeScale({ labelStyle: "plain" })).toEqual({
            ok: true,
            type: {},
        });
    });

    it("refuses each value outside its bounds, on the field, rather than clamping", () => {
        const result = parseTypeScale({
            displaySize: 120,
            bodySize: 12,
            measure: "64ch",
            labelStyle: "shouty",
            lineHeight: 2,
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems.map((p) => p.field).sort()).toEqual([
            "type.bodySize",
            "type.displaySize",
            "type.labelStyle",
            "type.lineHeight",
            "type.measure",
        ]);
    });
});

describe("typeScaleVariables", () => {
    it("sets only what the scale sets, so the blocks' fallbacks hold", () => {
        expect(typeScaleVariables(undefined)).toEqual({});
        expect(typeScaleVariables({})).toEqual({});
        expect(
            typeScaleVariables({
                displaySize: 44,
                bodySize: 18.5,
                measure: 64,
                labelStyle: "eyebrowAccent",
            }),
        ).toEqual({
            "--site-display-size": "44px",
            "--site-body-size": "18.5px",
            "--site-measure": "64ch",
            "--site-label-style": "eyebrowAccent",
        });
    });
});

describe("sameTypeScale", () => {
    it("treats absent and empty as the same, and any difference as not", () => {
        expect(sameTypeScale(undefined, {})).toBe(true);
        expect(sameTypeScale({ measure: 64 }, { measure: 64 })).toBe(true);
        expect(sameTypeScale({ measure: 64 }, { measure: 66 })).toBe(false);
    });
});
