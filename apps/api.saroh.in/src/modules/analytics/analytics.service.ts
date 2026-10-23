import {
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { AnalyticsDailyAggregate } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";
import { randomUUID } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { authorize } from "../organizations/organization-policy";
import {
    ANALYTICS_RETENTION_DAYS,
    PUBLIC_INGESTABLE_TYPES,
    validateEventProperties,
    VISIT_STEP_TYPES,
} from "./event-contract";
import { liveLinkLabel } from "./site-link-labels";
import { visitorHashOf } from "./visitor-hash";

/** ms in one day, for stamping `expiresAt` from the retention window. */
const DAY_MS = 24 * 60 * 60 * 1000;
/** ms in one hour: a visit step's times are kept to the hour. */
const HOUR_MS = 60 * 60 * 1000;

/** The hour `at` falls in, from its start. */
export function hourStartOf(at: Date): Date {
    return new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS);
}

/** The end of the hour `at` falls in (the next hour's start). */
export function hourEndOf(at: Date): Date {
    return new Date(hourStartOf(at).getTime() + HOUR_MS);
}

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

/**
 * The public-intake input — everything except the server-derived org/visitor.
 *
 * `consent`, `dedupeKey` and `occurredAt` are what the visitor's browser
 * says, so they are read and IGNORED (U15 privacy review): a public event is
 * always stored `anonymous`, at the server's time, with no key of the
 * visitor's choosing. They stay in the type so an older beacon that sends
 * them is still accepted.
 */
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
 * A visit step's properties with its `ref` kept only when it is a live
 * link label of the site (DEC-181, `site-link-labels.ts`), else left out.
 * Everything else is the contract's to check.
 */
async function withLiveLabel(
    site: { id: string; organizationId: string },
    properties: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const { ref, ...rest } = properties;
    if (ref === undefined || ref === null) return rest;
    const label = await liveLinkLabel(site, ref);
    return label === null ? rest : { ...rest, ref: label };
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
 * the target Site row (NEVER the client), only `site.view` and a visit's
 * steps (U15) are accepted, the source IP is hashed with the day's salt and the site (`visitor-hash.ts`) into both a `visitorHash` (for unique counts a day) and an
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
        // Not a DI provider — a per-instance default; @Optional() stops Nest
        // trying to inject it so the default (and test overrides) apply.
        @Optional()
        private readonly rateLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            120,
            60_000,
        ),
    ) {}

    /**
     * Ingest a PUBLIC event against `siteId`. The org is derived from the Site
     * (404 if missing) — the client never supplies it. Only `site.view` and a
     * visit's steps are
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

        // Only a page view and a visit's steps are publicly ingestable —
        // reject org-internal types.
        if (!PUBLIC_INGESTABLE_TYPES.has(input.type)) {
            throw new HttpException(
                `Event type "${input.type}" is not accepted here`,
                400,
            );
        }

        // Hash the source IP once, with the day's salt and the site: an
        // ipHash for rate-limiting and a visitorHash for unique counts a
        // day (`visitor-hash.ts`). The raw IP is used only to derive it and
        // is never stored or passed on.
        const ipHash =
            ip !== undefined
                ? visitorHashOf(site.id, ip, new Date())
                : undefined;

        if (ipHash !== undefined) {
            const allowed = this.rateLimiter.take(`${siteId}:${ipHash}`);
            if (!allowed) {
                throw new HttpException(
                    "Too many events. Wait a moment, then try again.",
                    429,
                );
            }
        }

        // A visit's steps (U15) are counted once per visit by the site
        // itself, so they need no visitor grouping: none is stored with them,
        // and a source is never kept beside anything about the person.
        const step = VISIT_STEP_TYPES.has(input.type);
        const visitorHash = step ? null : (ipHash ?? null);

        // Only the business's own links are counted as themselves
        // (DEC-181): a step's `ref` is kept when it is the label of one of
        // this site's live links made in Saroh, and otherwise dropped, so
        // the step counts under its group with no label. Never a reason to
        // refuse the step.
        const properties = step
            ? await withLiveLabel(site, input.properties)
            : input.properties;

        // What the browser says about consent, its clock and its own dedupe
        // key is never stored (U15 privacy review): a public event is
        // anonymous, at the server's time, and keyed by nothing the visitor
        // chose (a key would be an id they could follow).
        return this.record({
            organizationId: site.organizationId,
            siteId: site.id,
            type: input.type,
            schemaVersion: input.schemaVersion,
            properties,
            consent: "anonymous",
            visitorHash,
            occurredAt: undefined,
            dedupeKey: null,
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
        const bounded =
            input.occurredAt && input.occurredAt.getTime() < now.getTime()
                ? input.occurredAt
                : now;
        // A visit's steps (U15) keep their time only to the hour, so a step
        // can't be lined up with a page view (which keeps its visitor hash)
        // to the millisecond (U15 privacy review). `occurredAt` goes back to
        // the hour's start, keeping its day; `receivedAt` on to the hour's
        // end, so the hourly rollup, which reads what was received since its
        // last run, still finds it (a stamp in its past would be skipped).
        // Its id is random, not a cuid, which would carry the millisecond.
        const coarse = VISIT_STEP_TYPES.has(input.type);
        const occurredAt = coarse ? hourStartOf(bounded) : bounded;
        const receivedAt = coarse ? hourEndOf(now) : now;
        const expiresAt = new Date(
            receivedAt.getTime() + ANALYTICS_RETENTION_DAYS * DAY_MS,
        );

        try {
            const event = await prisma.analyticsEvent.create({
                data: {
                    ...(coarse ? { id: randomUUID() } : {}),
                    organizationId: input.organizationId,
                    siteId: input.siteId ?? null,
                    projectId: input.projectId ?? null,
                    type: input.type,
                    schemaVersion,
                    properties: properties as Prisma.InputJsonValue,
                    consent: input.consent ?? "anonymous",
                    visitorHash: input.visitorHash ?? null,
                    occurredAt,
                    receivedAt,
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
}
