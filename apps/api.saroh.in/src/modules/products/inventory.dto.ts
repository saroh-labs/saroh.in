import { Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateNested,
} from "class-validator";

export class UpdateInventoryDto {
    @Type(() => Number)
    @IsInt({ message: "Quantity must be a whole number" })
    @Min(0, { message: "Quantity can't be negative" })
    @Max(1_000_000)
    quantity!: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "Low-stock alert must be a whole number" })
    @Min(0)
    @Max(1_000_000)
    lowStockAlert?: number;
}

export class VariantStockInput {
    @IsString()
    variantId!: string;

    @Type(() => Number)
    @IsInt({ message: "On hand must be a whole number" })
    @Min(0, { message: "On hand can't be negative" })
    @Max(1_000_000)
    quantity!: number;

    @Type(() => Number)
    @IsInt({ message: "Low stock at must be a whole number" })
    @Min(0, { message: "Low stock at can't be negative" })
    @Max(1_000_000)
    lowStockAlert!: number;
}

/** Every variant's count at once — the Stock section's one save. */
export class UpdateVariantStockDto {
    @IsArray()
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => VariantStockInput)
    variants!: VariantStockInput[];
}
