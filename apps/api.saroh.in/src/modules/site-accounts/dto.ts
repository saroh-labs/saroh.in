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

import type { AccountBookPay, BookingLocationType } from "../bookings/dto";
import {
    ACCOUNT_BOOK_PAY,
    BOOKING_LOCATION_TYPES,
    INTAKE_NOTE_MESSAGE,
    MAX_INTAKE_NOTE,
} from "../bookings/dto";
import type { PauseWeeks } from "../subscriptions/dto";
import { PAUSE_WEEKS } from "../subscriptions/dto";
import { MESSAGE_MAX } from "./thread-store";

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

    /**
     * A phone to reach them on (UX-049), optional: kept on the booking, and
     * given to their record only when it has none.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(/^\+?[\d\s()-]{6,24}$/, {
        message: "Check the phone number.",
    })
    bookerPhone?: string;
}

/** The credit read (A10): what a customer could pay a class with, and when. */
export class AccountCreditQueryDto {
    @IsString()
    @MaxLength(64)
    serviceId!: string;

    @IsISO8601()
    startAt!: string;
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

/**
 * A member pausing their plan from their account (A8): 2, 4 or 8 weeks and
 * nothing else. There is no `until`, so a customer's pause always has an
 * end date; "until I resume" stays a staff choice (D8). With the global
 * pipe's `forbidNonWhitelisted`, a body carrying `until` is a 400.
 */
export class AccountPauseDto {
    @IsIn(PAUSE_WEEKS, { message: "Pause for 2, 4 or 8 weeks" })
    weeks!: PauseWeeks;
}

/**
 * A message in the customer's thread (A13), from either side: plain text,
 * trimmed, with control characters other than line breaks and tabs taken
 * out. Never HTML: it is stored as written and drawn as text.
 */
export const threadText = ({ value }: { value: unknown }) =>
    typeof value === "string"
        ? value
              // eslint-disable-next-line no-control-regex
              .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
              .replace(/\r\n?/g, "\n")
              .trim()
        : value;

export class PostMessageDto {
    @Transform(threadText)
    @IsString()
    @MinLength(1, { message: "Write your message" })
    @MaxLength(MESSAGE_MAX, {
        message: `Keep it to ${MESSAGE_MAX.toLocaleString("en-IN")} characters`,
    })
    text!: string;
}

// ---- Bookings (A6) ----------------------------------------------------------

/**
 * A new time for one of the customer's bookings, or for a treatment's next
 * visit. Only the time: the booking, its service and its person are the
 * ones already booked, found by the path and the customer's session.
 */
export class AccountBookingTimeDto {
    @IsISO8601()
    startAt!: string;
}

// ---- The class waitlist (A12) -----------------------------------------------

/** One session of a class: its service and its start. */
export class WaitlistSessionDto {
    @IsString()
    @MaxLength(64)
    serviceId!: string;

    @IsISO8601()
    startAt!: string;
}

/** The customer's places in line for one service's classes. */
export class WaitlistQueryDto {
    @IsString()
    @MaxLength(64)
    serviceId!: string;
}
