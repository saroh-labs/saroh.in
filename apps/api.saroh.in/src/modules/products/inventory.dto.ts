import { Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from "class-validator";

export class UpdateInventoryDto {
    @Type(() => Number)
    @IsInt({ message: "Quantity must be a whole number" })
    @Min(0, { message: "Quantity can't be negative" })
    quantity!: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "Low-stock alert must be a whole number" })
    @Min(0)
    lowStockAlert?: number;
}

export class VariantStockInput {
    @IsString()
    variantId!: string;

    @Type(() => Number)
    @IsInt({ message: "On hand must be a whole number" })
    @Min(0, { message: "On hand can't be negative" })
    quantity!: number;

    @Type(() => Number)
    @IsInt({ message: "Warn at must be a whole number" })
    @Min(0, { message: "Warn at can't be negative" })
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
