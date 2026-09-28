import { Transform } from "class-transformer";
import {
    IsEmail,
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";

/**
 * What New order v2 (plan B, B13) sends beside the lines: who it is for,
 * when not a storefront customer id, and how it is paid. Each is optional,
 * so an app from before B13 (a `customerId` and nothing else) is served as
 * it always was.
 */

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const t = value.trim();
    return t === "" ? null : t;
};
const lower = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/** A number as people write one: digits, spaces, +, -, ( and ). */
const PHONE_RE = /^\+?[\d\s()-]{5,20}$/;
const PHONE_MSG = "That doesn't look like a phone number.";

/**
 * Someone served at the counter who leaves no email (B13): a name, and a
 * phone if they gave one. No customer and no contact is made from them.
 */
export class WalkInInput {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Add the walk-in's name." })
    @MaxLength(120, { message: "Keep the name to 120 characters." })
    name!: string;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @Matches(PHONE_RE, { message: PHONE_MSG })
    phone?: string | null;
}

/**
 * Someone new, by email: the storefront's customer is found by it or made
 * with it, and a contact is linked once the order is paid (C2).
 */
export class NewOrderCustomerInput {
    @Transform(lower)
    @IsEmail({}, { message: "Add a real email address." })
    @MaxLength(254)
    email!: string;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(120)
    name?: string | null;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @Matches(PHONE_RE, { message: PHONE_MSG })
    phone?: string | null;
}

/**
 * How a New order is paid (B13). Cash, UPI and a card at the counter are
 * paid now and written down (no provider charges them); Later leaves it
 * unpaid to be settled at the counter; Link leaves it unpaid and makes the
 * order's pay link (B11), handed back once.
 */
export const NEW_ORDER_PAYMENTS = [
    "CASH",
    "UPI",
    "CARD",
    "LATER",
    "LINK",
] as const;
export type NewOrderPayment = (typeof NEW_ORDER_PAYMENTS)[number];

/** The payments that are taken at the counter, now. */
export const COUNTER_PAYMENTS = ["CASH", "UPI", "CARD"] as const;
export type CounterPayment = (typeof COUNTER_PAYMENTS)[number];

export class NewOrderPaymentInput {
    @IsIn(NEW_ORDER_PAYMENTS, { message: "Pick how it is paid." })
    kind!: NewOrderPayment;

    /**
     * Cash only: what was handed over. The change is worked out on the
     * screen; this is kept on the order's timeline step.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(/^\d+(\.\d{1,2})?$/, {
        message: "Cash given must be an amount, like 500 or 499.50.",
    })
    received?: string;
}
