import {
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type {
    PosthogRegion,
    TrackerKind,
    VerificationService,
} from "@saroh/block-contract";
import {
    checkTrackerId,
    checkVerificationCode,
    isPosthogRegion,
    isTrackerKind,
    isVerificationService,
    TRACKER_KINDS,
} from "@saroh/block-contract";
import { prisma, runInOrgContext } from "@saroh/database";

import type { BusinessAccess } from "../billing/catalogue-access.service";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";

/**
 * What a live site puts in every page's head, read live beside the
 * publication (DEC-108, #893): its verification codes, and the merchant's
 * own trackers.
 *
 * Public, so it carries only public values: codes, tracker ids and a
 * PostHog region, plus the merchant's privacy page. Nothing from the
 * business's provider connections, nor anything else about it, is read
 * here at all.
 *
 * Trackers fail CLOSED: none unless the business's plan resolves through
 * the catalogue with `site-trackers` on, and Saroh hasn't switched the site
 * off. `planMeter.isIncluded` is not used, because it answers yes whenever
 * it can't tell. Codes are on every plan, so they are served regardless.
 */
export interface PublicHead {
    verifications: { service: VerificationService; code: string }[];
    trackers: { kind: TrackerKind; id: string; region: PosthogRegion | null }[];
    privacyUrl: string | null;
}

/**
 * Two windows, so trackers never take the codes down with them: a page
 * view asks for both, and a visitor past the tracker limit (or one the
 * renderer could not name) still gets the codes Google re-checks.
 */
const CODE_READS_PER_WINDOW = 600;
const TRACKER_READS_PER_WINDOW = 120;
const READ_WINDOW_MS = 60_000;

/** Whether the business's plan includes its own trackers. Closed on doubt. */
export function trackersIncluded(access: BusinessAccess): boolean {
    if (access.source !== "catalogue") return false;
    return (
        access.modules.find((m) => m.moduleId === "site-trackers")?.state ===
        "on"
    );
}

@Injectable()
export class PublicHeadService {
    constructor(
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
        // Not DI providers: per-instance defaults that tests can replace.
        @Optional()
        private readonly codeLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            CODE_READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
        @Optional()
        private readonly trackerLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            TRACKER_READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
    ) {}

    async read(
        siteId: string,
        callerHash: string | undefined,
    ): Promise<PublicHead> {
        if (!this.codeLimiter.take(callerHash ?? `site:${siteId}`)) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: { organizationId: true },
        });
        if (!site) throw new NotFoundException("Nothing to show here");
        const { organizationId } = site;

        const [codes, trackers, settings] = await runInOrgContext(
            organizationId,
            () =>
                Promise.all([
                    prisma.siteVerification.findMany({
                        where: { siteId, organizationId },
                        select: { service: true, code: true },
                    }),
                    prisma.siteTracker.findMany({
                        where: { siteId, organizationId, enabled: true },
                        select: { kind: true, trackerId: true, region: true },
                    }),
                    prisma.siteTrackingSettings.findFirst({
                        where: { siteId, organizationId },
                        select: { privacyUrl: true, switchedOffAt: true },
                    }),
                ]),
        );

        const verifications = codes.flatMap((row) => {
            if (!isVerificationService(row.service)) return [];
            const checked = checkVerificationCode(row.service, row.code);
            return checked.ok
                ? [{ service: row.service, code: checked.value }]
                : [];
        });

        // A visitor the renderer couldn't name shares one window with every
        // other such visitor; they get the codes but never the trackers.
        const served =
            trackers.length > 0 &&
            !settings?.switchedOffAt &&
            callerHash !== undefined &&
            this.trackerLimiter.take(callerHash) &&
            trackersIncluded(await this.resolveSafely(organizationId));

        return {
            verifications,
            trackers: served ? usable(trackers) : [],
            privacyUrl: served ? (settings?.privacyUrl ?? null) : null,
        };
    }

    /** The plan, or none when it can't be read: trackers then stay off. */
    private async resolveSafely(
        organizationId: string,
    ): Promise<BusinessAccess> {
        try {
            return await this.access.resolve(organizationId);
        } catch {
            return {
                source: "legacy",
                reason: "no-catalogue",
                entitlements: {},
                planEntitlements: {},
                planOverride: null,
            };
        }
    }
}

/** Stored trackers re-checked, in the list's order. A bad row is dropped. */
function usable(
    rows: { kind: string; trackerId: string; region: string | null }[],
): PublicHead["trackers"] {
    return TRACKER_KINDS.flatMap((kind) => {
        const row = rows.find((r) => r.kind === kind);
        if (!row || !isTrackerKind(row.kind)) return [];
        const checked = checkTrackerId(kind, row.trackerId);
        if (!checked.ok) return [];
        if (kind === "posthog" && !isPosthogRegion(row.region)) return [];
        return [
            {
                kind,
                id: checked.value,
                region:
                    kind === "posthog" && isPosthogRegion(row.region)
                        ? row.region
                        : null,
            },
        ];
    });
}
