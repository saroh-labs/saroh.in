import { describe, expect, it } from "vitest";

import {
    abaChecksumOk,
    bankCodesOf,
    bankDetailsWhole,
    bankFormatFor,
    checkBankAccount,
    checkBankCode,
    checkSwift,
    joinBankCodes,
    usesIban,
} from "./bank-details";

const value = (c: { value: string } | { problem: string }) =>
    "value" in c ? c.value : null;
const problem = (c: { value: string } | { problem: string }) =>
    "problem" in c ? c.problem : null;

describe("which countries use IBAN, as ibantools says", () => {
    it("GB, DE and AE do; the six national ones and IN don't", () => {
        expect(["GB", "DE", "AE", "fr"].every(usesIban)).toBe(true);
        expect(
            ["US", "CA", "AU", "NZ", "SG", "ZA", "IN", null].some(usesIban),
        ).toBe(false);
    });
});

/** One row per kind of country: labels, a good sample, bad ones. */
const TABLE = [
    {
        country: "GB",
        account: "IBAN",
        code: null,
        good: [["gb82 west 1234 5698 7654 32", "GB82WEST12345698765432"]],
        bad: [
            [
                "GB83WEST12345698765432",
                "That IBAN doesn't check out. Look for a missing or swapped character.",
            ],
            [
                "GB82WEST1234569876543",
                "That IBAN is too short or too long for its country. Check every character is there.",
            ],
        ],
    },
    {
        country: "US",
        account: "Account number",
        code: "Routing number",
        good: [["0001 2345 6789", "000123456789"]],
        bad: [["123", "A US account number is 4 to 17 digits."]],
        goodCode: [["021000021", "021000021"]],
        badCode: [
            [
                "021000022",
                "That routing number doesn't check out. Look for a missing or swapped digit.",
            ],
            ["02100002", "A routing number is 9 digits."],
        ],
    },
    {
        country: "CA",
        account: "Account number",
        code: "Transit and institution number",
        good: [["1234567", "1234567"]],
        bad: [["123456", "A Canadian account number is 7 to 12 digits."]],
        goodCode: [
            ["12345-003", "12345-003"],
            ["12345 003", "12345-003"],
            ["000312345", "12345-003"],
        ],
        badCode: [
            [
                "1234-003",
                "Add the 5-digit transit number and the 3-digit institution number, like 12345-003.",
            ],
        ],
    },
    {
        country: "AU",
        account: "Account number",
        code: "BSB",
        good: [["12345678", "12345678"]],
        bad: [["1234567890", "An Australian account number is 5 to 9 digits."]],
        goodCode: [["062000", "062-000"]],
        badCode: [["06200", "A BSB is 6 digits, like 062-000."]],
    },
    {
        country: "NZ",
        account: "Account number",
        code: null,
        good: [
            ["12-3456-7654321-00", "123456765432100"],
            ["12-3456-7654321-001", "1234567654321001"],
        ],
        bad: [
            [
                "12-3456-765432-00",
                "A New Zealand account number is 15 or 16 digits: bank, branch, account and suffix, like 12-3456-7654321-00.",
            ],
        ],
    },
    {
        country: "SG",
        account: "Account number",
        code: "Bank and branch code",
        good: [["123-456789-0", "1234567890"]],
        bad: [["12AB567890", "A Singapore account number is 6 to 17 digits."]],
        goodCode: [["7171 081", "7171-081"]],
        badCode: [
            [
                "717108",
                "Add the 4-digit bank code and the 3-digit branch code, like 7171-081.",
            ],
        ],
    },
    {
        country: "ZA",
        account: "Account number",
        code: "Branch code",
        good: [["62 1234 5678", "6212345678"]],
        bad: [["12345", "A South African account number is 6 to 17 digits."]],
        goodCode: [["250 655", "250655"]],
        badCode: [["25065", "A branch code is 6 digits, like 250655."]],
    },
    {
        country: "JP",
        account: "Account number",
        code: null,
        good: [["ab-1234 567", "AB1234567"]],
        bad: [
            [
                "ABCDEF",
                "An account number is letters and digits, up to 34, with at least one digit.",
            ],
        ],
    },
] as const;

describe.each(TABLE)("$country's bank details", (row) => {
    it("names its fields", () => {
        const f = bankFormatFor(row.country);
        expect(f.account).toBe(row.account);
        expect(f.code).toBe(row.code);
    });
    it("takes the account as the bank writes it, and stores it plain", () => {
        for (const [typed, stored] of row.good)
            expect(value(checkBankAccount(row.country, typed))).toBe(stored);
    });
    it("refuses a bad account in the merchant's words", () => {
        for (const [typed, why] of row.bad)
            expect(problem(checkBankAccount(row.country, typed))).toBe(why);
    });
    it("checks its own code, where it has one", () => {
        const goodCode = "goodCode" in row ? row.goodCode : [];
        const badCode = "badCode" in row ? row.badCode : [];
        for (const [typed, stored] of goodCode)
            expect(value(checkBankCode(row.country, typed))).toBe(stored);
        for (const [typed, why] of badCode)
            expect(problem(checkBankCode(row.country, typed))).toBe(why);
        if (!row.code)
            expect(problem(checkBankCode(row.country, "123456"))).toBeTruthy();
    });
});

describe("SWIFT/BIC, every country's optional extra", () => {
    it("takes 8 or 11 characters, any case, and refuses the rest", () => {
        expect(value(checkSwift("deut de ff"))).toBe("DEUTDEFF");
        expect(value(checkSwift("DEUTDEFF500"))).toBe("DEUTDEFF500");
        expect(problem(checkSwift("DEUT1EFF"))).toBe(
            "That isn't a SWIFT/BIC. It's 8 or 11 letters and digits, like DEUTDEFF.",
        );
    });
});

describe("the ABA check", () => {
    it("passes a real routing number and fails one digit off", () => {
        expect(abaChecksumOk("021000021")).toBe(true);
        expect(abaChecksumOk("021000012")).toBe(false);
        expect(abaChecksumOk("12345678")).toBe(false);
    });
});

describe("the codes column", () => {
    // The database check: capitals, digits, spaces and hyphens, up to 34.
    const FITS = /^[A-Z0-9 -]{1,34}$/;
    it("keeps the country's code, then the SWIFT/BIC, and reads them back", () => {
        const both = joinBankCodes("12345-003", "ROYCCAT2XXX");
        expect(both).toBe("12345-003 ROYCCAT2XXX");
        expect(both).toMatch(FITS);
        expect(bankCodesOf("CA", both)).toEqual({
            code: "12345-003",
            swift: "ROYCCAT2XXX",
        });
        expect(bankCodesOf("CA", "12345-003")).toEqual({
            code: "12345-003",
            swift: null,
        });
        expect(bankCodesOf("GB", "NWBKGB2L")).toEqual({
            code: null,
            swift: "NWBKGB2L",
        });
        expect(joinBankCodes(null, null)).toBeNull();
    });
    it("calls stored details whole only when each part still checks", () => {
        expect(bankDetailsWhole("US", "000123456789", "021000021")).toBe(true);
        expect(
            bankDetailsWhole("US", "000123456789", "021000021 BOFAUS3N"),
        ).toBe(true);
        // A US account needs its routing number.
        expect(bankDetailsWhole("US", "000123456789", null)).toBe(false);
        expect(bankDetailsWhole("US", "000123456789", "021000022")).toBe(false);
        expect(bankDetailsWhole("GB", "GB82WEST12345698765432", null)).toBe(
            true,
        );
        // Stored before IBANs were checked.
        expect(bankDetailsWhole("GB", "GB83WEST12345698765432", null)).toBe(
            false,
        );
        expect(
            bankDetailsWhole("GB", "GB82WEST12345698765432", "12-34-56"),
        ).toBe(false);
    });
});
