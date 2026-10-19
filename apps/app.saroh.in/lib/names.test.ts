import { describe, expect, it } from "vitest";

import { avatarInitials } from "@saroh/ui/avatar";

import { firstName, initials, TITLES, withoutTitle } from "./names";

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

describe("withoutTitle", () => {
    it("drops the titles in front of a name, and keeps a lone title", () => {
        expect(withoutTitle("Dr. Arun Pillai")).toBe("Arun Pillai");
        expect(withoutTitle("Meera Iyer")).toBe("Meera Iyer");
        expect(withoutTitle("Dr.")).toBe("Dr.");
        expect(withoutTitle(null)).toBe("");
    });
});

describe("initials", () => {
    it("is the avatar's rule, past any title", () => {
        expect(initials("Dr. Arun Kumar Pillai")).toBe("AP");
        expect(initials("Dr. Arun Kumar Pillai")).toBe(
            avatarInitials("Dr. Arun Kumar Pillai"),
        );
        expect(initials("Kabir Singh")).toBe("KS");
        expect(initials("Zara")).toBe("ZA");
    });
    it("is ? for no name", () => {
        expect(initials("")).toBe("?");
        expect(initials("   ")).toBe("?");
        expect(initials(null)).toBe("?");
    });
    it("uses the one title list", () => {
        expect(TITLES.has("dr")).toBe(true);
        expect(TITLES.has("smt")).toBe(true);
    });
});
