import { Transform } from "class-transformer";
import {
    IsEmail,
    IsIn,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

import { WAITLIST_KINDS } from "../waitlist/waitlist-keys";
import type { ContactKind, LeadStage } from "./lead-rules";
import { CONTACT_KINDS, LEAD_STAGES } from "./lead-rules";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = "A follow-up is a date like 2026-10-18";

/** Every lead write carries the console's idempotency key. */
class LeadWriteDto {
    @Transform(trim)
    @IsString()
    @MinLength(8)
    @MaxLength(200)
    idempotencyKey!: string;
}

/** The board's filters. Query text, so nothing is converted. */
export class LeadsBoardQueryDto {
    /** "all", "unowned" or a teammate's id; all-scope staff only. */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    owner?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    q?: string;
}

export class AddLeadDto extends LeadWriteDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name!: string;

    @IsOptional()
    @Transform(trim)
    @IsEmail()
    @MaxLength(320)
    email?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(32)
    phone?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(80)
    city?: string | null;

    @IsOptional()
    @IsIn(WAITLIST_KINDS)
    kind?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    notes?: string | null;

    @IsOptional()
    @Matches(DAY, { message: DAY_MESSAGE })
    followUpOn?: string | null;
}

export class UpdateLeadDto extends LeadWriteDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @Transform(trim)
    @IsEmail()
    @MaxLength(320)
    email?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsEmail()
    @MaxLength(320)
    signUpEmail?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(32)
    phone?: string | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(80)
    city?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    notes?: string | null;

    @IsOptional()
    @Matches(DAY, { message: DAY_MESSAGE })
    followUpOn?: string | null;
}

export class MoveLeadStageDto extends LeadWriteDto {
    @IsIn(LEAD_STAGES)
    stage!: LeadStage;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    organizationId?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    lostReason?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    reason?: string;
}

export class AssignLeadDto extends LeadWriteDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    platformAdminId!: string;

    @Transform(trim)
    @IsString()
    @MinLength(4, { message: "Give a reason for this change" })
    @MaxLength(500)
    reason!: string;
}

export class LogContactDto extends LeadWriteDto {
    @IsIn(CONTACT_KINDS)
    kind!: ContactKind;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Say what was said" })
    @MaxLength(4000)
    summary!: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    feedback?: string | null;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(600)
    minutes?: number | null;

    @IsOptional()
    @IsISO8601()
    happenedAt?: string | null;

    @IsOptional()
    @Matches(DAY, { message: DAY_MESSAGE })
    followUpOn?: string | null;
}

/**
 * A call, visit or message with a business (admin console U22). As
 * {@link LogContactDto}, without a follow-up: a business keeps none.
 */
export class LogBusinessContactDto extends LeadWriteDto {
    @IsIn(CONTACT_KINDS)
    kind!: ContactKind;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Say what was said" })
    @MaxLength(4000)
    summary!: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    feedback?: string | null;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(600)
    minutes?: number | null;

    @IsOptional()
    @IsISO8601()
    happenedAt?: string | null;
}
