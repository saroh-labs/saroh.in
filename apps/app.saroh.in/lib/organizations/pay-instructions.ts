import { z } from "zod";

/**
 * "How to pay us" (R32): the UPI ID, bank details and note a business's
 * customers see on their own unpaid invoices, orders and desk bookings.
 * The API is the judge (`organizations/business-pay-instructions.ts`
 * there); this says the same rules on each field as the merchant types, so
 * Save isn't the first to know. Pure.
 */

/** The settings read's `payInstructions`: every field, null until set. */
export interface PayInstructionsSettings {
    upiId: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankIfsc: string | null;
    bankName: string | null;
    note: string | null;
}

export type PayField = keyof PayInstructionsSettings;

export const PAY_FIELDS: readonly PayField[] = [
    "upiId",
    "bankAccountName",
    "bankAccountNumber",
    "bankIfsc",
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
export function payStored(field: PayField, typed: string): string {
    const trimmed = typed.trim();
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

/** What is wrong with one typed value on its own, or null. */
export function payFieldProblem(field: PayField, typed: string): string | null {
    const value = payStored(field, typed);
    if (value === "") return null;
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
): { field: PayField; message: string } | null {
    const has = (f: PayField) => payStored(f, v[f]) !== "";
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
            message: "Add the account number, or clear the bank details.",
        };
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

const field = (name: PayField) =>
    z.string().superRefine((value, ctx) => {
        const problem = payFieldProblem(name, value);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
    });

/** The form's schema: each field's shape, then the bank details whole. */
export const payInstructionsSchema = z
    .object({
        upiId: field("upiId"),
        bankAccountName: field("bankAccountName"),
        bankAccountNumber: field("bankAccountNumber"),
        bankIfsc: field("bankIfsc"),
        bankName: field("bankName"),
        note: field("note"),
    })
    .superRefine((v, ctx) => {
        const problem = bankProblem(v);
        if (problem) {
            ctx.addIssue({
                code: "custom",
                path: [problem.field],
                message: problem.message,
            });
        }
    });

/** The form's starting values from the settings read (absent: none). */
export function payValuesOf(
    saved: PayInstructionsSettings | null | undefined,
): PayValues {
    return {
        upiId: saved?.upiId ?? "",
        bankAccountName: saved?.bankAccountName ?? "",
        bankAccountNumber: saved?.bankAccountNumber ?? "",
        bankIfsc: saved?.bankIfsc ?? "",
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
    const before = payValuesOf(saved);
    const input: Partial<PayValues> = {};
    for (const f of PAY_FIELDS) {
        if (payStored(f, values[f]) !== payStored(f, before[f])) {
            input[f] = values[f].trim();
        }
    }
    return input;
}

/**
 * What the customer's card would show for these values — as the API would
 * store them, a field that isn't valid yet left out — for the live preview.
 */
export function payPreviewOf(values: PayValues): PayInstructionsSettings {
    const clean = (f: PayField) => {
        const v = payStored(f, values[f]);
        return v !== "" && !payFieldProblem(f, values[f]) ? v : null;
    };
    return {
        upiId: clean("upiId"),
        bankAccountName: clean("bankAccountName"),
        bankAccountNumber: clean("bankAccountNumber"),
        bankIfsc: clean("bankIfsc"),
        bankName: clean("bankName"),
        note: clean("note"),
    };
}

/** "1234 5678 9012", for reading back an account number. */
export function accountLabel(stored: string | null | undefined): string {
    return stored ? stored.replace(/(\d{4})(?=\d)/g, "$1 ") : "";
}

/** Which ways a customer can pay, in a line, for the card's summary. */
export function payWaysSummary(
    saved: PayInstructionsSettings | null | undefined,
): string {
    const upi = !!saved?.upiId;
    const bank = !!(saved?.bankAccountNumber && saved.bankIfsc);
    if (upi && bank) return "UPI and bank transfer";
    if (upi) return "UPI";
    if (bank) return "Bank transfer";
    if (saved?.note) return "A note only";
    return "";
}
