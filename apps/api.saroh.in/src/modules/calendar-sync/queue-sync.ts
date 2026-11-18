import type { Prisma } from "@saroh/database";

import { CALENDAR_SYNC_TYPE } from "./calendar-jobs";

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
            payload: { bookingId: input.bookingId },
        },
        select: { id: true },
    });
}
