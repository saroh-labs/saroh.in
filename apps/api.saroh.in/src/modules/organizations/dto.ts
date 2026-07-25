import { Transform, Type } from "class-transformer";
import {
    IsEmail,
    IsIn,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
    MinLength,
    ValidateNested,
} from "class-validator";

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

    @IsOptional()
    @Transform(trimLower)
    @IsEmail({}, { message: "A valid contact email is required" })
    contactEmail?: string;

    @IsOptional()
    @Transform(trim)
    @IsUrl({}, { message: "A valid website URL is required" })
    website?: string;
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
}
