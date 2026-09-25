import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
    ValidateNested,
} from "class-validator";

/** The longest name a category can have — it is a filter chip and a label. */
export const CATEGORY_NAME_MAX = 40;
const NAME_MSG = `Keep it under ${CATEGORY_NAME_MAX} characters.`;

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const SLUG_RE = /^[a-z0-9-]+$/;
const SLUG_MSG =
    "Slug may only contain lowercase letters, numbers, and hyphens";

export class CreateCategoryDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "A category needs a name." })
    @MaxLength(CATEGORY_NAME_MAX, { message: NAME_MSG })
    name!: string;

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
    parentId?: string;
}

export class UpdateCategoryDto {
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

    // Pass null to detach from a parent (move to top level).
    @IsOptional()
    @Transform(trim)
    @IsString()
    parentId?: string | null;
}

/** Rename in place; the address (slug) is kept so nothing linking to it breaks. */
export class RenameCategoryDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "A category needs a name." })
    @MaxLength(CATEGORY_NAME_MAX, { message: NAME_MSG })
    name!: string;
}

/** Merge into another category, or into Uncategorized (null). */
export class MergeCategoryDto {
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    intoId?: string | null;
}

export class CategoryDefaultsInput {
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(300)
    howToUse?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsInt()
    @Min(0)
    lowStockAlert?: number | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsIn(["STOREFRONT", "OWN"])
    returnsMode?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(200)
    returnsText?: string | null;
}

/**
 * Undo of a merge or delete: the category as it was, and the products that
 * moved out of it. Only products still where the change put them move back.
 */
export class RestoreCategoryDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name!: string;

    @Transform(trim)
    @IsString()
    @Matches(SLUG_RE, { message: SLUG_MSG })
    slug!: string;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    parentId?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    movedTo?: string | null;

    @IsArray()
    @ArrayMaxSize(10000)
    @IsString({ each: true })
    productIds!: string[];

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @ValidateNested()
    @Type(() => CategoryDefaultsInput)
    defaults?: CategoryDefaultsInput | null;
    /** Custom fields shown for it; only this store's live ones come back. */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(200)
    @IsString({ each: true })
    fieldIds?: string[];
}
