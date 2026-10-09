import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Domain, Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { domainFakesOn } from "./domain-fakes";
import type { DomainHosting } from "./domain-hosting";
import { DOMAIN_HOSTING } from "./domain-hosting";
import { HOSTING_WORDS } from "./domain-hosting-sync";
import {
    DOMAIN_RECHECK_BATCH,
    DOMAIN_RECHECK_EVERY_MS,
    DOMAIN_RECHECK_MAX_HOST_FAILURES,
    lastCheckedOf,
    RECHECK_FAST_MS,
    RECHECK_PENDING_FOR_MS,
    recheckDue,
} from "./domain-recheck";
import { DomainsService } from "./domains.service";

/**
 * The background re-check of custom domains (#860). Before it, a domain's
 * hosting state moved only when the merchant pressed "Check now", so a
 * domain that went live waited on a click and one that stopped pointing
 * here was never noticed.
 *
 * A self-rescheduling chain like the renewal job (ADR-007,
 * `backend-jobs.md`): one PENDING run at a time
 * (`Job_one_pending_domains_recheck`), every five minutes. Each run finds
 * the domains due by the ladder in `domain-recheck.ts` and checks each
 * through `DomainsService.check`, exactly as "Check now" does. A domain
 * that fails is logged and passed; the run throws only when it cannot
 * enqueue the next one, so the worker retries it.
 *
 * Off — no run is queued and a stray one ends quietly — when hosting
 * isn't set up (no Cloudflare token or zone: dev, local) or the test-only
 * domain fakes are on, so the browser-test stack's domains move only when
 * a spec presses "Check now".
 *
 * Idempotent: a check writes the row's state as the host and DNS report
 * it now, so running one twice is two reads.
 */
export const DOMAIN_RECHECK_TYPE = "domains.recheck";

/** What a run did, for its log line and the spec. */
export interface RecheckSummary {
    checked: number;
    failed: number;
    /** True when the run stopped early because the host kept failing. */
    hostBackedOff: boolean;
    /** Domains that were live and no longer are. */
    wentDown: number;
}

/** Host-call failure words `syncHosting` writes on a row. */
const HOST_FAILURE_WORDS = new Set<string>([
    HOSTING_WORDS.unreachable,
    HOSTING_WORDS.checkFailed,
]);

@Injectable()
export class DomainRecheckHandler {
    private readonly logger = new Logger(DomainRecheckHandler.name);

    constructor(
        private readonly domains: DomainsService,
        @Inject(DOMAIN_HOSTING)
        private readonly hosting: DomainHosting | null = null,
    ) {}

    /** Whether the chain runs on this instance (see the class note). */
    enabled(): boolean {
        return this.hosting !== null && !domainFakesOn();
    }

    readonly handle = async (_job: Job): Promise<void> => {
        if (!this.enabled()) {
            // A run queued before hosting was turned off: end the chain.
            this.logger.log(
                "domains_recheck_off: hosting isn't set up here; not re-checking custom domains",
            );
            return;
        }
        const now = new Date();
        try {
            const summary = await this.sweep(now);
            if (summary.checked > 0 || summary.failed > 0) {
                this.logger.log(
                    `domains_recheck checked=${summary.checked} failed=${summary.failed} wentDown=${summary.wentDown}${summary.hostBackedOff ? " hostBackedOff=1" : ""}`,
                );
            }
        } catch (error) {
            // The read of due domains failed: the next run tries again.
            this.logger.error(
                `domains_recheck: sweep failed before it finished: ${String(error)}`,
            );
        }
        const runAt = new Date(now.getTime() + DOMAIN_RECHECK_EVERY_MS);
        if (!(await this.schedule(runAt))) {
            throw new Error(
                "Could not schedule the next domain re-check; retrying this one",
            );
        }
    };

    /**
     * Check every domain due at `now`, oldest-checked first, at most
     * {@link DOMAIN_RECHECK_BATCH}. Stops early after
     * {@link DOMAIN_RECHECK_MAX_HOST_FAILURES} host failures in a row.
     */
    async sweep(now: Date): Promise<RecheckSummary> {
        const due = await this.findDue(now);
        const summary: RecheckSummary = {
            checked: 0,
            failed: 0,
            hostBackedOff: false,
            wentDown: 0,
        };
        let hostFailures = 0;
        for (const domain of due) {
            if (hostFailures >= DOMAIN_RECHECK_MAX_HOST_FAILURES) {
                summary.hostBackedOff = true;
                this.logger.warn(
                    `domains_recheck_host_backoff failures=${hostFailures}: leaving the rest for the next run`,
                );
                break;
            }
            try {
                const { domain: after } = await this.domains.check(domain);
                summary.checked += 1;
                hostFailures = this.hostFailed(domain, after)
                    ? hostFailures + 1
                    : 0;
                if (this.wentDown(domain, after)) {
                    summary.wentDown += 1;
                    // The check itself queued the team's alert with its
                    // write (#917, once per incident); this line is for
                    // us, so a wave of them (a host outage) shows.
                    this.logger.warn(
                        `domain_hosting_went_down domain=${after.id} org=${after.organizationId} status=${after.hostingStatus ?? "-"}`,
                    );
                }
            } catch (error) {
                summary.failed += 1;
                await this.afterFailure(domain, error);
            }
        }
        return summary;
    }

    /**
     * The due domains: verified ones not asked in the last five minutes,
     * and claims younger than {@link RECHECK_PENDING_FOR_MS} likewise, then
     * the ladder decides. Each side reads its oldest-checked first.
     */
    private async findDue(now: Date): Promise<Domain[]> {
        const recent = new Date(now.getTime() - RECHECK_FAST_MS);
        const take = DOMAIN_RECHECK_BATCH * 4;
        const [verified, pending] = await Promise.all([
            prisma.domain.findMany({
                where: {
                    status: "VERIFIED",
                    OR: [
                        { hostingCheckedAt: null },
                        { hostingCheckedAt: { lte: recent } },
                    ],
                },
                orderBy: { hostingCheckedAt: { sort: "asc", nulls: "first" } },
                take,
            }),
            prisma.domain.findMany({
                where: {
                    status: "PENDING",
                    createdAt: {
                        gt: new Date(now.getTime() - RECHECK_PENDING_FOR_MS),
                    },
                    OR: [
                        { lastCheckedAt: null },
                        { lastCheckedAt: { lte: recent } },
                    ],
                },
                orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
                take,
            }),
        ]);
        return [...verified, ...pending]
            .filter((d) => recheckDue(d, now))
            .sort((a, b) => lastCheckedOf(a) - lastCheckedOf(b))
            .slice(0, DOMAIN_RECHECK_BATCH);
    }

    /** Whether this check's host call failed (the row says so in words). */
    private hostFailed(before: Domain, after: Domain): boolean {
        return (
            before.status === "VERIFIED" &&
            after.hostingError !== null &&
            HOST_FAILURE_WORDS.has(after.hostingError)
        );
    }

    /** Live before this check, and not live after it on the host's word. */
    private wentDown(before: Domain, after: Domain): boolean {
        return (
            before.hostingStatus === "ACTIVE" &&
            after.hostingStatus !== "ACTIVE"
        );
    }

    /**
     * A check that threw (a database error, or the row deleted under it).
     * A domain removed mid-check may have been registered again at the host
     * by this very check; when no row holds the hostname any more, it is
     * deleted there too, so nothing is left serving a domain Saroh dropped.
     */
    private async afterFailure(domain: Domain, error: unknown): Promise<void> {
        if (prismaErrorCode(error) !== "P2025") {
            this.logger.error(
                `domains_recheck_failed domain=${domain.id}: ${String(error)}`,
            );
            return;
        }
        this.logger.log(
            `domains_recheck_gone domain=${domain.id}: removed while it was checked`,
        );
        if (!this.hosting || domain.status !== "VERIFIED") return;
        try {
            const holder = await prisma.domain.findUnique({
                where: { hostname: domain.hostname },
                select: { id: true },
            });
            if (holder) return;
            await this.hosting.remove({ id: null, hostname: domain.hostname });
        } catch (cleanup) {
            this.logger.warn(
                `domains_recheck_cleanup_failed domain=${domain.id}: ${String(cleanup)}`,
            );
        }
    }

    /**
     * Enqueue the next run unless one is already waiting (P2002 = already
     * scheduled). Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: { type: DOMAIN_RECHECK_TYPE, payload: {}, runAt },
            });
            return true;
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return true;
            this.logger.error(
                `Could not schedule the next domain re-check: ${String(error)}`,
            );
            return false;
        }
    }

    /** Start the chain again when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        if (!this.enabled()) return;
        try {
            const live = await prisma.job.count({
                where: {
                    type: DOMAIN_RECHECK_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the domain re-check chain: ${String(error)}`,
            );
        }
    }
}
