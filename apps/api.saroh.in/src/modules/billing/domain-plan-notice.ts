import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { dayWords } from "../../common/words-format";
import { businessTimezone } from "../bookings/staff-availability";
import { noticeOf } from "../notifications/notice-target";
import { enqueueBusinessSitesRevalidation } from "../sites/page-cache-revalidate";
import { rendererHost } from "../sites/site-origin";
import { enqueueBillingEmail } from "./billing-email.job";
import type { DomainWords } from "./domain-plan";
import {
    clockStart,
    DOMAIN_ENDED_KEY,
    DOMAIN_ENDED_KIND,
    DOMAIN_PAUSED_KIND,
    DOMAIN_TOLD_KIND,
    domainNotice,
    domainPausedKey,
    domainPlanState,
    domainStopsAt,
    domainToldKey,
    toldEndOf,
} from "./domain-plan";
import type { ConnectedDomain, DomainPlanService } from "./domain-plan.service";
import { domainPlan } from "./domain-plan.service";
import { PLAN_ENDING_NOTIFICATION_TYPE, planEndingStage } from "./plan-ending";

/**
 * Telling a business what happens to its own domain when its plan stops
 * including one (DEC-139), and keeping the 3-day clock. The hourly billing
 * sweep runs {@link sweepDomains} after the plan's own notices.
 *
 * | What happened                                             | Told by                                                        | The domain stops           |
 * | --------------------------------------------------------- | -------------------------------------------------------------- | -------------------------- |
 * | The plan ends on a known day (an offer, a term, a move)    | a line in that end's own notice, 30, 7 and 1 days ahead; this sweep's own notice where that one said nothing | 3 days after the end       |
 * | The plan ended at once (a payment failed for good, a cancel now, an operator's change) | a line in the move-down notice when one is sent, else this sweep's own notice, within the hour | 3 days after it was told   |
 * | The 3 days are up                                          | this sweep, once                                               | now                        |
 *
 * Three claims (`CustomerNotice`), all gone again once the plan includes a
 * domain, so a later move is told and waited for afresh:
 *
 * - `DOMAIN_ENDING` `domain-ending:<end>:<stage>`: an end told ahead.
 * - `DOMAIN_PLAN_ENDED` `domain-plan-ended`: the clock, dated at the end the
 *   business was told about when one has passed, else when the sweep first
 *   saw the plan without a domain.
 * - `DOMAIN_PAUSED` `domain-paused:<clock>`: the "now paused" notice.
 *
 * Nothing here touches a `Domain` row, its verification or its hostname at
 * the host.
 */

type Tx = Prisma.TransactionClient;

const CLAIM_KINDS = [DOMAIN_TOLD_KIND, DOMAIN_ENDED_KIND, DOMAIN_PAUSED_KIND];

/**
 * Where a business's domains send visitors while paused, as a host
 * ("yourshop.saroh.app"); null when they belong to different websites, or
 * the website has no Saroh address.
 */
export function sarohAddressOf(
    domains: readonly ConnectedDomain[],
): string | null {
    const addresses = new Set(domains.map((d) => d.subdomain));
    const only = addresses.size === 1 ? domains[0]?.subdomain : null;
    return only ? `${only}.${rendererHost()}` : null;
}

function wordsOf(
    domains: readonly ConnectedDomain[],
    stopsAt: Date,
    zone: string,
): DomainWords {
    return {
        hostnames: domains.map((d) => d.hostname),
        stopsOn: dayWords(stopsAt, zone, { year: true }),
        address: sarohAddressOf(domains),
    };
}

/**
 * The domain line for a plan's own notice of an end at `endsAt`: the words
 * when that end is the one that stops the domain, else null (no connected
 * domain, nothing enforced, the next plan includes one, or another end
 * comes first and its notice carries the line). Null too when the domain
 * can't be read: the plan's notice goes without the line, and the sweep's
 * own step tells it.
 */
export async function domainEndingFor(
    organizationId: string,
    endsAt: Date,
    zone: string,
    now: Date,
    svc: DomainPlanService = domainPlan,
): Promise<DomainWords | null> {
    const s = await svc.standingOrNull(organizationId, now);
    if (s?.plan.state !== "ending" || s.domains.length === 0) return null;
    if (s.plan.endsAt.getTime() !== endsAt.getTime()) return null;
    return wordsOf(s.domains, s.plan.stopsAt, zone);
}

/** Record, on the notice's transaction, that it told the domain's end. */
export async function claimDomainToldInTx(
    tx: Pick<Tx, "customerNotice">,
    organizationId: string,
    endsAt: Date,
    stage: number,
): Promise<void> {
    await tx.customerNotice.createMany({
        data: [
            {
                organizationId,
                eventKey: domainToldKey(endsAt, stage),
                kind: DOMAIN_TOLD_KIND,
            },
        ],
        skipDuplicates: true,
    });
}

/**
 * The domain line for a notice of a move that already happened, with no
 * clock yet and no end told ahead: the words, counted from now. Null when
 * there is nothing to say, or the sweep's own step will start the clock at
 * the end the business was told about.
 */
export async function domainEndedFor(
    organizationId: string,
    zone: string,
    now: Date,
    svc: DomainPlanService = domainPlan,
): Promise<DomainWords | null> {
    const s = await svc.standingOrNull(organizationId, now);
    if (!s?.enforced || s.domains.length === 0) return null;
    if (s.plan.state !== "grace" && s.plan.state !== "paused") return null;
    const claims = await prisma.customerNotice.findMany({
        where: { organizationId, kind: { in: CLAIM_KINDS } },
        select: { kind: true, eventKey: true },
    });
    if (claims.some((c) => c.kind === DOMAIN_ENDED_KIND)) return null;
    const told = claims
        .filter((c) => c.kind === DOMAIN_TOLD_KIND)
        .map((c) => c.eventKey);
    if (clockStart(told, now).getTime() !== now.getTime()) return null;
    return wordsOf(s.domains, domainStopsAt(now), zone);
}

/**
 * Start the clock on the notice's transaction. True when this call started
 * it; false when it was already running.
 */
export async function startDomainClockInTx(
    tx: Pick<Tx, "customerNotice">,
    organizationId: string,
    startedAt: Date,
): Promise<boolean> {
    const made = await tx.customerNotice.createMany({
        data: [
            {
                organizationId,
                eventKey: DOMAIN_ENDED_KEY,
                kind: DOMAIN_ENDED_KIND,
                // Dated by the sweep's clock, so a check at exactly 3 days
                // on agrees with the day the notice named.
                createdAt: startedAt,
            },
        ],
        skipDuplicates: true,
    });
    return made.count > 0;
}

/** The sweep's step. Returns how many businesses were told something. */
export async function sweepDomains(
    now: Date,
    logger: Pick<Logger, "error">,
    svc: DomainPlanService = domainPlan,
): Promise<number> {
    const [connected, claimed] = await Promise.all([
        prisma.domain.findMany({
            where: { status: "VERIFIED", siteId: { not: null } },
            select: { organizationId: true },
            distinct: ["organizationId"],
        }),
        prisma.customerNotice.findMany({
            where: { kind: { in: CLAIM_KINDS } },
            select: { organizationId: true },
            distinct: ["organizationId"],
        }),
    ]);
    const organizationIds = new Set(
        [...connected, ...claimed].map((r) => r.organizationId),
    );
    let told = 0;
    for (const organizationId of [...organizationIds].sort()) {
        try {
            if (await sweepOne(organizationId, now, svc)) told += 1;
        } catch (error) {
            // One that fails never stops the rest.
            logger.error(
                `domain_plan_notice_failed org=${organizationId}: ${String(error)}`,
            );
        }
    }
    return told;
}

async function sweepOne(
    organizationId: string,
    now: Date,
    svc: DomainPlanService,
): Promise<boolean> {
    const s = await svc.standing(organizationId, now);
    const claims = await prisma.customerNotice.findMany({
        where: { organizationId, kind: { in: CLAIM_KINDS } },
        select: { id: true, kind: true, eventKey: true, createdAt: true },
    });
    const told = claims.filter((c) => c.kind === DOMAIN_TOLD_KIND);
    const ended = claims.find((c) => c.kind === DOMAIN_ENDED_KIND);
    const pausedTold = claims.filter((c) => c.kind === DOMAIN_PAUSED_KIND);

    // The plan includes a domain (or nothing is enforced, or no domain is
    // connected any more): what a past move left behind goes.
    const plan =
        s.domains.length === 0 ? { state: "included" as const } : s.plan;
    if (plan.state === "included" || plan.state === "ending") {
        const end = plan.state === "ending" ? plan.endsAt.getTime() : null;
        const gone = claims.filter(
            (c) =>
                c.kind !== DOMAIN_TOLD_KIND ||
                toldEndOf(c.eventKey)?.getTime() !== end,
        );
        if (gone.length > 0) {
            await prisma.$transaction(async (tx) => {
                await tx.customerNotice.deleteMany({
                    where: { id: { in: gone.map((c) => c.id) } },
                });
                // Back on a plan with a domain: every page names the
                // domain as its address again.
                if (pausedTold.length > 0) {
                    await enqueueBusinessSitesRevalidation(
                        tx,
                        organizationId,
                        "domain",
                    );
                }
            });
            svc.forget(organizationId);
        }
        if (plan.state !== "ending") return false;
        const stage = planEndingStage(plan.endsAt, now);
        if (!stage) return false;
        const eventKey = domainToldKey(plan.endsAt, stage);
        // The plan's own notice of this end already carried the line.
        if (told.some((c) => c.eventKey === eventKey)) return false;
        const zone = await businessTimezone(prisma, organizationId);
        const words = wordsOf(s.domains, plan.stopsAt, zone);
        return prisma.$transaction(async (tx) => {
            const claim = await tx.customerNotice.createMany({
                data: [{ organizationId, eventKey, kind: DOMAIN_TOLD_KIND }],
                skipDuplicates: true,
            });
            if (claim.count === 0) return false;
            await say(tx, organizationId, eventKey, eventKey, "ending", words);
            return true;
        });
    }

    // The plan no longer includes a domain.
    const zone = await businessTimezone(prisma, organizationId);
    let said = false;
    let endedAt = ended?.createdAt ?? null;
    if (!endedAt) {
        const startAt = clockStart(
            told.map((c) => c.eventKey),
            now,
        );
        // An end told ahead needs no second notice when it comes.
        const toldAhead = startAt.getTime() < now.getTime();
        const started = await prisma.$transaction(async (tx) => {
            if (!(await startDomainClockInTx(tx, organizationId, startAt))) {
                return false;
            }
            if (toldAhead) return true;
            await say(
                tx,
                organizationId,
                DOMAIN_ENDED_KEY,
                `domain-ended:${startAt.toISOString()}`,
                "ended",
                wordsOf(s.domains, domainStopsAt(startAt), zone),
            );
            return true;
        });
        // Another run started it first: it says what there is to say.
        if (!started) return false;
        said = !toldAhead;
        endedAt = startAt;
        svc.forget(organizationId);
    }

    const state = domainPlanState({
        enforced: true,
        includedNow: false,
        endsAt: null,
        endedAt,
        now,
    });
    if (state.state !== "paused") return said;
    const pausedKey = domainPausedKey(endedAt);
    if (pausedTold.some((c) => c.eventKey === pausedKey)) return said;
    const words = wordsOf(s.domains, state.since, zone);
    const paused = await prisma.$transaction(async (tx) => {
        const claim = await tx.customerNotice.createMany({
            data: [
                {
                    organizationId,
                    eventKey: pausedKey,
                    kind: DOMAIN_PAUSED_KIND,
                },
            ],
            skipDuplicates: true,
        });
        if (claim.count === 0) return false;
        await say(tx, organizationId, pausedKey, pausedKey, "paused", words);
        // Pages kept from before the pause still name the domain as their
        // address: draw them again.
        await enqueueBusinessSitesRevalidation(tx, organizationId, "domain");
        return true;
    });
    if (paused) svc.forget(organizationId);
    return said || paused;
}

/** One of the domain's own notices: the inbox row and the email. */
async function say(
    tx: Tx,
    organizationId: string,
    /** The claim the inbox row is recorded on. */
    claimKey: string,
    /** The email's once-only key. */
    eventKey: string,
    mode: "ending" | "ended" | "paused",
    words: DomainWords,
): Promise<void> {
    const notice = domainNotice(mode, words);
    const row = await tx.notification.create({
        data: {
            organizationId,
            // It opens Plan and billing: the way back.
            ...noticeOf(PLAN_ENDING_NOTIFICATION_TYPE, {}),
            title: notice.title,
            body: notice.body,
        },
        select: { id: true },
    });
    await tx.customerNotice.updateMany({
        where: { organizationId, eventKey: claimKey },
        data: { notificationId: row.id },
    });
    await enqueueBillingEmail(tx, {
        kind: "DOMAIN",
        organizationId,
        eventKey,
        mode,
        ...words,
    });
}
