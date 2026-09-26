import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
    ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const nullableTrim = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const t = value.trim();
    return t === "" ? null : t;
};

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const MONEY_MSG = "Price must be a number with up to 2 decimals";

export class CreateVariantDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Needs a SKU." })
    @MaxLength(100)
    sku!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Needs a title." })
    @MaxLength(150)
    title!: string;

    // Optional per-variant price override (null/absent = inherit the product's).
    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @Matches(MONEY_RE, { message: MONEY_MSG })
    price?: string | null;

    // Optional per-variant MRP (null/absent = inherit the product's).
    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @Matches(MONEY_RE, {
        message: "MRP must be a number with up to 2 decimals",
    })
    mrp?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    image?: string | null;

    /** Its value of the product's option ("M" of Size). */
    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    optionValueId?: string | null;

    /** One of the product's photos, shown when it is picked; null = cover. */
    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    imageId?: string | null;
}

export class UpdateVariantDto extends CreateVariantDto {}

/** The variants in the order customers see them. */
export class ReorderVariantsDto {
    @IsArray()
    @ArrayMaxSize(200)
    @IsString({ each: true })
    ids!: string[];
}
