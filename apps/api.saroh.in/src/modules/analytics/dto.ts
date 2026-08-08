import { Transform } from "class-transformer";
import {
    IsInt,
    IsISO8601,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

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
