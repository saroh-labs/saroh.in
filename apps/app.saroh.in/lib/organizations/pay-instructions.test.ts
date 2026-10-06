import { describe, expect, it } from "vitest";

import {
    accountLabel,
    bankProblem,
    payFieldProblem,
    payInputOf,
    payInstructionsSchema,
    payPreviewOf,
    payValuesOf,
    payWaysSummary,
} from "./pay-instructions";

/** "How to pay us" (R32): the API's rules said on the field. Made-up details. */

const EMPTY = payValuesOf(null);
const UPI = "northwind.supply@okexample";

describe("payFieldProblem", () => {
    it("takes a UPI ID in any case, and refuses one without its @handle", () => {
        expect(payFieldProblem("upiId", " Northwind.Supply@OKExample ")).toBe(
            null,
        );
        expect(payFieldProblem("upiId", "northwind")).toContain("UPI ID");
    });

    it("takes an account number with spaces, digits only, 9 to 18", () => {
        expect(payFieldProblem("bankAccountNumber", "9876 5432 1012")).toBe(
            null,
        );
        expect(payFieldProblem("bankAccountNumber", "98765A321")).toBe(
            "An account number is digits only.",
        );
        expect(payFieldProblem("bankAccountNumber", "12345678")).toBe(
            "An account number is 9 to 18 digits.",
        );
    });

    it("checks an IFSC's shape: 4 letters, 0, 6 more", () => {
        expect(payFieldProblem("bankIfsc", "wxyz0654321")).toBe(null);
        expect(payFieldProblem("bankIfsc", "WXYZ1654321")).toContain("IFSC");
    });

    it("lets every field be empty", () => {
        for (const f of Object.keys(EMPTY) as (keyof typeof EMPTY)[]) {
            expect(payFieldProblem(f, "")).toBeNull();
        }
    });
});

describe("bankProblem and the schema", () => {
    it("asks for the missing part of the bank details, in order", () => {
        expect(bankProblem(EMPTY)).toBeNull();
        expect(
            bankProblem({ ...EMPTY, bankAccountNumber: "987654321012" })?.field,
        ).toBe("bankAccountName");
        expect(
            bankProblem({
                ...EMPTY,
                bankAccountName: "Northwind",
                bankAccountNumber: "987654321012",
            })?.field,
        ).toBe("bankIfsc");
    });

    it("passes whole details and a UPI ID; refuses a bad one on its field", () => {
        expect(
            payInstructionsSchema.safeParse({
                ...EMPTY,
                upiId: UPI,
                bankAccountName: "Northwind",
                bankAccountNumber: "987654321012",
                bankIfsc: "WXYZ0654321",
            }).success,
        ).toBe(true);
        const bad = payInstructionsSchema.safeParse({
            ...EMPTY,
            upiId: "nope",
        });
        expect(bad.success).toBe(false);
        expect(bad.error?.issues[0]?.path).toEqual(["upiId"]);
    });
});

describe("payInputOf", () => {
    it("sends only what differs from what is saved, as typed and trimmed", () => {
        const saved = { ...payPreviewOf(EMPTY), note: "Thanks" };
        expect(
            payInputOf({ ...payValuesOf(saved), upiId: ` ${UPI} ` }, saved),
        ).toEqual({ upiId: UPI });
        // A change of case or spacing the API would store the same is none.
        expect(
            payInputOf(
                {
                    ...payValuesOf({ ...saved, upiId: UPI }),
                    upiId: UPI.toUpperCase(),
                },
                { ...saved, upiId: UPI },
            ),
        ).toEqual({});
        // Clearing sends "".
        expect(payInputOf({ ...payValuesOf(saved), note: "" }, saved)).toEqual({
            note: "",
        });
    });
});

describe("payPreviewOf", () => {
    it("shows values as they'd be stored, leaving out what isn't valid yet", () => {
        expect(
            payPreviewOf({
                ...EMPTY,
                upiId: "Northwind.Supply@OKExample",
                bankIfsc: "wxyz",
                note: " Thanks ",
            }),
        ).toEqual({
            upiId: UPI,
            bankAccountName: null,
            bankAccountNumber: null,
            bankIfsc: null,
            bankName: null,
            note: "Thanks",
        });
    });
});

describe("read-back words", () => {
    it("groups an account number and names the ways set", () => {
        expect(accountLabel("987654321012")).toBe("9876 5432 1012");
        expect(accountLabel(null)).toBe("");
        expect(payWaysSummary(null)).toBe("");
        expect(
            payWaysSummary({
                ...payPreviewOf(EMPTY),
                upiId: UPI,
                bankAccountNumber: "987654321012",
                bankIfsc: "WXYZ0654321",
            }),
        ).toBe("UPI and bank transfer");
    });
});
