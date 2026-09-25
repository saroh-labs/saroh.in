import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    ValidateIf,
} from "class-validator";

/** The longest name a collection can have — it is a card title and a chip. */
export const COLLECTION_NAME_MAX = 60;
/** The most products one request can pick, and a hand-picked one can hold. */
export const COLLECTION_PRODUCTS_MAX = 500;

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** A blank description is no description. */
const blankToNull = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
};

export class CreateCollectionDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "A collection needs a name." })
    @MaxLength(COLLECTION_NAME_MAX, {
        message: `Keep it under ${COLLECTION_NAME_MAX} characters.`,
    })
    name!: string;

    @IsOptional()
    @Transform(blankToNull)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(600)
    description?: string | null;

    /** Set: automatic — it fills itself from this category. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    categoryId?: string;

    /** Hand-picked only: its first products, in order. */
    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(COLLECTION_PRODUCTS_MAX)
    @IsString({ each: true })
    productIds?: string[];
}

export class UpdateCollectionDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "A collection needs a name." })
    @MaxLength(COLLECTION_NAME_MAX, {
        message: `Keep it under ${COLLECTION_NAME_MAX} characters.`,
    })
    name?: string;

    @IsOptional()
    @Transform(blankToNull)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(600)
    description?: string | null;

    /** Automatic only: the category it fills itself from. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    categoryId?: string;
}

/** Products to add to, or the whole ordered list of, a hand-picked one. */
export class CollectionProductsDto {
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(COLLECTION_PRODUCTS_MAX)
    @IsString({ each: true })
    productIds!: string[];
}

/** The hand-picked collections one product is in (the product page's sheet). */
export class ProductCollectionsDto {
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(200)
    @IsString({ each: true })
    collectionIds!: string[];
}
