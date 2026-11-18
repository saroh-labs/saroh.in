import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { noticeOf } from "../notifications/notice-target";
import { markLapsed } from "./calendar-access";

/** The notice's type: the person's own alert, opening their Hours and time off. */
export const CALENDAR_LAPSED_NOTICE = "calendar.lapsed";
/** A booking that didn't reach their Google Calendar: opens the booking. */
export const CALENDAR_SYNC_FAILED_NOTICE = "calendar.sync-failed";
/** Their busy times are two hours old: opens their Hours and time off. */
export const CALENDAR_BEHIND_NOTICE = "calendar.behind";

/** A burst of failures (a bulk move into a rate limit) tells the person once a day. */
export const SYNC_FAILED_QUIET_MS = 24 * 60 * 60_000;

/**
 * Google refused a connection's token (`invalid_grant`: access revoked,
 * six months unused, testing mode's 7 days, a Workspace limit). Every path
 * that meets the refusal comes here (#1047, U7):
 * - the connection goes LAPSED, its token dropped, its choices kept, so
 *   syncing stops for it and slots go on Saroh's own times;
 * - the person is told once, in their own alerts: "Reconnect Google
 *   Calendar". Only the write that made the change tells them, so ten jobs
 *   meeting the same refusal send one notice, and none again until they
 *   connect again (which clears the lapse).
 */
@Injectable()
export class CalendarLapseService {
    private readonly logger = new Logger(CalendarLapseService.name);

    async lapse(
        connectionId: string,
        now: Date = new Date(),
    ): Promise<boolean> {
        if (!(await markLapsed(connectionId, now))) return false;
        const row = await prisma.googleCalendarConnection.findUnique({
            where: { id: connectionId },
            select: {
                organizationId: true,
                membership: {
                    select: {
                        userId: true,
                        staffMember: { select: { id: true } },
                    },
                },
            },
        });
        const staffId = row?.membership.staffMember?.id;
        if (!row || !staffId) return true;
        await prisma.notification.create({
            data: {
                organizationId: row.organizationId,
                userId: row.membership.userId,
                ...noticeOf(CALENDAR_LAPSED_NOTICE, { staffId }),
                title: "Reconnect Google Calendar",
                body: "Google stopped Saroh's access to your calendar, so your bookings aren't being copied there and your busy times there aren't blocking slots. Connect it again to carry on.",
            },
            select: { id: true },
        });
        this.logger.warn(
            `google_calendar_lapsed connection=${connectionId}: the person was asked to reconnect`,
        );
        return true;
    }

    /**
     * Tell the person once that a booking didn't reach their Google
     * Calendar (GC-05: every retry spent), or got no Meet link (GC-07).
     * Once a day at most, however many bookings failed together. Never
     * throws: telling is best-effort beside the job's own failure.
     */
    async syncFailed(
        connectionId: string,
        bookingId: string,
        what: "sync" | "meet",
        now: Date = new Date(),
    ): Promise<boolean> {
        try {
            const row = await prisma.googleCalendarConnection.findUnique({
                where: { id: connectionId },
                select: {
                    organizationId: true,
                    membership: { select: { userId: true } },
                },
            });
            if (!row) return false;
            const recent = await prisma.notification.count({
                where: {
                    organizationId: row.organizationId,
                    userId: row.membership.userId,
                    type: CALENDAR_SYNC_FAILED_NOTICE,
                    createdAt: {
                        gte: new Date(now.getTime() - SYNC_FAILED_QUIET_MS),
                    },
                },
            });
            if (recent > 0) return false;
            await prisma.notification.create({
                data: {
                    organizationId: row.organizationId,
                    userId: row.membership.userId,
                    ...noticeOf(CALENDAR_SYNC_FAILED_NOTICE, { bookingId }),
                    title:
                        what === "meet"
                            ? "A booking has no Google Meet link"
                            : "A booking didn't reach Google Calendar",
                    body:
                        what === "meet"
                            ? "Google didn't make a Meet link for this online booking. Send the customer a link to join, or move the booking to make one again."
                            : "Google kept refusing to take this booking, so your Google Calendar doesn't show it as it is in Saroh. Check the booking here; changing it tries again.",
                },
                select: { id: true },
            });
            return true;
        } catch (error) {
            this.logger.warn(
                `google_calendar_sync_failed_notice_skipped connection=${connectionId} reason=${error instanceof Error ? error.name : "error"}`,
            );
            return false;
        }
    }
}
