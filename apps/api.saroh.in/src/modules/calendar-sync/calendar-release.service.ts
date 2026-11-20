import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";

import type { SealedConnection } from "./calendar-access";
import { openRefreshToken, SEALED_CONNECTION } from "./calendar-access";
import type { GoogleCalendarPort } from "./google/google-calendar.port";
import { GOOGLE_CALENDAR, isGoogleError } from "./google/google-calendar.port";
import { sealedToken } from "./sealing";

/**
 * Saroh letting go of a Google account (#1047, DEC-233): when the person
 * disconnects it, an owner or admin disconnects them, or they leave the
 * team.
 *
 * - **Upcoming events stay in Google, as they are** (DEC-233, replacing
 *   GC-09's quiet delete): deleting them could close the Meet rooms
 *   customers hold links to. Saroh stops updating them. The connection
 *   row stays as DISCONNECTED, with no token, scopes or chosen calendars,
 *   keeping only its address and the record of each event, so the same
 *   Google account connected again picks them back up by their ids, Meet
 *   links and all. Its busy times go at once. The hourly sweep deletes the
 *   row after `GOOGLE_CALENDAR_DISCONNECTED_KEEP_DAYS` (30) days.
 * - **Google's grant is revoked only at its last use.** Revoking one token
 *   removes the whole grant for Saroh's Google client (Google's docs), so
 *   it would also stop the same Google account connected in another
 *   business, and the person's Google sign-in consent. While the account
 *   is still connected elsewhere, or anyone signs in to Saroh with Google
 *   as that person or that address, only Saroh's stored token goes; the
 *   grant stays listed in the Google account until its last use is
 *   released, or the person removes it there.
 */
@Injectable()
export class CalendarReleaseService {
    private readonly logger = new Logger(CalendarReleaseService.name);

    constructor(
        @Optional()
        @Inject(GOOGLE_CALENDAR)
        private readonly google: GoogleCalendarPort | null,
    ) {}

    /**
     * Disconnect every Google account of one person here. Answers how many
     * upcoming events stay in Google, no longer updated.
     */
    async releaseMember(
        organizationId: string,
        membershipId: string,
    ): Promise<number> {
        const rows = await prisma.googleCalendarConnection.findMany({
            where: {
                organizationId,
                membershipId,
                status: { not: "DISCONNECTED" },
            },
            select: { id: true },
        });
        let kept = 0;
        for (const row of rows)
            kept += await this.release(organizationId, row.id);
        return kept;
    }

    /**
     * Revoke when it's the last use, drop the token and busy times, and
     * keep the row as DISCONNECTED. Answers how many upcoming events stay.
     */
    async release(
        organizationId: string,
        connectionId: string,
    ): Promise<number> {
        const connection = await prisma.googleCalendarConnection.findFirst({
            where: { id: connectionId, organizationId },
            select: {
                ...SEALED_CONNECTION,
                googleEmail: true,
                membership: { select: { userId: true } },
            },
        });
        if (!connection || connection.status === "DISCONNECTED") return 0;
        if (
            sealedToken(connection) &&
            (await this.lastUse(
                connection.id,
                connection.googleEmail,
                connection.membership.userId,
            ))
        ) {
            await this.revoke(connection);
        }
        await prisma.$transaction([
            prisma.googleCalendarConnection.update({
                where: { id: connection.id },
                data: {
                    status: "DISCONNECTED",
                    tokenCiphertext: null,
                    tokenIv: null,
                    tokenAuthTag: null,
                    scopes: [],
                    lapsedAt: null,
                    lastError: null,
                    busyRefreshedAt: null,
                },
            }),
            prisma.googleCalendarBusy.deleteMany({
                where: { connectionId: connection.id },
            }),
            // Calendar names and choices: a reconnect chooses afresh.
            prisma.googleCalendarLink.deleteMany({
                where: { connectionId: connection.id },
            }),
        ]);
        return prisma.googleCalendarEvent.count({
            where: {
                connectionId: connection.id,
                booking: { status: "CONFIRMED", endAt: { gt: new Date() } },
            },
        });
    }

    /**
     * A grant Saroh won't keep (another account past the plan's allowance,
     * DEC-233): revoked unless something else of Saroh's uses that account.
     */
    async revokeGrant(
        refreshToken: string,
        googleEmail: string,
        userId: string,
    ): Promise<void> {
        if (!this.google || !(await this.lastUse("", googleEmail, userId))) {
            return;
        }
        try {
            await this.google.revoke(refreshToken);
        } catch (error) {
            this.logger.warn(
                `google_calendar_revoke_failed connection=none reason=${reasonOf(error)}`,
            );
        }
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

    /** Revoke at Google; a failure is logged, never kept: the token goes anyway. */
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
