import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { noticeOf } from "../notifications/notice-target";
import { markLapsed } from "./calendar-access";

/** The notice's type: the person's own alert, opening their Hours and time off. */
export const CALENDAR_LAPSED_NOTICE = "calendar.lapsed";

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
}
