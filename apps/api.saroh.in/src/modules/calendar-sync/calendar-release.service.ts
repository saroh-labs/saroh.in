import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";

import type { SealedConnection } from "./calendar-access";
import {
    accessTokenFor,
    openRefreshToken,
    SEALED_CONNECTION,
} from "./calendar-access";
import { CalendarLapseService } from "./calendar-lapse.service";
import type { GoogleCalendarPort } from "./google/google-calendar.port";
import { GOOGLE_CALENDAR, isGoogleError } from "./google/google-calendar.port";

/** Upcoming events cleared per release; past that they stay (logged). */
export const CLEAR_MAX = 500;
/** How long a release may spend clearing, so a slow Google can't hang the request. */
export const CLEAR_BUDGET_MS = 20_000;
/** Deletes at once. */
const CLEAR_AT_ONCE = 4;

/**
 * Saroh letting go of a Google account (#1047, GC-06, GC-09): when the
 * person disconnects, an owner or admin disconnects them, they connect
 * another Google account, or they leave the team.
 *
 * - **Upcoming events Saroh made are deleted, quietly** (`sendUpdates=none`):
 *   nobody would keep them up to date any more, so a later move or cancel
 *   would leave a stale invite, and a reconnect would make a second event
 *   beside the first. The bookings still stand, so the customer is not
 *   emailed a cancellation. Past events stay: they are history, and
 *   deleting one would only mail someone about a visit already made.
 *   Bounded (`CLEAR_MAX` events, `CLEAR_BUDGET_MS`): what isn't reached
 *   stays in Google, logged.
 * - **Google's grant is revoked only at its last use.** Revoking one token
 *   removes the whole grant for Saroh's Google client (Google's docs), so
 *   it would also stop the same Google account connected in another
 *   business, and the person's Google sign-in consent. While the account
 *   is still connected elsewhere, or anyone signs in to Saroh with Google
 *   as that person or that address, only Saroh's stored token goes (the
 *   row is deleted with it); the grant stays listed in the Google account
 *   until its last use is released, or the person removes it there.
 */
@Injectable()
export class CalendarReleaseService {
    private readonly logger = new Logger(CalendarReleaseService.name);

    constructor(
        @Optional()
        @Inject(GOOGLE_CALENDAR)
        private readonly google: GoogleCalendarPort | null,
        private readonly lapses: CalendarLapseService,
    ) {}

    /** Disconnect one person's connection here, if they have one. */
    async releaseMember(
        organizationId: string,
        membershipId: string,
    ): Promise<void> {
        const connection = await prisma.googleCalendarConnection.findFirst({
            where: { organizationId, membershipId },
            select: { id: true },
        });
        if (connection) await this.release(organizationId, connection.id);
    }

    /** Clear, revoke when it's the last use, then delete the connection. */
    async release(organizationId: string, connectionId: string): Promise<void> {
        const connection = await prisma.googleCalendarConnection.findFirst({
            where: { id: connectionId, organizationId },
            select: {
                ...SEALED_CONNECTION,
                googleEmail: true,
                membership: { select: { userId: true } },
            },
        });
        if (!connection) return;
        if (connection.status === "CONNECTED") {
            await this.clearUpcoming(connection);
            if (
                await this.lastUse(
                    connection.id,
                    connection.googleEmail,
                    connection.membership.userId,
                )
            ) {
                await this.revoke(connection);
            }
        }
        await prisma.googleCalendarConnection.deleteMany({
            where: { id: connection.id },
        });
    }

    /**
     * Delete the upcoming events Saroh made through this connection, with
     * no email, and forget them. Never throws: what can't be reached stays.
     */
    async clearUpcoming(
        connection: SealedConnection,
        now: Date = new Date(),
    ): Promise<number> {
        const google = this.google;
        if (!google || connection.status !== "CONNECTED") return 0;
        const rows = await prisma.googleCalendarEvent.findMany({
            where: {
                connectionId: connection.id,
                booking: { endAt: { gt: now } },
            },
            orderBy: { booking: { startAt: "asc" } },
            take: CLEAR_MAX,
            select: { bookingId: true, calendarId: true, eventId: true },
        });
        if (rows.length === 0) return 0;
        let access: string;
        try {
            access = await accessTokenFor(google, connection, (id) =>
                this.lapses.lapse(id),
            );
        } catch (error) {
            this.logger.warn(
                `google_calendar_clear_skipped connection=${connection.id} events=${rows.length} reason=${reasonOf(error)}`,
            );
            return 0;
        }
        const deadline = Date.now() + CLEAR_BUDGET_MS;
        const cleared: string[] = [];
        let next = 0;
        const worker = async () => {
            while (next < rows.length && Date.now() < deadline) {
                const row = rows[next++];
                try {
                    await google.deleteEvent(
                        access,
                        row.calendarId,
                        row.eventId,
                        { quiet: true },
                    );
                    cleared.push(row.bookingId);
                } catch (error) {
                    this.logger.warn(
                        `google_calendar_clear_failed connection=${connection.id} reason=${reasonOf(error)}`,
                    );
                }
            }
        };
        await Promise.all(
            Array.from(
                { length: Math.min(CLEAR_AT_ONCE, rows.length) },
                worker,
            ),
        );
        await prisma.googleCalendarEvent.deleteMany({
            where: { connectionId: connection.id, bookingId: { in: cleared } },
        });
        if (cleared.length < rows.length) {
            this.logger.warn(
                `google_calendar_clear_partial connection=${connection.id} cleared=${cleared.length} of=${rows.length}`,
            );
        }
        return cleared.length;
    }

    /**
     * Whether this is the Google account's last use by Saroh: no other
     * connected connection reaches it, in any business, and nobody signs in
     * with Google as this person or this address. Read across businesses,
     * outside the request's own.
     */
    async lastUse(
        connectionId: string,
        googleEmail: string,
        userId: string,
    ): Promise<boolean> {
        const email = googleEmail.trim();
        const [elsewhere, signIn] = await outsideOrgContext(() =>
            Promise.all([
                prisma.googleCalendarConnection.count({
                    where: {
                        id: { not: connectionId },
                        status: "CONNECTED",
                        googleEmail: { equals: email, mode: "insensitive" },
                    },
                }),
                prisma.account.count({
                    where: {
                        providerId: "google",
                        OR: [
                            { userId },
                            {
                                user: {
                                    email: {
                                        equals: email,
                                        mode: "insensitive",
                                    },
                                },
                            },
                        ],
                    },
                }),
            ]),
        );
        return elsewhere === 0 && signIn === 0;
    }

    /** Revoke at Google; a failure is logged, never kept: the row goes anyway. */
    private async revoke(connection: SealedConnection): Promise<void> {
        if (!this.google) return;
        try {
            await this.google.revoke(openRefreshToken(connection));
        } catch (error) {
            this.logger.warn(
                `google_calendar_revoke_failed connection=${connection.id} reason=${reasonOf(error)}`,
            );
        }
    }
}

/** A failure in words for a log line: a kind and status, never a token. */
function reasonOf(error: unknown): string {
    if (isGoogleError(error)) return `${error.kind}:${error.detail}`;
    return error instanceof Error ? error.name : "error";
}
