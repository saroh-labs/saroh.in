import { Transform, Type } from "class-transformer";
import {
    IsEmail,
    IsIn,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const lowerTrim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/** The lead lifecycle status. */
export const LEAD_STATUSES = ["OPEN", "WON", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Inline contact for a hand-created lead when no `contactId` is given: the
 * `email` keys the `(organizationId, email)` upsert (so a manual lead for a
 * known address reuses the existing Contact), with optional descriptive fields.
 */
export class InlineContactDto {
    @Transform(lowerTrim)
    @IsEmail()
    @MaxLength(200)
    email!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    firstName?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    lastName?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(40)
    phone?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(160)
    company?: string;
}

/**
 * Create a Lead by hand (S3-005). Supply EITHER `contactId` (an existing
 * contact) OR `contact` (inline, upserted by email) — the service 400s when
 * neither is given. `pipelineId`/`stageId` are optional: omitting the pipeline
 * uses the org default, omitting the stage uses that pipeline's first stage.
 */
export class CreateLeadDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    contactId?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => InlineContactDto)
    contact?: InlineContactDto;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    pipelineId?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    stageId?: string;

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    title!: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    value?: number;
}

/** Patch a lead's title / status / value (a sparse patch; never its stage). */
export class UpdateLeadDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(160)
    title?: string;

    @IsOptional()
    @IsIn(LEAD_STATUSES)
    status?: LeadStatus;

    @IsOptional()
    @IsInt()
    @Min(0)
    value?: number;
}

/** Move a lead to another Stage of its OWN pipeline. */
export class MoveLeadDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    stageId!: string;
}

/**
 * Log an activity on a lead's timeline (S3-007) — a NOTE by default. `type` is
 * optional and, when given, may only be `"NOTE"` (STAGE_CHANGED/CREATED are
 * system-authored; TASK has its own endpoint). `body` is the required text.
 */
export class CreateActivityDto {
    @IsOptional()
    @IsIn(["NOTE"])
    type?: "NOTE";

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(2000)
    body!: string;
}

/**
 * Create a follow-up TASK on a lead (S3-007): a required `body` (what to do) and
 * a `dueAt` ISO-8601 timestamp. Recorded as an `Activity{ type:"TASK" }` and
 * completed via the dedicated complete endpoint.
 */
export class CreateTaskDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(2000)
    body!: string;

    @IsISO8601()
    dueAt!: string;
}
