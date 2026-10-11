import { Transform } from "class-transformer";
import {
    IsEmail,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

import type { WaitlistKind } from "../waitlist/waitlist-keys";
import { WAITLIST_KINDS } from "../waitlist/waitlist-keys";

/** What a message is about: the form's four chips. Never free text. */
export const CONTACT_TOPICS = ["question", "help", "bug", "other"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/** The shortest and longest message kept. */
export const CONTACT_MESSAGE_MIN = 5;
export const CONTACT_MESSAGE_MAX = 5000;

const trim = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim() : value;

/** A name on one line, with single spaces. */
const oneLine = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;

const lowerTrim = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/** "" from "Choose one" is no kind. */
const blankToUndefined = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" && value.trim() === "" ? undefined : value;

/**
 * A message from saroh.in/contact (DEC-137): what it is about, who wrote it,
 * the kind of business if they said, and their words. The page checks the
 * same rules first, so its messages name the field; these are the API's own.
 */
export class SendContactMessageDto {
    @IsIn(CONTACT_TOPICS, { message: "Pick what it's about." })
    topic!: ContactTopic;

    @Transform(oneLine)
    @IsString()
    @IsNotEmpty({ message: "Add your name." })
    @MaxLength(120)
    name!: string;

    @Transform(lowerTrim)
    @IsEmail({}, { message: "Check your email address." })
    @MaxLength(320)
    email!: string;

    @IsOptional()
    @Transform(blankToUndefined)
    @IsIn(WAITLIST_KINDS, { message: "Pick the closest one." })
    kind?: WaitlistKind;

    @Transform(trim)
    @IsString()
    @MinLength(CONTACT_MESSAGE_MIN, {
        message: "Write a short message, even one line.",
    })
    @MaxLength(CONTACT_MESSAGE_MAX, {
        message: `Keep it under ${CONTACT_MESSAGE_MAX} characters.`,
    })
    message!: string;
}
