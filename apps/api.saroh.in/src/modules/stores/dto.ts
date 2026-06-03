import { Transform } from "class-transformer";
import {
    IsOptional,
    IsString,
    IsUrl,
    Matches,
    MaxLength,
    MinLength,
    ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const SLUG_RE = /^[a-z0-9-]+$/;
const SLUG_MSG =
    "Slug may only contain lowercase letters, numbers, and hyphens";

export class CreateStoreDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Name is required" })
    @MaxLength(100)
    name!: string;

    // Optional: derived from the name when omitted.
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    @Matches(SLUG_RE, { message: SLUG_MSG })
    slug?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    description?: string;
}

export class UpdateStoreDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Name is required" })
    @MaxLength(100)
    name!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    @Matches(SLUG_RE, { message: SLUG_MSG })
    slug!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    description?: string | null;

    // Allow a valid URL or the empty string (cleared logo).
    @IsOptional()
    @Transform(trim)
    @ValidateIf((o: UpdateStoreDto) => o.logo != null && o.logo !== "")
    @IsUrl({}, { message: "Logo must be a valid URL" })
    logo?: string | null;
}
