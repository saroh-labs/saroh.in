import type { Edition } from "@saroh/edition";
import {
    bankFormatFor,
    checkBankAccount,
    checkBankCode,
    checkSwift,
    editionProfile,
    SWIFT_LABEL,
} from "@saroh/edition";
import { z } from "zod";

/**
 * "How to pay us" (R32): the UPI ID, bank details and note a business's
 * customers see on their own unpaid invoices, orders and desk bookings.
 * The API is the judge (`organizations/business-pay-instructions.ts`
 * there); this says the same rules on each field as the merchant types, so
 * Save isn't the first to know. Pure. A Global business (DEC-204) has no UPI,
 * and its bank details follow its country (`@saroh/edition` bank-details, the
 * table the API judges by): an IBAN, or a country's own account number and
 * code in `bankIfsc` (a routing number, a BSB), and an optional `bankSwift`.
 * The API sends its `edition` and `country`.
 */

/** The settings read's `payInstructions`: every field, null until set. */
export interface PayInstructionsSettings {
    upiId: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankIfsc: string | null;
    bankName: string | null;
    note: string | null;
    edition?: Edition;
    /** A Global business's SWIFT/BIC. */
    bankSwift?: string | null;
    /** A Global business's country, which its bank details follow. */
    country?: string | null;
    /** What a Global business's bank calls each number, as its customers read them. */
    bankLabels?: { account: string; code: string | null; swift: string };
}

/** No UPI, and the bank code is optional (DEC-204). Absent reads as India. */
export const payByBankCode = (edition: Edition | null | undefined) =>
    editionProfile(edition).payInstructions === "bank-code";

export type PayField = Exclude<
    keyof PayInstructionsSettings,
    "edition" | "country" | "bankLabels"
>;

export const PAY_FIELDS: readonly PayField[] = [
    "upiId",
    "bankAccountName",
    "bankAccountNumber",
    "bankIfsc",
    "bankSwift",
    "bankName",
    "note",
];

/** What the form holds: every field a string, "" for not set. */
export type PayValues = Record<PayField, string>;

const UPI_ID = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER = /^\d{9,18}$/;

export const MAX_ACCOUNT_NAME = 100;
export const MAX_BANK_NAME = 100;
export const MAX_PAY_NOTE = 280;

export const UPI_EXAMPLE = "yourname@okhdfc";
export const IFSC_EXAMPLE = "HDFC0001234";

/** As stored: the UPI ID lower-cased, the number digits only, IFSC capitals. */
export function payStored(
    field: PayField,
    typed: string,
    edition: Edition = "INDIA",
    country?: string | null,
): string {
    const trimmed = typed.trim();
    if (payByBankCode(edition)) {
        const check = globalCheck(field, country);
        if (check) {
            if (trimmed === "") return "";
            const result = check(trimmed);
            return "value" in result
                ? result.value
                : trimmed.replace(/[\s-]/g, "").toUpperCase();
        }
    }
    switch (field) {
        case "upiId":
            return trimmed.toLowerCase();
        case "bankAccountNumber":
            return trimmed.replace(/[\s-]/g, "");
        case "bankIfsc":
            return trimmed.replace(/\s/g, "").toUpperCase();
        default:
            return trimmed;
    }
}

/** A Global business's check for a bank field, by its country, or null. */
function globalCheck(field: PayField, country: string | null | undefined) {
    if (field === "bankAccountNumber")
        return (t: string) => checkBankAccount(country, t);
    if (field === "bankIfsc") return (t: string) => checkBankCode(country, t);
    if (field === "bankSwift") return checkSwift;
    return null;
}

/** What is wrong with one typed value on its own, or null. */
export function payFieldProblem(
    field: PayField,
    typed: string,
    edition: Edition = "INDIA",
    country?: string | null,
): string | null {
    const value = payStored(field, typed, edition, country);
    if (value === "") return null;
    if (payByBankCode(edition)) {
        if (field === "upiId") return "UPI only works for a business in India.";
        const check = globalCheck(field, country);
        if (check) {
            const result = check(typed.trim());
            return "problem" in result ? result.problem : null;
        }
    }
    switch (field) {
        case "upiId":
            return UPI_ID.test(value)
                ? null
                : `That isn't a UPI ID. It looks like ${UPI_EXAMPLE}.`;
        case "bankAccountNumber":
            if (!/^\d+$/.test(value))
                return "An account number is digits only.";
            return ACCOUNT_NUMBER.test(value)
                ? null
                : "An account number is 9 to 18 digits.";
        case "bankIfsc":
            return IFSC.test(value)
                ? null
                : `An IFSC is 11 characters: 4 letters, a 0, then 6 letters or digits, like ${IFSC_EXAMPLE}.`;
        // India's bank details have no SWIFT/BIC field.
        case "bankSwift":
            return null;
        case "bankAccountName":
            return value.length > MAX_ACCOUNT_NAME
                ? `Keep the account name to ${MAX_ACCOUNT_NAME} characters.`
                : null;
        case "bankName":
            return value.length > MAX_BANK_NAME
                ? `Keep the bank's name to ${MAX_BANK_NAME} characters.`
                : null;
        case "note":
            return value.length > MAX_PAY_NOTE
                ? `Keep the note to ${MAX_PAY_NOTE} characters.`
                : null;
    }
}

/**
 * Bank details go together: a number without the IFSC or the name on the
 * account can't be paid into. The first missing part and why, or null.
 */
export function bankProblem(
    v: PayValues,
    edition: Edition = "INDIA",
    country?: string | null,
): { field: PayField; message: string } | null {
    const has = (f: PayField) => payStored(f, v[f], edition, country) !== "";
    const global = payByBankCode(edition);
    const format = bankFormatFor(country);
    const any =
        has("bankAccountName") ||
        has("bankAccountNumber") ||
        has("bankIfsc") ||
        has("bankName");
    if (!any) return null;
    if (!has("bankAccountName")) {
        return {
            field: "bankAccountName",
            message: "Add the name on the account, so a transfer reaches you.",
        };
    }
    if (!has("bankAccountNumber")) {
        return {
            field: "bankAccountNumber",
            message: global
                ? format.accountMissing
                : "Add the account number, or clear the bank details.",
        };
    }
    if (global) {
        return format.codeMissing && !has("bankIfsc")
            ? { field: "bankIfsc", message: format.codeMissing }
            : null;
    }
    if (!has("bankIfsc")) {
        return {
            field: "bankIfsc",
            message:
                "Add the IFSC: a transfer needs it with the account number.",
        };
    }
    return null;
}

/** The form's schema: each field's shape, then the bank details whole. */
export function payInstructionsSchemaOf(
    edition: Edition = "INDIA",
    country?: string | null,
) {
    const field = (name: PayField) =>
        z.string().superRefine((value, ctx) => {
            const problem = payFieldProblem(name, value, edition, country);
            if (problem) ctx.addIssue({ code: "custom", message: problem });
        });
    return z
        .object({
            upiId: field("upiId"),
            bankAccountName: field("bankAccountName"),
            bankAccountNumber: field("bankAccountNumber"),
            bankIfsc: field("bankIfsc"),
            bankSwift: field("bankSwift"),
            bankName: field("bankName"),
            note: field("note"),
        })
        .superRefine((v, ctx) => {
            const problem = bankProblem(v, edition, country);
            if (problem) {
                ctx.addIssue({
                    code: "custom",
                    path: [problem.field],
                    message: problem.message,
                });
            }
        });
}

export const payInstructionsSchema = payInstructionsSchemaOf();

/** Enough bank details to pay into: a Global business's code only where its country has one. */
export function payBankSet(
    pay: PayInstructionsSettings | null | undefined,
): boolean {
    return !!(
        pay?.bankAccountNumber &&
        (!!pay.bankIfsc ||
            (payByBankCode(pay.edition) && !bankFormatFor(pay.country).code))
    );
}

/** The form's starting values from the settings read (absent: none). */
export function payValuesOf(
    saved: PayInstructionsSettings | null | undefined,
): PayValues {
    return {
        // A Global business has no such field, whatever an older save left.
        upiId: payByBankCode(saved?.edition) ? "" : (saved?.upiId ?? ""),
        bankAccountName: saved?.bankAccountName ?? "",
        bankAccountNumber: saved?.bankAccountNumber ?? "",
        bankIfsc: saved?.bankIfsc ?? "",
        bankSwift: saved?.bankSwift ?? "",
        bankName: saved?.bankName ?? "",
        note: saved?.note ?? "",
    };
}

/**
 * What Save sends: only the fields that differ from what is saved, as
 * typed ("" clears one). The API trims and normalises again.
 */
export function payInputOf(
    values: PayValues,
    saved: PayInstructionsSettings | null | undefined,
): Partial<PayValues> {
    const edition = saved?.edition;
    const country = saved?.country;
    const before = payValuesOf(saved);
    const input: Partial<PayValues> = {};
    for (const f of PAY_FIELDS) {
        if (
            payStored(f, values[f], edition, country) !==
            payStored(f, before[f], edition, country)
        ) {
            input[f] = values[f].trim();
        }
    }
    return input;
}

/**
 * What the customer's card would show for these values — as the API would
 * store them, a field that isn't valid yet left out — for the live preview.
 */
export function payPreviewOf(
    values: PayValues,
    edition: Edition = "INDIA",
    country?: string | null,
): PayInstructionsSettings {
    const clean = (f: PayField) => {
        const v = payStored(f, values[f], edition, country);
        return v !== "" && !payFieldProblem(f, values[f], edition, country)
            ? v
            : null;
    };
    return {
        upiId: clean("upiId"),
        bankAccountName: clean("bankAccountName"),
        bankAccountNumber: clean("bankAccountNumber"),
        bankIfsc: clean("bankIfsc"),
        bankName: clean("bankName"),
        note: clean("note"),
        ...(payByBankCode(edition)
            ? {
                  edition,
                  bankSwift: clean("bankSwift"),
                  country: country ?? null,
                  bankLabels: bankLabelsFor(country),
              }
            : {}),
    };
}

/** What a Global business's bank calls each number, by its country. */
export function bankLabelsFor(country: string | null | undefined) {
    const { account, code } = bankFormatFor(country);
    return { account, code, swift: SWIFT_LABEL };
}

/** "1234 5678 9012", for reading back an account number or IBAN. */
export function accountLabel(stored: string | null | undefined): string {
    return stored ? stored.replace(/([0-9A-Z]{4})(?=[0-9A-Z])/g, "$1 ") : "";
}

/** Which ways a customer can pay, in a line, for the card's summary. */
export function payWaysSummary(
    saved: PayInstructionsSettings | null | undefined,
): string {
    const upi = !!saved?.upiId && !payByBankCode(saved.edition);
    const bank = payBankSet(saved);
    if (upi && bank) return "UPI and bank transfer";
    if (upi) return "UPI";
    if (bank) return "Bank transfer";
    if (saved?.note) return "A note only";
    return "";
}
