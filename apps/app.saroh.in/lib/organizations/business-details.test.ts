import { describe, expect, it } from "vitest";

import type { BusinessDetailsValues } from "./business-details";
import {
    detailsInput,
    detailsProblems,
    detailsValuesOf,
    detailsWhy,
    inIndia,
    missingDetailsOf,
} from "./business-details";

const filled: BusinessDetailsValues = {
    addressLine1: "3 Hill Road",
    addressLine2: "",
    city: "Bengaluru",
    postalCode: "560038",
    gstState: "29",
    gstRegistered: false,
    taxId: "",
};

describe("missingDetailsOf (DEC-068)", () => {
    it("reads what the API's refusal names, in order", () => {
        expect(
            missingDetailsOf({
                reason: "BUSINESS_DETAILS_MISSING",
                missing: ["gstin", "address"],
            }),
        ).toEqual(["address", "gstin"]);
    });

    it("asks for the address when the refusal names nothing it knows", () => {
        expect(
            missingDetailsOf({
                reason: "BUSINESS_DETAILS_MISSING",
                missing: ["logo"],
            }),
        ).toEqual(["address"]);
    });

    it("is nothing for any other refusal", () => {
        expect(missingDetailsOf({ field: "dueAt" })).toBeUndefined();
        expect(missingDetailsOf({ reason: "autopay-pending" })).toBeUndefined();
        expect(missingDetailsOf(null)).toBeUndefined();
        expect(missingDetailsOf(["x"])).toBeUndefined();
    });
});

describe("detailsValuesOf", () => {
    it("starts from what is on file, blanks for what isn't", () => {
        expect(
            detailsValuesOf({
                profile: {
                    legalName: null,
                    type: null,
                    country: "IN",
                    taxId: "29AAGCR4375J1ZU",
                    contactEmail: null,
                    website: null,
                },
                tax: {
                    registered: true,
                    state: "29",
                    stateName: "Karnataka",
                    invoicePrefix: null,
                    deliveryRate: "18",
                    deliverySac: null,
                },
                registeredAddress: {
                    line1: "3 Hill Road",
                    line2: null,
                    city: null,
                    postalCode: null,
                    state: "29",
                    stateName: "Karnataka",
                },
            }),
        ).toEqual({
            addressLine1: "3 Hill Road",
            addressLine2: "",
            city: "",
            postalCode: "",
            gstState: "29",
            gstRegistered: true,
            taxId: "29AAGCR4375J1ZU",
        });
        expect(detailsValuesOf(null).gstRegistered).toBe(false);
    });
});

describe("detailsProblems", () => {
    it("asks for the first line, city and PIN whether registered or not", () => {
        const paths = detailsProblems(
            { ...filled, addressLine1: " ", city: "", postalCode: "" },
            { inIndia: true },
        ).map((p) => p.path);
        expect(paths).toEqual(["addressLine1", "city", "postalCode"]);
    });

    it("checks an Indian PIN's shape, and asks an Indian address its state", () => {
        expect(
            detailsProblems(
                { ...filled, postalCode: "0560038", gstState: "" },
                { inIndia: true },
            ),
        ).toEqual([
            {
                path: "postalCode",
                message: "A PIN code is six digits, like 560038.",
            },
            { path: "gstState", message: "Choose your state." },
        ]);
        // "560 038" is how a PIN is often written.
        expect(
            detailsProblems(
                { ...filled, postalCode: "560 038" },
                { inIndia: true },
            ),
        ).toEqual([]);
    });

    it("asks nothing Indian of an address abroad", () => {
        expect(
            detailsProblems(
                { ...filled, postalCode: "SW1A 1AA", gstState: "" },
                { inIndia: false },
            ),
        ).toEqual([]);
    });

    it("checks a registered business's GSTIN, part by part", () => {
        const [problem] = detailsProblems(
            { ...filled, gstRegistered: true, taxId: "29AAGCR" },
            { inIndia: true },
        );
        expect(problem.path).toBe("taxId");
        expect(
            detailsProblems(
                { ...filled, gstRegistered: true, taxId: "29AAGCR4375J1ZU" },
                { inIndia: true },
            ),
        ).toEqual([]);
    });
});

describe("detailsInput", () => {
    it("sends the address in full and the state, not an unchanged registration", () => {
        expect(detailsInput(filled, { gstRegistered: false })).toEqual({
            registeredAddress: {
                line1: "3 Hill Road",
                line2: "",
                city: "Bengaluru",
                postalCode: "560038",
            },
            tax: { state: "29" },
        });
    });

    it("registers with the GSTIN, its state from the GSTIN's first two", () => {
        expect(
            detailsInput(
                {
                    ...filled,
                    gstState: "27",
                    gstRegistered: true,
                    taxId: " 29aagcr4375j1zu ",
                },
                { gstRegistered: false },
            ),
        ).toMatchObject({
            tax: { registered: true, state: "29" },
            profile: { taxId: "29AAGCR4375J1ZU" },
        });
    });

    it("turning GST off says so and sends no GSTIN", () => {
        const input = detailsInput(filled, { gstRegistered: true });
        expect(input.tax).toEqual({ registered: false, state: "29" });
        expect(input.profile).toBeUndefined();
    });
});

describe("detailsWhy", () => {
    it("names what is missing and what happens next", () => {
        expect(detailsWhy(["address"], "issue it")).toBe(
            "Every invoice prints your registered address. Add it once and we'll issue it.",
        );
        expect(detailsWhy(["gstin"], "send it")).toBe(
            "Every invoice prints your GSTIN. Add it once and we'll send it.",
        );
        expect(detailsWhy(["address", "gstin"], "connect Razorpay")).toBe(
            "Every invoice prints your registered address and GSTIN. Add them once and we'll connect Razorpay.",
        );
    });
});

describe("inIndia", () => {
    it("is India when the country is India or unsaid", () => {
        expect(inIndia(null)).toBe(true);
        expect(inIndia("")).toBe(true);
        expect(inIndia("in")).toBe(true);
        expect(inIndia("GB")).toBe(false);
    });
});
