import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** A blank string is no value: the field is cleared. */
const nullableTrim = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const t = value.trim();
    return t === "" ? null : t;
};

/** The longest note the team can write; a paragraph, not a document. */
export const NOTE_BODY_MAX = 2000;

/** More allergens than a storefront would list is a mistake, not a note. */
export const NOTE_ALLERGENS_MAX = 30;

/**
 * A note about a customer (U8): free text and the allergens it names, as ids
 * from the storefront's allergen list. At least one of the two — the service
 * says so with the field it is about.
 */
export class ContactNoteDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(NOTE_BODY_MAX, {
        message: `Keep a note under ${NOTE_BODY_MAX} characters.`,
    })
    body?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(NOTE_ALLERGENS_MAX)
    @IsString({ each: true })
    allergenIds?: string[];
}

/** The kinds of Needs attention entry (DEC-040), in the order they show. */
export const ATTENTION_KINDS = [
    "ALLERGY",
    "MEDICAL",
    "ACCESS",
    "OTHER",
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/** What a Needs attention tag says (C1): a few words, not a note. */
export const ATTENTION_LABEL_MAX = 60;
/** The detail under it. */
export const ATTENTION_DETAIL_MAX = 500;

const KIND_MESSAGE = "Pick Allergy, Medical, Access or Other.";

/**
 * A new Needs attention entry (DEC-040, C1). An Allergy entry names an
 * allergen from the business's list when it has one, and its label defaults
 * to the allergen's name; everything else needs a label. `sensitive` left
 * out means on for Medical and off for the rest. The service checks the
 * rules that need the database, naming the field each is about.
 */
export class CreateAttentionDto {
    @IsIn(ATTENTION_KINDS, { message: KIND_MESSAGE })
    kind!: AttentionKind;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(ATTENTION_LABEL_MAX, {
        message: `Keep it under ${ATTENTION_LABEL_MAX} characters; add the rest as detail.`,
    })
    label?: string;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(ATTENTION_DETAIL_MAX, {
        message: `Keep the detail under ${ATTENTION_DETAIL_MAX} characters.`,
    })
    detail?: string | null;

    @IsOptional()
    @IsBoolean()
    sensitive?: boolean;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    allergenId?: string | null;
}

/** Fields given replace what the entry had; fields left out are kept. */
export class UpdateAttentionDto {
    @IsOptional()
    @IsIn(ATTENTION_KINDS, { message: KIND_MESSAGE })
    kind?: AttentionKind;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(ATTENTION_LABEL_MAX, {
        message: `Keep it under ${ATTENTION_LABEL_MAX} characters; add the rest as detail.`,
    })
    label?: string;

    @IsOptional()
    @Transform(nullableTrim)
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    @MaxLength(ATTENTION_DETAIL_MAX, {
        message: `Keep the detail under ${ATTENTION_DETAIL_MAX} characters.`,
    })
    detail?: string | null;

    @IsOptional()
    @IsBoolean()
    sensitive?: boolean;

    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @IsString()
    allergenId?: string | null;
}
