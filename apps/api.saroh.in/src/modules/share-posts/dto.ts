import { Transform } from "class-transformer";
import {
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from "class-validator";

import type { ShareSize, ShareStyle } from "./cards/card-model";
import { SHARE_SIZES, SHARE_STYLES } from "./cards/card-model";

/** The card's big line (#1378): short enough to read on a phone. */
export const HEADLINE_MAX = 90;
/** Instagram's cap on a caption, the longest of the places it goes. */
export const CAPTION_MAX = 2200;
export const LINK_PATH_MAX = 512;

/**
 * A path on the business's own site: starts with one "/", never "//" (a
 * host), no scheme, no backslash, no spaces. Held in the database too.
 */
export const LINK_PATH = /^\/(?!\/)[^\s\\]*$/;

const SIZE_KEYS = Object.keys(SHARE_SIZES) as ShareSize[];

/** Trim a string; an emptied one, or null, means "none". */
const trimOrNull = ({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
};

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * A post of the business's own: a headline, its own photo, or both. Which
 * of them the post has is the service's to check, against what is saved.
 */
export class SharePostInputDto {
    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(HEADLINE_MAX, {
        message: `Keep the headline to ${HEADLINE_MAX} characters`,
    })
    headline?: string | null;

    /** A photo from the business's media library; null takes it off. */
    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(64)
    mediaId?: string | null;

    @IsOptional()
    @IsIn(SHARE_STYLES)
    style?: ShareStyle;

    @IsOptional()
    @IsIn(SIZE_KEYS)
    size?: ShareSize;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(CAPTION_MAX, {
        message: `Keep the caption to ${CAPTION_MAX.toLocaleString("en-IN")} characters`,
    })
    caption?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(LINK_PATH_MAX)
    @Matches(LINK_PATH, {
        message: "Link to a page on your own website, such as /book",
    })
    linkPath?: string;
}
