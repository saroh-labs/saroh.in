import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { publicPhone } from "./business-phone";

/**
 * "How to pay us" (R32): how a customer pays the business offline — a UPI
 * ID (the customer's page draws a scannable QR from it), bank details for a
 * transfer, and a short note. Every business, on every plan.
 *
 * Read and written with the rest of the business's settings (OWNER/ADMIN:
 * `org:settings:read`, `org:update`). The public sees it only inside its own
 * unpaid invoice, order or booking — the pay link's read, the order pay
 * link's read and a signed-in booking's answer — never through an endpoint
 * that hands a business's bank details to anyone with its slug.
 *
 * These are a business's own payment details, but an account number is
 * still not something to scatter: never logged, and the audit stream names
 * a change without its value (`audit/audit-changes.ts`, NAME_ONLY_FIELDS).
 */

/** "asha.kapoor@okhdfc": a handle, an @, and the bank's PSP handle. */
export const UPI_ID = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/;
/** Four letters (the bank), a 0, six letters or digits (the branch). */
export const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Indian bank account numbers run 9 to 18 digits. */
export const ACCOUNT_NUMBER = /^\d{9,18}$/;

export const MAX_ACCOUNT_NAME = 100;
export const MAX_BANK_NAME = 100;
export const MAX_PAY_NOTE = 280;

/** The six columns, by the name the settings API gives each. */
export const PAY_FIELDS = {
    upiId: "payUpiId",
    bankAccountName: "payBankAccountName",
    bankAccountNumber: "payBankAccountNumber",
    bankIfsc: "payBankIfsc",
    bankName: "payBankName",
    note: "payNote",
} as const;

export type PayField = keyof typeof PAY_FIELDS;
type PayColumn = (typeof PAY_FIELDS)[PayField];

/** What the settings save takes: absent leaves a field, "" clears it. */
export type PayInstructionsInput = Partial<Record<PayField, string>>;

/** The business's pay instructions as stored, every field or null. */
export type PayInstructionsView = Record<PayField, string | null>;

/** The columns a read selects. */
export const PAY_SELECT = {
    payUpiId: true,
    payBankAccountName: true,
    payBankAccountNumber: true,
    payBankIfsc: true,
    payBankName: true,
    payNote: true,
} as const;

export type PayRow = Partial<Record<PayColumn, string | null>>;

const UPI_EXAMPLE = "yourname@okhdfc";

/**
 * One typed value as stored, or why it can't be. Pure: the save names the
 * field. "" (after trimming) is null — cleared.
 */
export function normalisePayField(
    field: PayField,
    raw: string,
): { value: string | null } | { problem: string } {
    const trimmed = raw.trim();
    if (trimmed === "") return { value: null };
    switch (field) {
        case "upiId": {
            const id = trimmed.toLowerCase();
            return UPI_ID.test(id)
                ? { value: id }
                : {
                      problem: `That isn't a UPI ID. It looks like ${UPI_EXAMPLE}.`,
                  };
        }
        case "bankAccountNumber": {
            // Spaces and dashes are how people copy it from a passbook.
            const digits = trimmed.replace(/[\s-]/g, "");
            if (!/^\d+$/.test(digits)) {
                return { problem: "An account number is digits only." };
            }
            return ACCOUNT_NUMBER.test(digits)
                ? { value: digits }
                : { problem: "An account number is 9 to 18 digits." };
        }
        case "bankIfsc": {
            const code = trimmed.replace(/\s/g, "").toUpperCase();
            return IFSC.test(code)
                ? { value: code }
                : {
                      problem:
                          "An IFSC is 11 characters: 4 letters, a 0, then 6 letters or digits, like HDFC0001234.",
                  };
        }
        case "bankAccountName":
            return trimmed.length > MAX_ACCOUNT_NAME
                ? {
                      problem: `Keep the account name to ${MAX_ACCOUNT_NAME} characters.`,
                  }
                : { value: trimmed };
        case "bankName":
            return trimmed.length > MAX_BANK_NAME
                ? {
                      problem: `Keep the bank's name to ${MAX_BANK_NAME} characters.`,
                  }
                : { value: trimmed };
        case "note":
            return trimmed.length > MAX_PAY_NOTE
                ? { problem: `Keep the note to ${MAX_PAY_NOTE} characters.` }
                : { value: trimmed };
    }
}

function refuse(field: PayField, message: string): never {
    throw new BadRequestException({ message, details: { field } });
}

/**
 * The settings save's write: only the fields sent, each checked and made
 * plain, as columns. Bank details go together — a number without the IFSC
 * or the name on the account can't be paid into — so they are judged as
 * they will stand once saved (`current`, the row before this save).
 */
export function payInstructionsWrite(
    input: PayInstructionsInput | undefined,
    current: PayRow | null,
): Partial<Record<PayColumn, string | null>> {
    if (!input) return {};
    const written: Partial<Record<PayColumn, string | null>> = {};
    for (const field of Object.keys(PAY_FIELDS) as PayField[]) {
        const raw = input[field];
        if (raw === undefined) continue;
        if (typeof raw !== "string") refuse(field, "That isn't text.");
        const result = normalisePayField(field, raw);
        if ("problem" in result) refuse(field, result.problem);
        written[PAY_FIELDS[field]] = result.value;
    }
    if (Object.keys(written).length === 0) return {};

    const after = { ...(current ?? {}), ...written };
    const has = (column: PayColumn) => Boolean(after[column]);
    const bank =
        has("payBankAccountNumber") ||
        has("payBankIfsc") ||
        has("payBankAccountName") ||
        has("payBankName");
    if (bank) {
        if (!has("payBankAccountName")) {
            refuse(
                "bankAccountName",
                "Add the name on the account, so a transfer reaches you.",
            );
        }
        if (!has("payBankAccountNumber")) {
            refuse(
                "bankAccountNumber",
                "Add the account number, or clear the bank details.",
            );
        }
        if (!has("payBankIfsc")) {
            refuse(
                "bankIfsc",
                "Add the IFSC: a transfer needs it with the account number.",
            );
        }
    }
    return written;
}

/** Every field as stored, for the business's own settings read. */
export function payInstructionsView(row: PayRow | null): PayInstructionsView {
    return {
        upiId: row?.payUpiId ?? null,
        bankAccountName: row?.payBankAccountName ?? null,
        bankAccountNumber: row?.payBankAccountNumber ?? null,
        bankIfsc: row?.payBankIfsc ?? null,
        bankName: row?.payBankName ?? null,
        note: row?.payNote ?? null,
    };
}

/**
 * What a customer may be shown, or null when there is nothing to show. A
 * stored value is re-checked on the way out rather than trusted (the public
 * phone's rule): a UPI ID that isn't one would draw a QR that pays nobody,
 * and bank details missing a part are left out whole.
 */
export function publicPayInstructions(
    row: PayRow | null | undefined,
): PayInstructionsView | null {
    if (!row) return null;
    const upi = row.payUpiId && UPI_ID.test(row.payUpiId) ? row.payUpiId : null;
    const bankWhole =
        !!row.payBankAccountName &&
        !!row.payBankAccountNumber &&
        ACCOUNT_NUMBER.test(row.payBankAccountNumber) &&
        !!row.payBankIfsc &&
        IFSC.test(row.payBankIfsc);
    const note = row.payNote?.trim() ? row.payNote.trim() : null;
    if (!upi && !bankWhole && !note) return null;
    return {
        upiId: upi,
        bankAccountName: bankWhole ? (row.payBankAccountName ?? null) : null,
        bankAccountNumber: bankWhole
            ? (row.payBankAccountNumber ?? null)
            : null,
        bankIfsc: bankWhole ? (row.payBankIfsc ?? null) : null,
        bankName: bankWhole ? (row.payBankName ?? null) : null,
        note,
    };
}

/**
 * The one read of a business's pay instructions for a customer's own
 * invoice, order or booking (and the invoice email's words). The caller
 * has already resolved the business from that record (never from the
 * request) and runs this inside its RLS context, or on its transaction.
 */
export async function businessPayInstructionsOf(
    organizationId: string,
    db: Pick<Prisma.TransactionClient, "businessProfile"> = prisma,
): Promise<PayInstructionsView | null> {
    const profile = await db.businessProfile.findUnique({
        where: { organizationId },
        select: PAY_SELECT,
    });
    return publicPayInstructions(profile);
}

/**
 * How the invoice email says the customer can pay, from what is set: "by
 * UPI or bank transfer", "by UPI", "by bank transfer", or null when only a
 * note (or nothing) is set. The details themselves stay on the page: a
 * stored message body never carries an account number.
 */
export function payWaysWords(view: PayInstructionsView | null): string | null {
    if (!view) return null;
    const upi = !!view.upiId;
    const bank = !!view.bankAccountNumber;
    if (upi && bank) return "by UPI or bank transfer";
    if (upi) return "by UPI";
    if (bank) return "by bank transfer";
    return null;
}

/** How a customer reaches the business, when it set no way to pay (UX-007). */
export interface BusinessContactView {
    phone: string | null;
    email: string | null;
}

/** A plain address: something, an @, a domain with a dot. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The business's phone and contact email, for a customer's own owed invoice
 * when the business set no How to pay us (UX-007): "Contact them to pay"
 * then names a way to reach them, as the invoice's paper already prints the
 * business's email. Re-checked on the way out (the public phone's rule);
 * null when neither is set. The caller resolved the business from the
 * invoice and runs this inside its RLS context.
 */
export async function businessContactOf(
    organizationId: string,
    db: Pick<Prisma.TransactionClient, "businessProfile"> = prisma,
): Promise<BusinessContactView | null> {
    const profile = await db.businessProfile.findUnique({
        where: { organizationId },
        select: { phone: true, contactEmail: true },
    });
    const phone = publicPhone(profile?.phone);
    const raw = profile?.contactEmail?.trim() ?? "";
    const email = EMAIL_SHAPE.test(raw) ? raw : null;
    return phone || email ? { phone, email } : null;
}
