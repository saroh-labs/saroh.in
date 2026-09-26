import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsObject,
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

export const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const SLUG_RE = /^[a-z0-9-]+$/;
const SLUG_MSG =
    "Slug may only contain lowercase letters, numbers, and hyphens";
// Money is carried as a decimal STRING end-to-end (Prisma serializes Decimal to
// a string) so prices never round-trip through a lossy JS float.
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const MONEY_MSG = "Price must be a number with up to 2 decimals";
const CURRENCY_RE = /^[A-Z]{3}$/;
const MRP_MSG = "MRP must be a number with up to 2 decimals";

export const RETURNS_MODES = ["STOREFRONT", "OWN"] as const;
export type ReturnsMode = (typeof RETURNS_MODES)[number];

/**
 * The customer-facing detail fields, each with its own "on the shop" switch.
 * A closed list: a key outside it is refused rather than stored.
 */
export const SHOP_FIELDS = [
    "howToUse",
    "materials",
    "keyPoints",
    "maker",
    "madeIn",
    "warranty",
    "returns",
] as const;
export type ShopField = (typeof SHOP_FIELDS)[number];

/** Photos and videos a product can carry (#517). */
export const PRODUCT_IMAGE_LIMIT = 15;
export const PRODUCT_VIDEO_LIMIT = 3;
export const PRODUCT_MEDIA_KINDS = ["photo", "video"] as const;
export type ProductMediaKind = (typeof PRODUCT_MEDIA_KINDS)[number];

/** What the merchant reads when a limit is reached. */
export const PHOTO_LIMIT_MESSAGE = `Already ${PRODUCT_IMAGE_LIMIT} photos — take one off first.`;
export const VIDEO_LIMIT_MESSAGE = `Already ${PRODUCT_VIDEO_LIMIT} videos — take one off first.`;

/** Limits the editor shows as counters; the API is the authority. */
export const DETAIL_LIMITS = {
    howToUse: 300,
    materials: 2000,
    keyPoint: 150,
    keyPoints: 8,
    shortText: 150,
    returnsText: 200,
    seoTitle: 70,
    seoDescription: 160,
} as const;

const nullableTrim = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const t = value.trim();
    return t === "" ? null : t;
};

/**
 * Every field a section of the editor can save. Shared by create (which sends
 * Basics, Details and Visibility at once) and PATCH (any subset). Nullable
 * text fields take "" or null to clear.
 */
class ProductSectionFields {
    /** Allergens (#483): ids from the storefront's list; each list replaces its kind. */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    contains?: string[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    mayContain?: string[];

    /** Custom fields (#482): field id → value; "" or null clears it. */
    @IsOptional()
    @IsObject()
    customFields?: Record<string, string | null>;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @Matches(MONEY_RE, { message: MRP_MSG })
    mrp?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(DETAIL_LIMITS.howToUse)
    howToUse?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(DETAIL_LIMITS.materials)
    materials?: string | null;

    // Trimmed and blank lines dropped by the service, which is the one
    // place both the API and direct callers pass through.
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(DETAIL_LIMITS.keyPoints, {
        message: `At most ${DETAIL_LIMITS.keyPoints} key points`,
    })
    @IsString({ each: true })
    @MaxLength(DETAIL_LIMITS.keyPoint, { each: true })
    keyPoints?: string[];

    @IsOptional()
    @IsBoolean()
    madeHere?: boolean;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(DETAIL_LIMITS.shortText)
    maker?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(DETAIL_LIMITS.shortText)
    madeIn?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(DETAIL_LIMITS.shortText)
    supplierCode?: string | null;

    /**
     * GST the price includes, in percent (ADR-008): printed on a registered
     * business's tax invoice. Checked against GST's rates in the service.
     * "" or null clears it.
     */
    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @Matches(/^\d{1,2}(\.\d{1,2})?$/, { message: "A GST rate like 5 or 18" })
    gstRate?: string | null;

    /** HSN code: four to eight digits, spaces allowed as typed on paper. */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => {
        if (typeof value !== "string") return value;
        const t = value.replace(/\s+/g, "");
        return t === "" ? null : t;
    })
    @ValidateIf((_o, v) => v !== null)
    @Matches(/^\d{4,8}$/, { message: "An HSN code is 4 to 8 digits" })
    hsnCode?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(DETAIL_LIMITS.shortText)
    warranty?: string | null;

    @IsOptional()
    @IsIn(RETURNS_MODES, { message: "Unknown returns rule" })
    returnsMode?: ReturnsMode;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(DETAIL_LIMITS.returnsText)
    returnsText?: string | null;

    /** `{ howToUse: true, supplierCode: … }` — checked against SHOP_FIELDS. */
    @IsOptional()
    @IsObject()
    shopFields?: Record<string, unknown>;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(DETAIL_LIMITS.seoTitle)
    seoTitle?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(DETAIL_LIMITS.seoDescription)
    seoDescription?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    seoImageId?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    optionId?: string | null;
}

export class CreateProductDto extends ProductSectionFields {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Name is required" })
    @MaxLength(150)
    name!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(150)
    @Matches(SLUG_RE, { message: SLUG_MSG })
    slug?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(5000)
    description?: string;

    @IsOptional()
    @Transform(trim)
    @ValidateIf((o: CreateProductDto) => o.image != null && o.image !== "")
    @IsString()
    image?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    categoryId?: string;

    @Transform(trim)
    @IsString()
    @Matches(MONEY_RE, { message: MONEY_MSG })
    price!: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @IsString()
    @Matches(CURRENCY_RE, { message: "Currency must be a 3-letter code" })
    currency?: string;

    @IsOptional()
    @IsString()
    @IsIn(PRODUCT_STATUSES, { message: "Unknown status" })
    status?: ProductStatus;
}

export class UpdateProductDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Name is required" })
    @MaxLength(150)
    name!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(150)
    @Matches(SLUG_RE, { message: SLUG_MSG })
    slug!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(5000)
    description?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    image?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    categoryId?: string | null;

    @Transform(trim)
    @IsString()
    @Matches(MONEY_RE, { message: MONEY_MSG })
    price!: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @IsString()
    @Matches(CURRENCY_RE, { message: "Currency must be a 3-letter code" })
    currency?: string;

    @IsOptional()
    @IsString()
    @IsIn(PRODUCT_STATUSES, { message: "Unknown status" })
    status?: ProductStatus;
}

/**
 * One editor section's save: any subset of the product's own fields. Price,
 * name and slug keep their create rules when present; everything absent is
 * left exactly as it was.
 */
export class PatchProductDto extends ProductSectionFields {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Name is required" })
    @MaxLength(150)
    name?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "A product needs an address" })
    @MaxLength(150)
    @Matches(SLUG_RE, { message: SLUG_MSG })
    slug?: string;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(5000, {
        message: "The description is over the 5,000-character limit",
    })
    description?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    categoryId?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(MONEY_RE, { message: MONEY_MSG })
    price?: string;

    @IsOptional()
    @IsString()
    @IsIn(PRODUCT_STATUSES, { message: "Unknown status" })
    status?: ProductStatus;
}

/** One photo in the ordered set. Exactly one of id, mediaId or url. */
export class ProductImageInput {
    /** An existing photo of this product, kept (and possibly moved). */
    @IsOptional()
    @IsString()
    id?: string;

    /** A READY object from the business's library. */
    @IsOptional()
    @IsString()
    mediaId?: string;

    /** An https address (e.g. a licensed library's CDN). */
    @IsOptional()
    @Transform(trim)
    @IsUrl(
        { protocols: ["https"], require_protocol: true },
        { message: "A photo address must start with https://" },
    )
    url?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(250)
    alt?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(20000)
    width?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(20000)
    height?: number;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(120)
    creditName?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsUrl({ protocols: ["https"], require_protocol: true })
    creditUrl?: string | null;

    /**
     * "photo" (the default) or "video". A new video comes from an uploaded
     * MP4 or MOV (mediaId); a kept item keeps the kind it has.
     */
    @IsOptional()
    @IsIn(PRODUCT_MEDIA_KINDS, {
        message: "A media item is a photo or a video",
    })
    kind?: ProductMediaKind;

    /** A video's length in whole seconds, read on the device. */
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt()
    @Min(0)
    @Max(24 * 60 * 60)
    durationSec?: number | null;

    /**
     * A video's poster: a READY image from the library. Never an address —
     * a poster is shown on the shop, so it comes from storage like the video.
     * Null takes the poster off a kept video.
     */
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    posterMediaId?: string | null;
}

/** The whole ordered set; the first photo is the cover. */
export class ReplaceProductImagesDto {
    @IsArray()
    @ArrayMaxSize(PRODUCT_IMAGE_LIMIT + PRODUCT_VIDEO_LIMIT, {
        message: `A product can have ${PRODUCT_IMAGE_LIMIT} photos and ${PRODUCT_VIDEO_LIMIT} videos at most — take one off first.`,
    })
    @ValidateNested({ each: true })
    @Type(() => ProductImageInput)
    images!: ProductImageInput[];
}
