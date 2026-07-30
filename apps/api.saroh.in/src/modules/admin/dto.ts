import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * Payload for every flag mutation.
 *
 * `reason` is REQUIRED, not optional: the flags decision (DECISIONS.md) commits
 * to recording operator AND reason for each change, and an audit trail of
 * unexplained boolean flips is close to useless during an incident review. The
 * minimum length is deliberate — it makes "x" as annoying to type as something
 * true.
 */
export class SetFlagDto {
    @IsBoolean()
    enabled!: boolean;

    @Transform(trim)
    @IsString()
    @MinLength(4, { message: "Give a reason for this change" })
    @MaxLength(500)
    reason!: string;

    @Transform(trim)
    @IsString()
    @MinLength(8)
    @MaxLength(200)
    idempotencyKey!: string;
}

/** Clearing an override still needs a reason — it is a rollout change too. */
export class ClearFlagOverrideDto {
    @Transform(trim)
    @IsString()
    @MinLength(4, { message: "Give a reason for this change" })
    @MaxLength(500)
    reason!: string;

    @Transform(trim)
    @IsString()
    @MinLength(8)
    @MaxLength(200)
    idempotencyKey!: string;
}

export class ListAdminAuditDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    cursor?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    actorUserId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    organizationId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    action?: string;
}

export class OpenAdminAccessSessionDto {
    @Transform(trim)
    @IsString()
    @MinLength(4, { message: "Give a reason for support access" })
    @MaxLength(500)
    reason!: string;

    @Transform(trim)
    @IsString()
    @MinLength(8)
    @MaxLength(200)
    idempotencyKey!: string;
}

export class RevokeAdminAccessSessionDto {
    @Transform(trim)
    @IsString()
    @MinLength(4, { message: "Give a reason for closing support access" })
    @MaxLength(500)
    reason!: string;

    @Transform(trim)
    @IsString()
    @MinLength(8)
    @MaxLength(200)
    idempotencyKey!: string;
}
