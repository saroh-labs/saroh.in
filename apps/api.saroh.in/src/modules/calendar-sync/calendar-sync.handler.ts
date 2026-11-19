import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { SealedConnection } from "./calendar-access";
import { accessTokenFor, SEALED_CONNECTION } from "./calendar-access";
import { businessPause, syncingMembers } from "./calendar-allowed";
import { CALENDAR_SYNC_ATTEMPTS, CALENDAR_SYNC_TYPE } from "./calendar-jobs";
import { CalendarLapseService } from "./calendar-lapse.service";
import { addressLine, eventFor } from "./event-shape";
import type { GoogleCalendarPort } from "./google/google-calendar.port";
import {
    GOOGLE_CALENDAR,
    grantedParts,
    isGoogleError,
} from "./google/google-calendar.port";

export { CALENDAR_SYNC_TYPE } from "./calendar-jobs";

/** How long to wait before asking Google again for a Meet link it is still making. */
export const MEET_RETRY_MS = 30_000;
/** And how many times, before the booking goes without one. */
export const MEET_TRIES = 6;

interface SyncPayload {
    bookingId: string;
    meetTries: number;
    /** Email nobody: a privacy removal or a deleted customer (GC-09). */
    quiet: boolean;
}

/** Where a booking belongs in Google now: a connection and its write calendar. */
interface Target {
    connection: SealedConnection & { scopes: string[] };
    calendarId: string;
}

interface Mapping {
    connectionId: string;
    calendarId: string;
    eventId: string;
    meetUrl: string | null;
}

/**
 * The `calendar.sync` job (#1047, KTD6): make the booking's event in
 * Google match the booking as it is now. It carries only the booking's id
 * and re-reads everything, so it is idempotent, and one job covers every
 * change:
 * - booked or confirmed: the event is made on the write calendar of
 *   whoever takes it, the customer invited (`sendUpdates=all`);
 * - moved: the same event is brought up to date (its id is Saroh's,
 *   one per booking and connection, so it is never made twice);
 * - cancelled or lapsed: the event is deleted, which tells the customer;
 * - handed to someone else: deleted from the first person's calendar and
 *   made on the second's, when they are connected.
 *
 * Online sessions of a service that makes Google Meet links (KTD8) get a
 * Meet: asked for on the event, read again if Google is still making it,
 * tightened to RESTRICTED when the host's account allows it, and saved on
 * the booking. One-to-one bookings only: a class's bookings and a course's
 * sessions are not copied.
 *
 * Google's "try later" (429, 5xx, a timeout) throws, so the worker retries
 * on `calendar.sync`'s schedule of minutes (GC-05); the last failure tells
 * the person, once. A refused token marks the connection lapsed and stops.
 *
 * Only while allowed (GC-02, GC-03, `calendar-allowed.ts`): with the flag
 * or the plan off, or the person no longer holding `calendar:connect-own`,
 * the job does nothing and events in Google stay as they were. A paused
 * person's calendar gets no new events; one already there is left alone.
 * A booking whose time has passed is never deleted with an email.
 */
@Injectable()
export class CalendarSyncHandler {
    private readonly logger = new Logger(CalendarSyncHandler.name);

    constructor(
        @Optional()
        @Inject(GOOGLE_CALENDAR)
        private readonly google: GoogleCalendarPort | null,
        private readonly flags: FeatureFlagService,
        private readonly lapses: CalendarLapseService,
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const payload = payloadOf(job.payload);
        if (!payload || !job.organizationId) {
            this.logger.warn(
                `${CALENDAR_SYNC_TYPE} job ${job.id} names no booking; nothing to sync`,
            );
            return;
        }
        const organizationId = job.organizationId;
        if (!this.google) return;
        if (await businessPause(organizationId, this.flags)) return;
        try {
            await runInOrgContext(organizationId, () =>
                this.sync(organizationId, payload),
            );
        } catch (error) {
            // The last try: the booking won't reach Google on its own now.
            if (job.attempts + 1 >= job.maxAttempts) {
                await runInOrgContext(organizationId, () =>
                    this.tellFailed(organizationId, payload.bookingId),
                );
            }
            throw error;
        }
    };

    async sync(organizationId: string, payload: SyncPayload): Promise<void> {
        const google = this.google;
        if (!google) return;
        const booking = await prisma.booking.findFirst({
            where: { id: payload.bookingId, organizationId },
            select: {
                id: true,
                status: true,
                startAt: true,
                endAt: true,
                timezone: true,
                staffId: true,
                bookerName: true,
                bookerEmail: true,
                locationType: true,
                meetingUrl: true,
                courseEnrollmentId: true,
                service: {
                    select: {
                        name: true,
                        capacity: true,
                        locationType: true,
                        meetingLink: true,
                    },
                },
                googleCalendarEvent: {
                    select: {
                        connectionId: true,
                        calendarId: true,
                        eventId: true,
                        meetUrl: true,
                    },
                },
            },
        });
        // Deleted: its event went with it (the row cascades); Google's stays.
        if (!booking) return;
        const mapping = booking.googleCalendarEvent;
        const syncing = await syncingMembers(organizationId);
        // Its event is on a paused person's calendar: left as it is.
        if (mapping && !(await this.mayReach(mapping.connectionId, syncing))) {
            return;
        }
        const copied =
            booking.status === "CONFIRMED" &&
            !booking.courseEnrollmentId &&
            booking.service.capacity <= 1;
        const found =
            copied && booking.staffId
                ? await this.targetFor(organizationId, booking.staffId, syncing)
                : null;
        // A booking that has ended is only ever brought up to date where
        // its event is (a privacy removal), never added somewhere new.
        const ended = booking.endAt.getTime() <= Date.now();
        const target =
            found &&
            ended &&
            (mapping?.connectionId !== found.connection.id ||
                mapping.calendarId !== found.calendarId)
                ? null
                : found;

        // 1. Off the calendar it no longer belongs on.
        const stays =
            mapping?.connectionId === target?.connection.id &&
            mapping?.calendarId === target?.calendarId;
        if (mapping && !stays) {
            await this.remove(organizationId, booking.id, mapping, {
                // Never a cancellation email for a time that has passed.
                quiet: payload.quiet || booking.endAt.getTime() <= Date.now(),
            });
        }

        const online = booking.locationType
            ? booking.locationType === "ONLINE"
            : booking.service.locationType === "ONLINE";
        const wantsMeet =
            !!target && online && booking.service.meetingLink === "GOOGLE_MEET";

        // 2. On the calendar it belongs on, as it is now.
        let meetUrl: string | null = null;
        if (target) {
            meetUrl = await this.put(organizationId, booking, target, {
                online,
                wantsMeet,
                meetTries: payload.meetTries,
                quiet: payload.quiet,
                // Tightened once, when the link is new to Saroh.
                knownMeet: stays ? (mapping?.meetUrl ?? null) : null,
                // The event it already has there, never a second one.
                knownEventId: stays ? (mapping?.eventId ?? null) : null,
            });
        }

        // 3. The booking's own link: its Meet, or none once it has left Google.
        const link = wantsMeet ? meetUrl : null;
        if (
            booking.meetingUrl !== link &&
            (link !== null || mapping?.meetUrl)
        ) {
            await prisma.booking.update({
                where: { id: booking.id },
                data: { meetingUrl: link },
                select: { id: true },
            });
        }
    }

    /** Whether the connection's person may sync now (GC-03). */
    private async mayReach(
        connectionId: string,
        syncing: ReadonlySet<string>,
    ): Promise<boolean> {
        const row = await prisma.googleCalendarConnection.findUnique({
            where: { id: connectionId },
            select: { membershipId: true },
        });
        return !row || syncing.has(row.membershipId);
    }

    /**
     * The connected calendar whoever takes the booking writes to, if any:
     * none for someone who may no longer sync (GC-03).
     */
    private async targetFor(
        organizationId: string,
        staffId: string,
        syncing: ReadonlySet<string>,
    ): Promise<Target | null> {
        const connection = await prisma.googleCalendarConnection.findFirst({
            where: {
                organizationId,
                status: "CONNECTED",
                membership: { staffMember: { id: staffId } },
            },
            select: {
                ...SEALED_CONNECTION,
                scopes: true,
                membershipId: true,
                calendars: {
                    where: { writeTo: true },
                    select: { calendarId: true },
                },
            },
        });
        const calendarId = connection?.calendars[0]?.calendarId;
        if (!connection || !calendarId) return null;
        if (!syncing.has(connection.membershipId)) return null;
        if (!grantedParts(connection.scopes).events) return null;
        return { connection, calendarId };
    }

    /** Delete the event where it is (telling the guest), and forget it. */
    private async remove(
        organizationId: string,
        bookingId: string,
        mapping: Mapping,
        opts: { quiet: boolean },
    ): Promise<void> {
        const google = this.google;
        const connection = await prisma.googleCalendarConnection.findFirst({
            where: { id: mapping.connectionId, organizationId },
            select: SEALED_CONNECTION,
        });
        // A lapsed connection can't be reached: the record goes, the event
        // stays in Google until the person deletes it.
        if (google && connection?.status === "CONNECTED") {
            const done = await this.withGoogle(connection, async (access) => {
                await google.deleteEvent(
                    access,
                    mapping.calendarId,
                    mapping.eventId,
                    { quiet: opts.quiet },
                );
                return true;
            });
            if (!done) return;
        }
        await prisma.googleCalendarEvent.deleteMany({ where: { bookingId } });
    }

    /** Make or update the event; the Meet link when there is one. */
    private async put(
        organizationId: string,
        booking: {
            id: string;
            status: string;
            staffId: string | null;
            startAt: Date;
            endAt: Date;
            timezone: string;
            bookerName: string | null;
            bookerEmail: string | null;
            service: { name: string };
        },
        target: Target,
        opts: {
            online: boolean;
            wantsMeet: boolean;
            meetTries: number;
            quiet: boolean;
            knownMeet: string | null;
            knownEventId: string | null;
        },
    ): Promise<string | null> {
        const google = this.google;
        if (!google) return null;
        const profile = opts.online
            ? null
            : await prisma.businessProfile.findUnique({
                  where: { organizationId },
                  select: {
                      addressLine1: true,
                      addressLine2: true,
                      city: true,
                      postalCode: true,
                  },
              });
        const input = eventFor(
            {
                id: booking.id,
                startAt: booking.startAt,
                endAt: booking.endAt,
                timezone: booking.timezone,
                bookerName: booking.bookerName,
                bookerEmail: booking.bookerEmail,
                serviceName: booking.service.name,
                online: opts.online,
            },
            {
                connectionId: target.connection.id,
                meet: opts.wantsMeet,
                address: addressLine(profile),
                ...(opts.knownEventId ? { eventId: opts.knownEventId } : {}),
            },
        );
        const result = await this.withGoogle(target.connection, (access) =>
            google
                .putEvent(access, target.calendarId, input, {
                    quiet: opts.quiet,
                })
                .then(async (made) => {
                    if (
                        made.meetUrl &&
                        made.meetCode &&
                        made.meetUrl !== opts.knownMeet
                    ) {
                        await this.restrict(
                            target,
                            access,
                            made.meetCode,
                            booking.id,
                        );
                    }
                    return made;
                }),
        );
        if (!result) return null;
        await prisma.googleCalendarEvent.upsert({
            where: { bookingId: booking.id },
            create: {
                organizationId,
                bookingId: booking.id,
                connectionId: target.connection.id,
                calendarId: target.calendarId,
                eventId: result.eventId || input.eventId,
                meetUrl: result.meetUrl,
            },
            update: {
                connectionId: target.connection.id,
                calendarId: target.calendarId,
                eventId: result.eventId || input.eventId,
                meetUrl: result.meetUrl,
                syncedAt: new Date(),
            },
        });
        await this.followUp(organizationId, booking);
        // Google is still making the Meet: ask again shortly.
        if (opts.wantsMeet && result.meetPending) {
            if (opts.meetTries + 1 < MEET_TRIES) {
                await prisma.job.create({
                    data: {
                        organizationId,
                        type: CALENDAR_SYNC_TYPE,
                        payload: {
                            bookingId: booking.id,
                            meetTries: opts.meetTries + 1,
                        },
                        maxAttempts: CALENDAR_SYNC_ATTEMPTS,
                        runAt: new Date(Date.now() + MEET_RETRY_MS),
                    },
                    select: { id: true },
                });
            } else {
                this.logger.warn(
                    `google_meet_not_ready booking=${booking.id}: Google never finished the Meet link`,
                );
                await this.lapses.syncFailed(
                    target.connection.id,
                    booking.id,
                    "meet",
                );
            }
        }
        return result.meetUrl;
    }

    /**
     * The booking changed while Google was making its event (GC-11): a
     * cancel then found no event to delete and queued nothing. Read it
     * again now the event is recorded, and queue one more pass if it moved
     * on, so the event is brought in line instead of left behind.
     */
    private async followUp(
        organizationId: string,
        before: { id: string; status: string; staffId: string | null },
    ): Promise<void> {
        const now = await prisma.booking.findFirst({
            where: { id: before.id, organizationId },
            select: { status: true, staffId: true },
        });
        if (
            !now ||
            (now.status === before.status && now.staffId === before.staffId)
        ) {
            return;
        }
        await prisma.job.create({
            data: {
                organizationId,
                type: CALENDAR_SYNC_TYPE,
                payload: { bookingId: before.id },
                maxAttempts: CALENDAR_SYNC_ATTEMPTS,
            },
            select: { id: true },
        });
    }

    /** Every retry spent: tell the person whose calendar it was for (GC-05). */
    private async tellFailed(
        organizationId: string,
        bookingId: string,
    ): Promise<void> {
        const booking = await prisma.booking.findFirst({
            where: { id: bookingId, organizationId },
            select: {
                staffId: true,
                googleCalendarEvent: { select: { connectionId: true } },
            },
        });
        const connectionId =
            booking?.googleCalendarEvent?.connectionId ??
            (booking?.staffId
                ? (
                      await prisma.googleCalendarConnection.findFirst({
                          where: {
                              organizationId,
                              membership: {
                                  staffMember: { id: booking.staffId },
                              },
                          },
                          select: { id: true },
                      })
                  )?.id
                : undefined);
        if (connectionId) {
            await this.lapses.syncFailed(connectionId, bookingId, "sync");
        }
    }

    /**
     * Only invitees join without knocking (KTD8): RESTRICTED. A personal
     * Gmail host can't have it and keeps TRUSTED, which for a one-to-one
     * session behaves the same: the customer is invited, a stranger knocks.
     * Never stops the sync.
     */
    private async restrict(
        target: Target,
        access: string,
        meetCode: string,
        bookingId: string,
    ): Promise<void> {
        const google = this.google;
        if (!google || !grantedParts(target.connection.scopes).meet) return;
        try {
            const space = await google.getMeetSpace(access, meetCode);
            if (space.access === "RESTRICTED") return;
            await google.setMeetAccess(access, space.name, "RESTRICTED");
        } catch (error) {
            this.logger.warn(
                `google_meet_restrict_skipped booking=${bookingId} reason=${reasonOf(error)}`,
            );
        }
    }

    /**
     * One step with Google for a connection: the access token, then `work`.
     * Null when it can't go on and shouldn't be retried: the token was
     * refused (the connection is now lapsed), or Google refused the call
     * (kept on the connection as its last error). Google's "try later"
     * throws, for the worker's retry.
     */
    private async withGoogle<T>(
        connection: SealedConnection,
        work: (access: string) => Promise<T>,
    ): Promise<T | null> {
        const google = this.google;
        if (!google) return null;
        try {
            const access = await accessTokenFor(google, connection, (id) =>
                this.lapses.lapse(id),
            );
            return await work(access);
        } catch (error) {
            if (isGoogleError(error, "lapsed")) return null;
            if (
                isGoogleError(error, "refused") ||
                isGoogleError(error, "gone")
            ) {
                this.logger.warn(
                    `google_calendar_sync_refused connection=${connection.id} reason=${reasonOf(error)}`,
                );
                await prisma.googleCalendarConnection.updateMany({
                    where: { id: connection.id },
                    data: { lastError: error.detail },
                });
                return null;
            }
            throw error;
        }
    }
}

function payloadOf(raw: unknown): SyncPayload | null {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as {
        bookingId?: unknown;
        meetTries?: unknown;
        quiet?: unknown;
    };
    if (typeof p.bookingId !== "string" || !p.bookingId) return null;
    return {
        bookingId: p.bookingId,
        meetTries: typeof p.meetTries === "number" ? p.meetTries : 0,
        quiet: p.quiet === true,
    };
}

function reasonOf(error: unknown): string {
    if (isGoogleError(error)) return `${error.kind}:${error.detail}`;
    return error instanceof Error ? error.name : "error";
}
