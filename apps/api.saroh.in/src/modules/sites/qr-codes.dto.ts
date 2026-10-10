import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    ValidateIf,
} from "class-validator";

import type { QrPrintFormat } from "./qr-print";
import { QR_PRINT_FORMATS } from "./qr-print";
import type { QrPlace, QrStyle, QrTargetKind } from "./qr-target";
import { QR_PLACES, QR_STYLES, QR_TARGET_KINDS } from "./qr-target";

/** Trim a string; an emptied one, or null, means "none". */
const trimOrNull = ({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
};

const lower = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

const COLOR = /^#[0-9a-f]{6}$/;
const COLOR_MESSAGE = "Pick a colour as #RRGGBB";

export const QR_LABEL_MAX = 40;
export const QR_PLACE_NOTE_MAX = 60;

/**
 * Make a code. The target is a kind and, for a product or a page, that
 * row's id; whether it can be opened is the service's to check, in the
 * merchant's words.
 */
export class CreateQrCodeDto {
    @IsIn(QR_TARGET_KINDS, { message: "Choose what this code opens" })
    targetKind!: QrTargetKind;

    /** The product's or page's id. Left out for the site, shop and booking page. */
    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(64)
    targetRef?: string | null;

    @IsIn(QR_PLACES, { message: "Choose where this code will be placed" })
    place!: QrPlace;

    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(QR_PLACE_NOTE_MAX)
    placeNote?: string | null;

    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(QR_LABEL_MAX)
    label?: string | null;

    /** Plain when left out. */
    @IsOptional()
    @IsIn(QR_STYLES)
    style?: QrStyle;

    /** Ink when left out. */
    @IsOptional()
    @Transform(lower)
    @Matches(COLOR, { message: COLOR_MESSAGE })
    color?: string;
}

/**
 * Change a code: only what is sent changes. The target moves as one thing,
 * so `targetKind` is sent whenever `targetRef` is. The short id never
 * changes, so paper already printed keeps working.
 */
export class UpdateQrCodeDto {
    @ValidateIf(
        (dto: UpdateQrCodeDto) =>
            dto.targetKind !== undefined || dto.targetRef !== undefined,
    )
    @IsIn(QR_TARGET_KINDS, { message: "Choose what this code opens" })
    targetKind?: QrTargetKind;

    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(64)
    targetRef?: string | null;

    @IsOptional()
    @IsIn(QR_PLACES, { message: "Choose where this code will be placed" })
    place?: QrPlace;

    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(QR_PLACE_NOTE_MAX)
    placeNote?: string | null;

    @IsOptional()
    @Transform(trimOrNull)
    @IsString()
    @MaxLength(QR_LABEL_MAX)
    label?: string | null;

    @IsOptional()
    @IsIn(QR_STYLES)
    style?: QrStyle;

    @IsOptional()
    @Transform(lower)
    @Matches(COLOR, { message: COLOR_MESSAGE })
    color?: string;
}

/**
 * What the site's server says about a scan it is relaying: the visitor's
 * browser, so a link preview isn't counted as a person, and whether it was
 * only asked for the headers.
 */
export class QrScanDto {
    @IsOptional()
    @IsString()
    @MaxLength(512)
    userAgent?: string;

    @IsOptional()
    @IsBoolean()
    head?: boolean;
}

/** Which print file: `?format=standee|tent|sticker|card`. */
export class QrPrintQueryDto {
    @Transform(lower)
    @IsIn(QR_PRINT_FORMATS, {
        message: "Choose a print format: standee, tent, sticker or card",
    })
    format!: QrPrintFormat;
}
