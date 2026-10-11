import { Transform } from "class-transformer";
import {
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim() : value;

/** "" from a blank optional field is no field. */
const blankToUndefined = ({ value }: { value: unknown }): unknown => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed === "" ? undefined : trimmed;
};

/** The longest message a report keeps. */
export const REPORT_MESSAGE_MAX = 2000;

/**
 * A customer's report about a business that uses Saroh, from
 * saroh.in/customers. The address is checked and reduced to its host by the
 * service (`reportHost`), so a message about it can be a person's words.
 */
export class SubmitBusinessReportDto {
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: "Add the business's website address." })
    @MaxLength(2048)
    site!: string;

    @Transform(trim)
    @IsString()
    @MinLength(10, { message: "Tell us a little more about what happened." })
    @MaxLength(REPORT_MESSAGE_MAX, {
        message: `Keep it under ${REPORT_MESSAGE_MAX} characters.`,
    })
    message!: string;

    @IsOptional()
    @Transform(blankToUndefined)
    @IsEmail({}, { message: "Enter an email like name@example.com." })
    @MaxLength(320)
    email?: string;
}
