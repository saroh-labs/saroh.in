import { HttpException, Injectable, NotFoundException } from "@nestjs/common";
import type { AnalyticsDailyAggregate } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";
import { createHash } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { authorize } from "../organizations/organization-policy";
import {
    ANALYTICS_RETENTION_DAYS,
    PUBLIC_INGESTABLE_TYPES,
    validateEventProperties,
} from "./event-contract";

/** The env var holding the IP-hashing salt (a platform secret, not per-org). */
const IP_SALT_ENV = "ANALYTICS_IP_SALT";
/** Dev fallback salt — production MUST set `ANALYTICS_IP_SALT` in the env. */
const DEV_IP_SALT = "saroh-dev-analytics-ip-salt";

/** ms in one day, for stamping `expiresAt` from the retention window. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The authoritative write input for {@link AnalyticsService.record}. Used by both
 * the public intake and (later) server-side producers. `visitorHash` is ALREADY
 * a salted hash (or null) — a raw IP must never reach this method.
 */
export interface RecordEventInput {
    organizationId: string;
    type: string;
    schemaVersion?: number;
    properties: Record<string, unknown>;
    siteId?: string | null;
    projectId?: string | null;
    consent?: string;
    visitorHash?: string | null;
    occurredAt?: Date;
    dedupeKey?: string | null;
}

/** The public-intake input — everything except the server-derived org/visitor. */
export interface PublicIngestInput {
    type: string;
    schemaVersion?: number;
    properties: Record<string, unknown>;
    consent?: string;
    dedupeKey?: string;
    occurredAt?: string;
}

/** The minimal intake result — the event id + whether it was a dedupe replay. */
export interface IngestResult {
    id: string;
    deduped: boolean;
}

/** Optional filters for the org dashboard read. */
export interface DashboardFilter {
    siteId?: string;
    type?: string;
    from?: Date;
    to?: Date;
}

/**
 * Analytics intake + org-safe reads (S7-002).
 *
 * `record` is the internal, authoritative write behind both the public beacon
 * and server-side producers: it validates against the versioned contract, stamps
 * server `receivedAt` + retention `expiresAt`, and is idempotent via `dedupeKey`
 * (a P2002 on the `(organizationId, dedupeKey)` unique is a no-op that returns
 * the existing row). It NEVER stores a raw IP — the caller passes an
 * already-salted `visitorHash`.
 *
 * `ingestPublic` is the unauthenticated boundary: the owning org is derived from
 * the target Site row (NEVER the client), only `site.view` is accepted, the
 * source IP is salted into both a `visitorHash` (for unique counts) and an
 * `ipHash` (for rate-limiting) and then discarded.
 *
 * `getDashboard` reads the pre-computed `AnalyticsDailyAggregate` rows for
 * `ctx.organizationId` ONLY, gated by `analytics:read` — a cross-tenant row is
 * impossible because every query is filtered by the proven org id.
 */
@Injectable()
export class AnalyticsService {
    /**
     * @param rateLimiter per-instance limiter for the public beacon (default
     * 120 hits / minute per `${siteId}:${ipHash}`). Injectable for tests.
     */
    constructor(
        private readonly rateLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            120,
            60_000,
        ),
    ) {}

    /**
     * Ingest a PUBLIC event against `siteId`. The org is derived from the Site
     * (404 if missing) — the client never supplies it. Only `site.view` is
     * accepted (other types 400). The raw IP is salted into a `visitorHash` and
     * an `ipHash` and then dropped; rate-limiting is per `(siteId, ipHash)`.
     */
    async ingestPublic(
        siteId: string,
        input: PublicIngestInput,
        ip: string | undefined,
    ): Promise<IngestResult> {
        // Derive the owning org from the Site — the tenant-isolation boundary.
        const site = await prisma.site.findUnique({ where: { id: siteId } });
        if (!site) {
            throw new NotFoundException("Site not found");
        }

        // Only `site.view` is publicly ingestable — reject org-internal types.
        if (!PUBLIC_INGESTABLE_TYPES.has(input.type)) {
            throw new HttpException(
                `Event type "${input.type}" is not accepted here`,
                400,
            );
        }

        // Salt the source IP once: an ipHash for rate-limiting and a visitorHash
        // for unique counts. The raw IP is used only to derive these and is
        // never stored or passed on.
        const ipHash = ip !== undefined ? this.hashIp(ip) : undefined;

        if (ipHash !== undefined) {
            const allowed = this.rateLimiter.take(`${siteId}:${ipHash}`);
            if (!allowed) {
                throw new HttpException(
                    "Too many events — please slow down",
                    429,
                );
            }
        }

        const visitorHash = ipHash ?? null;

        return this.record({
            organizationId: site.organizationId,
            siteId: site.id,
            type: input.type,
            schemaVersion: input.schemaVersion,
            properties: input.properties,
            consent: input.consent,
            visitorHash,
            occurredAt: input.occurredAt
                ? new Date(input.occurredAt)
                : undefined,
            dedupeKey: input.dedupeKey ?? null,
        });
    }

    /**
     * The authoritative event write. Validates the properties against the
     * versioned contract, stamps server `receivedAt` + retention `expiresAt`,
     * bounds `occurredAt` to now, and creates the row. Idempotent: a duplicate
     * `dedupeKey` raises P2002 on the `(organizationId, dedupeKey)` unique, which
     * is caught and replayed as a no-op returning the existing row.
     */
    async record(input: RecordEventInput): Promise<IngestResult> {
        const schemaVersion = input.schemaVersion ?? 1;
        const properties = validateEventProperties(
            input.type,
            schemaVersion,
            input.properties,
        );

        const now = new Date();
        // Bound the source-clock occurredAt to the server clock — never accept a
        // future timestamp (which would land in the wrong day bucket).
        const occurredAt =
            input.occurredAt && input.occurredAt.getTime() < now.getTime()
                ? input.occurredAt
                : now;
        const expiresAt = new Date(
            now.getTime() + ANALYTICS_RETENTION_DAYS * DAY_MS,
        );

        try {
            const event = await prisma.analyticsEvent.create({
                data: {
                    organizationId: input.organizationId,
                    siteId: input.siteId ?? null,
                    projectId: input.projectId ?? null,
                    type: input.type,
                    schemaVersion,
                    properties: properties as Prisma.InputJsonValue,
                    consent: input.consent ?? "anonymous",
                    visitorHash: input.visitorHash ?? null,
                    occurredAt,
                    receivedAt: now,
                    expiresAt,
                    dedupeKey: input.dedupeKey ?? null,
                },
            });
            return { id: event.id, deduped: false };
        } catch (err) {
            // P2002 on (organizationId, dedupeKey): an at-least-once replay of
            // the same event. Return the existing row — an idempotent no-op.
            if (
                input.dedupeKey &&
                (err as { code?: string }).code === "P2002"
            ) {
                const existing = await prisma.analyticsEvent.findFirst({
                    where: {
                        organizationId: input.organizationId,
                        dedupeKey: input.dedupeKey,
                    },
                });
                if (existing) {
                    return { id: existing.id, deduped: true };
                }
            }
            throw err;
        }
    }

    /**
     * Read the org's pre-computed daily aggregates for the dashboard.
     * Authorizes `analytics:read`. EVERY query is filtered by
     * `ctx.organizationId`, so a cross-tenant row can never surface. Optional
     * `{ siteId, type, from, to }` narrow the result.
     */
    async getDashboard(
        ctx: OrganizationContext,
        filter: DashboardFilter = {},
    ): Promise<AnalyticsDailyAggregate[]> {
        authorize(ctx, "analytics:read");

        const dateFilter: Prisma.DateTimeFilter = {};
        if (filter.from) {
            dateFilter.gte = filter.from;
        }
        if (filter.to) {
            dateFilter.lte = filter.to;
        }
        const hasDate = filter.from !== undefined || filter.to !== undefined;

        return prisma.analyticsDailyAggregate.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(filter.siteId !== undefined
                    ? { siteId: filter.siteId }
                    : {}),
                ...(filter.type !== undefined ? { type: filter.type } : {}),
                ...(hasDate ? { date: dateFilter } : {}),
            },
            orderBy: [{ date: "desc" }, { type: "asc" }],
        });
    }

    /**
     * Salt-hash a source IP with `ANALYTICS_IP_SALT` (a dev fallback is used when
     * unset). The output is a coarse, NON-reversible grouping token — the raw IP
     * is NEVER persisted. Read via `globalThis.process.env[name]` (the same
     * pattern billing's platform-secrets uses) so it goes straight to the env
     * without touching the validated `env.ts` this ticket must not modify.
     */
    private hashIp(ip: string): string {
        const salt = globalThis.process.env[IP_SALT_ENV] ?? DEV_IP_SALT;
        return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
    }
}
