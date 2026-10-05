import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsString, MaxLength } from "class-validator";

/**
 * The address to check. Generous here: an address the tool won't fetch
 * (too long, another scheme, a private host) is answered as a typed state
 * by the guard, not refused as a bad request.
 */
export class CheckLinkQueryDto {
    @IsString()
    @MaxLength(8192)
    url!: string;
}

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Unlock the fix-it report (resources plan U2, KTD-5): the email it's sent
 * to, the address it's for, and "Also send me Saroh news" as ticked. The
 * report is built from the API's own check of `url`, never from anything
 * else the caller sends.
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

    /** A real boolean: the body is JSON, and nothing converts it (backend-nestjs.md). */
    @IsBoolean()
    consent!: boolean;
}
