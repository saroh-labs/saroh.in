import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim() : value;

export class JoinWaitlistDto {
    /**
     * Normalized here rather than in the service so validation and storage see
     * the same string — otherwise `IsEmail` could pass on "  A@B.com " while the
     * unique index sees a different value than a later lowercase submission.
     */
    @Transform(normalizeEmail)
    @IsEmail({}, { message: "Enter a valid email address" })
    @MaxLength(320) // RFC 5321 maximum length of a forward path
    email!: string;

    /** Analytics only — where the signup came from, e.g. "saroh.in". */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    source?: string;
}
