import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

/**
 * The two jobs Google Calendar runs on (#1047):
 * - `calendar.sync`: make one booking's event in Google match the booking,
 *   queued beside each `booking.notify` (`calendar-sync.handler.ts`);
 * - `calendar.busy`: read one connection's busy times, then queue itself
 *   again 10 minutes on (`calendar-busy.handler.ts`).
 */
export const CALENDAR_SYNC_TYPE = "calendar.sync";
export const CALENDAR_BUSY_TYPE = "calendar.busy";

/** How often a connection's busy times are read. */
export const BUSY_EVERY_MS = 10 * 60_000;

/**
 * A `calendar.sync`'s tries: one, then one per wait of its retry schedule
 * (`RETRY_SCHEDULES`, 1, 5, 15, 60 and 240 minutes, GC-05), about five
 * hours in all, so a rate limit or an outage of hours still lands it.
 */
export const CALENDAR_SYNC_ATTEMPTS = 6;

const logger = new Logger("CalendarJobs");

/**
 * Leave one `calendar.busy` run waiting for this connection at `runAt`,
 * unless one is: "is one waiting? if not, add one" under the advisory lock
 * `calendar-busy:<connectionId>`, as the manager link sweep keeps its one
 * run. A reconnect, a retry and the run's own next run can't make two.
 * One waiting for later is brought forward to `runAt` (GC-13): choosing
 * calendars reads them now, not at the next ten-minute run.
 * Never throws; false when it couldn't queue.
 */
export async function scheduleBusy(
    organizationId: string,
    connectionId: string,
    runAt: Date,
): Promise<boolean> {
    const lock = `calendar-busy:${connectionId}`;
    try {
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
            const waiting = await tx.job.findFirst({
                where: {
                    type: CALENDAR_BUSY_TYPE,
                    status: "PENDING",
                    payload: { path: ["connectionId"], equals: connectionId },
                },
                select: { id: true, runAt: true },
            });
            if (waiting) {
                if (waiting.runAt > runAt) {
                    await tx.job.update({
                        where: { id: waiting.id },
                        data: { runAt },
                        select: { id: true },
                    });
                }
                return;
            }
            await tx.job.create({
                data: {
                    organizationId,
                    type: CALENDAR_BUSY_TYPE,
                    payload: { connectionId },
                    runAt,
                },
                select: { id: true },
            });
        });
        return true;
    } catch (error) {
        logger.error(
            `Could not queue ${CALENDAR_BUSY_TYPE} for connection ${connectionId}: ${error instanceof Error ? error.name : "error"}`,
        );
        return false;
    }
}
