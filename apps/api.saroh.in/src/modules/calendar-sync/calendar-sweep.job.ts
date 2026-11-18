import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { GOOGLE_BUSY_FRESH_MS } from "../bookings/staff-availability";
import { noticeOf } from "../notifications/notice-target";
import { businessPause, syncingMembers } from "./calendar-allowed";
import {
    BUSY_EVERY_MS,
    CALENDAR_BUSY_TYPE,
    scheduleBusy,
} from "./calendar-jobs";
import { CALENDAR_BEHIND_NOTICE } from "./calendar-lapse.service";

/** The hourly net under every connection's busy reads (GC-14). */
export const CALENDAR_SWEEP_TYPE = "calendar.sweep";
export const CALENDAR_SWEEP_EVERY_MS = 60 * 60_000;

/** Connections read per page; a run goes through them all. */
const PAGE = 500;
const CHAIN_LOCK = `job-chain:${CALENDAR_SWEEP_TYPE}`;

/**
 * Hourly, every connected Google Calendar (#1047, GC-14):
 * - one that may sync and has no busy read waiting gets one, spread over
 *   the next ten minutes: a chain that stopped (the flag turned off and on,
 *   the key missing for a while, a paused connection allowed again) starts
 *   by itself instead of waiting for the person to open their settings;
 * - one whose busy times are two hours old, while its calendars are
 *   checked, tells the person once (`calendar.behind`): slots are on
 *   Saroh's own times. Once per stale spell: not again until a read lands.
 *
 * No Google call: it only queues and tells. A connection that fails is
 * logged and the rest go on; it throws only when the next run can't be
 * queued (one waiting run, under `job-chain:calendar.sweep`).
 */
@Injectable()
export class CalendarSweepJob {
    private readonly logger = new Logger(CalendarSweepJob.name);

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const done = await this.sweep(now);
            if (done.started > 0 || done.told > 0) {
                this.logger.log(
                    `calendar_sweep started=${done.started} told_behind=${done.told}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `calendar_sweep failed before it finished: ${nameOf(error)}`,
            );
        }
        if (
            !(await this.schedule(
                new Date(now.getTime() + CALENDAR_SWEEP_EVERY_MS),
            ))
        ) {
            throw new Error(
                "Could not schedule the next calendar sweep; retrying this one",
            );
        }
    };

    async sweep(now: Date): Promise<{ started: number; told: number }> {
        let started = 0;
        let told = 0;
        let cursor: string | undefined;
        // Asked once per business a run, not once per person.
        const allowed = new Map<string, Promise<Set<string> | null>>();
        const allowedIn = (organizationId: string) => {
            let known = allowed.get(organizationId);
            if (!known) {
                known = businessPause(organizationId).then((off) =>
                    off ? null : syncingMembers(organizationId),
                );
                allowed.set(organizationId, known);
            }
            return known;
        };
        for (;;) {
            const page = await prisma.googleCalendarConnection.findMany({
                where: { status: "CONNECTED" },
                orderBy: { id: "asc" },
                take: PAGE,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                select: {
                    id: true,
                    organizationId: true,
                    membershipId: true,
                    createdAt: true,
                    busyRefreshedAt: true,
                    membership: {
                        select: {
                            userId: true,
                            staffMember: { select: { id: true } },
                        },
                    },
                    calendars: {
                        where: { checkBusy: true },
                        select: { id: true },
                        take: 1,
                    },
                },
            });
            for (const c of page) {
                try {
                    const members = await allowedIn(c.organizationId);
                    const staffId = c.membership.staffMember?.id;
                    // Paused (`calendar-allowed.ts`): left until allowed.
                    if (!members?.has(c.membershipId) || !staffId) continue;
                    if (c.calendars.length === 0) continue;
                    const waiting = await prisma.job.count({
                        where: {
                            type: CALENDAR_BUSY_TYPE,
                            status: { in: ["PENDING", "PROCESSING"] },
                            payload: { path: ["connectionId"], equals: c.id },
                        },
                    });
                    if (waiting === 0) {
                        const at = new Date(
                            now.getTime() +
                                Math.floor(Math.random() * BUSY_EVERY_MS),
                        );
                        if (await scheduleBusy(c.organizationId, c.id, at)) {
                            started += 1;
                        }
                    }
                    if (await this.tellBehind(c, staffId, now)) told += 1;
                } catch (error) {
                    this.logger.error(
                        `calendar_sweep skipped connection=${c.id}: ${nameOf(error)}`,
                    );
                }
            }
            if (page.length < PAGE) break;
            cursor = page[page.length - 1]?.id;
        }
        return { started, told };
    }

    /** One notice per stale spell: none since the last read (or the connect). */
    private async tellBehind(
        c: {
            organizationId: string;
            createdAt: Date;
            busyRefreshedAt: Date | null;
            membership: { userId: string };
        },
        staffId: string,
        now: Date,
    ): Promise<boolean> {
        const since = c.busyRefreshedAt ?? c.createdAt;
        if (now.getTime() - since.getTime() <= GOOGLE_BUSY_FRESH_MS) {
            return false;
        }
        const told = await prisma.notification.count({
            where: {
                organizationId: c.organizationId,
                userId: c.membership.userId,
                type: CALENDAR_BEHIND_NOTICE,
                createdAt: { gte: since },
            },
        });
        if (told > 0) return false;
        await prisma.notification.create({
            data: {
                organizationId: c.organizationId,
                userId: c.membership.userId,
                ...noticeOf(CALENDAR_BEHIND_NOTICE, { staffId }),
                title: "Google Calendar is behind",
                body: "Saroh hasn't been able to read your Google Calendar for two hours, so your busy times there aren't blocking slots. Bookings go on Saroh's own hours until it catches up.",
            },
            select: { id: true },
        });
        return true;
    }

    /** Leave one run waiting at `runAt`, unless one is. Never throws. */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: { type: CALENDAR_SWEEP_TYPE, status: "PENDING" },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: { type: CALENDAR_SWEEP_TYPE, payload: {}, runAt },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next calendar sweep: ${nameOf(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: CALENDAR_SWEEP_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the calendar sweep chain: ${nameOf(error)}`,
            );
        }
    }
}

function nameOf(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}
