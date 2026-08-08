import { Transform } from "class-transformer";
import {
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const MONEY_MSG = "Price must be a number with up to 2 decimals";

export class CreateVariantDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "SKU is required" })
    @MaxLength(100)
    sku!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Title is required" })
    @MaxLength(150)
    title!: string;

    // Optional per-variant price override (null/absent = inherit the product's).
    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(MONEY_RE, { message: MONEY_MSG })
    price?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    image?: string | null;
}

export class UpdateVariantDto extends CreateVariantDto {}
