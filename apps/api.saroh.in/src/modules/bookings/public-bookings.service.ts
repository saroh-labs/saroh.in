import {
    BadRequestException,
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Booking, Service } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import { ActivationEvents } from "../analytics/activation-events";
import { hashPayToken } from "../invoices/pay-token";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import { isValidSlotStart } from "./availability";
import type { HoldState } from "./booking-hold";
import {
    createHoldInvoiceInTx,
    holdExpiry,
    holdState,
    releaseHoldInTx,
    renewHoldTokenInTx,
} from "./booking-hold";
import {
    bookingWindowRefusal,
    loadBookingRules,
    withinBookingWindow,
} from "./booking-rules";
import type { AvailableSlot } from "./booking-slots";
import {
    loadStaffing,
    openSlots,
    parseRange,
    resolvePerson,
    toAvailabilityService,
} from "./booking-slots";
import type {
    PublicBooking,
    PublicBookingPage,
    PublicDays,
    PublicService,
} from "./public-booking-page";
import {
    publicBookingPage,
    publicDays,
    publicServices,
    takesOnlinePayment,
    toPublicBooking,
} from "./public-booking-page";
import { FixedWindowRateLimiter } from "./rate-limiter";
import type { BookInput, ReserveWith } from "./reservation";
import { bookingByKey, loadBookableService, reserve } from "./reservation";
import { serviceStaff } from "./staff-availability";

/** Who takes a service, as the booking page may show them: a name and an id. */
export interface PublicStaff {
    id: string;
    name: string;
}

/** A pay-now hold, as the booking page polls it (U19). */
export interface PublicHold {
    state: HoldState;
    holdExpiresAt: string | null;
    booking: PublicBooking;
}

/**
 * The customer's side of bookings (#508): the booking page and the
 * website's services list — no session, so everything is UNAUTHENTICATED and
 * org-agnostic. The owning organization is derived from the target Service,
 * so an anonymous booker can only ever create rows in the org that owns it;
 * the central guarantee, "only one confirmed booking can own a
 * capacity-one slot", is the serializable re-count in {@link book}.
 */
@Injectable()
export class PublicBookingsService {
    /**
     * @param rateLimiter per-instance limiter (default 5 hits / minute per
     * `${serviceId}:${ipHash}`). Injectable for tests.
     */
    constructor(
        // Not a DI provider — a per-instance default; @Optional() stops Nest
        // trying to inject it so the default (and test overrides) apply.
        @Optional()
        private readonly rateLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(),
        @Optional() private readonly activation?: ActivationEvents,
    ) {}

    /**
     * Reads and releases of a pay-now hold (#508). The page polls every four
     * seconds while its booker pays — 15 a minute — so one hold gets 40.
     * Counted per hashed IP AND token, so one payer cannot use up a limit
     * the other customers on the same network share.
     */
    private readonly holdLimiter = new FixedWindowRateLimiter(40, 60_000);

    /**
     * And a ceiling per hashed IP, whatever the token: room for ten people
     * paying at once from one network (a gym's wifi), not for a scraper. It
     * is checked first — the token is the caller's to make up, so only this
     * bounds a run of invented tokens, and the keys it leaves behind.
     */
    private readonly holdIpCeiling = new FixedWindowRateLimiter(150, 60_000);

    /**
     * PUBLIC availability for a bookable service — no auth, org-agnostic. Loads
     * the ACTIVE service of an organization with Appointments on (404/410
     * otherwise) and returns open slots for the range. The org is never
     * surfaced.
     *
     * The business's booking rules apply here (U3): nothing sooner than the
     * latest-booking rule or further ahead than book-ahead is offered. People
     * appear only as opaque ids — never when or why someone is off.
     */
    async publicAvailability(
        serviceId: string,
        fromISO: string,
        toISO: string,
        staffId?: string,
        now: Date = new Date(),
    ): Promise<AvailableSlot[]> {
        const { service, rules } = await loadBookableService(serviceId);
        const { from, to } = parseRange(fromISO, toISO);
        const [slots, bookingRules] = await Promise.all([
            openSlots(service, rules, from, to, staffId),
            loadBookingRules(prisma, service.organizationId),
        ]);
        return slots.filter((slot) =>
            withinBookingWindow(slot.startAt, now, bookingRules),
        );
    }

    /**
     * Who takes a public service, for the booking page's "with whom" step
     * (U3): a display name and an opaque id per person, nothing else.
     */
    async publicServiceStaff(serviceId: string): Promise<PublicStaff[]> {
        await loadBookableService(serviceId);
        const people = await serviceStaff(prisma, serviceId);
        return people.map(({ id, name }) => ({ id, name }));
    }

    /** The booking page's next two weeks for one service — see {@link publicDays}. */
    publicDays(serviceId: string, now: Date = new Date()): Promise<PublicDays> {
        return publicDays(serviceId, now);
    }

    /** What a site's booking page opens with — see {@link publicBookingPage}. */
    publicBookingPage(siteId: string): Promise<PublicBookingPage> {
        return publicBookingPage(siteId);
    }

    /** The website's services list (#255) — see {@link publicServices}. */
    publicServices(ids: string[]): Promise<PublicService[]> {
        return publicServices(ids);
    }

    /**
     * A pay-now hold, by its pay token (U19): what the booking page polls
     * while the customer pays. The booking as the booker sees it, and where
     * the hold stands. An unknown or cleared token is a 404.
     */
    async publicHold(
        token: string,
        ipHash: string | undefined,
        now: Date = new Date(),
    ): Promise<PublicHold> {
        this.takeHoldHit(token, ipHash, now);
        const booking = await this.holdBooking(token);
        return {
            state: holdState(booking, now),
            holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
            booking: toPublicBooking(booking),
        };
    }

    /**
     * Let a hold go before its time (U19): the customer chose to pay at the
     * desk instead, or the payment could not start. Only a hold still
     * PENDING is released; anything else is answered as it stands.
     */
    async releasePublicHold(
        token: string,
        ipHash: string | undefined,
        now: Date = new Date(),
    ): Promise<PublicHold> {
        this.takeHoldHit(token, ipHash, now);
        const found = await this.holdBooking(token);
        await prisma.$transaction((tx) => releaseHoldInTx(tx, found.id, now));
        const booking = await prisma.booking.findUniqueOrThrow({
            where: { id: found.id },
        });
        return {
            state: holdState(booking, now),
            holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
            booking: toPublicBooking(booking),
        };
    }

    /** One read or release of a hold against its limits; 429 past them. */
    private takeHoldHit(
        token: string,
        ipHash: string | undefined,
        now: Date,
    ): void {
        if (!ipHash) return;
        const at = now.getTime();
        // The ceiling first and on its own: a refusal there never adds a
        // per-token key.
        const allowed =
            this.holdIpCeiling.take(ipHash, at) &&
            this.holdLimiter.take(`${ipHash}:${hashPayToken(token)}`, at);
        if (!allowed) {
            throw new HttpException(
                "Too many requests. Try again shortly.",
                429,
            );
        }
    }

    private async holdBooking(token: string): Promise<Booking> {
        const invoice = await prisma.invoice.findUnique({
            where: { payTokenHash: hashPayToken(token) },
            select: { source: true, booking: true },
        });
        if (invoice?.source !== "BOOKING" || !invoice.booking) {
            throw new NotFoundException("Booking not found");
        }
        return invoice.booking;
    }

    /**
     * Reserve a slot on a public Service. Steps (in order):
     *  1. Load the Service (+ rules); 404 if missing/soft-deleted, 410 if not ACTIVE.
     *     The org is taken from `service.organizationId`, NEVER from the client.
     *  2. Validate `startAt` is a real, geometrically-valid open slot (aligned to
     *     a rule window + duration stepping) — 400 otherwise.
     *  3. Idempotency: an existing booking for `(serviceId, idempotencyKey)` is replayed.
     *  4. Rate-limit by `${serviceId}:${ipHash}`; 429 on exceed.
     *  5. In ONE Serializable transaction: RE-COUNT confirmed overlaps and abort
     *     (409) if `>= capacity`, else upsert the Contact, create the CONFIRMED
     *     Booking (immutable snapshot), and enqueue the `booking.notify` Job.
     *
     * WHY the serializable in-tx re-count guarantees "only one confirmed booking
     * can own a capacity-one slot":
     *  - The step-4 pre-check is best-effort — two requests can both read
     *    count = 0 before either writes, so it CANNOT be the guarantee.
     *  - Inside a `Serializable` transaction, the `booking.count(...)` predicate
     *    read is tracked by Postgres' SSI. If two concurrent transactions both
     *    read "0 confirmed overlaps" and both INSERT a CONFIRMED booking into the
     *    same slot, their read/write sets form a dangerous dependency cycle;
     *    Postgres detects it at commit and aborts one with a serialization
     *    failure (surfaced by Prisma as P2034). So at most ONE commits — the
     *    other is rolled back and mapped to 409. The re-count also directly
     *    returns 409 when a conflicting booking is already committed and visible.
     *    Buffers are part of the slot geometry, so overlap uses the [start,end]
     *    interval — a capacity-1 slot admits exactly one CONFIRMED booking.
     */
    async book(
        serviceId: string,
        input: BookInput,
        ipHash: string | undefined,
    ): Promise<Booking> {
        return (await this.bookOnline(serviceId, input, ipHash)).booking;
    }

    /**
     * {@link book}, and what the booking page needs back from it (U19): for
     * pay now, the hold's pay token — handed over once, as a pay link is.
     *
     * Pay now needs a price, Payments on and a connected provider; the amount
     * is the service's price, read here, never the client's. The booking is
     * PENDING and holds its place for 15 minutes (`HOLD_MINUTES`) with a draft
     * invoice for it (`booking-hold.ts`); the provider's webhook confirms it.
     * Pay at the desk books it CONFIRMED with nothing charged.
     */
    async bookOnline(
        serviceId: string,
        input: BookInput,
        ipHash: string | undefined,
        now: Date = new Date(),
    ): Promise<{ booking: Booking; payToken: string | null }> {
        // 1. Load the Service. Org is derived from HERE, never the client.
        const { service, rules } = await loadBookableService(serviceId);
        await assertOrganizationOpen(service.organizationId);

        // 2. Validate the requested instant is a real, aligned slot start —
        //    with a person when somebody takes the service (U3) — and
        //    inside the business's booking rules.
        const startAt = new Date(input.startAt);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        const availService = toAvailabilityService(service);
        const staffing = await loadStaffing(service);
        if (
            !staffing.perPerson &&
            !isValidSlotStart(availService, rules, startAt)
        ) {
            throw new BadRequestException(
                "startAt is not a bookable slot for this service",
            );
        }
        const refusal = bookingWindowRefusal(
            startAt,
            now,
            await loadBookingRules(prisma, service.organizationId),
        );
        if (refusal) throw new BadRequestException(refusal);
        const endAt = new Date(
            startAt.getTime() + service.durationMinutes * 60_000,
        );
        // Pay now is refused before anything is held: no price, or no way
        // for this business to take the money online.
        const price =
            input.pay === "NOW" ? await this.onlinePrice(service) : null;

        // 3. Rate-limit per (service, hashed IP). Cheap abuse guard. Before
        //    the replay too, so replays cannot be used to probe for keys.
        if (ipHash) {
            const allowed = this.rateLimiter.take(`${serviceId}:${ipHash}`);
            if (!allowed) {
                throw new HttpException(
                    "Too many booking attempts — please slow down and try again shortly",
                    429,
                );
            }
        }

        // 4. Idempotency pre-check — replay an existing booking unchanged, but
        //    only to the same booker: a key alone does not hand over someone
        //    else's booking (or its meeting link).
        const existing = await bookingByKey(serviceId, input);
        if (existing) return this.replay(existing, input, now);

        // 5. Who it is with (U3) — after the replay, so a retried request is
        //    not refused by the person its own first attempt booked.
        //    A double submit can lose here too, once its twin has committed:
        //    the person is busy with the very booking this key made.
        let person: ReserveWith;
        try {
            person = await resolvePerson(
                service,
                rules,
                staffing,
                startAt,
                input.staffId,
                "public",
            );
        } catch (err) {
            const twin = await bookingByKey(serviceId, input);
            if (twin) return this.replay(twin, input, now);
            throw err;
        }
        if (input.pay === "DESK") person.paidWith = "DESK";

        // 6. Atomic, serializable reservation (see the method doc for WHY) —
        //    with the hold's invoice in the same transaction for pay now.
        // Written inside the transaction; a holder, since a closure's write
        // is invisible to the narrowing that follows.
        // Which booking this call wrote, so an idempotency race that hands
        // back the winner's is told apart — and a token made in a
        // transaction that was then rolled back is never handed out.
        const made: { bookingId: string | null; payToken: string | null } = {
            bookingId: null,
            payToken: null,
        };
        const also = {
            onRace: "This slot is fully booked",
            inTx: async (tx: Prisma.TransactionClient, booking: Booking) => {
                made.bookingId = booking.id;
                if (!price || !booking.contactId) return;
                const hold = await createHoldInvoiceInTx(tx, {
                    organizationId: service.organizationId,
                    bookingId: booking.id,
                    contactId: booking.contactId,
                    billToName: booking.bookerName,
                    billToEmail: booking.bookerEmail ?? "",
                    service: {
                        name: service.name,
                        priceCents: price.cents,
                        currency: price.currency,
                        timezone: service.timezone,
                        gstRate: service.gstRate,
                        sacCode: service.sacCode,
                    },
                    startAt,
                });
                made.payToken = hold.payToken;
            },
        };
        if (price) person.holdUntil = holdExpiry(now);
        const booking = await reserve(
            this.activation,
            service,
            startAt,
            endAt,
            input,
            { source: `booking:service:${serviceId}`, actorUserId: null },
            also,
            person,
        );
        // An idempotency race replays the winner, which made its own token.
        if (made.bookingId !== booking.id) {
            return this.replay(booking, input, now);
        }
        return { booking, payToken: made.payToken };
    }

    /**
     * An idempotent replay, to the same booker only. A hold still inside its
     * time gets a fresh pay token (only the first one's hash was kept).
     */
    private async replay(
        existing: Booking,
        input: BookInput,
        now: Date = new Date(),
    ): Promise<{ booking: Booking; payToken: string | null }> {
        if (
            (existing.bookerEmail ?? "").toLowerCase() !==
            input.bookerEmail.trim().toLowerCase()
        ) {
            throw new ConflictException(
                "That booking was already made. Refresh the page and book again.",
            );
        }
        if (holdState(existing, now) !== "HELD") {
            return { booking: existing, payToken: null };
        }
        const payToken = await prisma.$transaction((tx) =>
            renewHoldTokenInTx(tx, existing.id),
        );
        return { booking: existing, payToken };
    }

    /**
     * What pay now charges for a service: its price, when it has one and the
     * business can take money online (Payments on, a provider connected).
     */
    private async onlinePrice(
        service: Service,
    ): Promise<{ cents: number; currency: string }> {
        if (
            !service.priceCents ||
            service.priceCents <= 0 ||
            !service.currency
        ) {
            throw new BadRequestException({
                message:
                    "This has no price to pay online. Book it to pay at the desk.",
                field: "pay",
            });
        }
        if (!(await takesOnlinePayment(service.organizationId))) {
            throw new ConflictException({
                message:
                    "This business isn't taking payment online right now. Book it to pay at the desk.",
                field: "pay",
            });
        }
        return { cents: service.priceCents, currency: service.currency };
    }
}
