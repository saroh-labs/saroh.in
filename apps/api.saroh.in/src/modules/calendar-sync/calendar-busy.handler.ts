import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { accessTokenFor, SEALED_CONNECTION } from "./calendar-access";
import { pausedBecause } from "./calendar-allowed";
import {
    BUSY_EVERY_MS,
    CALENDAR_BUSY_TYPE,
    scheduleBusy,
} from "./calendar-jobs";
import { CalendarLapseService } from "./calendar-lapse.service";
import { eventIdFor } from "./event-shape";
import type {
    BusyInterval,
    GoogleCalendarPort,
    GrantedParts,
} from "./google/google-calendar.port";
import {
    GOOGLE_CALENDAR,
    grantedParts,
    isGoogleError,
} from "./google/google-calendar.port";

export { CALENDAR_BUSY_TYPE } from "./calendar-jobs";

/** How far ahead busy times are read: past any booking window a person keeps. */
export const BUSY_AHEAD_MS = 60 * 86_400_000;

/**
 * The `calendar.busy` job (#1047, KTD7): read one connection's busy times
 * from the calendars its person checks, for the next 60 days, and replace
 * what was kept in one transaction; then queue itself again in 10 minutes
 * (one waiting run per connection, `scheduleBusy`). Slot reads never call
 * Google: they read what this keeps, while it is fresh (`loadPeople`).
 *
 * What counts (GC-01, GC-10): on a calendar the person owns, the events
 * they made or accepted, read with `events.list`, less the events Saroh
 * made for this connection (their own bookings already block in Saroh, and
 * counting them again stopped a booking being moved by less than its
 * length). An invitation nobody answered doesn't block. A calendar they
 * don't own, or a grant without the events scope, is read with Google's
 * free/busy, which can't tell either apart: there, unanswered invitations
 * still block (documented limit).
 *
 * Google's error keeps the old busy times until they are two hours old,
 * then slots fall back to Saroh's own times and the connection reads
 * behind (R9). A refused token lapses the connection and ends its chain;
 * a disconnected or paused one (`calendar-allowed.ts`) ends it too, and
 * its busy times go; the daily sweep, connecting again or reading the
 * status starts it again.
 */
@Injectable()
export class CalendarBusyHandler {
    private readonly logger = new Logger(CalendarBusyHandler.name);

    constructor(
        @Optional()
        @Inject(GOOGLE_CALENDAR)
        private readonly google: GoogleCalendarPort | null,
        private readonly flags: FeatureFlagService,
        private readonly lapses: CalendarLapseService,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const connectionId = connectionOf(job.payload);
        if (!connectionId || !job.organizationId) {
            this.logger.warn(
                `${CALENDAR_BUSY_TYPE} job ${job.id} names no connection; nothing to read`,
            );
            return;
        }
        const organizationId = job.organizationId;
        if (!this.google) return;
        const goOn = await runInOrgContext(organizationId, () =>
            this.refresh(organizationId, connectionId),
        );
        if (!goOn) return;
        const next = new Date(Date.now() + BUSY_EVERY_MS);
        if (!(await scheduleBusy(organizationId, connectionId, next))) {
            throw new Error(
                `Could not queue the next ${CALENDAR_BUSY_TYPE} run; retrying this one`,
            );
        }
    };

    /** One read. False when the chain should end. */
    async refresh(
        organizationId: string,
        connectionId: string,
        now: Date = new Date(),
    ): Promise<boolean> {
        const google = this.google;
        if (!google) return false;
        const connection = await prisma.googleCalendarConnection.findFirst({
            where: { id: connectionId, organizationId, status: "CONNECTED" },
            select: {
                ...SEALED_CONNECTION,
                scopes: true,
                membershipId: true,
                membership: {
                    select: { staffMember: { select: { id: true } } },
                },
                calendars: {
                    where: { checkBusy: true },
                    select: { calendarId: true },
                },
            },
        });
        if (!connection) return false;
        if (
            await pausedBecause(
                organizationId,
                connection.membershipId,
                this.flags,
                connectionId,
            )
        ) {
            // Paused: its busy times stop blocking now, not in two hours.
            await prisma.googleCalendarBusy.deleteMany({
                where: { connectionId },
            });
            return false;
        }
        const staffId = connection.membership.staffMember?.id;
        const parts = grantedParts(connection.scopes);
        const ids = parts.freeBusy
            ? connection.calendars.map((c) => c.calendarId)
            : [];
        const busy: BusyInterval[] = [];
        if (staffId && ids.length > 0) {
            try {
                const access = await accessTokenFor(google, connection, (id) =>
                    this.lapses.lapse(id),
                );
                const to = new Date(now.getTime() + BUSY_AHEAD_MS);
                for (const calendarId of ids) {
                    try {
                        busy.push(
                            ...(await this.busyOn(
                                google,
                                access,
                                parts,
                                connectionId,
                                calendarId,
                                now,
                                to,
                            )),
                        );
                    } catch (error) {
                        // One calendar Google won't give free/busy for (a
                        // holidays or other public calendar, or one unshared
                        // since) must not stop the person's other calendars.
                        if (!isGoogleError(error, "gone")) throw error;
                        this.logger.warn(
                            `google_calendar_busy_calendar_skipped connection=${connectionId} reason=${error.detail}`,
                        );
                    }
                }
            } catch (error) {
                if (isGoogleError(error, "lapsed")) return false;
                if (!isGoogleError(error)) throw error;
                // Kept until stale: slots then go on Saroh's own times.
                this.logger.warn(
                    `google_calendar_busy_failed connection=${connectionId} reason=${error.kind}:${error.detail}`,
                );
                await prisma.googleCalendarConnection.updateMany({
                    where: { id: connectionId },
                    data: { lastError: error.detail },
                });
                return true;
            }
        }
        await prisma.$transaction(async (tx) => {
            await tx.googleCalendarBusy.deleteMany({ where: { connectionId } });
            if (staffId && busy.length > 0) {
                await tx.googleCalendarBusy.createMany({
                    data: busy
                        .filter((b) => b.endAt > b.startAt)
                        .map((b) => ({
                            organizationId,
                            connectionId,
                            staffId,
                            startAt: b.startAt,
                            endAt: b.endAt,
                        })),
                });
            }
            await tx.googleCalendarConnection.updateMany({
                where: { id: connectionId, status: "CONNECTED" },
                data: { busyRefreshedAt: now, lastError: null },
            });
        });
        return true;
    }

    /**
     * One calendar's busy times. Its events when Saroh may read them (an
     * owned calendar), less the ones Saroh made for this connection; else,
     * or when Google refuses that read, its free/busy.
     */
    private async busyOn(
        google: GoogleCalendarPort,
        access: string,
        parts: GrantedParts,
        connectionId: string,
        calendarId: string,
        from: Date,
        to: Date,
    ): Promise<BusyInterval[]> {
        if (parts.events) {
            try {
                const events = await google.busyEvents(
                    access,
                    calendarId,
                    from,
                    to,
                );
                return events
                    .filter(
                        (e) =>
                            !e.bookingId ||
                            e.eventId !== eventIdFor(e.bookingId, connectionId),
                    )
                    .map(({ startAt, endAt }) => ({ startAt, endAt }));
            } catch (error) {
                // Not theirs to read event by event (a calendar shared
                // with them): Google's free/busy still answers for it.
                if (
                    !isGoogleError(error, "refused") &&
                    !isGoogleError(error, "gone")
                ) {
                    throw error;
                }
            }
        }
        return google.freeBusy(access, [calendarId], from, to);
    }
}

function connectionOf(raw: unknown): string | null {
    if (!raw || typeof raw !== "object") return null;
    const id = (raw as { connectionId?: unknown }).connectionId;
    return typeof id === "string" && id ? id : null;
}
