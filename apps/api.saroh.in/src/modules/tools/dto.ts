import { Transform } from "class-transformer";
import { IsEmail, MaxLength } from "class-validator";

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Unlock the QR code maker's downloads (QR codes plan U9): the email, and
 * nothing else. The visitor's link, logo and label never leave their
 * browser, so there is no field for them. No consent field: an address
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
}
