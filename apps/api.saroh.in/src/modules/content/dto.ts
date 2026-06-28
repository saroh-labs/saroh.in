import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsIn,
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

export const POST_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

// ---- Posts ----

export class CreatePostDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Title is required" })
    @MaxLength(200)
    title!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    @Matches(SLUG_RE, { message: SLUG_MSG })
    slug?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    excerpt?: string;

    @IsOptional()
    @IsString()
    content?: string;

    // Pass null to clear the category.
    @IsOptional()
    @Transform(trim)
    @IsString()
    categoryId?: string | null;

    @IsOptional()
    @IsBoolean()
    featured?: boolean;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    image?: string;

    @IsOptional()
    @IsIn(POST_STATUSES, {
        message: "Status must be DRAFT, PUBLISHED, or ARCHIVED",
    })
    status?: PostStatus;
}

// Standalone (not `extends CreatePostDto`): an inherited @IsOptional() on slug
// would defeat making it required here, so the editable fields are redeclared.
export class UpdatePostDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Title is required" })
    @MaxLength(200)
    title!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    @Matches(SLUG_RE, { message: SLUG_MSG })
    slug!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    excerpt?: string;

    @IsOptional()
    @IsString()
    content?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    categoryId?: string | null;

    @IsOptional()
    @IsBoolean()
    featured?: boolean;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2000)
    image?: string;

    @IsOptional()
    @IsIn(POST_STATUSES, {
        message: "Status must be DRAFT, PUBLISHED, or ARCHIVED",
    })
    status?: PostStatus;
}

// ---- Post categories ----

export class CreatePostCategoryDto {
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
}

export class UpdatePostCategoryDto {
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
}
