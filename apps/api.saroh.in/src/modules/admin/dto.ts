import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsEmail,
    IsIn,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

import type { DeployApp, DeployEnvironment } from "./admin-deployments";
import { DEPLOY_APPS, DEPLOY_ENVIRONMENTS } from "./admin-deployments";

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

    /**
     * The one field in the API that arrives as TEXT and is declared a number:
     * this DTO is bound to the QUERY STRING, where `?limit=50` is the string
     * "50" and nothing else is possible.
     *
     * Converted here, explicitly. The pipe used to do it for every property of
     * every DTO — which is also how the string "false" became `true` on eleven
     * boolean fields (#314). `Number("abc")` is NaN and `@IsInt` refuses it, so
     * a bad limit is still a 400 rather than a silent default.
     */
    @IsOptional()
    @Type(() => Number)
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

/** Every operator write carries a reason and an idempotency key. */
export class OperatorReasonDto {
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

/** Destructive lifecycle changes are confirmed by typing the business's name. */
export class ConfirmedOperatorDto extends OperatorReasonDto {
    @IsString()
    @MaxLength(200)
    confirmName!: string;
}

export class ScheduleDeletionDto extends ConfirmedOperatorDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(7)
    @Max(90)
    retentionDays?: number;
}

export class ChangePlanDto extends OperatorReasonDto {
    @IsString()
    @MaxLength(200)
    planId!: string;
}

export class TrialDto extends OperatorReasonDto {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(90)
    days!: number;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    planId?: string;
}

export class RaiseLimitDto extends OperatorReasonDto {
    @IsString()
    @MaxLength(80)
    key!: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(1_000_000)
    value!: number;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(365)
    days!: number;
}

export class SetModuleDto extends OperatorReasonDto {
    @IsBoolean()
    enabled!: boolean;
}

export class AddNoteDto {
    @Transform(trim)
    @IsString()
    @MinLength(2)
    @MaxLength(4000)
    body!: string;
}

/** The business directory's query string. */
export class ListOrganizationsDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    q?: string;

    @IsOptional()
    @IsIn(["ACTIVE", "SUSPENDED", "PENDING_DELETION", "DELETED_RETAINED"])
    lifecycle?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    plan?: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    module?: string;

    @IsOptional()
    @IsIn(["attention"])
    health?: "attention";

    /** `picker`: the flag screen's id/name/slug list, unpaged. */
    @IsOptional()
    @IsIn(["picker"])
    for?: "picker";

    @IsOptional()
    @IsString()
    @MaxLength(200)
    cursor?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}

/** Grant staff access to someone with a Saroh account. */
export class GrantStaffDto {
    @Transform(trim)
    @IsEmail()
    @MaxLength(320)
    email!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(6)
    @IsString({ each: true })
    roles!: string[];

    @Transform(trim)
    @IsString()
    @MinLength(4, { message: "Give a reason for this change" })
    @MaxLength(500)
    reason!: string;

    @IsOptional()
    @IsISO8601()
    expiresAt?: string;

    @Transform(trim)
    @IsString()
    @MinLength(8)
    @MaxLength(200)
    idempotencyKey!: string;
}

/** Set exactly which roles a staff member holds, and until when. */
export class AmendStaffDto extends OperatorReasonDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(6)
    @IsString({ each: true })
    roles!: string[];

    /** An ISO date, or absent for no expiry. */
    @IsOptional()
    @IsISO8601()
    expiresAt?: string;
}

export class SearchPeopleDto {
    @Transform(trim)
    @IsString()
    @MinLength(2)
    @MaxLength(200)
    q!: string;
}

export class ChangeMemberRoleDto extends OperatorReasonDto {
    @IsString()
    @MaxLength(80)
    role!: string;
}

/** The targets of a dry run. */
export class OperationTargetsDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(500)
    @IsString({ each: true })
    ids!: string[];
}

/** The targets of a bulk operation, with its reason and idempotency key. */
export class StartOperationDto extends OperatorReasonDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(500)
    @IsString({ each: true })
    ids!: string[];
}

export class ListJobsDto {
    @IsOptional()
    @IsIn(["PENDING", "PROCESSING", "DONE", "FAILED"])
    status?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    type?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    organizationId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    cursor?: string;
}

export class ListWebhooksDto {
    @IsOptional()
    @IsIn(["RECEIVED", "PROCESSED", "FAILED", "IGNORED"])
    status?: string;

    @IsOptional()
    @IsString()
    @MaxLength(60)
    provider?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    organizationId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    cursor?: string;
}

export class ExplainFlagDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    organizationId?: string;
}

export class ListWaitlistDto {
    @IsOptional()
    @IsIn(["waiting", "invited"])
    state?: "waiting" | "invited";

    @IsOptional()
    @IsString()
    @MaxLength(120)
    source?: string;

    /** One of the form's kinds (U30), or "none" for entries without one. */
    @IsOptional()
    @IsString()
    @MaxLength(40)
    kind?: string;

    /** A city as typed, matched without case, or "none". */
    @IsOptional()
    @IsString()
    @MaxLength(80)
    city?: string;

    /** A two-letter country, or "none" for entries without one. */
    @IsOptional()
    @IsString()
    @MaxLength(4)
    country?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    cursor?: string;
}

/** Remove one entry when its owner asks (U30, KTD-17). */
export class DeleteWaitlistDto extends OperatorReasonDto {}

/**
 * A catalogue override on one business (plans catalogue U11): grant or
 * remove a catalogue row, or set its limit up or down. `expiresAt` is
 * optional: without one it lasts until an operator removes it.
 */
export class ModuleOverrideDto extends OperatorReasonDto {
    @IsIn(["grant", "remove", "limit"])
    kind!: "grant" | "remove" | "limit";

    @IsString()
    @MaxLength(80)
    moduleKey!: string;

    /** The new limit, for `limit` only. */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(1_000_000)
    value?: number;

    @IsOptional()
    @IsISO8601()
    expiresAt?: string;
}

/** A custom monthly price for one business, before GST, in paise (KTD-18). */
export class PriceOverrideDto extends OperatorReasonDto {
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(100_000_000)
    pricePaise!: number;

    @IsOptional()
    @IsISO8601()
    expiresAt?: string;
}

/**
 * Put a business on a catalogue plan until a date, whatever its
 * subscription says (how grandfathering works, U5). Writing one replaces
 * the plan override it had, so extending is writing a later date.
 */
export class PlanOverrideDto extends OperatorReasonDto {
    @IsString()
    @MaxLength(80)
    planKey!: string;

    @IsISO8601()
    expiresAt!: string;
}

/** Move one business to the live catalogue version, now or at its renewal. */
export class CatalogueMoveDto extends OperatorReasonDto {
    @IsIn(["now", "renewal"])
    when!: "now" | "renewal";
}

/**
 * Start a deploy of one Cloudflare app in one environment (#886). `confirm`
 * is the production Worker's name typed back, and the service refuses a
 * production deploy without it; a dev deploy needs none. The reason is
 * optional: the ledger records who, which app, which environment and when
 * regardless.
 */
export class StartDeploymentDto {
    @IsIn(DEPLOY_APPS)
    app!: DeployApp;

    @IsIn(DEPLOY_ENVIRONMENTS)
    environment!: DeployEnvironment;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    confirm?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    reason?: string;

    @Transform(trim)
    @IsString()
    @MinLength(8)
    @MaxLength(200)
    idempotencyKey!: string;
}
