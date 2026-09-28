import { Transform, Type } from "class-transformer";
import {
    IsEmail,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from "class-validator";

import { SEARCH_LIMIT_MAX } from "./contact-search";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const lowerTrim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Edit a Contact (S3-005; C8). Every field is optional; an omitted field is
 * left untouched (a sparse patch), and "" clears a text field.
 *
 * `email` is unique per business, so another contact's address is refused
 * with a 409 naming them. Changing it clears the contact's verified stamp
 * (DEC-049) and never touches a site account's sign-in email. The address
 * fields are checked as a whole by `contact-address.ts`.
 */
export class UpdateContactDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    firstName?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    lastName?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(40)
    phone?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(160)
    company?: string;

    @IsOptional()
    @Transform(lowerTrim)
    @IsEmail({}, { message: "That doesn't look like an email address." })
    @MaxLength(200)
    email?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    addressLine1?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    addressLine2?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(60)
    city?: string;

    /** In India, a GST state's code ("29") or name ("Karnataka"). */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(60)
    state?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(12)
    postalCode?: string;

    /** ISO 3166-1 alpha-2, e.g. "IN"; "" clears it. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2, { message: "Pick a country from the list." })
    country?: string;
}

/**
 * Add someone to the CRM by hand (#384) — met at the counter, called on the
 * phone. `email` is required because it is the `(organizationId, email)`
 * identity every later enquiry, lead and order is matched on; the rest is
 * whatever the merchant knows.
 */
export class CreateContactDto {
    @Transform(lowerTrim)
    @IsEmail()
    @MaxLength(200)
    email!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    firstName?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    lastName?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(40)
    phone?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(160)
    company?: string;
}

/**
 * Find a customer by name or phone (E4): `?q=` as typed, `?limit=` at most
 * {@link SEARCH_LIMIT_MAX}. The query arrives as text, so `limit` converts
 * explicitly.
 */
export class SearchContactsQueryDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(200)
    q?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(SEARCH_LIMIT_MAX)
    limit?: number;
}
