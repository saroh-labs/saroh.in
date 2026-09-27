import {
    contactEmailForDisplay,
    isReservedContactEmail,
    reservedAccountEmail,
    reservedMergedEmail,
    reservedRemovedEmail,
} from "./contact-email";

const ID = "ckcontact0001";

describe("contact-email placeholders", () => {
    it("builds each reserved shape from the contact's id", () => {
        expect(reservedAccountEmail(ID)).toBe(
            "account+ckcontact0001@account.invalid",
        );
        expect(reservedMergedEmail(ID)).toBe(
            "merged+ckcontact0001@removed.invalid",
        );
        expect(reservedRemovedEmail(ID)).toBe(
            "removed+ckcontact0001@removed.invalid",
        );
    });

    it("gives two contacts two different placeholders, so the unique email holds", () => {
        expect(reservedAccountEmail("a")).not.toBe(reservedAccountEmail("b"));
        expect(reservedRemovedEmail("a")).not.toBe(reservedMergedEmail("a"));
    });

    describe("isReservedContactEmail", () => {
        it.each([
            reservedAccountEmail(ID),
            reservedMergedEmail(ID),
            reservedRemovedEmail(ID),
        ])("is true for %s", (email) => {
            expect(isReservedContactEmail(email)).toBe(true);
        });

        it("recognises the domain whatever the case or surrounding space", () => {
            expect(isReservedContactEmail("ACCOUNT+X@Account.INVALID ")).toBe(
                true,
            );
            expect(isReservedContactEmail("anything@removed.invalid")).toBe(
                true,
            );
        });

        it.each([
            "asha@kavidental.in",
            "asha@example.com",
            "account+x@account.in",
            "removed@invalid.example.com",
            "invalid@gmail.com",
            "no-at-sign",
            "",
        ])("is false for %p", (email) => {
            expect(isReservedContactEmail(email)).toBe(false);
        });

        it("is false for a missing email", () => {
            expect(isReservedContactEmail(null)).toBe(false);
            expect(isReservedContactEmail(undefined)).toBe(false);
        });
    });

    describe("contactEmailForDisplay", () => {
        it("shows a real contact email as it is", () => {
            expect(contactEmailForDisplay("asha@kavidental.in")).toBe(
                "asha@kavidental.in",
            );
            expect(
                contactEmailForDisplay("asha@kavidental.in", "other@x.in"),
            ).toBe("asha@kavidental.in");
        });

        it("shows the account's email in place of a placeholder", () => {
            expect(
                contactEmailForDisplay(
                    reservedAccountEmail(ID),
                    "asha@kavidental.in",
                ),
            ).toBe("asha@kavidental.in");
        });

        it("shows no email for a placeholder with no account", () => {
            expect(contactEmailForDisplay(reservedRemovedEmail(ID))).toBeNull();
            expect(
                contactEmailForDisplay(reservedMergedEmail(ID), null),
            ).toBeNull();
        });

        it("never returns a placeholder, even from the account side", () => {
            expect(
                contactEmailForDisplay(
                    reservedAccountEmail(ID),
                    reservedRemovedEmail(ID),
                ),
            ).toBeNull();
        });

        it("shows nothing when there is no email at all", () => {
            expect(contactEmailForDisplay(null)).toBeNull();
            expect(contactEmailForDisplay("", "")).toBeNull();
        });
    });
});
