import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

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
