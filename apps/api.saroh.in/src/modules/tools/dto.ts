import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, MaxLength } from "class-validator";

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
