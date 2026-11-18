import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsIn,
    IsISO8601,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    ValidateNested,
} from "class-validator";

import { SHARE_STYLES } from "../../share-posts/cards/card-model";
import {
    CAPTION_MAX,
    HEADLINE_MAX,
    LINK_PATH,
    LINK_PATH_MAX,
} from "../../share-posts/dto";
import type { ChannelKind } from "../meta/social-meta.port";
import { CHANNEL_KINDS } from "../meta/social-meta.port";

/** What a post is about: an item's kind, a review, or the business's own words. */
export const SOURCE_KINDS = [
    "product",
    "service",
    "post",
    "offer",
    "book",
    "review",
    "own",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Feed shapes Meta takes for an image post: 4:5 and square. */
export const POST_SIZES = ["post", "square"] as const;

/** What a save does: keep a draft, schedule it, or post it now. */
export const POST_ACTIONS = ["draft", "schedule", "now"] as const;
export type PostAction = (typeof POST_ACTIONS)[number];

/** A list's filter, as the chips say it (S3). */
export const POST_FILTERS = ["scheduled", "posted", "failed", "draft"] as const;
export type PostFilter = (typeof POST_FILTERS)[number];

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;
const trimOrNull = ({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== "string") return value;
    const t = value.trim();
    return t === "" ? null : t;
};

/** A channel's own words, by kind; none means the post's. */
export class ChannelCaptionsDto {
    @IsOptional()
    @IsString()
    @MaxLength(CAPTION_MAX)
    INSTAGRAM?: string;

    @IsOptional()
    @IsString()
    @MaxLength(CAPTION_MAX)
    FACEBOOK?: string;

    @IsOptional()
    @IsString()
    @MaxLength(CAPTION_MAX)
    THREADS?: string;
}

/**
 * A post as the composer saves it (S4). On a change (PATCH) every field is
 * optional and what is left out stays as it was.
 */
export class PostInputDto {
    @IsOptional()
    @IsIn(SOURCE_KINDS)
    sourceKind?: SourceKind;

    /** The item's slug or id (a product's slug, a service's id…); "page" for the booking page. */
    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(191)
    sourceRef?: string | null;

    /** The item's name as lists show it. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(160)
    title?: string;

    @IsOptional()
    @IsIn(["card", "photo"])
    picture?: "card" | "photo";

    @IsOptional()
    @IsIn(SHARE_STYLES)
    cardStyle?: string;

    @IsOptional()
    @IsIn(POST_SIZES)
    size?: "post" | "square";

    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(HEADLINE_MAX)
    headline?: string | null;

    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(64)
    mediaId?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(CAPTION_MAX, {
        message: `Keep the caption to ${CAPTION_MAX.toLocaleString("en-US")} characters`,
    })
    caption?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => ChannelCaptionsDto)
    captions?: ChannelCaptionsDto | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(LINK_PATH_MAX)
    @Matches(LINK_PATH, {
        message: "Link to a page on your own website, such as /book",
    })
    linkPath?: string;

    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @ArrayMaxSize(CHANNEL_KINDS.length)
    @IsIn(CHANNEL_KINDS, { each: true })
    channels?: ChannelKind[];

    /** Draft (default), schedule at `publishAt`, or post now. */
    @IsOptional()
    @IsIn(POST_ACTIONS)
    action?: PostAction;

    @IsOptional()
    @IsISO8601({ strict: true })
    publishAt?: string;
}

/** Move, or try the failed channels again at a time. */
export class PostTimeDto {
    @IsOptional()
    @IsISO8601({ strict: true })
    publishAt?: string;
}

export class PostListQueryDto {
    @IsOptional()
    @IsIn(POST_FILTERS)
    status?: PostFilter;

    /** Posts going out from (ISO), for the month view. */
    @IsOptional()
    @IsISO8601({ strict: true })
    from?: string;

    @IsOptional()
    @IsISO8601({ strict: true })
    to?: string;
}
