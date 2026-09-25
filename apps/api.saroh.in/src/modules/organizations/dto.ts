import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsEmail,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUrl,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
    ValidateNested,
} from "class-validator";

import {
    MAX_COUNTER_DIGITS,
    MIN_COUNTER_DIGITS,
    NUMBER_PARTS,
    NUMBER_RESTARTS,
    NUMBER_SEPARATORS,
} from "../invoices/numbering";

/** Recognized business-profile types. Free-form-ish but constrained for hygiene. */
export const BUSINESS_TYPES = ["individual", "company"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const trimLower = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Optional business identity supplied at onboarding (S1-004). Every field is
 * optional — an org can onboard with a name alone and complete this later.
 */
export class BusinessProfileDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(200)
    legalName?: string;

    @IsOptional()
    @Transform(trimLower)
    @IsString()
    @IsIn(BUSINESS_TYPES, { message: "Unknown business type" })
    type?: BusinessType;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2, { message: "Country must be an ISO 3166-1 alpha-2 code" })
    country?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    taxId?: string;

    // "" clears it, as the settings form clears any field; `@IsOptional`
    // lets only null and undefined through, so it was refused as invalid.
    @ValidateIf((_o, v: unknown) => v != null && v !== "")
    @Transform(trimLower)
    @IsEmail({}, { message: "A valid contact email is required" })
    contactEmail?: string;

    @ValidateIf((_o, v: unknown) => v != null && v !== "")
    @Transform(trim)
    @IsUrl({}, { message: "A valid website URL is required" })
    website?: string;

    /**
     * IANA zone the business keeps time in, e.g. "Asia/Kolkata". New
     * subscriptions renew on its midnight (ADR-007). Checked against the tz
     * database in the service.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    timezone?: string;
}

/**
 * Payload for `POST /organizations` (S1-004). Carries only the business
 * identity — never the owner. Ownership is derived from the authenticated
 * caller, so this DTO deliberately has no `userId`/`ownerId`/`role` field.
 */
export class OnboardOrganizationDto {
    /** Human display name for the organization; also seeds the slug. */
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "An organization name is required" })
    @MaxLength(120)
    name!: string;

    /** Optional nested business profile (legal/tax/contact details). */
    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessProfileDto)
    profile?: BusinessProfileDto;

    /**
     * The business's address on Saroh — the `<address>.saroh.app` its website
     * will live at — chosen at setup. Optional: absent, it is derived from
     * the name, as it always was. Its shape, the reserved words and whether
     * it is free are checked by the service (`site-address.ts`), where the
     * answer can name the field and say why.
     */
    @IsOptional()
    @Transform(trimLower)
    @IsString()
    @MaxLength(63)
    address?: string;
}

const DIGITS_MESSAGE = `The counter is ${MIN_COUNTER_DIGITS} to ${MAX_COUNTER_DIGITS} digits.`;

/**
 * How the business's invoice numbers are built (`numbering.ts`,
 * NumberFormat), sent whole. Its shape is checked here; whether it suits the
 * business — unique across years, within 16 characters, a restart GST
 * allows — by the service, which names the field.
 */
export class InvoiceNumberFormatDto {
    /**
     * The parts before the counter, in order: PREFIX, FY ("26-27"),
     * FY_SHORT ("26"), YEAR, MONTH.
     */
    @IsArray()
    @ArrayUnique({ message: "Each part can be in the number once." })
    @ArrayMaxSize(NUMBER_PARTS.length)
    @IsIn(NUMBER_PARTS, {
        each: true,
        message: "That is not a part a number can carry.",
    })
    parts!: string[];

    @IsIn(NUMBER_SEPARATORS, {
        message: 'The separator is "/", "-" or no separator ("").',
    })
    separator!: string;

    @IsInt({ message: DIGITS_MESSAGE })
    @Min(MIN_COUNTER_DIGITS, { message: DIGITS_MESSAGE })
    @Max(MAX_COUNTER_DIGITS, { message: DIGITS_MESSAGE })
    digits!: number;

    /** FY: every financial year; MONTH: every month; NEVER: one counter. */
    @IsIn(NUMBER_RESTARTS, {
        message: "Numbers restart every financial year, every month or never.",
    })
    restart!: string;
}

/**
 * The business's GST settings (ADR-008). Owner/Admin, like the rest of the
 * profile (`org:update`). The GSTIN is the profile's `taxId`; switching
 * registration on checks it (shape, state, check character) against the
 * state. "" clears a text field.
 */
export class TaxSettingsDto {
    @IsOptional()
    @IsBoolean()
    registered?: boolean;

    /** A GST state code ("29") or its name ("Karnataka"). */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(60)
    state?: string;

    /** One to three capitals or digits: RC → RC/26-27/0001. */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim() : value,
    )
    @IsString()
    @MaxLength(10)
    invoicePrefix?: string;

    /** The GST rate on delivery, in percent. */
    @IsOptional()
    @Transform(trim)
    @Matches(/^\d{1,2}(\.\d{1,2})?$/, { message: "A GST rate like 5 or 18" })
    deliveryRate?: string;

    /** The SAC code delivery is billed under; "" clears it. */
    @IsOptional()
    @Transform(trim)
    @Matches(/^(\d{4,8})?$/, { message: "A SAC code is 4 to 8 digits" })
    deliverySac?: string;

    /** How invoice numbers are built; absent, unchanged. */
    @IsOptional()
    @ValidateNested()
    @Type(() => InvoiceNumberFormatDto)
    invoiceNumber?: InvoiceNumberFormatDto;
}

/**
 * The business's registered address (CGST rule 46: a tax invoice names the
 * supplier's address). Its state is the GST state (`tax.state`), so the two
 * can never disagree. "" clears a line. The service checks the PIN (six
 * digits, India) and refuses a GST-registered business without an address.
 */
export class RegisteredAddressDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    line1?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    line2?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(60)
    city?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(12)
    postalCode?: string;
}

/**
 * Payload for `PATCH /organizations/:organizationId`. Both fields are optional
 * so a caller can rename the org, edit the business profile, or both.
 *
 * Deliberately absent: `slug`. It is the org's stable public identifier (unique
 * index, and it is embedded in published site content), so renaming the org does
 * NOT re-slug it. The global ValidationPipe runs with `forbidNonWhitelisted`, so
 * a client that tries to send one gets an explicit 400 rather than a silent
 * no-op. Also absent: anything about ownership or membership — those move only
 * through the membership endpoints.
 */
export class UpdateOrganizationDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "An organization name is required" })
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessProfileDto)
    profile?: BusinessProfileDto;

    /** GST (ADR-008): registration, state, invoice prefix, delivery rate. */
    @IsOptional()
    @ValidateNested()
    @Type(() => TaxSettingsDto)
    tax?: TaxSettingsDto;

    /** The registered address, printed on invoices (ADR-008). */
    @IsOptional()
    @ValidateNested()
    @Type(() => RegisteredAddressDto)
    registeredAddress?: RegisteredAddressDto;
}

/**
 * Set the business logo to an image the business uploaded to its library
 * (`POST /organizations/:id/media/upload-url`, then `/complete`).
 */
export class SetLogoDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "mediaId is required" })
    @MaxLength(64)
    mediaId!: string;
}
