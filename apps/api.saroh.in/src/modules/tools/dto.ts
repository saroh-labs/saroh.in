import { Transform } from "class-transformer";
import {
    IsEmail,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
} from "class-validator";

import { TOOL_SLUGS } from "./tool-names";

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Unlock a free tool's downloads (QR codes plan U9; every tool, #1253): the
 * email, and which tool by its slug, one of {@link TOOL_SLUGS} (none: the
 * QR code maker). What the visitor typed into the tool never leaves their
 * browser, so there is no field for it. No consent field: an address
 * nobody has verified can't say yes to news.
 */
export class UnlockQrMakerDto {
    @Transform(normalizeEmail)
    @IsEmail(
        {},
        { message: "That email looks incomplete. Check it and try again." },
    )
    @MaxLength(320)
    email!: string;

    /** The tool's slug; anything not on the list is refused (400). */
    @IsOptional()
    @IsIn(TOOL_SLUGS, { message: "That isn't one of our tools." })
    tool?: string;
}

/**
 * Get a free download (plan 2026-10-31-002 U9): which download, and an
 * email or an Indian mobile for WhatsApp, exactly one (the service refuses
 * both or neither). The slug is checked against `DOWNLOAD_NAMES` by the
 * controller, so an unknown one answers 404, not a 400 the site would read
 * as a bad contact. No consent field: an unverified contact can't say yes
 * to news.
 */
export class DownloadUnlockDto {
    @IsString()
    @MaxLength(80)
    slug!: string;

    @IsOptional()
    @Transform(normalizeEmail)
    @IsEmail(
        {},
        { message: "That email looks incomplete. Check it and try again." },
    )
    @MaxLength(320)
    email?: string;

    /** Read by `indianPhoneE164` in the service (DEC-198). */
    @IsOptional()
    @IsString()
    @MaxLength(32)
    phone?: string;

    /** Turnstile's token; the challenge is skipped only while Turnstile isn't set up. */
    @IsOptional()
    @IsString()
    @MaxLength(2048)
    turnstileToken?: string;
}
