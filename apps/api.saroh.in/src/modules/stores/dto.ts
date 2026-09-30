import { Transform } from "class-transformer";
import {
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
    MinLength,
    ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

export class CreateStoreDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Name is required" })
    @MaxLength(100)
    name!: string;

    /**
     * Ignored: the storefront "Web address" is gone (DEC-069, L14). Still
     * declared so an older app that sends it isn't refused by
     * `forbidNonWhitelisted`. Remove in L15.
     */
    @IsOptional()
    slug?: unknown;

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

    /**
     * Ignored: the storefront "Web address" is gone (DEC-069, L14). Still
     * declared so an older app that sends it isn't refused by
     * `forbidNonWhitelisted`. Remove in L15.
     */
    @IsOptional()
    slug?: unknown;

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
