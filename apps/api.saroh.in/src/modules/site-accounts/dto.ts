import { Transform } from "class-transformer";
import {
    IsEmail,
    IsIn,
    IsISO8601,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from "class-validator";

import type { AccountBookPay, BookingLocationType } from "../bookings/dto";
import {
    ACCOUNT_BOOK_PAY,
    BOOKING_LOCATION_TYPES,
    INTAKE_NOTE_MESSAGE,
    MAX_INTAKE_NOTE,
} from "../bookings/dto";

/**
 * The two bodies site sign-in takes (round-2 plan A, A2). Email is the only
 * channel this round (ADR-011 §6), and the business comes from the relayed
 * host: with the global pipe's `forbidNonWhitelisted`, a body carrying a
 * `phone`, a `channel`, a `host`, an `organizationId` or anything else is a
 * 400, so nothing can half-enable a phone path or pick a business.
 */
const lowerTrim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

export class RequestCodeDto {
    @Transform(lowerTrim)
    @IsEmail()
    @MaxLength(254)
    email!: string;

    /** The bot challenge's token, when the site was asked for one. */
    @IsOptional()
    @IsString()
    @MaxLength(2_048)
    challenge?: string;
}

export class VerifyCodeDto {
    @Transform(lowerTrim)
    @IsEmail()
    @MaxLength(254)
    email!: string;

    @Transform(trim)
    @IsString()
    @Matches(/^\d{6}$/, { message: "Enter the 6-digit code from the email" })
    code!: string;
}

/**
 * A booking a signed-in customer makes on the business's booking page (A9).
 *
 * There is no email and no phone: the booker is the account's (its verified
 * email, its contact's name and phone), and the business is the one the
 * relayed host resolves to. `bookerName` is only a name for a contact that
 * has none yet. The rest is the booking page's own request, as the anonymous
 * route takes it (`BookServiceDto`); the price is always the service's.
 */
export class AccountBookDto {
    @IsString()
    @MaxLength(64)
    serviceId!: string;

    @IsISO8601()
    startAt!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(128)
    bookerName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    staffId?: string;

    /**
     * NOW, DEPOSIT (E8), DESK, or CREDIT (A10): one class from the pack or
     * membership the credit read offered, named below. The amount is always
     * the server's.
     */
    @IsOptional()
    @IsIn(ACCOUNT_BOOK_PAY)
    pay?: AccountBookPay;

    /** Paying with CREDIT from a pack: the purchase the page was offered. */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    packPurchaseId?: string;

    /** Paying with CREDIT from a membership: the one the page was offered. */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    subscriptionId?: string;

    @IsOptional()
    @IsIn(BOOKING_LOCATION_TYPES, {
        message: "Where has to be in person or online.",
    })
    locationType?: BookingLocationType;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(MAX_INTAKE_NOTE, { message: INTAKE_NOTE_MESSAGE })
    intakeNote?: string;
}

/** The credit read (A10): what a customer could pay a class with, and when. */
export class AccountCreditQueryDto {
    @IsString()
    @MaxLength(64)
    serviceId!: string;

    @IsISO8601()
    startAt!: string;
}
