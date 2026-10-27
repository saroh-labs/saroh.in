import { E164 } from "@saroh/block-contract";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

const PHONE_MESSAGE = "Enter the phone number with its country code.";

/** `POST account-phone/start`: the number, and Turnstile's token. */
export class StartPhoneDto {
    @IsString()
    @Matches(E164, { message: PHONE_MESSAGE })
    phone!: string;

    @IsOptional()
    @IsString()
    @MaxLength(2048)
    turnstileToken?: string;
}

/** The widget's access token for a number, to be checked on the server. */
export class VerifyPhoneDto {
    @IsString()
    @Matches(E164, { message: PHONE_MESSAGE })
    phone!: string;

    @IsString()
    @MaxLength(4096)
    accessToken!: string;
}
