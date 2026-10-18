import { describe, expect, it } from "vitest";

import type { SetupBilling } from "./setup-billing";
import {
    addressLine,
    BILLING_EMAIL_TAKEN,
    billingFieldOf,
    billingProblems,
    billingSent,
    CHOOSE_BILLING,
    NEW_PROFILE,
} from "./setup-billing";

const BILLING: SetupBilling = {
    profiles: [
        {
            id: "bprof_1",
            legalName: "Asha Foods LLP",
            gstin: null,
            address: null,
            billingEmail: "accounts@example.com",
        },
    ],
};

describe("a profile's address on one line", () => {
    it("joins what it has, with the state's name", () => {
        expect(
            addressLine({
                addressLine1: "3 Hill Road",
                addressLine2: " ",
                city: "Bengaluru",
                postalCode: "560038",
                gstState: "29",
            }),
        ).toBe("3 Hill Road, Bengaluru 560038, Karnataka");
        expect(addressLine({ gstState: "06" })).toBe("Haryana");
        expect(addressLine({})).toBeNull();
    });
});

describe("what the step refuses (DEC-167, R7)", () => {
    it("asks for a choice, and takes only one of the owner's or a new one", () => {
        expect(billingProblems({}, BILLING)).toEqual([
            ["billingChoice", CHOOSE_BILLING],
        ]);
        expect(
            billingProblems({ billingChoice: "bprof_other" }, BILLING),
        ).toEqual([["billingChoice", CHOOSE_BILLING]]);
        expect(billingProblems({ billingChoice: "bprof_1" }, BILLING)).toEqual(
            [],
        );
    });

    it("asks a new profile for its legal name and a billing email the owner doesn't use, in any case (R3)", () => {
        expect(
            billingProblems({ billingChoice: NEW_PROFILE }, BILLING).map(
                ([field]) => field,
            ),
        ).toEqual(["billLegalName", "billEmail"]);
        expect(
            billingProblems(
                {
                    billingChoice: NEW_PROFILE,
                    billLegalName: "Asha Bakes",
                    billEmail: " Accounts@Example.com ",
                },
                BILLING,
            ),
        ).toEqual([["billEmail", BILLING_EMAIL_TAKEN]]);
        expect(
            billingProblems(
                {
                    billingChoice: NEW_PROFILE,
                    billLegalName: "Asha Bakes",
                    billEmail: "bakes@",
                },
                BILLING,
            ),
        ).toEqual([["billEmail", "That email doesn't look right."]]);
    });

    it("checks a GSTIN and a PIN only when typed", () => {
        const base = {
            billingChoice: NEW_PROFILE,
            billLegalName: "Asha Bakes",
            billEmail: "bakes@example.com",
        };
        expect(billingProblems(base, BILLING)).toEqual([]);
        expect(
            billingProblems(
                { ...base, billGstin: "29ABCDE", billPin: "5600" },
                BILLING,
            ).map(([field]) => field),
        ).toEqual(["billGstin", "billPin"]);
        expect(
            billingProblems(
                { ...base, billGstin: "29ABCDE1234F1ZW", billPin: "560 038" },
                BILLING,
            ),
        ).toEqual([]);
    });
});

describe("what the create sends", () => {
    it("one of the owner's profiles by id", () => {
        expect(billingSent({ billingChoice: "bprof_1" })).toEqual({
            billingProfileId: "bprof_1",
        });
    });

    it("a new profile, trimmed, with nothing empty", () => {
        expect(
            billingSent({
                billingChoice: NEW_PROFILE,
                billLegalName: " Asha Bakes ",
                billEmail: "bakes@example.com",
                billGstin: "29abcde1234f1zw",
                billState: "29",
                billAddress: "",
                billCity: " Bengaluru ",
                billPin: "560 038",
            }),
        ).toEqual({
            newBillingProfile: {
                legalName: "Asha Bakes",
                billingEmail: "bakes@example.com",
                gstin: "29ABCDE1234F1ZW",
                gstState: "29",
                city: "Bengaluru",
                postalCode: "560038",
            },
        });
    });

    it("puts the API's refusal on the step's own field", () => {
        expect(billingFieldOf("billingProfile")).toBe("billingChoice");
        expect(billingFieldOf("billingEmail")).toBe("billEmail");
        expect(billingFieldOf("postalCode")).toBe("billPin");
        expect(billingFieldOf("name")).toBeNull();
        expect(billingFieldOf(undefined)).toBeNull();
    });
});
