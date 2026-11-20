import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { SealedConnection } from "./calendar-access";
import { accessTokenFor, SEALED_CONNECTION } from "./calendar-access";
import {
    businessPause,
    overAllowance,
    syncingMembers,
} from "./calendar-allowed";
import { CALENDAR_SYNC_ATTEMPTS, CALENDAR_SYNC_TYPE } from "./calendar-jobs";
import { CalendarLapseService } from "./calendar-lapse.service";
import type { Target } from "./calendar-target";
import { targetFor } from "./calendar-target";
import { addressLine, eventFor } from "./event-shape";
import type {
    GoogleCalendarPort,
    MeetAccess,
} from "./google/google-calendar.port";
import {
    GOOGLE_CALENDAR,
    grantedParts,
    isGoogleError,
} from "./google/google-calendar.port";
import { meetAccessOf } from "./meet-access";

export { CALENDAR_SYNC_TYPE } from "./calendar-jobs";

/** How long to wait before asking Google again for a Meet link it is still making. */
export const MEET_RETRY_MS = 30_000;
/** And how many times, before the booking goes without one. */
export const MEET_TRIES = 6;

export interface SyncPayload {
    bookingId: string;
    meetTries: number;
    /** Email nobody: a privacy removal or a deleted customer (GC-09). */
    quiet: boolean;
    /**
     * An event already there is brought up to date with no email (DEC-233):
     * picked back up after a reconnect, or its Meet access changed.
     */
    quietUpdate?: boolean;
    /**
     * "Move my upcoming bookings" (DEC-233): one whose event is on an
     * account Saroh no longer reaches goes to the "bookings go to"
     * calendar, found there first by its `sarohBookingId`.
     */
    move?: boolean;
}

interface Mapping {
    connectionId: string;
    calendarId: string;
    eventId: string;
    meetUrl: string | null;
    meetAccessAsked: string | null;
    meetAccess: string | null;
    connection: { status: string; membershipId: string };
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
 * - handed to someone else, or to another calendar of theirs: deleted
 *   from where it was with no email, and made where it goes now, which
 *   invites the customer (DEC-233: one notice, not a cancellation too).
 *
 * An event on an account Saroh can't reach now (disconnected or lapsed) is
 * left as it is, record and all, so the same account connected again picks
 * it back up (DEC-233). It is only made afresh elsewhere when the booking
 * went to someone else, or on "Move my upcoming bookings".
 *
 * Online sessions of a service that makes Google Meet links (KTD8), and a
 * booking given one of its own (DEC-233), get a Meet: asked for on the
 * event, read again if Google is still making it, set to who may join
 * (the booking's, else the service's, else the business's choice) as far
 * as the host's account allows, and saved on the booking. One-to-one
 * bookings only: a class's bookings and a course's sessions are not
 * copied.
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
                meetingLink: true,
                meetAccess: true,
                courseEnrollmentId: true,
                service: {
                    select: {
                        name: true,
                        capacity: true,
                        locationType: true,
                        meetingLink: true,
                        meetAccess: true,
                    },
                },
                googleCalendarEvent: {
                    select: {
                        connectionId: true,
                        calendarId: true,
                        eventId: true,
                        meetUrl: true,
                        meetAccessAsked: true,
                        meetAccess: true,
                        connection: {
                            select: { status: true, membershipId: true },
                        },
                    },
                },
            },
        });
        // Deleted: its event went with it (the row cascades); Google's stays.
        if (!booking) return;
        let mapping: Mapping | null = booking.googleCalendarEvent;
        const syncing = await syncingMembers(organizationId);
        // Its event is on a paused person's calendar, or an account past the
        // plan's allowance: left as it is.
        if (
            mapping &&
            (!syncing.has(mapping.connection.membershipId) ||
                (await overAllowance(organizationId)).has(mapping.connectionId))
        ) {
            return;
        }
        const copied =
            booking.status === "CONFIRMED" &&
            !booking.courseEnrollmentId &&
            booking.service.capacity <= 1;
        const found =
            copied && booking.staffId
                ? await targetFor(organizationId, booking.staffId, syncing)
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

        // 0. Its event is on an account Saroh can't reach now (DEC-233):
        // left there, record and all, for a reconnect to pick up; made
        // afresh only for someone else, or when asked to move it.
        if (mapping && mapping.connection.status !== "CONNECTED") {
            const elsewhere =
                !!target &&
                (payload.move === true ||
                    target.connection.membershipId !==
                        mapping.connection.membershipId);
            if (!elsewhere) {
                // The booking changed; its event in Google can't follow.
                await prisma.googleCalendarEvent.updateMany({
                    where: { bookingId: booking.id, outOfDateAt: null },
                    data: { outOfDateAt: new Date() },
                });
                return;
            }
            this.logger.warn(
                `google_calendar_event_left booking=${booking.id} connection=${mapping.connectionId}: its account isn't connected, so its event stays there`,
            );
            await prisma.googleCalendarEvent.deleteMany({
                where: { bookingId: booking.id },
            });
            mapping = null;
        }

        // 1. Off the calendar it no longer belongs on. Only a booking that
        // ended (cancelled, lapsed) tells the customer: one that still
        // stands goes quietly, and its new event is the notice (DEC-233).
        const stays =
            !!mapping &&
            !!target &&
            mapping.connectionId === target.connection.id &&
            mapping.calendarId === target.calendarId;
        if (mapping && !stays) {
            await this.remove(organizationId, booking.id, mapping, {
                // Never a cancellation email for a time that has passed.
                quiet:
                    payload.quiet ||
                    booking.status === "CONFIRMED" ||
                    booking.endAt.getTime() <= Date.now(),
            });
        }

        const online = booking.locationType
            ? booking.locationType === "ONLINE"
            : booking.service.locationType === "ONLINE";
        // The booking's own choice first (DEC-233), else the service's.
        const wantsMeet =
            !!target &&
            (booking.meetingLink
                ? booking.meetingLink === "GOOGLE_MEET"
                : online && booking.service.meetingLink === "GOOGLE_MEET");

        // 2. On the calendar it belongs on, as it is now.
        let meetUrl: string | null = null;
        if (target) {
            meetUrl = await this.put(organizationId, booking, target, {
                online,
                wantsMeet,
                meetAccess: wantsMeet
                    ? await meetAccessOf(organizationId, booking)
                    : null,
                meetTries: payload.meetTries,
                quiet: payload.quiet,
                quietUpdate: payload.quietUpdate === true,
                search: payload.move === true,
                // Set once, when the link is new to Saroh or the choice changed.
                known: stays ? mapping : null,
            });
        }

        // 3. The booking's own link: its Meet, or none once it has left
        // Google. A link pasted on the booking (MANUAL) is the team's own.
        const link = wantsMeet ? meetUrl : null;
        if (
            booking.meetingLink !== "MANUAL" &&
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
            meetAccess: MeetAccess | null;
            meetTries: number;
            quiet: boolean;
            quietUpdate: boolean;
            /** Look for it on the calendar first, by `sarohBookingId`. */
            search: boolean;
            /** Its event there already. */
            known: Mapping | null;
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
        const known = opts.known;
        const result = await this.withGoogle(
            target.connection,
            async (access) => {
                // Made there already under another id (DEC-233): that one.
                const found =
                    !known && opts.search
                        ? await google.findEventByBooking(
                              access,
                              target.calendarId,
                              booking.id,
                          )
                        : null;
                const eventId = known?.eventId ?? found?.eventId;
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
                        ...(eventId ? { eventId } : {}),
                    },
                );
                const made = await google.putEvent(
                    access,
                    target.calendarId,
                    input,
                    { quiet: opts.quiet, quietUpdate: opts.quietUpdate },
                );
                let meet: { asked: string | null; applied: string | null } = {
                    asked: known?.meetAccessAsked ?? null,
                    applied: known?.meetAccess ?? null,
                };
                if (
                    made.meetUrl &&
                    made.meetCode &&
                    opts.meetAccess &&
                    (made.meetUrl !== known?.meetUrl ||
                        opts.meetAccess !== known.meetAccessAsked)
                ) {
                    meet = {
                        asked: opts.meetAccess,
                        applied: await this.applyAccess(
                            target,
                            access,
                            made.meetCode,
                            opts.meetAccess,
                            booking.id,
                        ),
                    };
                }
                if (!made.meetUrl) meet = { asked: null, applied: null };
                return {
                    ...made,
                    eventId: made.eventId || input.eventId,
                    access: meet,
                };
            },
        );
        if (!result) return null;
        const row = {
            connectionId: target.connection.id,
            calendarId: target.calendarId,
            eventId: result.eventId,
            meetUrl: result.meetUrl,
            meetAccessAsked: result.access.asked,
            meetAccess: result.access.applied,
            outOfDateAt: null,
        };
        await prisma.googleCalendarEvent.upsert({
            where: { bookingId: booking.id },
            create: { organizationId, bookingId: booking.id, ...row },
            update: { ...row, syncedAt: new Date() },
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
     * Set who may join without knocking (DEC-233), and answer what Google
     * then has: the choice, or what it kept when it refused (a personal
     * Gmail host can't have RESTRICTED and keeps TRUSTED, which for a
     * one-to-one session behaves the same: the customer is invited, a
     * stranger knocks). Null when Saroh may not touch the Meet or couldn't
     * read it. Never stops the sync.
     */
    private async applyAccess(
        target: Target,
        access: string,
        meetCode: string,
        wanted: MeetAccess,
        bookingId: string,
    ): Promise<MeetAccess | null> {
        const google = this.google;
        if (!google || !grantedParts(target.connection.scopes).meet) {
            return null;
        }
        let space: { name: string; access: MeetAccess | null } | null = null;
        try {
            space = await google.getMeetSpace(access, meetCode);
            if (space.access === wanted) return wanted;
            await google.setMeetAccess(access, space.name, wanted);
            return wanted;
        } catch (error) {
            this.logger.warn(
                `google_meet_meetskipped booking=${bookingId} wanted=${wanted} reason=${reasonOf(error)}`,
            );
            return space?.access ?? null;
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
        quietUpdate?: unknown;
        move?: unknown;
    };
    if (typeof p.bookingId !== "string" || !p.bookingId) return null;
    return {
        bookingId: p.bookingId,
        meetTries: typeof p.meetTries === "number" ? p.meetTries : 0,
        quiet: p.quiet === true,
        quietUpdate: p.quietUpdate === true,
        move: p.move === true,
    };
}

function reasonOf(error: unknown): string {
    if (isGoogleError(error)) return `${error.kind}:${error.detail}`;
    return error instanceof Error ? error.name : "error";
}
