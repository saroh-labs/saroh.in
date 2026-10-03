import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsISO8601,
    IsObject,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** A coupon code as typed: trimmed and upper-cased (the column's CHECK). */
const upperTrim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value;

/** `POST /admin/pricing/preview-token`: the draft revision on screen. */
export class PreviewTokenDto {
    @IsInt()
    @Min(0)
    revision!: number;
}

/**
 * `PUT /admin/pricing/draft`: the whole draft as the editor holds it, and
 * the revision it was based on (0 when there is no draft yet). The catalogue
 * is stored as sent and checked on read and on publish, because the shared
 * draft autosaves while it is half-edited (U3's `AdminDraft.valid`).
 */
export class SaveDraftDto {
    @IsObject()
    catalog!: Record<string, unknown>;

    @IsInt()
    @Min(0)
    revision!: number;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(8)
    @MaxLength(200)
    idempotencyKey?: string;
}

/** `DELETE /admin/pricing/draft`: the revision the person decided to throw away. */
export class DiscardDraftDto {
    @IsInt()
    @Min(0)
    revision!: number;

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

/** Every write that changes what businesses pay or get carries these. */
class ReasonedWriteDto {
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

export const PUBLISH_POLICIES = ["keep", "move"] as const;
export type PublishPolicy = (typeof PUBLISH_POLICIES)[number];

/** `POST /admin/pricing/publish`. */
export class PublishDto extends ReasonedWriteDto {
    /** The draft revision reviewed: a newer save is a 409, not a surprise. */
    @IsInt()
    @Min(0)
    revision!: number;

    /** Absent: now. Otherwise a moment ahead (a scheduled version). */
    @IsOptional()
    @IsISO8601({ strict: true })
    goLiveAt?: string;

    @IsIn(PUBLISH_POLICIES)
    policy!: PublishPolicy;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    note?: string;
}

/** `DELETE /admin/pricing/versions/:version` (cancel a scheduled version). */
export class CancelVersionDto extends ReasonedWriteDto {}

/** `POST /admin/pricing/versions/:version/rollback`. */
export class RollbackDto extends ReasonedWriteDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    note?: string;
}

/** Codes people type at checkout: letters, digits and dashes. */
const COUPON_CODE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
const COUPON_CODE_MESSAGE =
    "Use 3 to 32 letters, digits or dashes, starting with a letter or digit";

/** `POST /admin/pricing/coupons`. Coupons apply at once, outside versions. */
export class CreateCouponDto extends ReasonedWriteDto {
    @Transform(upperTrim)
    @IsString()
    @Matches(COUPON_CODE, { message: COUPON_CODE_MESSAGE })
    code!: string;

    /** Off each month's charge, in paise, before GST. */
    @IsInt()
    @Min(1)
    discountPaise!: number;

    @IsInt()
    @Min(1)
    @Max(36)
    months!: number;

    /** Catalogue plan ids it applies to (paid plans of the live version). */
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @IsString({ each: true })
    planIds!: string[];

    @IsInt()
    @Min(1)
    @Max(1_000_000)
    maxRedemptions!: number;

    @IsOptional()
    @IsISO8601({ strict: true })
    expiresAt?: string;

    /** New coupons start paused unless asked otherwise (the design). */
    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

/** `PATCH /admin/pricing/coupons/:id`. The code itself never changes. */
export class UpdateCouponDto extends ReasonedWriteDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    discountPaise?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(36)
    months?: number;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @IsString({ each: true })
    planIds?: string[];

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1_000_000)
    maxRedemptions?: number;

    /** An ISO time, or null to remove the expiry. */
    @IsOptional()
    @IsISO8601({ strict: true })
    expiresAt?: string | null;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

/** `DELETE /admin/pricing/coupons/:id`. */
export class DeleteCouponDto extends ReasonedWriteDto {}
