import { describe, expect, it } from "vitest";

import {
    ADD_AS_NEW_NOTE,
    addAsNewLabel,
    apartByEmailMessage,
    initialsOf,
    listLabel,
    newCustomerProblems,
    walkInCopy,
    walkInPhone,
    withDialCode,
} from "@/lib/customers/picker";

/**
 * The walk-in form's words (B13b): a phone keeps them as a customer, and the
 * form says so before it is used. The API decides who they are; this only
 * reads what was typed.
 */
describe("walkInPhone", () => {
    it("is none for nothing typed", () => {
        expect(walkInPhone("")).toBe("none");
        expect(walkInPhone("   ")).toBe("none");
    });

    it("is short below the digits the API keeps a customer by", () => {
        expect(walkInPhone("12345")).toBe("short");
        expect(walkInPhone("+91")).toBe("short");
    });

    it("is a phone however it is written", () => {
        expect(walkInPhone("+91 98450 00002")).toBe("phone");
        expect(walkInPhone("9845000002")).toBe("phone");
        expect(walkInPhone("(080) 2222-3333")).toBe("phone");
    });
});

describe("walkInCopy", () => {
    it("asks for a phone to keep them, and uses them as a walk-in without", () => {
        expect(walkInCopy("")).toEqual({
            hint: "Add a phone to keep them as a customer.",
            action: "Use walk-in",
        });
    });

    it("says they'll be kept as a customer once a phone is typed", () => {
        expect(walkInCopy("+91 98450 00002")).toEqual({
            hint: "They'll be kept as a customer, by this phone.",
            action: "Keep as customer",
        });
    });

    it("doesn't promise it for a phone too short to keep them by", () => {
        expect(walkInCopy("123").action).toBe("Use walk-in");
    });
});

describe("adding a customer while booking (DEC-170, U3)", () => {
    it("needs a name and a phone, and an email only when one is typed", () => {
        expect(
            newCustomerProblems({
                name: "Zara Ahmed",
                phone: "90000 54321",
                email: "",
            }),
        ).toEqual({});
        expect(newCustomerProblems({ name: "", phone: "", email: "" })).toEqual(
            {
                name: "Add their name.",
                phone: "Add their phone number.",
            },
        );
        expect(
            newCustomerProblems({ name: "Zara", phone: "123", email: "zara@" }),
        ).toEqual({
            phone: "That doesn't look like a phone number.",
            email: "That doesn't look like an email, like priya@example.com.",
        });
    });

    it("puts the business's dialling code in front of a bare number", () => {
        expect(withDialCode("90000 54321", "+91")).toBe("+91 90000 54321");
        expect(withDialCode("+44 20 7946 0000", "+91")).toBe(
            "+44 20 7946 0000",
        );
        expect(withDialCode("919000054321", "+91")).toBe("+919000054321");
        expect(withDialCode("", "+91")).toBe("");
    });

    it("says the add row, the list's label and the initials as the boards draw them", () => {
        expect(addAsNewLabel(" Zara ")).toBe("Add “Zara” as a new customer");
        expect(ADD_AS_NEW_NOTE).toBe("Just a name and phone number");
        expect(listLabel("", 8)).toBe("Recent customers");
        expect(listLabel("Ro", 2)).toBe("Matches");
        expect(listLabel("Zara", 0)).toBe("No one called “Zara” yet");
        expect(initialsOf("Kabir Singh")).toBe("KS");
        expect(initialsOf("Zara")).toBe("ZA");
        expect(initialsOf(null)).toBe("?");
    });

    it("asks for an email to keep two people on one phone apart", () => {
        expect(apartByEmailMessage("Rohan Mehta", "Zara Ahmed")).toBe(
            "Rohan Mehta has this number, so add Zara's email to keep them apart.",
        );
    });
});
