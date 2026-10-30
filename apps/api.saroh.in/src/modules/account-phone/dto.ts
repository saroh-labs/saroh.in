import { E164 } from "@saroh/block-contract";
import {
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from "class-validator";

const PHONE_MESSAGE = "Enter the phone number with its country code.";

/** `POST account-phone/start` (and `account/phone/start`): the number, the channel, Turnstile's token. */
export class StartPhoneDto {
    @IsString()
    @Matches(E164, { message: PHONE_MESSAGE })
    phone!: string;

    /** WhatsApp unless asked otherwise (owner, 28 Oct). */
    @IsOptional()
    @IsIn(["whatsapp", "sms"])
    channel?: "whatsapp" | "sms";

    @IsOptional()
    @IsString()
    @MaxLength(2048)
    turnstileToken?: string;
}

/**
 * The proof for a number, checked on the server: exactly one of the
 * WhatsApp `code` Saroh sent or the SMS widget's `accessToken`.
 */
export class VerifyPhoneDto {
    @IsString()
    @Matches(E164, { message: PHONE_MESSAGE })
    phone!: string;

    @IsOptional()
    @IsString()
    @Matches(/^\d{6}$/, { message: "Enter the 6-digit code." })
    code?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    accessToken?: string;
}
