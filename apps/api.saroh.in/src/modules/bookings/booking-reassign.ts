import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import type { Booking, Prisma, Service } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { dayWords, isTimeZone, timeWords } from "../../common/words-format";
import { noticeOf } from "../notifications/notice-target";
import { allows } from "../organizations/organization-policy";
import type {
    AvailabilityRuleWindow,
    Interval,
    OpeningHours,
} from "./availability";
import { guarded, isPersonSlotStart, overlaps, widen } from "./availability";
import type { Staffing } from "./booking-slots";
import { toAvailabilityService } from "./booking-slots";
import { loadPeople } from "./staff-availability";

/*
 * Changing who a booking is with (#1157): handing it to someone else on
 * the team, or giving one that has nobody a person. The write itself is
 * the move's (`booking-move.ts`, with `reassign`), so the money, deposit,
 * pay link, pack credit, waitlist place and series stay exactly where they
 * are: only `staffId` (and the time, when it moves too) changes.
 *
 * - **Who may.** `booking:write`. Someone who may also change services
 *   and who takes them (`service:write`: an owner, an admin, a role the
 *   business gave it) may give anyone's booking to anyone. Anyone else (a
 *   Member at the front desk, Calendar only) may hand over a booking from
 *   their own diary, or take one that has nobody; someone else's booking
 *   is theirs to move or cancel (DEC-170), not to give away. The same
 *   split as a person's own booking rules (#1038).
 * - **Who can take it.** Someone who takes the service, working then
 *   (their hours, extra hours and time off), with no clash: a clash is a
 *   409 that says when they are busy. A class keeps its own instructor
 *   flow and is refused here.
 * - **Who is told.** The customer, once, through the booking-moved path;
 *   both people in their own alerts (`notification:read-own`), except the
 *   person who made the change.
 */

/** The `type` of the alert each person gets in their own inbox. */
export const BOOKING_REASSIGNED_NOTIFICATION_TYPE =
    "booking.reassigned" as const;

/** Said to someone who may only hand over their own bookings. */
export const NOT_YOURS_TO_REASSIGN =
    "You can hand over only your own bookings, or take one that has nobody. An owner or admin can change who has someone else's.";

/** Said when someone who isn't on the diary tries to take one. */
export const TAKE_ONLY_YOURSELF =
    "You can give a booking that has nobody only to yourself. An owner or admin can give it to someone else.";

/** Said for a class: its instructor is changed on the class. */
export const CLASS_INSTRUCTOR_ELSEWHERE =
    "This is a class. Change who teaches it from the class, not one booking.";

type Tx = Prisma.TransactionClient;

/**
 * The person a booking is being given to, in this business. Someone in
 * another business, or no one, is a 404, as if they weren't there.
 */
export async function requireTeamPerson(
    organizationId: string,
    staffId: string,
): Promise<{ id: string; name: string; membershipId: string | null }> {
    const person = await prisma.staffMember.findFirst({
        where: { id: staffId, organizationId },
        select: { id: true, name: true, membershipId: true },
    });
    if (!person) {
        throw new NotFoundException({
            message: "That person isn't on your team.",
            field: "staffId",
        });
    }
    return person;
}

/**
 * Whether this caller may give `booking` to `toStaffId` (see the file
 * comment). Nothing for someone with `service:write`.
 */
export async function assertMayReassign(
    ctx: OrganizationContext,
    booking: { staffId: string | null },
    toStaffId: string,
): Promise<void> {
    if (allows(ctx, "service:write")) return;
    const membership = await prisma.membership.findUnique({
        where: {
            organizationId_userId: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
            },
        },
        select: { staffMember: { select: { id: true } } },
    });
    const own = membership?.staffMember?.id ?? null;
    if (booking.staffId === null) {
        if (own && toStaffId === own) return;
        throw new ForbiddenException(TAKE_ONLY_YOURSELF);
    }
    if (own && booking.staffId === own) return;
    throw new ForbiddenException(NOT_YOURS_TO_REASSIGN);
}

/** "10:00 am to 10:45 am", in the business's zone. */
function spanWords(span: Interval, zone: string): string {
    return `${timeWords(span.startAt, zone)} to ${timeWords(span.endAt, zone)}`;
}

function zoneOf(staffing: Staffing, booking: { timezone: string }): string {
    const zone = staffing.zone ?? booking.timezone;
    return isTimeZone(zone) ? zone : "Asia/Kolkata";
}

/**
 * Refuse, as a 409 that says when, giving the booking to someone already
 * booked then (their other bookings, with the service's buffers and their
 * gap between bookings). The booking itself never counts.
 */
export async function refuseIfBusy(
    service: Service,
    staffing: Staffing,
    booking: Pick<Booking, "id" | "timezone">,
    person: { id: string; name: string },
    startAt: Date,
): Promise<void> {
    const endAt = new Date(
        startAt.getTime() + service.durationMinutes * 60_000,
    );
    // loadPeople answers one row per id asked for, in order.
    const [loaded] = await loadPeople(
        prisma,
        service.organizationId,
        [person.id],
        startAt,
        endAt,
        booking.id,
    );
    const clash = firstClash(
        { startAt, endAt },
        service,
        loaded.busy,
        loaded.gapMinutes ?? 0,
    );
    if (!clash) return;
    const zone = zoneOf(staffing, booking);
    throw new ConflictException({
        message: `${person.name} is already booked from ${spanWords(clash, zone)}. Pick someone else or another time.`,
        field: "staffId",
        details: {
            reason: "person-busy",
            busyFrom: clash.startAt.toISOString(),
            busyTo: clash.endAt.toISOString(),
        },
    });
}

/** The first of `busy` that keeps `slot` from being theirs, or null. */
function firstClash(
    slot: Interval,
    service: Service,
    busy: Interval[],
    gapMinutes: number,
): Interval | null {
    const span = widen(
        guarded(slot, toAvailabilityService(service)),
        gapMinutes,
    );
    return (
        [...busy]
            .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
            .find((b) => overlaps(span, b)) ?? null
    );
}

/** One person the booking could be given to, and whether they can take it. */
export interface ReassignCandidate {
    id: string;
    name: string;
    /**
     * `current`: it is with them now. `free`: they can take it then.
     * `busy`: booked then (`busyFrom`–`busyTo`). `off`: not working then.
     */
    state: "current" | "free" | "busy" | "off";
    busyFrom?: string;
    busyTo?: string;
}

/**
 * Everyone who takes the service, and whether each can take this booking
 * at `startAt` (the picker's list, #1157): free first, then busy (saying
 * when), then not working. The booking itself never counts against
 * anyone, so its own person reads free at its own time.
 */
export async function reassignCandidates(
    booking: Pick<Booking, "id" | "staffId" | "timezone">,
    service: Service,
    rules: AvailabilityRuleWindow[],
    staffing: Staffing,
    startAt: Date,
    opening: OpeningHours | null,
): Promise<ReassignCandidate[]> {
    if (!staffing.perPerson || !staffing.zone) return [];
    const zone = staffing.zone;
    const endAt = new Date(
        startAt.getTime() + service.durationMinutes * 60_000,
    );
    const people = await loadPeople(
        prisma,
        service.organizationId,
        staffing.people.map((p) => p.id),
        startAt,
        endAt,
        booking.id,
    );
    const availService = toAvailabilityService(service);
    const rows = staffing.people.map((p, index): ReassignCandidate => {
        // loadPeople answers in the order asked.
        const person = people[index];
        if (p.id === booking.staffId) {
            return { id: p.id, name: p.name, state: "current" };
        }
        if (
            isPersonSlotStart(
                availService,
                rules,
                person,
                zone,
                startAt,
                opening,
            )
        ) {
            return { id: p.id, name: p.name, state: "free" };
        }
        const clash = firstClash(
            { startAt, endAt },
            service,
            person.busy,
            person.gapMinutes ?? 0,
        );
        return clash
            ? {
                  id: p.id,
                  name: p.name,
                  state: "busy",
                  busyFrom: clash.startAt.toISOString(),
                  busyTo: clash.endAt.toISOString(),
              }
            : { id: p.id, name: p.name, state: "off" };
    });
    const order = { current: 0, free: 1, busy: 2, off: 3 } as const;
    return rows.sort((a, b) => order[a.state] - order[b.state]);
}

/** Refuse what can't be given to someone: a class, or nobody takes it. */
export function refuseUnreassignable(staffing: Staffing, service: Service) {
    if (service.capacity > 1) {
        throw new ConflictException(CLASS_INSTRUCTOR_ELSEWHERE);
    }
    if (!staffing.perPerson) {
        throw new BadRequestException({
            message:
                "Nobody takes this service yet. Add who takes it on the service first.",
            field: "staffId",
        });
    }
}

/**
 * The two people's own alerts (`notification:read-own`, #1138's per-person
 * inbox): the one who had it and the one who has it now, each opening the
 * booking. Someone with no login has no inbox; the person who made the
 * change already knows. Written on the reassigning transaction.
 */
export async function tellStaffInTx(
    tx: Tx,
    input: {
        organizationId: string;
        bookingId: string;
        actorUserId: string | null;
        /** "Kabir Singh", or "A customer". */
        who: string;
        service: string;
        startAt: Date;
        timeZone: string;
        from: { id: string; name: string } | null;
        to: { id: string; name: string };
    },
): Promise<void> {
    const ids = [input.from?.id, input.to.id].filter(
        (id): id is string => typeof id === "string",
    );
    const staff = await tx.staffMember.findMany({
        where: { id: { in: ids }, organizationId: input.organizationId },
        select: { id: true, membership: { select: { userId: true } } },
    });
    const userOf = (id: string | undefined) =>
        staff.find((s) => s.id === id)?.membership?.userId ?? null;
    const zone = isTimeZone(input.timeZone) ? input.timeZone : "Asia/Kolkata";
    const when = `${dayWords(input.startAt, zone, { weekday: true })} at ${timeWords(input.startAt, zone)}`;
    const alerts: { userId: string | null; title: string; body: string }[] = [
        {
            userId: userOf(input.to.id),
            title: `${input.who}'s ${input.service} is now with you`,
            body: input.from
                ? `${when}. It was with ${input.from.name}.`
                : `${when}.`,
        },
        {
            userId: input.from ? userOf(input.from.id) : null,
            title: `${input.who}'s ${input.service} is now with ${input.to.name}`,
            body: `${when}. It's off your diary.`,
        },
    ];
    for (const alert of alerts) {
        if (!alert.userId || alert.userId === input.actorUserId) continue;
        await tx.notification.create({
            data: {
                organizationId: input.organizationId,
                userId: alert.userId,
                ...noticeOf(BOOKING_REASSIGNED_NOTIFICATION_TYPE, {
                    bookingId: input.bookingId,
                }),
                title: alert.title,
                body: alert.body,
            },
            select: { id: true },
        });
    }
}
