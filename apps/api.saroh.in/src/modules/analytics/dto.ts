import { Transform } from "class-transformer";
import {
    IsIn,
    IsInt,
    IsISO8601,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

import type { InsightsPeriod } from "./period";
import { INSIGHTS_PERIODS } from "./period";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * PUBLIC analytics intake body (S7-002) — the payload an anonymous visitor's
 * beacon POSTs to `/public/sites/:siteId/analytics/events`.
 *
 * SECURITY: this DTO carries NO organization id. The owning org is derived
 * server-side from the `:siteId` Site row, never from the client — identical to
 * how the public enquiry endpoint derives its org from the target Form. Only
 * `site.view` is accepted here (enforced in the service); `properties` is
 * validated against the versioned event contract before anything is persisted.
 */
export class IngestAnalyticsEventDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    type!: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    schemaVersion?: number;

    /** Event properties — validated against the `(type, schemaVersion)` contract. */
    @IsObject()
    properties!: Record<string, unknown>;

    /** Consent basis at capture time (defaults to "anonymous" server-side). */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(32)
    consent?: string;

    /** Optional client idempotency key — a replay is a no-op (P2002). */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(200)
    dedupeKey?: string;

    /** When the event happened (source clock); bounded to now at intake. */
    @IsOptional()
    @IsISO8601()
    occurredAt?: string;
}

/**
 * Insights' one period for the page (DEC-171): `7d`, `4w` or `3m`, each
 * against the same number of days before it (`period.ts`). Absent means
 * the default, the last 4 weeks; anything else is a 400.
 */
export class InsightsPeriodQueryDto {
    @IsOptional()
    @IsIn(INSIGHTS_PERIODS, {
        message: `period must be one of ${INSIGHTS_PERIODS.join(", ")}`,
    })
    period?: InsightsPeriod;
}

/**
 * Insights' sources (plan U16, #1101): the period, and the website chosen
 * on Where customers come from, absent for every website together. A
 * website not the business's reads as no visits; the read names the
 * business on every query.
 */
export class InsightsSourcesQueryDto extends InsightsPeriodQueryDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    siteId?: string;
}
