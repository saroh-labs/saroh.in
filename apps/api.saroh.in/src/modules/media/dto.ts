import { IMAGE_PLACEHOLDER_MAX } from "@saroh/block-contract";
import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

// Logical bucketing within the tenant (e.g. product-image, avatar). The
// object-storage port sanitizes this to `[a-z0-9-]`; we pre-validate the shape.
const PURPOSE_RE = /^[a-z0-9-]+$/;
const PURPOSE_MSG =
    "Purpose may only contain lowercase letters, numbers, and hyphens";

/** One smaller copy the browser made (DEC-246): its width and exact size. */
export class UploadVariantDto {
    @IsInt()
    @Min(1)
    @Max(10_000)
    width!: number;

    @IsInt({ message: "contentLength must be an integer number of bytes" })
    @Min(1, { message: "contentLength must be at least 1 byte" })
    contentLength!: number;
}

/**
 * Request to mint a presigned upload URL. The client tells us what it is about
 * to PUT; the server validates the content-type/size against the storage
 * allowlist + cap (in the port) and derives the storage key — the client never
 * supplies the key.
 */
export class CreateUploadDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "contentType is required" })
    @MaxLength(255)
    contentType!: string;

    // Exact byte length the client will upload; the port caps it before signing.
    @IsInt({ message: "contentLength must be an integer number of bytes" })
    @Min(1, { message: "contentLength must be at least 1 byte" })
    contentLength!: number;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "filename is required" })
    @MaxLength(255)
    filename!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    @Matches(PURPOSE_RE, { message: PURPOSE_MSG })
    purpose?: string;

    /*
     * What the merchant's browser made of a photo (DEC-246): the stored
     * copy's size, its ThumbHash and its smaller copies. All optional: an
     * upload from the API or MCP sends none and is kept as sent. The
     * service checks they agree (`upload-checks.ts`).
     */
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10_000)
    width?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10_000)
    height?: number;

    @IsOptional()
    @IsString()
    @MaxLength(IMAGE_PLACEHOLDER_MAX)
    placeholder?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(3)
    @ValidateNested({ each: true })
    @Type(() => UploadVariantDto)
    variants?: UploadVariantDto[];
}
