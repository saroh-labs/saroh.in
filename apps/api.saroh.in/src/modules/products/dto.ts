import { Transform } from "class-transformer";
import {
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
    ValidateIf,
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

export class CreateProductDto {
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
    @Transform(({ value }) =>
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
    @Transform(({ value }) =>
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
