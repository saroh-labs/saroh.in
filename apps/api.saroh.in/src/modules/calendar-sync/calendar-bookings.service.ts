import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { assertOwnBooking } from "../bookings/own-diary";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { allows, authorize } from "../organizations/organization-policy";
import type { WindowLimiter } from "../rate-limits/shared-window";
import {
    assertCalendarPlan,
    businessPause,
    pausedBecause,
    syncingMembers,
} from "./calendar-allowed";
import { CalendarSyncHandler } from "./calendar-sync.handler";
import { hasTarget, staffWithTargets, targetFor } from "./calendar-target";
import type {
    BookingMeetingDto,
    BookingMeetingView,
    CalendarMemberView,
    MoveBookingsView,
} from "./dto";
import {
    memberChanges,
    moves,
    takeBusinessChanges,
    takeGoogleChange,
    takeOrRefuse,
} from "./google-changes";
import type { MeetAccess } from "./google/google-calendar.port";
import { isGoogleError } from "./google/google-calendar.port";
import { isMeetAccess, meetAccessOf, resyncMeetAccess } from "./meet-access";
import { queueCalendarSyncs } from "./queue-sync";

/**
 * Google Calendar v2's booking side (DEC-233): moving a person's upcoming
 * bookings to their "bookings go to" calendar, who may join a Meet (the
 * business's default and one booking's choice), a Meet link of a booking's
 * own, and the team's read of who has connected.
 */
@Injectable()
export class CalendarBookingsService {
    private readonly logger = new Logger(CalendarBookingsService.name);

    constructor(
        private readonly flags: FeatureFlagService,
        private readonly sync: CalendarSyncHandler,
        // Each change queues Google work on the shared lane: a person
        // can't flood it, or Saroh's one Google quota (M2, L9).
        @Optional()
        private readonly changes: WindowLimiter = memberChanges,
        @Optional()
        private readonly moveLimit: WindowLimiter = moves,
    ) {}

    /**
     * "Move my upcoming bookings" (DEC-233): every upcoming one-to-one
     * booking of theirs that isn't on their "bookings go to" calendar goes
     * there, a job each; one already there under another id is found by
     * its `sarohBookingId` rather than made twice. New Meet links, and the
     * customers are invited. One left on an account Saroh can't reach stays
     * there as well.
     */
    async moveBookings(ctx: OrganizationContext): Promise<MoveBookingsView> {
        authorize(ctx, "calendar:connect-own");
        await this.gate(ctx.organizationId);
        await this.takeChange(ctx);
        const staff = await prisma.staffMember.findFirst({
            where: {
                organizationId: ctx.organizationId,
                membership: { userId: ctx.userId },
            },
            select: { id: true },
        });
        if (!staff) {
            throw new ForbiddenException({
                message:
                    "Only someone who takes bookings can move them. Add yourself to the diary first.",
                details: { code: "NOT_ON_DIARY" },
            });
        }
        const target = await targetFor(
            ctx.organizationId,
            staff.id,
            await syncingMembers(ctx.organizationId),
        );
        if (!target) {
            throw new BadRequestException(
                "Choose where your bookings go in Google Calendar first.",
            );
        }
        const bookings = await prisma.booking.findMany({
            where: {
                organizationId: ctx.organizationId,
                staffId: staff.id,
                status: "CONFIRMED",
                endAt: { gt: new Date() },
                courseEnrollmentId: null,
                service: { capacity: { lte: 1 } },
                NOT: {
                    googleCalendarEvent: {
                        is: {
                            connectionId: target.connection.id,
                            calendarId: target.calendarId,
                        },
                    },
                },
            },
            select: { id: true },
        });
        if (bookings.length > 0) {
            // Each round invites every customer again (L1): a few a day,
            // and the business's hour pays for every booking it queues.
            await takeOrRefuse(
                this.moveLimit,
                ctx,
                "You've moved your bookings a few times today. Try again tomorrow.",
            );
            await takeBusinessChanges(ctx.organizationId, bookings.length);
        }
        const moving = await queueCalendarSyncs(
            prisma,
            ctx.organizationId,
            bookings.map((b) => b.id),
            { move: true },
        );
        return {
            moving,
            message:
                moving === 0
                    ? "Every upcoming booking is already on that calendar."
                    : `Moving ${moving === 1 ? "1 upcoming booking" : `${moving} upcoming bookings`}. Each gets a new Meet link where it has one, and the customer gets Google's invitation.`,
        };
    }

    /** The business's default for who may join a Meet (DEC-233). */
    async setBusinessMeetAccess(
        ctx: OrganizationContext,
        meetAccess: MeetAccess,
    ): Promise<{ meetAccess: MeetAccess; updating: number }> {
        authorize(ctx, "service:write");
        await this.gate(ctx.organizationId);
        await this.takeChange(ctx);
        await prisma.businessProfile.upsert({
            where: { organizationId: ctx.organizationId },
            create: { organizationId: ctx.organizationId, meetAccess },
            update: { meetAccess },
            select: { id: true },
        });
        const updating = await resyncMeetAccess(ctx.organizationId);
        return { meetAccess, updating };
    }

    /**
     * One booking's link and who may join it (DEC-233): a Meet of its own,
     * a link the business pastes, or back to its service's. Google is asked
     * here, so the answer says what Meet then has; a Google that is slow
     * or still making the Meet is asked again by a job.
     */
    async setBookingMeeting(
        ctx: OrganizationContext,
        bookingId: string,
        dto: BookingMeetingDto,
    ): Promise<BookingMeetingView> {
        authorize(ctx, "booking:write");
        const booking = await prisma.booking.findFirst({
            where: { id: bookingId, organizationId: ctx.organizationId },
            select: {
                id: true,
                status: true,
                endAt: true,
                staffId: true,
                serviceId: true,
                meetingLink: true,
                courseEnrollmentId: true,
                service: { select: { capacity: true } },
            },
        });
        if (!booking) throw new NotFoundException("That booking isn't here.");
        // A Calendar only person changes only their own diary's (H1).
        await assertOwnBooking(prisma, ctx, booking, "write");
        const google =
            dto.meetingLink === "GOOGLE_MEET" || dto.meetAccess !== undefined;
        if (google) await this.gate(ctx.organizationId);
        await this.takeChange(ctx);
        if (dto.meetingLink === "GOOGLE_MEET") {
            if (booking.service.capacity > 1 || booking.courseEnrollmentId) {
                throw new BadRequestException(
                    "Google Meet links are made for one-to-one bookings, not a class.",
                );
            }
            if (booking.status !== "CONFIRMED" || booking.endAt <= new Date()) {
                throw new BadRequestException(
                    "Only an upcoming booking can get a Meet link.",
                );
            }
        }
        if (dto.meetingUrl !== undefined && dto.meetingLink !== "MANUAL") {
            throw new BadRequestException({
                message: "A pasted link goes with meetingLink MANUAL.",
                details: { field: "meetingUrl" },
            });
        }
        const data: {
            meetingLink?: string | null;
            meetingUrl?: string | null;
            meetAccess?: string | null;
        } = {};
        if (dto.meetingLink === "MANUAL") {
            data.meetingLink = "MANUAL";
            data.meetingUrl = httpsLink(dto.meetingUrl);
        } else if (dto.meetingLink !== undefined) {
            data.meetingLink =
                dto.meetingLink === "GOOGLE_MEET" ? "GOOGLE_MEET" : null;
            // A pasted link goes with it; a Meet comes from the sync.
            if (booking.meetingLink === "MANUAL") data.meetingUrl = null;
        }
        if (dto.meetAccess !== undefined) data.meetAccess = dto.meetAccess;
        await prisma.booking.update({
            where: { id: booking.id },
            data,
            select: { id: true },
        });
        const linkChanged =
            dto.meetingLink !== undefined &&
            (data.meetingLink ?? null) !== booking.meetingLink;
        if (google || linkChanged) {
            await this.syncNow(ctx.organizationId, booking.id, !linkChanged);
        }
        return this.meetingOf(ctx, booking.id);
    }

    /**
     * One booking's link, who may join it, and its Google event (DEC-233).
     * Not there while Google Calendar is off for the business (L2).
     */
    async bookingMeeting(
        ctx: OrganizationContext,
        bookingId: string,
    ): Promise<BookingMeetingView> {
        authorize(ctx, "booking:read");
        if (
            !(await this.flags.isEnabled("GOOGLE_CALENDAR", ctx.organizationId))
        ) {
            throw new NotFoundException("Google Calendar isn't available yet.");
        }
        const found = await prisma.booking.findFirst({
            where: { id: bookingId, organizationId: ctx.organizationId },
            select: { staffId: true, serviceId: true },
        });
        if (!found) throw new NotFoundException("That booking isn't here.");
        await assertOwnBooking(prisma, ctx, found, "read");
        return this.meetingOf(ctx, bookingId);
    }

    /**
     * Who on the team has connected (the Team screen's Google Calendar
     * column): for whoever may disconnect them, `member:role:update`.
     */
    async members(ctx: OrganizationContext): Promise<CalendarMemberView[]> {
        authorize(ctx, "member:role:update");
        if (
            !(await this.flags.isEnabled("GOOGLE_CALENDAR", ctx.organizationId))
        ) {
            throw new NotFoundException("Google Calendar isn't available yet.");
        }
        const rows = await prisma.googleCalendarConnection.findMany({
            where: {
                organizationId: ctx.organizationId,
                status: { in: ["CONNECTED", "LAPSED"] },
            },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                googleEmail: true,
                status: true,
                membershipId: true,
                membership: {
                    select: {
                        user: { select: { name: true } },
                        staffMember: { select: { id: true, name: true } },
                    },
                },
            },
        });
        const going = await staffWithTargets(ctx.organizationId);
        const people = new Map<string, CalendarMemberView>();
        for (const row of rows) {
            const staff = row.membership.staffMember;
            const person: CalendarMemberView = people.get(row.membershipId) ?? {
                membershipId: row.membershipId,
                staffId: staff?.id ?? null,
                name: staff?.name ?? row.membership.user.name ?? "",
                accounts: [],
                bookingsGoToGoogle: !!staff && going.has(staff.id),
                pausedBecause: null,
            };
            person.accounts.push({
                id: row.id,
                googleEmail: row.googleEmail,
                state: row.status === "LAPSED" ? "LAPSED" : "CONNECTED",
            });
            people.set(row.membershipId, person);
        }
        for (const person of people.values()) {
            person.pausedBecause = await pausedBecause(
                ctx.organizationId,
                person.membershipId,
                this.flags,
            );
        }
        return [...people.values()];
    }

    /** The flag (404 while off) and the plan (`integrations`, Free locked). */
    private async gate(organizationId: string): Promise<void> {
        if (!(await this.flags.isEnabled("GOOGLE_CALENDAR", organizationId))) {
            throw new NotFoundException("Google Calendar isn't available yet.");
        }
        await assertCalendarPlan(organizationId);
    }

    /** One change to Google Calendar: the person's hour, then the business's (M2, L9). */
    private takeChange(ctx: OrganizationContext): Promise<void> {
        return takeGoogleChange(ctx, this.changes);
    }

    /**
     * Bring Google in line now; a Google that says "later" gets a job. Each
     * Google call is bounded (`GOOGLE_CALL_TIMEOUT_MS`), and `takeChange`
     * caps how often a business gets here.
     */
    private async syncNow(
        organizationId: string,
        bookingId: string,
        quietUpdate: boolean,
    ): Promise<void> {
        if (await businessPause(organizationId, this.flags)) return;
        const payload = { bookingId, meetTries: 0, quiet: false, quietUpdate };
        try {
            await this.sync.sync(organizationId, payload);
        } catch (error) {
            if (!isGoogleError(error)) throw error;
            this.logger.warn(
                `google_calendar_sync_later booking=${bookingId} reason=${error.kind}`,
            );
            await queueCalendarSyncs(
                prisma,
                organizationId,
                [bookingId],
                quietUpdate ? { quietUpdate } : {},
            );
        }
    }

    private async meetingOf(
        ctx: OrganizationContext,
        bookingId: string,
    ): Promise<BookingMeetingView> {
        const { organizationId } = ctx;
        const b = await prisma.booking.findFirstOrThrow({
            where: { id: bookingId, organizationId },
            select: {
                staffId: true,
                locationType: true,
                meetingLink: true,
                meetingUrl: true,
                meetAccess: true,
                service: {
                    select: {
                        locationType: true,
                        meetingLink: true,
                        meetAccess: true,
                    },
                },
                googleCalendarEvent: {
                    select: {
                        meetUrl: true,
                        meetAccess: true,
                        outOfDateAt: true,
                        connection: {
                            select: {
                                status: true,
                                googleEmail: true,
                                membership: { select: { userId: true } },
                            },
                        },
                    },
                },
            },
        });
        const online = b.locationType
            ? b.locationType === "ONLINE"
            : b.service.locationType === "ONLINE";
        const wantsMeet = b.meetingLink
            ? b.meetingLink === "GOOGLE_MEET"
            : online && b.service.meetingLink === "GOOGLE_MEET";
        const event = b.googleCalendarEvent;
        return {
            meetingLink:
                b.meetingLink === "GOOGLE_MEET" || b.meetingLink === "MANUAL"
                    ? b.meetingLink
                    : null,
            meetingUrl: b.meetingUrl,
            meetAccess: {
                own: isMeetAccess(b.meetAccess) ? b.meetAccess : null,
                chosen: await meetAccessOf(organizationId, b),
                applied:
                    event?.meetUrl && isMeetAccess(event.meetAccess)
                        ? event.meetAccess
                        : null,
            },
            google: !wantsMeet
                ? "NONE"
                : event?.meetUrl
                  ? "READY"
                  : (await hasTarget(organizationId, b.staffId))
                    ? "PENDING"
                    : "NOT_CONNECTED",
            googleEvent: event
                ? googleEventOf(
                      event,
                      // The host's Google address: theirs, or an admin's (L2).
                      event.connection.membership.userId === ctx.userId ||
                          allows(ctx, "member:role:update"),
                  )
                : null,
        };
    }
}

/** Its event in Google, and whether it still follows the booking (DEC-233). */
function googleEventOf(
    event: {
        outOfDateAt: Date | null;
        connection: { status: string; googleEmail: string };
    },
    showEmail: boolean,
): NonNullable<BookingMeetingView["googleEvent"]> {
    const connected = event.connection.status === "CONNECTED";
    const outOfDate = !connected && event.outOfDateAt !== null;
    return {
        googleEmail: showEmail ? event.connection.googleEmail : null,
        connected,
        outOfDate,
        message: connected
            ? null
            : outOfDate
              ? "This booking's old Google event isn't updated any more: it changed after that Google account was disconnected."
              : "This booking's Google event is on an account Saroh no longer reaches, so it won't follow changes.",
    };
}

/** A pasted link: https only, as a service's typed link (`resolveLocation`). */
function httpsLink(raw: string | undefined): string {
    let parsed: URL;
    try {
        parsed = new URL(raw ?? "");
    } catch {
        throw new BadRequestException({
            message: "That meeting link is not a web address",
            details: { field: "meetingUrl" },
        });
    }
    if (parsed.protocol !== "https:") {
        throw new BadRequestException({
            message: "A meeting link must start with https://",
            details: { field: "meetingUrl" },
        });
    }
    return parsed.toString();
}
