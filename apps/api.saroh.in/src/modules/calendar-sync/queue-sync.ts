import type { Prisma } from "@saroh/database";

import { CALENDAR_SYNC_ATTEMPTS, CALENDAR_SYNC_TYPE } from "./calendar-jobs";

type Tx = Pick<
    Prisma.TransactionClient,
    "googleCalendarEvent" | "googleCalendarConnection" | "job"
>;

/**
 * Queue `calendar.sync` for a booking that just changed (#1047, KTD6), on
 * the change's own transaction, beside its `booking.notify`. Only when
 * Google has something to do: the booking already has an event there (a
 * move, a cancel, a hand-over), or whoever takes it now has a connected
 * calendar. A cheap check; the job checks again and acts on the booking
 * as it is then.
 */
export async function queueCalendarSyncInTx(
    tx: Tx,
    input: {
        organizationId: string;
        bookingId: string;
        staffId: string | null;
        /** Email nobody (GC-09): a deleted customer, a privacy removal. */
        quiet?: boolean;
    },
): Promise<void> {
    const mapped = await tx.googleCalendarEvent.count({
        where: { bookingId: input.bookingId },
    });
    const connected =
        mapped === 0 && input.staffId
            ? await tx.googleCalendarConnection.count({
                  where: {
                      organizationId: input.organizationId,
                      status: "CONNECTED",
                      membership: { staffMember: { id: input.staffId } },
                  },
              })
            : 0;
    if (mapped === 0 && connected === 0) return;
    await tx.job.create({
        data: {
            organizationId: input.organizationId,
            type: CALENDAR_SYNC_TYPE,
            payload: {
                bookingId: input.bookingId,
                ...(input.quiet ? { quiet: true } : {}),
            },
            maxAttempts: CALENDAR_SYNC_ATTEMPTS,
        },
        select: { id: true },
    });
}

/**
 * Queue `calendar.sync` for several bookings at once, outside a booking's
 * own write (DEC-233): picking events back up after a reconnect
 * (`quietUpdate`, no email), moving them to a new "bookings go to"
 * calendar (`move`), or a Meet's access changed (`quietUpdate`). Answers
 * how many bookings are on their way, queued now or already waiting.
 */
export async function queueCalendarSyncs(
    db: Pick<Prisma.TransactionClient, "job">,
    organizationId: string,
    bookingIds: readonly string[],
    flags: { quietUpdate?: true; move?: true } = {},
): Promise<number> {
    if (bookingIds.length === 0) return 0;
    // One already waiting (not yet claimed) with the same ask does it: a
    // repeated click doesn't pile jobs on the shared lane (M2).
    const waiting = await db.job.findMany({
        where: {
            organizationId,
            type: CALENDAR_SYNC_TYPE,
            status: "PENDING",
            OR: bookingIds.map((bookingId) => ({
                payload: { equals: { bookingId, ...flags } },
            })),
        },
        select: { payload: true },
    });
    const queued = new Set(
        waiting.map((j) => (j.payload as { bookingId?: string }).bookingId),
    );
    const fresh = bookingIds.filter((id) => !queued.has(id));
    if (fresh.length > 0) {
        await db.job.createMany({
            data: fresh.map((bookingId) => ({
                organizationId,
                type: CALENDAR_SYNC_TYPE,
                payload: { bookingId, ...flags },
                maxAttempts: CALENDAR_SYNC_ATTEMPTS,
            })),
        });
    }
    return bookingIds.length;
}
