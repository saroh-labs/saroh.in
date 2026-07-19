import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

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
