import {
    BadRequestException,
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
import { isReservedContactEmail } from "../contacts/contact-email";
import { phoneToFill } from "../customer-workspace/contact-phone-fill";
import { resolveContact } from "../customer-workspace/resolve-contact";
import type { PriceTerms } from "../invoices/gst-price";
import { NO_GST_TERMS } from "../invoices/gst-price";
import { loadPriceTerms } from "../invoices/price-terms";
import { publicSiteOnlineFor } from "../organizations/organization-lifecycle.gate";
import { appointmentsOpen } from "./appointments-open";
import type { AvailabilityRuleWindow } from "./availability";
import { guarded, guardMinutes } from "./availability";
import { BookingEventType } from "./booking-event-type";
import { holdsPlace, releaseHoldInTx } from "./booking-hold";
import { bookingLocation, intakeNoteOf } from "./booking-intake";
import { freeCancelDeadline } from "./booking-rules";
import type { AccountBookPay, BookingLocationType, PaidWith } from "./dto";
import { seatsHeld } from "./held-seats";
import { loadRulesFor } from "./person-rules";
import { phoneContactInTx, PhoneSeenLate } from "./phone-booker";
import { depositCents } from "./service-fields";
import { bookedPriceOf, serviceCharge } from "./service-price";
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
    /**
     * Who books, by email: the contact with it, or someone new. Absent only
     * for a booking made by hand for someone known by their phone alone
     * (DEC-170), when `phoneKey` says how to find them.
     */
    bookerEmail?: string;
    bookerPhone?: string;
    /**
     * A booking made by hand with a name and phone and no email (DEC-170):
     * the phone as matched (`normalisePhone`). The contact with it is
     * booked, else one is made kept by it (`phone-booker.ts`).
     */
    phoneKey?: string;
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
    /**
     * The tag the booking page's address carried when a QR code's scan
     * opened it (`qr-<code>`), as the page sent it. Only ever read by
     * `qrSourceFor`, which turns it into {@link ReserveBy.sourceCode} or
     * nothing; never stored as it is.
     */
    sourceTag?: string;
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
    /**
     * The QR code whose scan opened the page it was booked from
     * (`Booking.sourceCode`), already resolved on the customer's own site
     * (`sites/qr-source.ts`). Absent for every booking the team makes.
     */
    sourceCode?: string | null;
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
 * Runs `load` at most once per key for the life of one read; the plain
 * {@link readNow} runs it every time. Keys name their business.
 */
export type OnceRead = <T>(key: string, load: () => Promise<T>) => Promise<T>;

/** No sharing: every check reads the database. */
export const readNow: OnceRead = (_key, load) => load();

/** A {@link OnceRead} for one read across several services (review #4). */
export function onceReads(): OnceRead {
    const memo = new Map<string, Promise<unknown>>();
    return <T>(key: string, load: () => Promise<T>): Promise<T> => {
        let kept = memo.get(key) as Promise<T> | undefined;
        if (!kept) {
            kept = load();
            memo.set(key, kept);
        }
        return kept;
    };
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
    {
        bookingPage = false,
        once = readNow,
    }: {
        bookingPage?: boolean;
        /**
         * Shares the business-wide checks across several services read
         * together (On today, the Timetable: review #4). Keyed by business.
         */
        once?: OnceRead;
    } = {},
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
    // A deleted business's booking page is offline with its site (#921).
    const org = service.organizationId;
    if (
        bookingPage &&
        !(await once(`${org}:site-online`, () => publicSiteOnlineFor(org)))
    ) {
        throw new NotFoundException("Service not found");
    }
    if (!(await once(`${org}:appointments`, () => appointmentsOpen(org)))) {
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
 * Whether `err` is the loser of a race for a slot: Postgres stopped this
 * transaction because another one took it. The winner may still be
 * committing when the loser hears of it, so a read made at once can miss
 * the booking that beat it.
 */
export function lostRace(err: unknown): boolean {
    return err instanceof RaceLost;
}

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
        /**
         * How many tries in all against lost races, a short random wait
         * apart ({@link RACE_RETRY_WAIT_MS}); more than `retryOnce`'s two.
         * The booking page's (review #33): many visitors booking at once
         * each lose to another's serializable write, of any time, until
         * one try sees the true count.
         */
        tries?: number;
        /**
         * What to say when every try lost a race: nobody has been told the
         * time is full, since none of the tries saw it full.
         */
        busy?: string;
    },
    person?: ReserveWith,
): Promise<Booking> {
    const tries = Math.max(1, also?.tries ?? (also?.retryOnce ? 2 : 1));
    for (let attempt = 1; ; attempt += 1) {
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
            if (!(err instanceof RaceLost) || tries === 1) throw err;
            if (attempt >= tries) {
                throw also?.busy ? new RaceLost(also.busy) : err;
            }
            await sleep(raceRetryWait());
        }
    }
}

/** Between tries after a lost race: 20 to 80 ms, so racers spread out. */
export const RACE_RETRY_WAIT_MS = { min: 20, max: 80 } as const;

function raceRetryWait(): number {
    const { min, max } = RACE_RETRY_WAIT_MS;
    return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        // A phone's contact made under us by a walk-in order counts the
        // same: the retry books that contact (phone-booker.ts).
        if (code === "P2034" || err instanceof PhoneSeenLate) {
            throw new RaceLost(also?.onRace ?? "That time is fully booked.");
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
    const email = input.bookerEmail?.trim().toLowerCase() ?? "";
    if (!email && !input.phoneKey && !by.account) {
        throw new BadRequestException({
            message: "Give an email or a phone number.",
            field: "bookerEmail",
        });
    }
    // The price is fixed here, as the business charges it today
    // (`service-price.ts`): the amount to pay, the typed price and the
    // mode, read in the booking's own transaction.
    const snapshot = buildSnapshot(
        service,
        input,
        startAt,
        endAt,
        await loadPriceTerms(tx, organizationId),
    );
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
    // A one-to-one keeps its person's own rule, else the business's
    // (DEC-170, #1038); a class, the business's.
    const freeCancelUntil = freeCancelDeadline(
        startAt,
        await loadRulesFor(
            tx,
            organizationId,
            person?.perPerson ? person.staffId : null,
        ),
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
            throw new ConflictException("That time is fully booked.");
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
        : !email && input.phoneKey
          ? await phoneContactInTx(
                tx,
                organizationId,
                {
                    name: input.bookerName,
                    phone: input.bookerPhone,
                    key: input.phoneKey,
                },
                by.source,
            )
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
            // A placeholder (someone known by their phone, DEC-049) is no
            // email: the booking says none.
            bookerEmail: bookerEmailOf(email),
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
            sourceCode: by.sourceCode ?? null,
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
 * A one-to-one also keeps the person's gap between bookings clear (DEC-170,
 * #1038), read under the lock so a gap set meanwhile is kept.
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
    const locked = await tx.$queryRaw<
        { organizationId: string; gapMinutes: number | null }[]
    >`SELECT "organizationId", "gapMinutes" FROM "StaffMember" WHERE id = ${person.staffId} FOR UPDATE`;
    const gap = person.perPerson
        ? await personGapInTx(tx, Array.isArray(locked) ? locked[0] : undefined)
        : { minutes: 0 };
    const pad = (padMinutes + gap.minutes) * 60_000;
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
        const who = person.staffName ?? "That person";
        throw new ConflictException({
            message:
                gap.minutes > 0
                    ? `${who} is already booked then, or needs ${gap.minutes} min between bookings.`
                    : `${who} is already booked then.`,
            field: "staffId",
        });
    }
}

/** A person's gap between bookings: their own, else the business's. */
async function personGapInTx(
    tx: Prisma.TransactionClient,
    person: { organizationId: string; gapMinutes: number | null } | undefined,
): Promise<{ minutes: number }> {
    if (!person) return { minutes: 0 };
    if (person.gapMinutes !== null) return { minutes: person.gapMinutes };
    const business = await tx.bookingRules.findUnique({
        where: { organizationId: person.organizationId },
        select: { gapMinutes: true },
    });
    return { minutes: business?.gapMinutes ?? 0 };
}

/**
 * The immutable snapshot of Service terms + booker frozen onto a Booking.
 * `priceCents` is the amount to pay for it: the typed price, or under "GST
 * is added" the typed price plus its GST (`service-price.ts`), with what
 * was typed and the mode kept beside it. Without `terms` the business
 * charges no GST and the price is the typed one.
 */
export function buildSnapshot(
    service: Service,
    input: BookInput,
    startAt: Date,
    endAt: Date,
    terms: PriceTerms = NO_GST_TERMS,
): Record<string, unknown> {
    const price = bookedPriceOf(serviceCharge(service, terms));
    return {
        service: {
            id: service.id,
            name: service.name,
            durationMinutes: service.durationMinutes,
            bufferBeforeMinutes: service.bufferBeforeMinutes,
            bufferAfterMinutes: service.bufferAfterMinutes,
            capacity: service.capacity,
            timezone: service.timezone,
            priceCents: price.priceCents,
            // Only when GST is charged on it: what was typed, and whether
            // the price included GST or had it added.
            ...(price.gstPriceMode
                ? {
                      listPriceCents: price.listPriceCents,
                      gstPriceMode: price.gstPriceMode,
                  }
                : {}),
            currency: service.currency,
            // Frozen like the rest: a link changed later reaches new
            // bookings, never the ones already made (ADR-007).
            locationType: service.locationType,
            meetingUrl: service.meetingUrl,
            depositMode: service.depositMode,
        },
        // What was asked for at booking when only the deposit is paid online
        // (E8): the rest is due at the visit. Absent for every other way.
        // A share of the amount to pay, GST and all.
        ...(input.pay === "DEPOSIT"
            ? {
                  deposit: {
                      cents: depositCents(
                          price.priceCents,
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
            email: bookerEmailOf(input.bookerEmail),
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

/**
 * The email a booking keeps of its booker: none for none, or for a reserved
 * placeholder (a contact known by their phone alone, DEC-049), which every
 * reader treats as no email.
 */
export function bookerEmailOf(email: string | undefined): string | null {
    const value = email?.trim().toLowerCase();
    if (!value || isReservedContactEmail(value)) return null;
    return value;
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
