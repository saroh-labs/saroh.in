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

describe("a Global business's bank by its country (DEC-204)", () => {
    const GB = ["GLOBAL", "GB"] as const;
    const US = ["GLOBAL", "US"] as const;

    it("checks an IBAN and a SWIFT/BIC, and asks no code", () => {
        expect(
            payFieldProblem(
                "bankAccountNumber",
                "GB83WEST12345698765432",
                ...GB,
            ),
        ).toBe(
            "That IBAN doesn't check out. Look for a missing or swapped character.",
        );
        expect(
            payFieldProblem(
                "bankAccountNumber",
                "GB82 WEST 1234 5698 7654 32",
                ...GB,
            ),
        ).toBeNull();
        expect(payFieldProblem("bankSwift", "NWBKGB2L", ...GB)).toBeNull();
        expect(
            bankProblem(
                {
                    upiId: "",
                    bankAccountName: "Rye",
                    bankAccountNumber: "GB82WEST12345698765432",
                    bankIfsc: "",
                    bankSwift: "",
                    bankName: "",
                    note: "",
                },
                ...GB,
            ),
        ).toBeNull();
    });

    it("wants a US routing number, and sends only what changed", () => {
        const v = {
            upiId: "",
            bankAccountName: "Rye",
            bankAccountNumber: "000123456789",
            bankIfsc: "",
            bankSwift: "",
            bankName: "",
            note: "",
        };
        expect(bankProblem(v, ...US)).toEqual({
            field: "bankIfsc",
            message:
                "Add the routing number: a transfer needs it with the account number.",
        });
        const saved = {
            upiId: null,
            bankAccountName: "Rye",
            bankAccountNumber: "000123456789",
            bankIfsc: "021000021",
            bankSwift: null,
            bankName: null,
            note: null,
            edition: "GLOBAL" as const,
            country: "US",
        };
        expect(
            payInputOf(
                { ...v, bankIfsc: "021 000 021", bankSwift: "bofaus3n" },
                saved,
            ),
        ).toEqual({ bankSwift: "bofaus3n" });
        expect(payPreviewOf(v, ...US).bankLabels).toEqual({
            account: "Account number",
            code: "Routing number",
            swift: "SWIFT/BIC",
        });
    });

    it("India's fields and words don't change", () => {
        expect(payFieldProblem("bankSwift", "anything")).toBeNull();
        expect(
            payPreviewOf({
                upiId: "",
                bankAccountName: "",
                bankAccountNumber: "",
                bankIfsc: "",
                bankSwift: "",
                bankName: "",
                note: "",
            }),
        ).not.toHaveProperty("bankLabels");
    });
});
