import { Transform } from "class-transformer";
import {
    IsEmail,
    IsNotEmpty,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";

import { CUSTOMER_PHONE } from "../../common/customer-phone";

const trim = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim() : value;

/** An email as it is kept: trimmed and in lower case. */
const lower = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/** The longest message a report keeps. */
export const REPORT_MESSAGE_MAX = 2000;

/**
 * A customer's report about a business that uses Saroh, from
 * saroh.in/customers. The address is checked and reduced to its host by the
 * service (`reportHost`), so a message about it can be a person's words.
 *
 * Whoever reports gives their email and their mobile number (DEC-138), so
 * the team can reach them about it. The number follows the rule for a phone
 * a customer types on a business's site (`common/customer-phone.ts`), kept
 * as typed; the service also refuses one with too few digits.
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

    @Transform(lower)
    @IsEmail({}, { message: "Enter an email like name@example.com." })
    @MaxLength(320)
    email!: string;

    @Transform(trim)
    @IsString()
    @Matches(CUSTOMER_PHONE, {
        message: "Enter a mobile number like +91 98450 12345.",
    })
    phone!: string;
}
