import { Transform } from "class-transformer";
import {
    IsEmail,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from "class-validator";

/**
 * The two bodies site sign-in takes (round-2 plan A, A2). Email is the only
 * channel this round (ADR-011 §6), and the business comes from the relayed
 * host: with the global pipe's `forbidNonWhitelisted`, a body carrying a
 * `phone`, a `channel`, a `host`, an `organizationId` or anything else is a
 * 400, so nothing can half-enable a phone path or pick a business.
 */
const lowerTrim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

export class RequestCodeDto {
    @Transform(lowerTrim)
    @IsEmail()
    @MaxLength(254)
    email!: string;

    /** The bot challenge's token, when the site was asked for one. */
    @IsOptional()
    @IsString()
    @MaxLength(2_048)
    challenge?: string;
}

export class VerifyCodeDto {
    @Transform(lowerTrim)
    @IsEmail()
    @MaxLength(254)
    email!: string;

    @Transform(trim)
    @IsString()
    @Matches(/^\d{6}$/, { message: "Enter the 6-digit code from the email" })
    code!: string;
}
