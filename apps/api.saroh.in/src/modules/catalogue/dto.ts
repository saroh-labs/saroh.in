import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
    ValidateNested,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const nullableTrim = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const t = value.trim();
    return t === "" ? null : t;
};

export const OPTION_NAME_MAX = 40;
export const OPTION_VALUE_MAX = 40;

export class CreateOptionDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "An option needs a name." })
    @MaxLength(OPTION_NAME_MAX, {
        message: `Keep it under ${OPTION_NAME_MAX} characters.`,
    })
    name!: string;

    /** Values to start with — Undo of a delete sends them back. */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    @MaxLength(OPTION_VALUE_MAX, { each: true })
    values?: string[];
}

export class RenameOptionDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "An option needs a name." })
    @MaxLength(OPTION_NAME_MAX, {
        message: `Keep it under ${OPTION_NAME_MAX} characters.`,
    })
    name!: string;
}

export class AddOptionValueDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "A value can't be empty." })
    @MaxLength(OPTION_VALUE_MAX, {
        message: `Keep it under ${OPTION_VALUE_MAX} characters.`,
    })
    value!: string;
}

export const DEFAULT_KEYS_MAX = 500;

export class DefaultsEntryInput {
    /** "all" for All products, or a category id. */
    @IsString()
    key!: string;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(300)
    howToUse?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Type(() => Number)
    @IsInt({ message: "Warn at must be a whole number, zero or more." })
    @Min(0, { message: "Warn at must be a whole number, zero or more." })
    lowStockAlert?: number | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsIn(["STOREFRONT", "OWN"], { message: "Unknown returns rule" })
    returnsMode?: string | null;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(200)
    returnsText?: string | null;
}

export class SaveDefaultsDto {
    /** Every entry given replaces that key's row; keys left out are kept. */
    @IsArray()
    @ArrayMaxSize(DEFAULT_KEYS_MAX)
    @ValidateNested({ each: true })
    @Type(() => DefaultsEntryInput)
    entries!: DefaultsEntryInput[];

    /** Also update saved products still holding the old default. */
    @IsOptional()
    @IsBoolean()
    updateExisting?: boolean;
}

export class ProductDefaultsSnapshot {
    @IsString()
    id!: string;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    howToUse?: string | null;

    @IsString()
    returnsMode!: string;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    returnsText?: string | null;
}

export class StockAlertSnapshot {
    @IsIn(["product", "variant"])
    kind!: "product" | "variant";

    @IsString()
    id!: string;

    @IsInt()
    @Min(0)
    lowStockAlert!: number;
}

/** Undo of a defaults save: the entries as they were, and what it updated. */
export class UndoDefaultsDto {
    @IsArray()
    @ArrayMaxSize(DEFAULT_KEYS_MAX)
    @ValidateNested({ each: true })
    @Type(() => DefaultsEntryInput)
    entries!: DefaultsEntryInput[];

    @IsArray()
    @ArrayMaxSize(10000)
    @ValidateNested({ each: true })
    @Type(() => ProductDefaultsSnapshot)
    products!: ProductDefaultsSnapshot[];

    @IsArray()
    @ArrayMaxSize(20000)
    @ValidateNested({ each: true })
    @Type(() => StockAlertSnapshot)
    stock!: StockAlertSnapshot[];
}
