import { BadRequestException, ConflictException } from "@nestjs/common";

import { emailHeldBy, planContactEdit } from "./contact-edit";

/** What a staff edit writes (C8), before anything is written. */

const CURRENT = {
    firstName: "Ananya",
    lastName: "Rao",
    phone: "+91 98450 00001",
    company: null,
    email: "ananya@example.com",
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
};

describe("planContactEdit", () => {
    it("changes the email and clears its verified stamp (DEC-049)", () => {
        const edit = planContactEdit(CURRENT, {
            email: "ananya.rao@gmail.com",
        });
        expect(edit.email).toBe("ananya.rao@gmail.com");
        expect(edit.data).toEqual({
            email: "ananya.rao@gmail.com",
            emailVerifiedAt: null,
            emailVerifiedVia: null,
        });
        expect(edit.changed).toEqual(["email"]);
    });

    it("leaves the email and its stamp alone when it is sent unchanged", () => {
        const edit = planContactEdit(
            { ...CURRENT, email: "Ananya@Example.com" },
            { email: "ananya@example.com" },
        );
        expect(edit.email).toBeNull();
        expect(edit.data).toEqual({});
        expect(edit.changed).toEqual([]);
    });

    it.each([
        "removed+c_9@removed.invalid",
        "merged+c_9@removed.invalid",
        "account+c_9@account.invalid",
    ])("refuses a reserved placeholder (%s) as invalid", (email) => {
        expect(() => planContactEdit(CURRENT, { email })).toThrow(
            BadRequestException,
        );
    });

    it("adds an address, and names it once among what changed", () => {
        const edit = planContactEdit(CURRENT, {
            firstName: "Ananya",
            addressLine1: "12 Hill Road",
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560038",
            country: "IN",
        });
        expect(edit.data).toMatchObject({
            addressLine1: "12 Hill Road",
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560038",
            country: "IN",
        });
        // The name was sent as it was: not a change.
        expect(edit.changed).toEqual(["address"]);
    });

    it("refuses an Indian PIN of four digits", () => {
        expect(() =>
            planContactEdit(CURRENT, {
                addressLine1: "12 Hill Road",
                postalCode: "5600",
                country: "IN",
            }),
        ).toThrow("A PIN code is six digits, like 560038.");
    });

    it("applies name, phone and company as sent", () => {
        const edit = planContactEdit(CURRENT, { company: "Acme" });
        expect(edit.data).toEqual({ company: "Acme" });
        expect(edit.changed).toEqual(["company"]);
    });
});

describe("emailHeldBy", () => {
    it("names the other customer and says who they are", () => {
        const err = emailHeldBy({
            id: "c_2",
            firstName: "Priya",
            lastName: "R",
        });
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse()).toEqual({
            message: "Priya R already has this email.",
            details: { field: "email", contactId: "c_2", name: "Priya R" },
        });
    });

    it("says another customer when the race's winner isn't known", () => {
        expect(emailHeldBy(null).getResponse()).toEqual({
            message: "Another customer already has this email.",
            details: { field: "email" },
        });
    });
});
