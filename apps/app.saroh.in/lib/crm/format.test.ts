import { describe, expect, it } from "vitest";

import { contactEmail, contactName, isRemovedContact } from "./format";

describe("contactName", () => {
    it("is the full name, else the email", () => {
        expect(
            contactName({
                firstName: "Asha",
                lastName: "Rao",
                email: "asha@example.in",
            }),
        ).toBe("Asha Rao");
        expect(
            contactName({
                firstName: null,
                lastName: null,
                email: "asha@example.in",
            }),
        ).toBe("asha@example.in");
    });

    it("reads “Removed customer” once their details were removed (C11)", () => {
        expect(
            contactName({
                firstName: null,
                lastName: null,
                email: "removed+c1@removed.invalid",
            }),
        ).toBe("Removed customer");
        expect(
            contactName({
                firstName: null,
                lastName: null,
                email: "x@example.in",
                removedAt: "2026-09-28T00:00:00Z",
            }),
        ).toBe("Removed customer");
    });

    it("never shows a placeholder email as a name", () => {
        expect(
            contactName({
                firstName: null,
                lastName: null,
                email: "account+c1@account.invalid",
            }),
        ).toBe("No name");
    });
});

describe("contactEmail", () => {
    it("hides the reserved placeholders", () => {
        expect(contactEmail("removed+c1@removed.invalid")).toBeNull();
        expect(contactEmail("merged+c1@Removed.Invalid")).toBeNull();
        expect(contactEmail("account+c1@account.invalid")).toBeNull();
        expect(contactEmail("phone+c1@phone.invalid")).toBeNull();
        expect(contactEmail("asha@example.in")).toBe("asha@example.in");
        expect(contactEmail(null)).toBeNull();
    });
});

describe("isRemovedContact", () => {
    it("reads the stamp or the removal placeholder, not a merge's", () => {
        expect(isRemovedContact({ email: "removed+c1@removed.invalid" })).toBe(
            true,
        );
        expect(isRemovedContact({ email: "merged+c1@removed.invalid" })).toBe(
            false,
        );
        expect(isRemovedContact({ email: "asha@example.in" })).toBe(false);
    });
});
