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

const SLUG_RE = /^[a-z0-9-]+$/;
const SLUG_MSG =
    "Slug may only contain lowercase letters, numbers, and hyphens";

export class CreateCategoryDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Name is required" })
    @MaxLength(100)
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
