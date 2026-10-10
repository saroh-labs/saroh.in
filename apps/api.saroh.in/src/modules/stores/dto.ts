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

    /**
     * The location's own logo (DEC-120): an image the business uploaded to
     * its library, or `null` to use the business logo. Left out, the logo
     * stays as it is.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "logoMediaId is required" })
    @MaxLength(64)
    logoMediaId?: string | null;

    /**
     * The logo as a typed address, from before it could be uploaded. Kept
     * for an older app that sends it with every save: repeating what is
     * stored changes nothing, an empty one takes off a logo that was an
     * address, and a new address is refused (`location-logo.ts`).
     */
    @IsOptional()
    @Transform(trim)
    @ValidateIf((o: UpdateStoreDto) => o.logo != null && o.logo !== "")
    @IsUrl({}, { message: "Logo must be a valid URL" })
    logo?: string | null;
}
