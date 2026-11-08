import {
    electronicFormatIBAN,
    getCountrySpecifications,
    isValidBIC,
    validateIBAN,
    ValidationErrorsIBAN,
} from "ibantools";

import type { Checked } from "./address-rules";

/**
 * A business's bank details where its profile pays by bank code ("How to pay
 * us", DEC-204): what its bank calls each number, and the checks each takes,
 * by the business's country (ISO 3166-1 alpha-2, set at setup). The API
 * holds a save to these; the merchant app says the same as they type, so
 * both read this one table. India's UPI and IFSC rules aren't here: they
 * live with the API and the app, unchanged.
 *
 * Two columns hold it: the account (`payBankAccountNumber`) and the codes
 * (`payBankIfsc`). The codes column is the country's own code, then a space
 * and the SWIFT/BIC when there is one: "021000021 BOFAUS3N". A country with
 * no code of its own keeps the SWIFT/BIC alone. Every shape stored fits the
 * columns' database checks (`20270127100000_pay_bank_shapes_by_edition`):
 * capitals and digits, the codes with spaces and hyphens, up to 34.
 */

export type { Checked };

export interface BankFormat {
    /** The account field's name: "IBAN", "Account number". */
    account: string;
    /** The country's own code, or null where a transfer needs none. */
    code: string | null;
    /** Shown in an empty field. */
    accountExample: string;
    codeExample: string | null;
    /** Home's setup step: "Add your IBAN". */
    asks: string;
    /** Said when the rest of the bank details are there and the account isn't. */
    accountMissing: string;
    /** Said when the account is there and the code isn't. */
    codeMissing: string | null;
}

const ACCOUNT_MISSING = "Add the account number, or clear the bank details.";

export const SWIFT_LABEL = "SWIFT/BIC";

/** Spaces and hyphens are how people copy a number from a statement. */
const plain = (typed: string) => typed.replace(/[\s-]/g, "").toUpperCase();

const digits =
    (min: number, max: number, problem: string) =>
    (typed: string): Checked => {
        const v = plain(typed);
        return new RegExp(`^\\d{${min},${max}}$`).test(v)
            ? { value: v }
            : { problem };
    };

/** The ABA's mod 10 check: weights 3, 7, 1 across the nine digits. */
export function abaChecksumOk(routing: string): boolean {
    if (!/^\d{9}$/.test(routing)) return false;
    const w = [3, 7, 1];
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += Number(routing[i]) * w[i % 3];
    return sum % 10 === 0;
}

interface CountryRules extends BankFormat {
    checkAccount: (typed: string) => Checked;
    checkCode: ((typed: string) => Checked) | null;
}

const NATIONAL: Record<string, CountryRules> = {
    // Routing number: nine digits (12 CFR 229.2(dd)), the ninth a check digit
    // over the ABA's 3-7-1 weights (Nacha Operating Rules, Appendix Three).
    // Account: Nacha's DFI Account Number field holds up to 17.
    US: {
        account: "Account number",
        code: "Routing number",
        accountExample: "000123456789",
        codeExample: "021000021",
        asks: "Add your account and routing number",
        accountMissing: ACCOUNT_MISSING,
        codeMissing:
            "Add the routing number: a transfer needs it with the account number.",
        checkAccount: digits(4, 17, "A US account number is 4 to 17 digits."),
        checkCode: (typed) => {
            const v = plain(typed);
            if (!/^\d{9}$/.test(v))
                return { problem: "A routing number is 9 digits." };
            return abaChecksumOk(v)
                ? { value: v }
                : {
                      problem:
                          "That routing number doesn't check out. Look for a missing or swapped digit.",
                  };
        },
    },
    // Payments Canada, Standard 006 (MICR), 4.4.3: a branch (transit) number
    // of five digits and an institution number of three, written
    // 12345-003. EFT writes them 0 + institution + transit, also taken.
    // Account: each institution sets its own (Standard 006, 4.4.2).
    CA: {
        account: "Account number",
        code: "Transit and institution number",
        accountExample: "1234567",
        codeExample: "12345-003",
        asks: "Add your account, transit and institution number",
        accountMissing: ACCOUNT_MISSING,
        codeMissing:
            "Add the transit and institution number: a transfer needs them with the account number.",
        checkAccount: digits(
            7,
            12,
            "A Canadian account number is 7 to 12 digits.",
        ),
        checkCode: (typed) => {
            const v = plain(typed);
            if (/^\d{8}$/.test(v))
                return { value: `${v.slice(0, 5)}-${v.slice(5)}` };
            if (/^0\d{8}$/.test(v))
                return { value: `${v.slice(4)}-${v.slice(1, 4)}` };
            return {
                problem:
                    "Add the 5-digit transit number and the 3-digit institution number, like 12345-003.",
            };
        },
    },
    // AusPayNet's BSB register: a BSB is XXX-XXX. Account: BECS carries up
    // to nine digits.
    AU: {
        account: "Account number",
        code: "BSB",
        accountExample: "12345678",
        codeExample: "062-000",
        asks: "Add your account number and BSB",
        accountMissing: ACCOUNT_MISSING,
        codeMissing:
            "Add the BSB: a transfer needs it with the account number.",
        checkAccount: digits(
            5,
            9,
            "An Australian account number is 5 to 9 digits.",
        ),
        checkCode: (typed) => {
            const v = plain(typed);
            return /^\d{6}$/.test(v)
                ? { value: `${v.slice(0, 3)}-${v.slice(3)}` }
                : { problem: "A BSB is 6 digits, like 062-000." };
        },
    },
    // Payments NZ's Bank Branch Register numbers banks (2 digits) and their
    // branches (4); the account (7) and a suffix (2 or 3) follow, as one
    // number: 12-3456-7654321-00.
    NZ: {
        account: "Account number",
        code: null,
        accountExample: "12-3456-7654321-00",
        codeExample: null,
        asks: "Add your account number",
        accountMissing: ACCOUNT_MISSING,
        codeMissing: null,
        checkAccount: digits(
            15,
            16,
            "A New Zealand account number is 15 or 16 digits: bank, branch, account and suffix, like 12-3456-7654321-00.",
        ),
        checkCode: null,
    },
    // Singapore's FAST and GIRO name a bank by a 4-digit code and a branch by
    // 3 (DBS: "Bank code is 7171", POSB's branch code 081). Account lengths
    // are each bank's own (DBS 10 digits, POSB 9).
    SG: {
        account: "Account number",
        code: "Bank and branch code",
        accountExample: "1234567890",
        codeExample: "7171-081",
        asks: "Add your account number, bank and branch code",
        accountMissing: ACCOUNT_MISSING,
        codeMissing:
            "Add the bank and branch code: a transfer needs them with the account number.",
        checkAccount: digits(
            6,
            17,
            "A Singapore account number is 6 to 17 digits.",
        ),
        checkCode: (typed) => {
            const v = plain(typed);
            return /^\d{7}$/.test(v)
                ? { value: `${v.slice(0, 4)}-${v.slice(4)}` }
                : {
                      problem:
                          "Add the 4-digit bank code and the 3-digit branch code, like 7171-081.",
                  };
        },
    },
    // South Africa's branch codes, a bank's universal one or a branch's,
    // are six digits. Account lengths are each bank's own.
    ZA: {
        account: "Account number",
        code: "Branch code",
        accountExample: "1234567890",
        codeExample: "250655",
        asks: "Add your account number and branch code",
        accountMissing: ACCOUNT_MISSING,
        codeMissing:
            "Add the branch code: a transfer needs it with the account number.",
        checkAccount: digits(
            6,
            17,
            "A South African account number is 6 to 17 digits.",
        ),
        checkCode: digits(6, 6, "A branch code is 6 digits, like 250655."),
    },
};

/** Where SWIFT's IBAN registry lists the country, ibantools knows it. */
export function usesIban(country: string | null | undefined): boolean {
    const code = country?.trim().toUpperCase() ?? "";
    const specs = getCountrySpecifications();
    return code in specs && specs[code].IBANRegistry === true;
}

function checkIban(typed: string): Checked {
    const v = electronicFormatIBAN(typed) ?? "";
    const { valid, errorCodes } = validateIBAN(v);
    if (valid) return { value: v };
    if (errorCodes.includes(ValidationErrorsIBAN.NoIBANCountry))
        return {
            problem: "An IBAN starts with its country's two letters, like GB.",
        };
    if (errorCodes.includes(ValidationErrorsIBAN.WrongBBANLength))
        return {
            problem:
                "That IBAN is too short or too long for its country. Check every character is there.",
        };
    return {
        problem:
            "That IBAN doesn't check out. Look for a missing or swapped character.",
    };
}

const IBAN_RULES: CountryRules = {
    account: "IBAN",
    code: null,
    accountExample: "GB82 WEST 1234 5698 7654 32",
    codeExample: null,
    asks: "Add your IBAN",
    accountMissing: "Add the IBAN, or clear the bank details.",
    codeMissing: null,
    checkAccount: checkIban,
    checkCode: null,
};

const OTHER_RULES: CountryRules = {
    account: "Account number",
    code: null,
    accountExample: "",
    codeExample: null,
    asks: "Add your account number and SWIFT/BIC",
    accountMissing: ACCOUNT_MISSING,
    codeMissing: null,
    checkAccount: (typed) => {
        const v = plain(typed);
        return /^(?=.*\d)[A-Z0-9]{1,34}$/.test(v)
            ? { value: v }
            : {
                  problem:
                      "An account number is letters and digits, up to 34, with at least one digit.",
              };
    },
    checkCode: null,
};

function rulesFor(country: string | null | undefined): CountryRules {
    const code = country?.trim().toUpperCase() ?? "";
    if (usesIban(code)) return IBAN_RULES;
    return NATIONAL[code] ?? OTHER_RULES;
}

/** What the business's bank calls each number, for its country. */
export function bankFormatFor(country: string | null | undefined): BankFormat {
    const { checkAccount: _a, checkCode: _c, ...format } = rulesFor(country);
    return format;
}

/** The account as stored, or why it isn't one. "" is the caller's. */
export const checkBankAccount = (
    country: string | null | undefined,
    typed: string,
): Checked => rulesFor(country).checkAccount(typed);

/** The country's own code as stored, or why it isn't one. */
export function checkBankCode(
    country: string | null | undefined,
    typed: string,
): Checked {
    const check = rulesFor(country).checkCode;
    return check
        ? check(typed)
        : { problem: "Banks here need no code beyond the SWIFT/BIC." };
}

export function checkSwift(typed: string): Checked {
    const v = plain(typed);
    return isValidBIC(v)
        ? { value: v }
        : {
              problem:
                  "That isn't a SWIFT/BIC. It's 8 or 11 letters and digits, like DEUTDEFF.",
          };
}

/** The codes column from its parts, or null when neither is set. */
export function joinBankCodes(
    code: string | null | undefined,
    swift: string | null | undefined,
): string | null {
    return [code, swift].filter(Boolean).join(" ") || null;
}

/** The codes column read back into its parts, by the country's format. */
export function bankCodesOf(
    country: string | null | undefined,
    stored: string | null | undefined,
): { code: string | null; swift: string | null } {
    if (!stored) return { code: null, swift: null };
    if (!rulesFor(country).checkCode) return { code: null, swift: stored };
    const [code, ...rest] = stored.split(" ");
    return { code: code || null, swift: rest.join(" ") || null };
}

/**
 * Stored bank details still whole by today's rules: the account, the code
 * where the country has one, and a SWIFT/BIC if any, each re-checked. A
 * customer is shown them only then.
 */
export function bankDetailsWhole(
    country: string | null | undefined,
    account: string | null | undefined,
    codes: string | null | undefined,
): boolean {
    if (!account) return false;
    const ok = (c: Checked, v: string) => "value" in c && c.value === v;
    if (!ok(checkBankAccount(country, account), account)) return false;
    const { code, swift } = bankCodesOf(country, codes);
    if (rulesFor(country).checkCode) {
        if (!code || !ok(checkBankCode(country, code), code)) return false;
    }
    return !swift || ok(checkSwift(swift), swift);
}
