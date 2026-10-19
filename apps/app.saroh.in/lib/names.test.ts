import { describe, expect, it } from "vitest";

import { firstName } from "./names";

describe("firstName", () => {
    it("is what someone is called by, past any title", () => {
        expect(firstName("Meera Iyer")).toBe("Meera");
        expect(firstName("Dr. Priya Kavi")).toBe("Priya");
        expect(firstName("dr meenakshi rao")).toBe("meenakshi");
        expect(firstName("Smt. Lakshmi Devi")).toBe("Lakshmi");
    });
    it("keeps an email whole, a lone title, and nothing as nothing", () => {
        expect(firstName("asha@example.com")).toBe("asha@example.com");
        expect(firstName("Dr.")).toBe("Dr.");
        expect(firstName("  ")).toBe("");
        expect(firstName(null)).toBe("");
    });
});
