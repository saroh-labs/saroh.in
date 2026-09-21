import { describe, expect, it } from "vitest";

import { initials } from "./block-feedback";

describe("a note author's initials", () => {
    it.each([
        ["Dalia Haddad", "DH"],
        ["Priya (reviewer)", "PR"],
        ["priya", "P"],
        ["Ananya R. Rao", "AR"],
        ["2nd shift", "NS"],
        ["???", "?"],
        ["", "?"],
    ])("%s → %s", (name, expected) => {
        expect(initials(name)).toBe(expected);
    });
});
