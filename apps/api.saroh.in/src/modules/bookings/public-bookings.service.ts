import {
    BadRequestException,
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
    UnauthorizedException,
} from "@nestjs/common";
import type { Booking, Service } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import { ActivationEvents } from "../analytics/activation-events";
import { suggestFromBookingNoteInTx } from "../customer-workspace/attention-suggest";
import { hashPayToken } from "../invoices/pay-token";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import { isValidSlotStart } from "./availability";
import type { PublicCredit } from "./booking-credit";
import {
    creditChoiceOf,
    offeredCredit,
    spendCreditInTx,
} from "./booking-credit";
import type { HoldState } from "./booking-hold";
import {
    createHoldInvoiceInTx,
    holdExpiry,
    holdState,
    releaseHoldInTx,
    renewHoldTokenInTx,
} from "./booking-hold";
import { bookingLocation, intakeNoteOf } from "./booking-intake";
import { paidADeposit } from "./booking-money";
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
    refuseIfClosed,
    resolvePerson,
    toAvailabilityService,
} from "./booking-slots";
import { asBookedOnPlan } from "./deposit-plan";
import type { BookPay } from "./dto";
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
import type { BookInput, CreditChoice, ReserveWith } from "./reservation";
import {
    alreadyBooked,
    bookingByKey,
    holdsSlotAlready,
    loadBookableService,
    ownHoldOn,
    reserve,
} from "./reservation";
import { depositCents } from "./service-fields";
import { serviceStaff } from "./staff-availability";
import {
    isTreatment,
    requireTreatmentStorefront,
    startTreatmentInTx,
    treatmentEmail,
} from "./visits";

/**
 * A customer signed in on the business's site (A9): who `CustomerSessionGuard`
 * says they are. The booking goes on their account's contact.
 */
export interface SignedInCustomer {
    organizationId: string;
    accountId: string;
    contactId: string;
}

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
        const { service, rules } = await loadBookableService(serviceId, {
            bookingPage: true,
        });
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
        await loadBookableService(serviceId, {
            bookingPage: true,
        });
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
        given: BookInput,
        ipHash: string | undefined,
        now: Date = new Date(),
        signedIn?: SignedInCustomer,
    ): Promise<{ booking: Booking; payToken: string | null }> {
        // 1. Load the Service. Org is derived from HERE, never the client.
        const loaded = await loadBookableService(serviceId, {
            bookingPage: true,
        });
        const { rules } = loaded;
        // A stored deposit the plan can't take online books as no deposit
        // (pay at the desk) — the row keeps it for an upgrade
        // (`deposit-plan.ts`): what a business set up never goes unbookable.
        const service = await asBookedOnPlan(loaded.service);
        // A signed-in customer books only their own business's services:
        // another business's service is as good as missing (A9).
        if (signedIn && service.organizationId !== signedIn.organizationId) {
            throw new NotFoundException("Service not found");
        }
        await assertOrganizationOpen(service.organizationId);
        // The booker is the account's, never the page's (A9): its verified
        // email, and its contact's name and phone. A name typed on the page
        // is used only when the contact has none yet.
        const asked = signedIn
            ? await this.signedInBooker(signedIn, given)
            : given;
        // How they pay, as the service allows it (E8): a deposit service is
        // paid online, in part or in full; any other never takes a deposit.
        // A credit (A10) pays the class whatever its price or deposit, and
        // only for someone signed in: it is their own pack or membership.
        const askedPay = asked.pay;
        const credit =
            askedPay === "CREDIT" ? creditOf(asked, service, signedIn) : null;
        const input: BookInput = {
            ...asked,
            pay:
                askedPay === "CREDIT"
                    ? askedPay
                    : payAtBooking(service, askedPay),
        };
        // A treatment is sold as one order (E9, DEC-050): with nowhere to
        // sell it, or no email to bill, it is refused before anything is
        // held.
        const treatmentStore = isTreatment(service)
            ? await requireTreatmentStorefront(service)
            : null;
        if (treatmentStore) treatmentEmail(input.bookerEmail);
        // Where and the note are checked before anything is held (E7): an
        // answer to Where the service can't give, or a note past its length.
        const place = bookingLocation(service.locationType, input.locationType);
        intakeNoteOf(input.intakeNote);

        // 2. Validate the requested instant is a real, aligned slot start —
        //    with a person when somebody takes the service (U3) — and
        //    inside the business's booking rules.
        const startAt = new Date(input.startAt);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        await refuseIfClosed(
            service.organizationId,
            startAt,
            new Date(startAt.getTime() + service.durationMinutes * 60_000),
        );
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
        // for this business to take the money online. A deposit is its
        // share of the price, worked out here — never the client's (E8).
        const price =
            input.pay === "NOW" || input.pay === "DEPOSIT"
                ? await this.onlinePrice(service, input.pay)
                : null;

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
        if (existing) return this.replay(existing, input, place, now);

        // The same person, the same session (A9): said before anything is
        // held. The reservation checks it again under its lock.
        const account = signedIn
            ? { accountId: signedIn.accountId, contactId: signedIn.contactId }
            : undefined;
        if (
            account &&
            (await holdsSlotAlready(
                prisma,
                service.organizationId,
                account,
                serviceId,
                startAt,
                now,
            ))
        ) {
            throw alreadyBooked();
        }
        // Their own unpaid hold on it is let go by this booking (K-2), so
        // its person isn't busy with it.
        const ownHold = account
            ? await ownHoldOn(
                  prisma,
                  service.organizationId,
                  account.accountId,
                  serviceId,
                  startAt,
                  now,
              )
            : null;

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
                ownHold ?? undefined,
            );
        } catch (err) {
            const twin = await bookingByKey(serviceId, input);
            if (twin) return this.replay(twin, input, place, now);
            throw err;
        }
        if (input.pay === "DESK") person.paidWith = "DESK";
        // Paid with a credit (A10): said on the booking as the desk says it.
        if (credit) {
            person.paidWith = credit.kind === "PACK" ? "PACK" : "MEMBERSHIP";
            person.subscriptionId =
                credit.kind === "MEMBERSHIP" ? credit.subscriptionId : null;
        }

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
            // With a credit, the race lost may have been the pack's (or the
            // month's) last class; tried again, the answer says which. A
            // treatment's may have been another order taking the business's
            // next order number (P3): tried again, it books.
            onRace: credit
                ? "That changed while you were booking. Try again."
                : "This slot is fully booked",
            retryOnce: credit !== null || treatmentStore !== null,
            inTx: async (tx: Prisma.TransactionClient, booking: Booking) => {
                made.bookingId = booking.id;
                // A note on a booking confirmed now waits on the customer's
                // record for staff (C12). A pay-now hold's waits for the
                // payment (`confirmHoldInTx`).
                await suggestFromBookingNoteInTx(tx, booking);
                if (credit) {
                    // The contact the booking resolved to (C9): a credit is
                    // only ever spent by the person who holds it.
                    await spendCreditInTx(tx, {
                        organizationId: service.organizationId,
                        bookingId: booking.id,
                        contactId: booking.contactId ?? "",
                        serviceId: service.id,
                        startAt,
                        credit,
                    });
                    return;
                }
                // The treatment's order, with this booking its visit 1.
                const sold = treatmentStore
                    ? await startTreatmentInTx(tx, {
                          service,
                          booking,
                          storeId: treatmentStore.id,
                      })
                    : null;
                if (!price || !booking.contactId) return;
                const hold = await createHoldInvoiceInTx(tx, {
                    organizationId: service.organizationId,
                    bookingId: booking.id,
                    contactId: booking.contactId,
                    billToName: booking.bookerName,
                    billToEmail: booking.bookerEmail ?? "",
                    service: {
                        name:
                            input.pay === "DEPOSIT"
                                ? `Deposit for ${service.name}`
                                : service.name,
                        priceCents: price.cents,
                        currency: price.currency,
                        timezone: service.timezone,
                        gstRate: service.gstRate,
                        sacCode: service.sacCode,
                    },
                    startAt,
                    // A treatment's pay-now invoice is its order's (E9).
                    ...(sold
                        ? {
                              order: {
                                  orderId: sold.orderId,
                                  orderItemId: sold.orderItemId,
                              },
                          }
                        : {}),
                });
                made.payToken = hold.payToken;
            },
        };
        if (price) person.holdUntil = holdExpiry(now);
        let booking: Booking;
        try {
            booking = await reserve(
                this.activation,
                service,
                startAt,
                endAt,
                input,
                {
                    source: `booking:service:${serviceId}`,
                    actorUserId: null,
                    account,
                },
                also,
                person,
            );
        } catch (err) {
            // Two tabs of one customer racing for one slot: the loser's
            // conflict is theirs already, not the slot being full.
            if (
                account &&
                err instanceof ConflictException &&
                (await holdsSlotAlready(
                    prisma,
                    service.organizationId,
                    account,
                    serviceId,
                    startAt,
                ))
            ) {
                throw alreadyBooked();
            }
            throw err;
        }
        // An idempotency race replays the winner, which made its own token.
        if (made.bookingId !== booking.id) {
            return this.replay(booking, input, place, now);
        }
        // A treatment's visit 1 names its order, written after the booking.
        if (treatmentStore) {
            booking = await prisma.booking.findUniqueOrThrow({
                where: { id: booking.id },
            });
        }
        return { booking, payToken: made.payToken };
    }

    /**
     * The credit a signed-in customer could pay a class with (A10): the
     * pay step asks once a time is chosen, and books with what it is given.
     * Another business's service is as good as missing; nothing is held.
     */
    async creditFor(
        signedIn: SignedInCustomer,
        serviceId: string,
        startAtISO: string,
    ): Promise<{ credit: PublicCredit | null }> {
        const { service } = await loadBookableService(serviceId, {
            bookingPage: true,
        });
        if (service.organizationId !== signedIn.organizationId) {
            throw new NotFoundException("Service not found");
        }
        const startAt = new Date(startAtISO);
        if (Number.isNaN(startAt.getTime())) {
            throw new BadRequestException("startAt is not a valid instant");
        }
        return {
            credit: await offeredCredit(prisma, {
                organizationId: service.organizationId,
                contactId: signedIn.contactId,
                service,
                startAt,
            }),
        };
    }

    /**
     * The booking request as the signed-in customer's account makes it
     * (A9): the account's verified email, and its contact's name and phone.
     * Read in the business's RLS context the customer route runs in.
     */
    private async signedInBooker(
        customer: SignedInCustomer,
        given: BookInput,
    ): Promise<BookInput> {
        const account = await prisma.customerAccount.findFirst({
            where: {
                id: customer.accountId,
                organizationId: customer.organizationId,
                contactId: customer.contactId,
                status: "ACTIVE",
            },
            select: {
                email: true,
                contact: {
                    select: { firstName: true, lastName: true, phone: true },
                },
            },
        });
        // Signed out between the guard and here (unlinked, blocked, merged).
        if (!account) {
            throw new UnauthorizedException({
                message: "Sign in to continue.",
                details: { reason: "signed-out" },
            });
        }
        const known = [account.contact.firstName, account.contact.lastName]
            .map((part) => part?.trim() ?? "")
            .filter(Boolean)
            .join(" ");
        // An empty name is no name.
        const typed = given.bookerName?.trim() ?? "";
        const bookerName = [known, typed].find((n) => n !== "");
        return {
            ...given,
            bookerEmail: account.email,
            bookerName,
            bookerPhone: account.contact.phone ?? undefined,
        };
    }

    /**
     * An idempotent replay, to the same booker for the same booking only: the
     * same email, time, person (when one was asked for), way of paying and
     * place (when Where was answered, E7).
     * A retry that changed any of them is not the request that booked — the
     * page would show the new time over the old booking. A hold still inside
     * its time gets a fresh pay token (only the first one's hash was kept).
     */
    private async replay(
        existing: Booking,
        input: BookInput,
        place: string | null,
        now: Date = new Date(),
    ): Promise<{ booking: Booking; payToken: string | null }> {
        const paidAs =
            existing.paidWith === "DESK"
                ? "DESK"
                : existing.paidWith === "PACK" ||
                    existing.paidWith === "MEMBERSHIP"
                  ? "CREDIT"
                  : existing.paidWith === "PAID" || existing.holdExpiresAt
                    ? paidADeposit(existing.snapshot)
                        ? "DEPOSIT"
                        : "NOW"
                    : undefined;
        if (
            (existing.bookerEmail ?? "").toLowerCase() !==
                input.bookerEmail.trim().toLowerCase() ||
            existing.startAt.getTime() !== new Date(input.startAt).getTime() ||
            (input.staffId !== undefined &&
                existing.staffId !== input.staffId) ||
            (input.pay !== undefined && paidAs !== input.pay) ||
            (input.locationType !== undefined &&
                existing.locationType !== place)
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
     * What pay now charges for a service: its price — or, paying a deposit,
     * the deposit worked out from it (E8) — when it has one and the business
     * can take money online (Payments on, a provider connected).
     */
    private async onlinePrice(
        service: Service,
        pay: "NOW" | "DEPOSIT",
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
        const deposit = depositCents(service.priceCents, service.depositMode);
        if (!(await takesOnlinePayment(service.organizationId))) {
            throw new ConflictException({
                message:
                    deposit === null
                        ? "This business isn't taking payment online right now. Book it to pay at the desk."
                        : "This business can't take the deposit online right now. Get in touch with them to book.",
                field: "pay",
            });
        }
        return {
            cents:
                pay === "DEPOSIT" && deposit !== null
                    ? deposit
                    : service.priceCents,
            currency: service.currency,
        };
    }
}

/**
 * The credit a CREDIT booking names (A10): only someone signed in has one,
 * and it must name exactly one pack or membership (`creditChoiceOf`).
 */
function creditOf(
    asked: BookInput,
    service: Pick<Service, "capacity" | "visits">,
    signedIn: SignedInCustomer | undefined,
): CreditChoice {
    if (!signedIn) {
        throw new BadRequestException({
            message: "Sign in to use a credit.",
            field: "pay",
        });
    }
    return creditChoiceOf(asked, service);
}

/**
 * How a booking is paid, as its service allows (E8, default 39). A service
 * that takes a deposit is paid online: its deposit, or the whole price, and
 * never at the desk — a full-price deposit is simply paying now. A service
 * that takes none is paid now or at the desk, and a deposit is refused.
 * On a plan without online payments the booking page hands this the
 * service with no deposit (`deposit-plan.ts`), so it books at the desk.
 */
export function payAtBooking(
    service: Pick<Service, "priceCents" | "depositMode">,
    pay: BookPay | undefined,
): BookPay | undefined {
    const deposit = depositCents(service.priceCents, service.depositMode);
    if (deposit === null) {
        if (pay === "DEPOSIT") {
            throw new BadRequestException({
                message:
                    "This takes no deposit. Pay now or pay at the desk instead.",
                field: "pay",
            });
        }
        return pay;
    }
    if (pay === "NOW" || pay === "DEPOSIT") {
        return service.depositMode === "FULL" ? "NOW" : pay;
    }
    throw new BadRequestException({
        message:
            service.depositMode === "FULL"
                ? "This is paid online when you book."
                : "This takes a deposit when you book. Pay the deposit or the full price online.",
        field: "pay",
    });
}
