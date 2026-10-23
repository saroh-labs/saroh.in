import { describe, expect, it } from "vitest";

import { avatarInitials } from "./avatar";

describe("avatarInitials", () => {
    it("takes the first and last name, past a title", () => {
        expect(avatarInitials("Meera Iyer")).toBe("MI");
        expect(avatarInitials("Dr. Arun Pillai")).toBe("AP");
        expect(avatarInitials("Dr Meenakshi Rao")).toBe("MR");
        expect(avatarInitials("Priya (reviewer)")).toBe("PR");
    });
    it("keeps a lone title, one word, or the email", () => {
        expect(avatarInitials("Dr.")).toBe("DR");
        expect(avatarInitials("Asha")).toBe("AS");
        expect(avatarInitials("", "zara@example.com")).toBe("Z");
    });
});
