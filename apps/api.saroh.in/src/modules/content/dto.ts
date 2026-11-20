import { POST_TITLE_MAX } from "@saroh/api-contract";
import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsIn,
    IsISO8601,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
    ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** Blank is "not written", the same as null. */
const trimOrNull = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
};

const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * A cover picture must be a web address (#232, following #227 for the share
 * image). Every sink today is an escaped attribute, so a `javascript:` value
 * is inert — but this field is merchant-controlled, it is copied into an
 * immutable snapshot and re-read by the renderer and by share cards, and a
 * check at the one place it is written is cheaper than remembering one at
 * each future sink.
 */
const IMAGE_URL_RE = /^https?:\/\/\S+$/i;
const IMAGE_URL_MSG =
    "The cover must be a web address starting with http:// or https://";
const SLUG_MSG =
    "Slug may only contain lowercase letters, numbers, and hyphens";

export const POST_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

// ---- Posts ----

export class CreatePostDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Title is required" })
    @MaxLength(POST_TITLE_MAX, {
        message: `Keep the title to ${POST_TITLE_MAX} characters`,
    })
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
    @Matches(IMAGE_URL_RE, { message: IMAGE_URL_MSG })
    image?: string;

    @IsOptional()
    @IsIn(POST_STATUSES, {
        message: "Status must be DRAFT, PUBLISHED, or ARCHIVED",
    })
    status?: PostStatus;

    // ---- Search and sharing (editor redesign U17a). Absent leaves alone;
    // null clears, and the title, short description and cover stand in. ----

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(300, {
        message: "Keep the photo's description to 300 characters",
    })
    imageAlt?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(70, { message: "Keep the Google title to 70 characters" })
    seoTitle?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(300, { message: "Keep the Google text to 300 characters" })
    seoDescription?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(2000)
    @Matches(IMAGE_URL_RE, {
        message:
            "The share image must be a web address starting with http:// or https://",
    })
    shareImageUrl?: string | null;
}

// Standalone (not `extends CreatePostDto`): an inherited @IsOptional() on slug
// would defeat making it required here, so the editable fields are redeclared.
export class UpdatePostDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Title is required" })
    @MaxLength(POST_TITLE_MAX, {
        message: `Keep the title to ${POST_TITLE_MAX} characters`,
    })
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
    @Matches(IMAGE_URL_RE, { message: IMAGE_URL_MSG })
    image?: string;

    @IsOptional()
    @IsIn(POST_STATUSES, {
        message: "Status must be DRAFT, PUBLISHED, or ARCHIVED",
    })
    status?: PostStatus;

    // ---- Search and sharing (editor redesign U17a). Absent leaves alone;
    // null clears, and the title, short description and cover stand in. ----

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(300, {
        message: "Keep the photo's description to 300 characters",
    })
    imageAlt?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(70, { message: "Keep the Google title to 70 characters" })
    seoTitle?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(300, { message: "Keep the Google text to 300 characters" })
    seoDescription?: string | null;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(2000)
    @Matches(IMAGE_URL_RE, {
        message:
            "The share image must be a web address starting with http:// or https://",
    })
    shareImageUrl?: string | null;

    /** A save that takes an Ask AI draft: always kept as a revision. */
    @IsOptional()
    @IsIn(["ask_ai"], { message: "event must be ask_ai" })
    event?: "ask_ai";
}

/** Publish post › Later: the instant it goes live. */
export class SchedulePostDto {
    @IsISO8601(
        { strict: true },
        { message: "Pick a date and time for it to go live" },
    )
    at!: string;
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
