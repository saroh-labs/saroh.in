import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const lowerTrim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Edit a Contact's human attributes (S3-005). The `email` dedupe key is
 * deliberately NOT editable here — it is the `(organizationId, email)` identity
 * a repeat enquiry keys on — so only the descriptive fields may change. Every
 * field is optional; an omitted field is left untouched (a sparse patch).
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
