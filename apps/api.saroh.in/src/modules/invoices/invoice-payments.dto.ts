import { Transform } from "class-transformer";
import {
    IsIn,
    IsISO8601,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from "class-validator";

import type { PaymentMethod } from "./invoice-state";
import { PAYMENT_METHODS } from "./invoice-state";

/** Trimmed, and a blank answer is no answer. */
const trimOrOmit = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
};

/**
 * An amount as money travels (`backend-data-and-money.md`): whole rupees
 * and at most two decimals, never negative. "0" passes here and is refused
 * by the ledger, which says so in words.
 */
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;

/**
 * A payment recorded by hand on an invoice's ledger (DEC-173, #1114):
 * cash, UPI, a bank transfer, a card, other, or a cheque (with its number
 * and bank, recorded as received and waiting for the bank). ONLINE is the
 * webhook's alone.
 */
export class RecordPaymentDto {
    @IsIn(PAYMENT_METHODS, { message: "Pick how it was paid." })
    method!: PaymentMethod;

    /**
     * How much came in, as a Decimal string ("1000" or "1000.50"). Left
     * out, it is everything left to pay. More than is left is a 422.
     */
    @IsOptional()
    @Transform(trimOrOmit)
    @Matches(AMOUNT, { message: "An amount has at most two decimal places" })
    amount?: string;

    @IsOptional()
    @Transform(trimOrOmit)
    @IsString()
    @MaxLength(120)
    reference?: string;

    @IsOptional()
    @Transform(trimOrOmit)
    @IsString()
    @MaxLength(500)
    note?: string;

    /** When the money came in (ISO); defaults to now. */
    @IsOptional()
    @IsISO8601()
    receivedAt?: string;

    /** The name before the ledger (`receivedAt`); still read when sent. */
    @IsOptional()
    @IsISO8601()
    paidAt?: string;

    /** A cheque only: its number. */
    @IsOptional()
    @Transform(trimOrOmit)
    @IsString()
    @MaxLength(40)
    chequeNumber?: string;

    /** A cheque only: the bank it is drawn on. */
    @IsOptional()
    @Transform(trimOrOmit)
    @IsString()
    @MaxLength(120)
    chequeBank?: string;

    /**
     * One key per opening of the Record payment sheet (#6 review): a retry
     * with it answers with the payment already written (`replayed`), never
     * a second. Left out, every record is a payment of its own.
     */
    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z0-9_-]{8,80}$/, {
        message: "That request key isn't one Saroh made.",
    })
    idempotencyKey?: string;
}

/** Remove a payment recorded by mistake (soft; it stays in the history). */
export class RemovePaymentDto {
    /** Why; "Recorded by mistake" when none is given. */
    @IsOptional()
    @Transform(trimOrOmit)
    @IsString()
    @MaxLength(500)
    reason?: string;
}

/** A cheque marked as in the bank. */
export class ChequeClearedDto {
    /** When it cleared (ISO); defaults to now. */
    @IsOptional()
    @IsISO8601()
    clearedAt?: string;
}

/** A cheque marked as bounced: what it paid is owed again, no charge. */
export class ChequeBouncedDto {
    /** When it bounced (ISO); defaults to now. */
    @IsOptional()
    @IsISO8601()
    bouncedAt?: string;

    @IsOptional()
    @Transform(trimOrOmit)
    @IsString()
    @MaxLength(500)
    reason?: string;
}
