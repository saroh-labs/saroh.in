import { describe, expect, it } from "vitest";

import { callName } from "./call-name";

describe("callName (a service card's With line)", () => {
    it("is the first name", () => {
        expect(callName("Karan Mehta")).toBe("Karan");
        expect(callName("Ritu")).toBe("Ritu");
    });

    it("keeps a title with the surname, never the title alone", () => {
        expect(callName("Dr. Arun Pillai")).toBe("Dr. Pillai");
        expect(callName("Dr Meenakshi Rao")).toBe("Dr Rao");
        expect(callName("Prof. Anita Desai")).toBe("Prof. Desai");
    });

    it("a lone word that looks like a title is still the name", () => {
        expect(callName("Dr.")).toBe("Dr.");
        expect(callName("  ")).toBe("");
    });
});
