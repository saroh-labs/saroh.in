import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsEmail,
    IsOptional,
    IsString,
    MaxLength,
} from "class-validator";

/**
 * The address to check. Generous here: an address the tool won't fetch
 * (too long, another scheme, a private host) is answered as a typed state
 * by the guard, not refused as a bad request. In the body, never the query
 * string: a request line is logged, a body is not.
 */
export class CheckLinkDto {
    @IsString()
    @MaxLength(8192)
    url!: string;

    /** "Check again", past the minute's cache. A real boolean: the body is JSON. */
    @IsOptional()
    @IsBoolean()
    fresh?: boolean;
}

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Unlock the fix-it report (resources plan U2, KTD-5): the email it's sent
 * to and the address it's for. The report is built from the API's own
 * check of `url`, never from anything else the caller sends. No consent
 * field: an address nobody has verified can't say yes to news.
 */
export class UnlockReportDto {
    @Transform(normalizeEmail)
    @IsEmail(
        {},
        { message: "That email doesn't look right. Check it and try again." },
    )
    @MaxLength(320)
    email!: string;

    @IsString()
    @MaxLength(8192)
    url!: string;
}
