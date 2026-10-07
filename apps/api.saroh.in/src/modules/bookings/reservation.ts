import {
    ConflictException,
    GoneException,
    NotFoundException,
} from "@nestjs/common";
import type { Booking, Service } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { ActivationEvents } from "../analytics/activation-events";
import { planMeter } from "../billing/metering.service";
import { bookingsPaused } from "../billing/plan-limit-errors";
import { phoneToFill } from "../customer-workspace/contact-phone-fill";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { appointmentsOpen } from "./appointments-open";
import type { AvailabilityRuleWindow } from "./availability";
import { guarded, guardMinutes } from "./availability";
import { BookingEventType } from "./booking-event-type";
import { holdsPlace, releaseHoldInTx } from "./booking-hold";
import { bookingLocation, intakeNoteOf } from "./booking-intake";
import { freeCancelDeadline, loadBookingRules } from "./booking-rules";
import type { AccountBookPay, BookingLocationType, PaidWith } from "./dto";
import { seatsHeld } from "./held-seats";
import { depositCents } from "./service-fields";
import { acceptWaitlistInTx } from "./waitlist-queue";

/*
 * The reservation both booking services share (#508): the booking page's
 * and a booking made by hand go through the same serializable write, so
 * neither can promise what the other could not.
 */

/** The validated public booking command input (see {@link BookServiceDto}). */
export interface BookInput {
    startAt: string;
    bookerName?: string;
    bookerEmail: string;
    bookerPhone?: string;
    idempotencyKey?: string;
    /** The person asked for (U3); absent means whoever is free. */
    staffId?: string;
    /**
     * How the booking page's booker pays (U19): NOW holds the place for
     * 15 minutes (`HOLD_MINUTES`) while they pay online, DEPOSIT does the
     * same for the service's deposit only (E8), DESK books it to pay on the
     * day. Absent — the one-service booking block — books as before.
     * CREDIT (A10, signed in only) spends one class of the pack or
     * membership named below (`creditChoiceOf`).
     */
    pay?: AccountBookPay;
    /** Paying with CREDIT (A10): the pack purchase it comes out of… */
    packPurchaseId?: string;
    /** …or the membership. */
    subscriptionId?: string;
    /**
     * Where, for a service offered either way (E7). Absent: in person. See
     * {@link bookingLocation}.
     */
    locationType?: BookingLocationType;
    /**
     * "Anything we should know?" (E7). Kept on the booking only — never in
     * its snapshot, its job payload or a log.
     */
    intakeNote?: string;
}

/** The pack or the membership a class credit comes out of (A10). */
export type CreditChoice =
    | { kind: "PACK"; packPurchaseId: string }
    | { kind: "MEMBERSHIP"; subscriptionId: string };

/** Who a booking is with and how it is paid, for {@link reserveInTx}. */
export interface ReserveWith {
    staffId: string | null;
    staffName?: string;
    perPerson: boolean;
    paidWith?: PaidWith | null;
    subscriptionId?: string | null;
    /** A pay-now hold (U19): PENDING, holding its place until then. */
    holdUntil?: Date | null;
    /**
     * A later visit of a treatment (E9, DEC-050): the order that sold it
     * and which visit this is. Written with the booking, so the one-live-
     * visit unique refuses a second booking of the same visit at once.
     */
    visit?: { orderId: string; visitNumber: number };
}

/** Who a reservation is made by. */
export interface ReserveBy {
    /** `Contact.source` for someone new. */
    source: string;
    /** Who made it; `null` when the booker did it themselves. */
    actorUserId: string | null;
    /**
     * The customer's site account, when they booked signed in (A9,
     * ADR-011). Its contact is the booker — never a contact found or made by
     * the email — the booking names the account, and the same account (or
     * its contact) can't hold the same session twice.
     */
    account?: SignedInBooker;
}

/** A signed-in customer booking for themselves (A9). */
export interface SignedInBooker {
    accountId: string;
    contactId: string;
}

/** The 409 for a customer who already holds this very slot (A9). */
export const ALREADY_BOOKED = "You're already booked for this.";

export function alreadyBooked(): ConflictException {
    return new ConflictException({
        message: ALREADY_BOOKED,
        details: { reason: "already-booked" },
    });
}

/**
 * Whether the account — or the contact it signs in as — already holds this
 * session of this service: confirmed, or a pay-now hold still running. A
 * booking cancelled or let go doesn't count, and nor does the account's own
 * unpaid hold: booking again lets that go ({@link reserveInTx}, K-2).
 */
export async function holdsSlotAlready(
    db: Pick<Prisma.TransactionClient, "booking">,
    organizationId: string,
    who: SignedInBooker,
    serviceId: string,
    startAt: Date,
    now: Date = new Date(),
): Promise<boolean> {
    const found = await db.booking.findFirst({
        where: {
            organizationId,
            serviceId,
            startAt,
            AND: [
                holdsPlace(now),
                {
                    OR: [
                        { customerAccountId: who.accountId },
                        { contactId: who.contactId },
                    ],
                },
                // Spelled out: a NOT over a nullable column would drop a
                // guest's hold on the same contact (NULL account) too.
                {
                    OR: [
                        { status: { not: "PENDING" } },
                        { customerAccountId: null },
                        { customerAccountId: { not: who.accountId } },
                    ],
                },
            ],
        },
        select: { id: true },
    });
    return found !== null;
}

/**
 * The account's own live, unpaid hold on this session, if any — the one a
 * new booking of it lets go (K-2).
 */
export async function ownHoldOn(
    db: Pick<Prisma.TransactionClient, "booking">,
    organizationId: string,
    accountId: string,
    serviceId: string,
    startAt: Date,
    now: Date = new Date(),
): Promise<string | null> {
    const hold = await db.booking.findFirst({
        where: {
            organizationId,
            serviceId,
            startAt,
            customerAccountId: accountId,
            status: "PENDING",
            holdExpiresAt: { gt: now },
        },
        select: { id: true },
    });
    return hold?.id ?? null;
}

/**
 * Load an ACTIVE, non-deleted bookable service + its rules, or throw
 * (404/410). A service whose organization switched Appointments off is 410
 * like an archived one: the booking would otherwise land behind a module
 * the merchant can no longer open. `bookingPage` is the public booking page's
 * read: a service the merchant hid from it (E1) is 410 there too, while
 * staff still book it.
 */
export async function loadBookableService(
    serviceId: string,
    { bookingPage = false }: { bookingPage?: boolean } = {},
): Promise<{ service: Service; rules: AvailabilityRuleWindow[] }> {
    const service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: { availabilityRules: true },
    });
    if (service?.deletedAt !== null) {
        throw new NotFoundException("Service not found");
    }
    if (service.status !== "ACTIVE") {
        throw new GoneException("This service is not accepting bookings");
    }
    if (bookingPage && !service.showOnBookingPage) {
        throw new GoneException("This service isn't booked online");
    }
    if (!(await appointmentsOpen(service.organizationId))) {
        throw new GoneException(
            "This business isn't taking online bookings right now",
        );
    }
    const { availabilityRules, ...rest } = service;
    return { service: rest, rules: availabilityRules };
}

/** The booking an idempotency key already made for this service, if any. */
export async function bookingByKey(
    serviceId: string,
    input: BookInput,
): Promise<Booking | null> {
    if (!input.idempotencyKey) return null;
    return prisma.booking.findUnique({
        where: {
            serviceId_idempotencyKey: {
                serviceId,
                idempotencyKey: input.idempotencyKey,
            },
        },
    });
}

/** A serialization failure that nothing else explained: the race was lost. */
class RaceLost extends ConflictException {}

/**
 * The reservation itself, shared by the booking page and a booking made
 * by hand: re-count inside a Serializable transaction, upsert the contact,
 * write the CONFIRMED booking, its first history event and the notify job.
 * See `PublicBookingsService.book` for why the in-transaction re-count is
 * the guarantee.
 *
 * `also.inTx` runs on the same transaction after the booking is written —
 * spending a class pack on it, for one — so a refusal there takes the
 * booking back with it, and a booking never exists half-paid. Losing a
 * race then may be about what it touched rather than the slot, so the
 * caller says what to tell the booker (`also.onRace`).
 */
export async function reserve(
    activation: ActivationEvents | undefined,
    service: Service,
    startAt: Date,
    endAt: Date,
    input: BookInput,
    by: ReserveBy,
    also?: {
        inTx: (tx: Prisma.TransactionClient, booking: Booking) => Promise<void>;
        onRace: string;
        /**
         * Try once more after losing a serialization race, so the answer is
         * true now (`backend-billing-and-classes.md`): a customer spending
         * their last credit in two tabs is told the pack is empty, not that
         * something changed (A10).
         */
        retryOnce?: boolean;
    },
    person?: ReserveWith,
): Promise<Booking> {
    try {
        return await reserveOnce(
            activation,
            service,
            startAt,
            endAt,
            input,
            by,
            also,
            person,
        );
    } catch (err) {
        if (!also?.retryOnce || !(err instanceof RaceLost)) throw err;
        return reserveOnce(
            activation,
            service,
            startAt,
            endAt,
            input,
            by,
            also,
            person,
        );
    }
}

async function reserveOnce(
    activation: ActivationEvents | undefined,
    service: Service,
    startAt: Date,
    endAt: Date,
    input: BookInput,
    by: ReserveBy,
    also?: {
        inTx: (tx: Prisma.TransactionClient, booking: Booking) => Promise<void>;
        onRace: string;
    },
    person?: ReserveWith,
): Promise<Booking> {
    const serviceId = service.id;
    const organizationId = service.organizationId;

    let booked: Booking;
    try {
        booked = await prisma.$transaction(
            async (tx) => {
                const booking = await reserveInTx(
                    tx,
                    service,
                    startAt,
                    endAt,
                    input,
                    by,
                    undefined,
                    person,
                );
                if (also) await also.inTx(tx, booking);
                return booking;
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            },
        );
    } catch (err) {
        // P2034 however it arrives (common/prisma-errors.ts).
        const code = prismaErrorCode(err);
        // Idempotency race: two concurrent books with the same
        // (serviceId, idempotencyKey). The loser is refused one of three
        // ways — the unique index (P2002), a serialization failure
        // (P2034, both read the slot and its person), or the capacity or
        // person gate once the winner is visible. Whichever, when the
        // key's booking now exists, replay the winner instead of erroring.
        if (
            input.idempotencyKey &&
            (code === "P2002" ||
                code === "P2034" ||
                err instanceof ConflictException)
        ) {
            const existing = await bookingByKey(serviceId, input);
            if (existing) return existing;
        }
        // Serialization failure — Postgres aborted the loser of a race.
        // On its own, the only thing two bookings contend for is the slot.
        if (code === "P2034") {
            throw new RaceLost(also?.onRace ?? "This slot is fully booked");
        }
        throw err;
    }

    // Instrumentation lives OUTSIDE the try, not merely after the commit.
    // Inside it, a throw from here would fall into the catch above and be
    // re-thrown as if the booking had failed — a committed booking
    // reported to the booker as an error. The catch is for database
    // outcomes only.
    //
    // Safe on every booking: the ledger keeps only the first
    // (deterministic dedupeKey), so there is no "is this their first?"
    // query and no race between two concurrent bookings.
    await activation?.firstBookingCreated(organizationId, booked.id);
    return booked;
}

/**
 * Write one booking on the caller's transaction: re-count capacity,
 * upsert the contact, create the CONFIRMED booking and its first history
 * event, and queue its notification.
 *
 * Public so a course can book every session in one transaction (ADR-007).
 * The caller owns the transaction and its isolation, and maps its errors.
 */
export async function reserveInTx(
    tx: Prisma.TransactionClient,
    service: Service,
    startAt: Date,
    endAt: Date,
    input: BookInput,
    by: ReserveBy,
    course?: { courseId: string; enrollmentId: string },
    person?: ReserveWith,
): Promise<Booking> {
    const serviceId = service.id;
    const organizationId = service.organizationId;
    const email = input.bookerEmail.trim().toLowerCase();
    const snapshot = buildSnapshot(service, input, startAt, endAt);
    // The plan's monthly bookings cap (U13), before anything is written.
    // It counts and refuses only bookings customers make themselves
    // (DEC-095): one the team makes in the workspace is never capped. A
    // course's sessions are the course's (COURSES), not counted here. The
    // booking page is told only that the business isn't taking bookings
    // online, and nothing is paid yet (a pay-now hold is made below).
    const bookedOnline = by.actorUserId === null;
    if (!course && bookedOnline) {
        await planMeter.roomInTx(tx, organizationId, "bookings", {
            refuse: bookingsPaused,
        });
    }
    // The free-cancel deadline, fixed now from today's rule (E8, DEC-051):
    // no later move changes it.
    const freeCancelUntil = freeCancelDeadline(
        startAt,
        await loadBookingRules(tx, organizationId),
    );

    // A signed-in customer booking a session they hold themselves, unpaid
    // (a pay-now they left, now at the desk or trying again): that hold is
    // let go here, so it neither fills the slot nor answers "already
    // booked" (K-2). Only this account's own PENDING hold; a confirmed
    // booking, or anyone else's, still stands.
    if (by.account) {
        await releaseOwnHoldInTx(
            tx,
            organizationId,
            by.account.accountId,
            serviceId,
            startAt,
        );
    }

    // Authoritative capacity gate — re-counted INSIDE the tx. A
    // one-to-one somebody takes is capacity per person (U3), checked
    // below; everything else counts the service's seats as before.
    // Counted over the slot widened by the buffers (DEC-052): starts can
    // now sit closer than a booking and its buffers, so the check carries
    // them, as the listing does.
    const clear = guarded({ startAt, endAt }, service);
    if (!(person?.perPerson && person.staffId)) {
        const confirmed = await tx.booking.count({
            where: {
                serviceId,
                ...holdsPlace(new Date()),
                startAt: { lt: clear.endAt },
                endAt: { gt: clear.startAt },
            },
        });
        // Seats an open course still holds count as taken (ADR-007) —
        // other courses' seats, for a course's own booking: its unsold
        // seats are the ones it is filling. So does a place held for
        // someone on the waitlist (A12), except for that person, who takes
        // it by booking it.
        const held = await seatsHeld(
            tx,
            serviceId,
            clear.startAt,
            clear.endAt,
            {
                exceptCourseId: course?.courseId,
                exceptContactId: by.account?.contactId ?? null,
            },
        );
        if (confirmed + held >= service.capacity) {
            throw new ConflictException("This slot is fully booked");
        }
    }
    if (person) {
        await assertPersonFreeInTx(
            tx,
            person,
            serviceId,
            startAt,
            endAt,
            undefined,
            guardMinutes(service),
        );
    }
    // The same person twice in one session (A9). Read in the same
    // serializable transaction, so two tabs racing both can't commit.
    if (
        by.account &&
        (await holdsSlotAlready(
            tx,
            organizationId,
            by.account,
            serviceId,
            startAt,
        ))
    ) {
        throw alreadyBooked();
    }

    const contact = by.account
        ? await accountContactInTx(tx, organizationId, by.account, input)
        : await tx.contact.upsert({
              where: {
                  organizationId_email: { organizationId, email },
              },
              update: contactUpdate(input),
              create: {
                  organizationId,
                  email,
                  firstName: splitName(input.bookerName).first ?? null,
                  lastName: splitName(input.bookerName).last ?? null,
                  phone: input.bookerPhone ?? null,
                  source: by.source,
              },
          });

    const booking = await tx.booking.create({
        data: {
            organizationId,
            serviceId,
            contactId: contact.id,
            startAt,
            endAt,
            timezone: service.timezone,
            // A pay-now booking holds its place until paid (U19).
            status: person?.holdUntil ? "PENDING" : "CONFIRMED",
            holdExpiresAt: person?.holdUntil ?? null,
            snapshot: snapshot as Prisma.InputJsonValue,
            bookerName: input.bookerName ?? null,
            bookerEmail: email,
            bookerPhone: input.bookerPhone ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            courseEnrollmentId: course?.enrollmentId ?? null,
            // Where it happens and what the booker told the team (E7).
            locationType: bookingLocation(
                service.locationType,
                input.locationType,
            ),
            intakeNote: intakeNoteOf(input.intakeNote),
            customerAccountId: by.account?.accountId ?? null,
            bookedOnline,
            freeCancelUntil,
            ...(person
                ? {
                      staffId: person.staffId,
                      paidWith: person.paidWith ?? null,
                      subscriptionId: person.subscriptionId ?? null,
                  }
                : {}),
            ...(person?.visit
                ? {
                      orderId: person.visit.orderId,
                      visitNumber: person.visit.visitNumber,
                  }
                : {}),
        },
    });

    // A place they were waiting for, or held for them, is taken (A12).
    await acceptWaitlistInTx(tx, {
        serviceId,
        startAt,
        contactId: contact.id,
        bookingId: booking.id,
        now: new Date(),
    });

    // Where the history starts. No `fromStartAt`: there was no before.
    // The actor is whoever made it by hand; a booker who did it
    // themselves leaves it empty.
    const booked = await tx.bookingEvent.create({
        data: {
            bookingId: booking.id,
            organizationId,
            type: BookingEventType.Booked,
            toStartAt: startAt,
            ...(by.actorUserId ? { actorUserId: by.actorUserId } : {}),
        },
        select: { id: true },
    });

    // A course session's booking is not notified one by one: one enrolment
    // books every session (ADR-007).
    if (course) return booking;
    // A pay-now hold is confirmed, and told, once it is paid
    // (`booking-hold.ts`).
    if (booking.status !== "CONFIRMED") return booking;

    // Transactional outbox: a committed booking always has its notice
    // queued. A14's `booking-notify.handler.ts` tells the customer.
    await tx.job.create({
        data: {
            organizationId,
            type: "booking.notify",
            payload: {
                bookingId: booking.id,
                serviceId,
                contactId: contact.id,
                reason: "booked",
                eventId: booked.id,
            },
        },
    });

    return booking;
}

/**
 * Let go of the account's own live, unpaid hold on this session, on the
 * reservation's transaction ({@link releaseHoldInTx}, which re-reads it
 * under its locks: a hold paid a moment ago stays, and is then "already
 * booked").
 */
async function releaseOwnHoldInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    accountId: string,
    serviceId: string,
    startAt: Date,
): Promise<void> {
    const now = new Date();
    const hold = await ownHoldOn(
        tx,
        organizationId,
        accountId,
        serviceId,
        startAt,
        now,
    );
    // Nothing frees: they are booking this very session again.
    if (hold) {
        await releaseHoldInTx(tx, hold, now, null, { freesPlace: false });
    }
}

/**
 * One person, one place at a time (U3): inside the booking transaction,
 * refuse when they already have a confirmed booking overlapping — on any
 * service. The person's row is locked first, so two bookings racing for
 * the same person queue on it and the second sees the first.
 *
 * For a class, the other places in the SAME session (same service, same
 * start) are not a clash — they are the class. `excludeBookingId` is a
 * booking being moved, which is not its own competitor. `padMinutes` is the
 * service's buffers either side (DEC-052): what the listing keeps clear too.
 */
export async function assertPersonFreeInTx(
    tx: Prisma.TransactionClient,
    person: ReserveWith,
    serviceId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string,
    padMinutes = 0,
): Promise<void> {
    if (!person.staffId) return;
    const pad = padMinutes * 60_000;
    await tx.$queryRaw`SELECT id FROM "StaffMember" WHERE id = ${person.staffId} FOR UPDATE`;
    const clashes = await tx.booking.count({
        where: {
            staffId: person.staffId,
            ...holdsPlace(new Date()),
            startAt: { lt: new Date(endAt.getTime() + pad) },
            endAt: { gt: new Date(startAt.getTime() - pad) },
            ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
            ...(person.perPerson ? {} : { NOT: { serviceId, startAt } }),
        },
    });
    if (clashes > 0) {
        throw new ConflictException({
            message: `${person.staffName ?? "That person"} is already booked then.`,
            field: "staffId",
        });
    }
}

/** The immutable snapshot of Service terms + booker frozen onto a Booking. */
export function buildSnapshot(
    service: Service,
    input: BookInput,
    startAt: Date,
    endAt: Date,
): Record<string, unknown> {
    return {
        service: {
            id: service.id,
            name: service.name,
            durationMinutes: service.durationMinutes,
            bufferBeforeMinutes: service.bufferBeforeMinutes,
            bufferAfterMinutes: service.bufferAfterMinutes,
            capacity: service.capacity,
            timezone: service.timezone,
            priceCents: service.priceCents,
            currency: service.currency,
            // Frozen like the rest: a link changed later reaches new
            // bookings, never the ones already made (ADR-007).
            locationType: service.locationType,
            meetingUrl: service.meetingUrl,
            depositMode: service.depositMode,
        },
        // What was asked for at booking when only the deposit is paid online
        // (E8): the rest is due at the visit. Absent for every other way.
        ...(input.pay === "DEPOSIT"
            ? {
                  deposit: {
                      cents: depositCents(
                          service.priceCents,
                          service.depositMode,
                      ),
                  },
              }
            : {}),
        slot: {
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
        },
        booker: {
            name: input.bookerName ?? null,
            email: input.bookerEmail.trim().toLowerCase(),
            phone: input.bookerPhone ?? null,
        },
    };
}

/**
 * The signed-in booker's own contact (A9). A name typed on the booking page
 * fills a contact that has none; a name the contact already has is kept,
 * and nothing else about it changes.
 *
 * The id comes from the session, read before this transaction, so it goes
 * through `resolveContact` (C9): a booking racing a merge lands on the
 * survivor, never on the tombstone.
 */
async function accountContactInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    who: SignedInBooker,
    input: BookInput,
): Promise<{ id: string }> {
    const resolved = await resolveContact(tx, who.contactId, organizationId);
    if (!resolved || resolved.removed) {
        throw new NotFoundException("Sign in to continue.");
    }
    const contact = await tx.contact.findFirst({
        where: { id: resolved.id, organizationId },
        select: { id: true, firstName: true, lastName: true, phone: true },
    });
    if (!contact) throw new NotFoundException("Sign in to continue.");
    const { first, last } = splitName(input.bookerName);
    const data: Prisma.ContactUpdateInput = {};
    if (!contact.firstName?.trim() && !contact.lastName?.trim() && first) {
        data.firstName = first;
        data.lastName = last ?? null;
    }
    // A phone they gave on the booking page fills a record that has none
    // (UX-049); one the business already has is never replaced from here.
    const phone = phoneToFill(input.bookerPhone, contact.phone);
    if (phone) data.phone = phone;
    if (Object.keys(data).length > 0) {
        await tx.contact.update({
            where: { id: contact.id },
            data,
            select: { id: true },
        });
    }
    return { id: contact.id };
}

/** Contact fields to update on a repeat booking (only supplied values). */
export function contactUpdate(input: BookInput): Prisma.ContactUpdateInput {
    const update: Prisma.ContactUpdateInput = {};
    const { first, last } = splitName(input.bookerName);
    if (first !== undefined) update.firstName = first;
    if (last !== undefined) update.lastName = last;
    if (input.bookerPhone !== undefined) update.phone = input.bookerPhone;
    return update;
}

/** Split a single "full name" into first / last parts. */
export function splitName(full: string | undefined): {
    first?: string;
    last?: string;
} {
    if (!full) return {};
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return {};
    if (parts.length === 1) return { first: parts[0] };
    return { first: parts[0], last: parts.slice(1).join(" ") };
}
