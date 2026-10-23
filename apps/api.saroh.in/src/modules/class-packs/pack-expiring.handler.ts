import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";
import { DateTime } from "luxon";

import { businessTimezone } from "../bookings/staff-availability";
import { noticeOn } from "../communications/notice-settings";
import {
    CUSTOMER_NOTIFY_TYPE,
    enqueueCustomerNotice,
} from "../site-accounts/customer-notify-queue";
import {
    PACK_EXPIRING_DAYS,
    packExpiringNoticeKey,
} from "../site-accounts/notices/pack";

/** The sweep that tells holders their classes run out in a week. */
export const PACK_EXPIRING_TYPE = "class-packs.expiring";

/**
 * Every 6 hours: "7 days away" is a day in each business's own zone, and
 * four runs a day reach every zone's new day soon after it starts. A
 * purchase is queued once per use-by date whichever run finds it.
 */
export const PACK_EXPIRING_EVERY_MS = 6 * 60 * 60 * 1000;

/** Purchases read per page; a run goes on until none are left. */
export const PACK_EXPIRING_BATCH = 500;

/** The key that lets one waiting run of the chain exist at a time. */
const CHAIN_LOCK = `job-chain:${PACK_EXPIRING_TYPE}`;

const DAY_MS = 86_400_000;

/** A day number in a zone, so two instants compare as calendar days. */
function zoneDay(at: Date, timeZone: string): number {
    const d = DateTime.fromJSDate(at, { zone: timeZone });
    return Math.round(Date.UTC(d.year, d.month - 1, d.day) / DAY_MS);
}

/** What the sweep reads of a purchase. */
export interface ExpiringCandidate {
    createdAt: Date;
    expiresAt: Date;
    credits: number;
    used: number;
}

/**
 * Whether a holder is told now, in the business's zone:
 * - classes still to use, and the date still to come;
 * - the use-by day is 7 days from today (or 6: a day the sweep missed is
 *   made up the next day, never more);
 * - and they held it before then: a pack bought with a week or less to go
 *   was bought knowing its date, so it says nothing.
 */
export function dueForExpiringNotice(
    p: ExpiringCandidate,
    now: Date,
    timeZone: string,
): boolean {
    if (p.credits - p.used <= 0 || p.expiresAt <= now) return false;
    const end = zoneDay(p.expiresAt, timeZone);
    const away = end - zoneDay(now, timeZone);
    if (away > PACK_EXPIRING_DAYS || away < PACK_EXPIRING_DAYS - 1) {
        return false;
    }
    return end - zoneDay(p.createdAt, timeZone) > PACK_EXPIRING_DAYS;
}

/**
 * `class-packs.expiring` (DEC-174 U22, #1153): a week before a pack's
 * use-by date, its holder hears how many classes they still have and the
 * date, as a PACK_EXPIRING `customer.notify` keyed to the purchase and the
 * date (`pack-expiring:<purchaseId>:<expiresAt>`). An extension moves the
 * date, so the new date is told a week before it; a run twice, or two
 * runs on one day, queue it once (an existing notice or a waiting job for
 * the key is skipped) and the notice job's `CustomerNotice` claim sends it
 * once regardless. Nothing is queued while the business has Pack credits
 * off; the notice job reads the switch, the credits and the date again.
 *
 * It reschedules itself (ADR-007), with one waiting run kept by a
 * transaction advisory lock on `job-chain:class-packs.expiring`, as the
 * manager link sweep does. A business that fails is logged and the rest
 * go on; it throws only when the next run can't be enqueued.
 */
@Injectable()
export class PackExpiringHandler {
    private readonly logger = new Logger(PackExpiringHandler.name);

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const queued = await this.sweep(now);
            if (queued > 0) {
                this.logger.log(`pack_expiring queued=${queued}`);
            }
        } catch (error) {
            this.logger.error(
                `pack_expiring failed before it finished: ${errorName(error)}`,
            );
        }
        const next = new Date(now.getTime() + PACK_EXPIRING_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next pack expiry sweep; retrying this one",
            );
        }
    };

    /** Queue every notice due at `now`. Returns how many were queued. */
    async sweep(now: Date): Promise<number> {
        // Anything whose date is within the window in some zone: a day
        // either side of 7 days covers every zone's calendar.
        const until = new Date(
            now.getTime() + (PACK_EXPIRING_DAYS + 1) * DAY_MS,
        );
        const byBusiness = new Map<
            string,
            ({ id: string } & ExpiringCandidate)[]
        >();
        let cursor: string | undefined;
        for (;;) {
            const page = await prisma.packPurchase.findMany({
                where: {
                    expiresAt: { gt: now, lte: until },
                    ...(cursor ? { id: { gt: cursor } } : {}),
                },
                orderBy: { id: "asc" },
                take: PACK_EXPIRING_BATCH,
                select: {
                    id: true,
                    organizationId: true,
                    createdAt: true,
                    expiresAt: true,
                    credits: true,
                    _count: {
                        select: {
                            redemptions: { where: { reversedAt: null } },
                        },
                    },
                },
            });
            for (const p of page) {
                const list = byBusiness.get(p.organizationId) ?? [];
                list.push({
                    id: p.id,
                    createdAt: p.createdAt,
                    expiresAt: p.expiresAt,
                    credits: p.credits,
                    used: p._count.redemptions,
                });
                byBusiness.set(p.organizationId, list);
            }
            if (page.length < PACK_EXPIRING_BATCH) break;
            cursor = page[page.length - 1].id;
        }

        let queued = 0;
        for (const [organizationId, purchases] of byBusiness) {
            try {
                queued += await this.queueFor(organizationId, purchases, now);
            } catch (error) {
                this.logger.error(
                    `pack_expiring could not queue for organization=${organizationId}: ${errorName(error)}`,
                );
            }
        }
        return queued;
    }

    /** One business's due notices, on its own transaction. */
    private queueFor(
        organizationId: string,
        purchases: ({ id: string } & ExpiringCandidate)[],
        now: Date,
    ): Promise<number> {
        return runInOrgContext(organizationId, () =>
            prisma.$transaction(async (tx) => {
                if (!(await noticeOn(tx, organizationId, "PACK_CREDITS"))) {
                    return 0;
                }
                const zone = await businessTimezone(tx, organizationId);
                let queued = 0;
                for (const p of purchases) {
                    if (!dueForExpiringNotice(p, now, zone)) continue;
                    const eventKey = packExpiringNoticeKey(p.id, p.expiresAt);
                    const [told, waiting] = await Promise.all([
                        tx.customerNotice.count({
                            where: { organizationId, eventKey },
                        }),
                        tx.job.count({
                            where: {
                                organizationId,
                                type: CUSTOMER_NOTIFY_TYPE,
                                status: { in: ["PENDING", "PROCESSING"] },
                                payload: {
                                    path: ["eventKey"],
                                    equals: eventKey,
                                },
                            },
                        }),
                    ]);
                    if (told > 0 || waiting > 0) continue;
                    await enqueueCustomerNotice(tx, organizationId, {
                        kind: "PACK_EXPIRING",
                        eventKey,
                        packPurchaseId: p.id,
                        packExpiresAt: p.expiresAt.toISOString(),
                    });
                    queued += 1;
                }
                return queued;
            }),
        );
    }

    /**
     * Leave one run waiting at `runAt`, unless one is waiting already.
     * Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: { type: PACK_EXPIRING_TYPE, status: "PENDING" },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: { type: PACK_EXPIRING_TYPE, payload: {}, runAt },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next pack expiry sweep: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: PACK_EXPIRING_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the pack expiry sweep chain: ${errorName(error)}`,
            );
        }
    }
}

function errorName(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}
