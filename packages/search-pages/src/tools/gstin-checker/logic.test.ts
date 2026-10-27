import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    checkGstin,
    checkList,
    GST_STATES,
    gstinCheckChar,
    listCsv,
} from "./logic";

// The sample GSTIN (DEC-194): made up, and its check character is right.
const SAMPLE = "29AAAAA0000A1ZY";

describe("checkGstin", () => {
    it("passes the sample, fixing spaces and lower case", () => {
        const c = checkGstin(" 29aaaaa0000a1zy ");
        expect(c?.ok).toBe(true);
        expect(c?.verdict).toBe("The format is right");
        expect(c?.rows.map((r) => [r.label, r.value])).toEqual([
            ["Length", "15 characters"],
            ["State code", "29 · Karnataka"],
            ["PAN", "AAAAA0000A"],
            ["PAN type", "A · association of persons"],
            ["Registration in the state", "1st"],
            ["14th character", "Z"],
            ["Check digit", "Y matches"],
        ]);
        expect(gstinCheckChar(SAMPLE.slice(0, 14))).toBe("Y");
    });

    it("works the check character out as the GST network does", () => {
        // A real-shaped pair from the boards: ...1Z5 is one character off.
        expect(gstinCheckChar("27AAAAA0000A1Z")).toBe("2");
        expect(gstinCheckChar("07AAAAA0000A1Z")).toBe("4");
    });

    it("says which character to fix", () => {
        const c = checkGstin("29AAAAA0000A1Z5");
        expect(c?.verdict).toBe("One character looks mistyped");
        expect(c?.rows.at(-1)?.value).toBe("5, should be Y");
    });

    it("counts a short one", () => {
        const c = checkGstin("29AAAAA0000A1Z");
        expect(c?.verdict).toBe("Not a full GSTIN yet");
        expect(c?.error).toBe("A GSTIN has 15 characters. This one has 14.");
        expect(c?.rows.map((r) => r.value)).toEqual([
            "14 of 15",
            "29 · Karnataka",
        ]);
    });

    it("says only the state code when only that is wrong", () => {
        const c = checkGstin("39AAAAA0000A1ZY");
        expect(c?.verdict).toBe("Not a GST state code");
        expect(c?.rows.map((r) => r.value)).toEqual(["39 isn't one"]);
    });

    it("checks the PAN part and the 14th character", () => {
        expect(checkGstin("291AAAA0000A1ZY")?.line).toBe(
            "The PAN part isn't right",
        );
        expect(checkGstin("29AAAAA0000A1XY")?.line).toBe(
            "14th character should be Z",
        );
    });

    it("checks a list, one a line, and writes the spreadsheet", () => {
        const list = checkList(`${SAMPLE}\n27AAAAA0000A1Z5\n\n07AAAAA0000A1Z`);
        expect(list.map((c) => c.line)).toEqual([
            "Format right · Karnataka",
            "Check digit should be 2",
            "14 characters, not 15",
        ]);
        expect(listCsv(list).split("\n")[1]).toBe(
            `${SAMPLE},Yes,"Format right · Karnataka"`,
        );
    });
});

describe("GST_STATES", () => {
    it("is the same list as accounts.saroh.in's", () => {
        const src = readFileSync(
            join(
                __dirname,
                "../../../../../apps/accounts.saroh.in/lib/gst-states.ts",
            ),
            "utf8",
        );
        const theirs = [
            ...src.matchAll(/\{ value: "(\d\d)", label: "([^"]+)" \}/g),
        ].map((m) => ({ value: m[1], label: m[2] }));
        expect(theirs.length).toBeGreaterThan(30);
        expect(GST_STATES.map((s) => ({ ...s }))).toEqual(theirs);
    });
});
