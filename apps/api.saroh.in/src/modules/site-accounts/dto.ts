import { Transform } from "class-transformer";
import {
    IsEmail,
    IsIn,
    IsISO8601,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";

import type { BookingLocationType, BookPay } from "../bookings/dto";
import {
    BOOK_PAY,
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

    /** NOW, DEPOSIT (E8) or DESK; the amount is always the server's. */
    @IsOptional()
    @IsIn(BOOK_PAY)
    pay?: BookPay;

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

// ---- The account area (A5) --------------------------------------------------

/**
 * The customer's own details in Me (default 75): a name, and a phone kept as
 * a contact detail, never a way to sign in. An empty phone clears it. The
 * email changes only with a code (`ChangeEmailDto`).
 */
export class UpdateDetailsDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Enter your name" })
    @MaxLength(128)
    name?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(/^(\+?[\d\s-]{7,20})?$/, {
        message: "Enter a phone number, like +91 98765 43210",
    })
    phone?: string;
}

/** Ask for a code at a new sign-in email. */
export class ChangeEmailCodeDto {
    @Transform(lowerTrim)
    @IsEmail()
    @MaxLength(254)
    email!: string;

    /** The bot challenge's token, when the sheet was asked for one. */
    @IsOptional()
    @IsString()
    @MaxLength(2_048)
    challenge?: string;
}

/** Change the sign-in email with the code sent to the new one. */
export class ChangeEmailDto extends VerifyCodeDto {}

/** A health note the customer sends to the team (default 12). */
export class AddNoteDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Write your note" })
    @MaxLength(500, { message: "Keep it to 500 characters" })
    text!: string;
}
