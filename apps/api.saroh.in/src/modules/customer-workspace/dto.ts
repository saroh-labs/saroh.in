import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsOptional,
    IsString,
    MaxLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

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
