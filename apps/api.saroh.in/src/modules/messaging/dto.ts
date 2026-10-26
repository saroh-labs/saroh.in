import type { VerificationModule } from "@saroh/database";
import { Type } from "class-transformer";
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from "class-validator";

/** The modules a business can turn Saroh-sent codes on for. */
export const VERIFICATION_MODULES = [
    "BOOKING",
    "ORDER",
    "ACCOUNT",
] as const satisfies readonly VerificationModule[];

/** `PUT …/messaging/verification-settings`: one module on or off. */
export class SetVerificationSettingDto {
    @IsIn(VERIFICATION_MODULES)
    module!: VerificationModule;

    @IsBoolean()
    enabled!: boolean;
}

export class LedgerQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(64)
    cursor?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

/**
 * A customer asking for a code on a business's site. The business comes from
 * the relayed host, never the body (`forbidNonWhitelisted` refuses any other
 * field).
 */
export class StartVerificationDto {
    @IsIn(VERIFICATION_MODULES)
    module!: VerificationModule;

    @IsString()
    @MaxLength(32)
    phone!: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    subjectRef?: string;
}

export class CheckVerificationDto {
    @IsString()
    @Matches(/^\d{6}$/, { message: "Enter the 6-digit code." })
    code!: string;
}
