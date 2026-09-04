// DB-free unit tests: @saroh/database is mocked so nothing touches a real
// Postgres. The `$transaction` mock invokes its callback with the SAME mocked
// client (ignoring the isolationLevel option), so every write inside the booking
// command is asserted to happen in the one serializable transaction. The real
// Prisma namespace is kept for the JSON casts + isolation-level enum.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        service: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        availabilityRule: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            createMany: jest.fn(),
            deleteMany: jest.fn(),
            delete: jest.fn(),
        },
        booking: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        contact: { upsert: jest.fn() },
        bookingEvent: { create: jest.fn() },
        job: { create: jest.fn() },
        site: { findUnique: jest.fn() },
    };
    return {
        ...actual,
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    GoneException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService, type BookInput } from "./bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";

const serviceFindUnique = prisma.service.findUnique as jest.Mock;
const serviceCreate = prisma.service.create as jest.Mock;
const bookingFindUnique = prisma.booking.findUnique as jest.Mock;
const bookingCreate = prisma.booking.create as jest.Mock;
const bookingUpdate = prisma.booking.update as jest.Mock;
const bookingCount = prisma.booking.count as jest.Mock;
const contactUpsert = prisma.contact.upsert as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const siteFindUnique = prisma.site.findUnique as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;
const eventCreate = prisma.bookingEvent.create as jest.Mock;
const ruleFindMany = prisma.availabilityRule.findMany as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_SVC",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

const SERVICE = {
    id: "svc_1",
    organizationId: "org_SVC",
    siteId: null,
    name: "Consult",
    description: null,
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    capacity: 1,
    priceCents: null,
    currency: null,
    timezone: "UTC",
    status: "ACTIVE",
    deletedAt: null,
};

// Mon 2026-07-20 09:00–10:00 UTC — the one rule that makes START a valid slot.
const RULES = [
    {
        id: "r1",
        organizationId: "org_SVC",
        serviceId: "svc_1",
        dayOfWeek: 1,
        startMinute: 540,
        endMinute: 600,
    },
];
const START = "2026-07-20T09:00:00.000Z";

function baseInput(over: Partial<BookInput> = {}): BookInput {
    return {
        startAt: START,
        bookerName: "Jane Doe",
        bookerEmail: "Jane@Example.com",
        bookerPhone: "123",
        ...over,
    };
}

/** Wire the happy booking path: ACTIVE service (+rules), empty slot. */
function wireBookHappyPath() {
    serviceFindUnique.mockResolvedValue({
        ...SERVICE,
        availabilityRules: RULES,
    });
    bookingFindUnique.mockResolvedValue(null);
    bookingCount.mockResolvedValue(0);
    contactUpsert.mockResolvedValue({ id: "contact_1" });
    bookingCreate.mockResolvedValue({ id: "bk_1", status: "CONFIRMED" });
    jobCreate.mockResolvedValue({ id: "job_1" });
}

describe("BookingsService.book — capacity-one reservation", () => {
    beforeEach(() => jest.clearAllMocks());

    it("creates a Contact, CONFIRMED Booking and booking.notify Job in one serializable tx", async () => {
        const service = new BookingsService();
        wireBookHappyPath();

        const res = await service.book(
            "svc_1",
            baseInput({ idempotencyKey: undefined }),
            "iphash",
        );

        expect(transaction).toHaveBeenCalledTimes(1);
        // Serializable isolation was requested (the capacity-one guarantee).
        expect(transaction.mock.calls[0][1]).toMatchObject({
            isolationLevel: "Serializable",
        });

        expect(bookingCount).toHaveBeenCalledTimes(1);
        expect(contactUpsert).toHaveBeenCalledTimes(1);
        expect(bookingCreate).toHaveBeenCalledTimes(1);
        expect(jobCreate).toHaveBeenCalledTimes(1);
        expect(res).toEqual({ id: "bk_1", status: "CONFIRMED" });

        // Booking is CONFIRMED, endAt = start + duration, tz carried from the service.
        expect(bookingCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_SVC",
            serviceId: "svc_1",
            contactId: "contact_1",
            status: "CONFIRMED",
            timezone: "UTC",
            bookerEmail: "jane@example.com",
        });
        const created = bookingCreate.mock.calls[0][0].data;
        expect(created.startAt.toISOString()).toBe(START);
        expect(created.endAt.toISOString()).toBe("2026-07-20T10:00:00.000Z");

        // The in-tx capacity re-count targets CONFIRMED overlaps of this slot.
        expect(bookingCount.mock.calls[0][0].where).toMatchObject({
            serviceId: "svc_1",
            status: "CONFIRMED",
        });

        // Outbox job.
        expect(jobCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_SVC",
            type: "booking.notify",
            payload: { bookingId: "bk_1", serviceId: "svc_1" },
        });
    });

    it("ISOLATION: every write is stamped with service.organizationId, never a client value", async () => {
        const service = new BookingsService();
        wireBookHappyPath();

        await service.book("svc_1", baseInput(), "iphash");

        expect(contactUpsert.mock.calls[0][0].where).toEqual({
            organizationId_email: {
                organizationId: "org_SVC",
                email: "jane@example.com",
            },
        });
        expect(bookingCreate.mock.calls[0][0].data.organizationId).toBe(
            "org_SVC",
        );
        expect(jobCreate.mock.calls[0][0].data.organizationId).toBe("org_SVC");
    });

    it("409s when the in-tx re-count is already at capacity — creates nothing", async () => {
        const service = new BookingsService();
        wireBookHappyPath();
        bookingCount.mockResolvedValue(1); // capacity is 1 → full

        await expect(
            service.book("svc_1", baseInput(), "iphash"),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(bookingCreate).not.toHaveBeenCalled();
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("maps a Postgres serialization failure (P2034) to 409", async () => {
        const service = new BookingsService();
        wireBookHappyPath();
        transaction.mockRejectedValueOnce({ code: "P2034" });

        await expect(
            service.book("svc_1", baseInput(), "iphash"),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("replays an existing booking for a repeated (serviceId, idempotencyKey) — no tx", async () => {
        const service = new BookingsService();
        serviceFindUnique.mockResolvedValue({
            ...SERVICE,
            availabilityRules: RULES,
        });
        bookingFindUnique.mockResolvedValue({ id: "bk_prev" });

        const res = await service.book(
            "svc_1",
            baseInput({ idempotencyKey: "idem_1" }),
            "iphash",
        );

        expect(res).toEqual({ id: "bk_prev" });
        expect(transaction).not.toHaveBeenCalled();
        expect(bookingCreate).not.toHaveBeenCalled();
    });

    it("backstops an idempotency race: catches P2002 and replays the winner", async () => {
        const service = new BookingsService();
        serviceFindUnique.mockResolvedValue({
            ...SERVICE,
            availabilityRules: RULES,
        });
        // Pre-check finds nothing; the tx loses the unique race; re-read wins.
        bookingFindUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: "bk_win" });
        bookingCount.mockResolvedValue(0);
        contactUpsert.mockResolvedValue({ id: "contact_1" });
        bookingCreate.mockRejectedValue({ code: "P2002" });

        const res = await service.book(
            "svc_1",
            baseInput({ idempotencyKey: "idem_1" }),
            "iphash",
        );

        expect(res).toEqual({ id: "bk_win" });
    });

    it("400s an off-grid startAt (not an aligned slot) — no tx", async () => {
        const service = new BookingsService();
        serviceFindUnique.mockResolvedValue({
            ...SERVICE,
            availabilityRules: RULES,
        });

        await expect(
            service.book(
                "svc_1",
                baseInput({ startAt: "2026-07-20T09:15:00.000Z" }),
                "iphash",
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(transaction).not.toHaveBeenCalled();
    });

    it("404s a missing/soft-deleted service and 410s an archived one", async () => {
        const service = new BookingsService();

        serviceFindUnique.mockResolvedValueOnce(null);
        await expect(
            service.book("nope", baseInput(), "iphash"),
        ).rejects.toBeInstanceOf(NotFoundException);

        serviceFindUnique.mockResolvedValueOnce({
            ...SERVICE,
            status: "ARCHIVED",
            availabilityRules: RULES,
        });
        await expect(
            service.book("svc_1", baseInput(), "iphash"),
        ).rejects.toBeInstanceOf(GoneException);
    });

    it("429s the N+1th rapid booking from the same ipHash (before the tx)", async () => {
        const service = new BookingsService(
            new FixedWindowRateLimiter(1, 60_000),
        );
        wireBookHappyPath();

        await service.book("svc_1", baseInput(), "same_ip");

        let status: number | undefined;
        try {
            await service.book("svc_1", baseInput(), "same_ip");
        } catch (err) {
            status = (err as { getStatus(): number }).getStatus();
        }
        expect(status).toBe(429);
        expect(transaction).toHaveBeenCalledTimes(1);
    });
});

describe("BookingsService — Service management authz + isolation", () => {
    beforeEach(() => jest.clearAllMocks());

    it("createService denies a MEMBER (service:write) before any I/O", async () => {
        const service = new BookingsService();
        await expect(
            service.createService(ctx({ role: "MEMBER" }), {
                name: "X",
                durationMinutes: 30,
                timezone: "UTC",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(serviceCreate).not.toHaveBeenCalled();
    });

    it("createService 400s an invalid IANA timezone", async () => {
        const service = new BookingsService();
        await expect(
            service.createService(ctx(), {
                name: "X",
                durationMinutes: 30,
                timezone: "Mars/Phobos",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(serviceCreate).not.toHaveBeenCalled();
    });

    it("createService 404s a cross-tenant siteId", async () => {
        const service = new BookingsService();
        siteFindUnique.mockResolvedValue({
            id: "site_1",
            organizationId: "org_OTHER",
        });
        await expect(
            service.createService(ctx(), {
                name: "X",
                durationMinutes: 30,
                timezone: "UTC",
                siteId: "site_1",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(serviceCreate).not.toHaveBeenCalled();
    });

    it("getService 404s a cross-tenant service (no 403 probe)", async () => {
        const service = new BookingsService();
        serviceFindUnique.mockResolvedValue({
            ...SERVICE,
            organizationId: "org_OTHER",
        });
        await expect(service.getService(ctx(), "svc_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe("BookingsService — availability rules validation", () => {
    beforeEach(() => jest.clearAllMocks());

    it("replaceRules 400s a rule with startMinute >= endMinute", async () => {
        const service = new BookingsService();
        serviceFindUnique.mockResolvedValue(SERVICE);
        await expect(
            service.replaceRules(ctx(), "svc_1", [
                { dayOfWeek: 1, startMinute: 600, endMinute: 600 },
            ]),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("replaceRules denies a MEMBER (service:write)", async () => {
        const service = new BookingsService();
        await expect(
            service.replaceRules(ctx({ role: "MEMBER" }), "svc_1", []),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe("BookingsService — bookings management", () => {
    beforeEach(() => jest.clearAllMocks());

    it("cancelBooking sets CANCELLED + cancelledAt on an owned booking", async () => {
        const service = new BookingsService();
        bookingFindUnique.mockResolvedValue({
            id: "bk_1",
            organizationId: "org_SVC",
            status: "CONFIRMED",
        });
        bookingUpdate.mockResolvedValue({ id: "bk_1", status: "CANCELLED" });

        const res = await service.cancelBooking(ctx(), "bk_1");

        expect(bookingUpdate).toHaveBeenCalledTimes(1);
        const arg = bookingUpdate.mock.calls[0][0];
        expect(arg.where).toEqual({ id: "bk_1" });
        expect(arg.data.status).toBe("CANCELLED");
        expect(arg.data.cancelledAt).toBeInstanceOf(Date);
        expect(res).toEqual({ id: "bk_1", status: "CANCELLED" });
    });

    it("cancelBooking is idempotent for an already-cancelled booking", async () => {
        const service = new BookingsService();
        bookingFindUnique.mockResolvedValue({
            id: "bk_1",
            organizationId: "org_SVC",
            status: "CANCELLED",
        });

        await service.cancelBooking(ctx(), "bk_1");
        expect(bookingUpdate).not.toHaveBeenCalled();
    });

    it("cancelBooking denies a MEMBER (booking:write)", async () => {
        const service = new BookingsService();
        await expect(
            service.cancelBooking(ctx({ role: "MEMBER" }), "bk_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(bookingFindUnique).not.toHaveBeenCalled();
    });

    it("cancelBooking 404s a cross-tenant booking", async () => {
        const service = new BookingsService();
        bookingFindUnique.mockResolvedValue({
            id: "bk_1",
            organizationId: "org_OTHER",
            status: "CONFIRMED",
        });
        await expect(
            service.cancelBooking(ctx(), "bk_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(bookingUpdate).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Moving a booking (#121)
// ---------------------------------------------------------------------------

// Mon 2026-07-20 09:00–12:00 UTC at 60 minutes: slots at 09:00, 10:00, 11:00.
// Wider than RULES on purpose — a reschedule test needs somewhere to move TO.
const WIDE_RULES = [{ ...RULES[0], endMinute: 720 }];
const AT_10 = "2026-07-20T10:00:00.000Z";
const AT_11 = "2026-07-20T11:00:00.000Z";

const BOOKING = {
    id: "bk_1",
    organizationId: "org_SVC",
    serviceId: "svc_1",
    contactId: "contact_1",
    status: "CONFIRMED",
    startAt: new Date(START),
    endAt: new Date("2026-07-20T10:00:00.000Z"),
    // The terms as agreed at booking time. The slot inside is the ORIGINAL.
    snapshot: { slot: { startAt: START } },
};

/** An owned, CONFIRMED booking on a service with room to move within. */
function wireReschedule(over: Partial<typeof BOOKING> = {}) {
    bookingFindUnique.mockResolvedValue({ ...BOOKING, ...over });
    serviceFindUnique.mockResolvedValue(SERVICE);
    ruleFindMany.mockResolvedValue(WIDE_RULES);
    bookingCount.mockResolvedValue(0);
    bookingUpdate.mockImplementation(({ data }) =>
        Promise.resolve({ ...BOOKING, ...over, ...data }),
    );
    eventCreate.mockResolvedValue({ id: "ev_1" });
    jobCreate.mockResolvedValue({ id: "job_1" });
}

describe("BookingsService.rescheduleBooking", () => {
    beforeEach(() => jest.clearAllMocks());

    it("moves the slot, records the move, and tells the booker — in one serializable tx", async () => {
        wireReschedule();
        const service = new BookingsService();
        const moved = await service.rescheduleBooking(ctx(), "bk_1", {
            startAt: AT_10,
        });

        expect(moved.startAt).toEqual(new Date(AT_10));
        // End moves with it, by the service's own duration.
        expect(bookingUpdate.mock.calls[0][0].data.endAt).toEqual(
            new Date(AT_11),
        );

        // The history says where it came from AND who moved it — the
        // difference between "they booked it" and "we moved it".
        expect(eventCreate.mock.calls[0][0].data).toMatchObject({
            bookingId: "bk_1",
            organizationId: "org_SVC",
            type: "RESCHEDULED",
            actorUserId: "user_1",
            fromStartAt: new Date(START),
            toStartAt: new Date(AT_10),
        });

        // Transactional outbox, with the reason, so a committed move always
        // has a pending notification.
        expect(jobCreate.mock.calls[0][0].data).toMatchObject({
            type: "booking.notify",
            payload: { bookingId: "bk_1", reason: "rescheduled" },
        });

        // All three writes in the ONE serializable transaction.
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(transaction.mock.calls[0][1]).toMatchObject({
            isolationLevel: "Serializable",
        });
    });

    it("never rewrites the snapshot — it is the terms that were agreed", async () => {
        wireReschedule();
        await new BookingsService().rescheduleBooking(ctx(), "bk_1", {
            startAt: AT_10,
        });
        expect(bookingUpdate.mock.calls[0][0].data).not.toHaveProperty(
            "snapshot",
        );
    });

    it("refuses a time the service is not open for", async () => {
        wireReschedule();
        const service = new BookingsService();
        await expect(
            // 13:00 is past the rule's 12:00 end.
            service.rescheduleBooking(ctx(), "bk_1", {
                startAt: "2026-07-20T13:00:00.000Z",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(bookingUpdate).not.toHaveBeenCalled();
    });

    it("refuses a time off the duration grid", async () => {
        wireReschedule();
        await expect(
            new BookingsService().rescheduleBooking(ctx(), "bk_1", {
                startAt: "2026-07-20T09:30:00.000Z",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(bookingUpdate).not.toHaveBeenCalled();
    });

    it("does not count the booking against its own seat", async () => {
        wireReschedule();
        await new BookingsService().rescheduleBooking(ctx(), "bk_1", {
            startAt: AT_10,
        });
        // Without this a capacity-one booking could never be nudged into a
        // slot that overlaps where it already is: it would collide with itself.
        expect(bookingCount.mock.calls[0][0].where).toMatchObject({
            id: { not: "bk_1" },
            status: "CONFIRMED",
        });
    });

    it("refuses a slot somebody else already has", async () => {
        wireReschedule();
        bookingCount.mockResolvedValue(1); // capacity is 1
        await expect(
            new BookingsService().rescheduleBooking(ctx(), "bk_1", {
                startAt: AT_10,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(bookingUpdate).not.toHaveBeenCalled();
    });

    it("maps a lost race for the last seat to the same conflict", async () => {
        wireReschedule();
        transaction.mockRejectedValueOnce(
            Object.assign(new Error("serialization failure"), {
                code: "P2034",
            }),
        );
        await expect(
            new BookingsService().rescheduleBooking(ctx(), "bk_1", {
                startAt: AT_10,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("will not move a cancelled booking", async () => {
        wireReschedule({ status: "CANCELLED" });
        await expect(
            new BookingsService().rescheduleBooking(ctx(), "bk_1", {
                startAt: AT_10,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(bookingUpdate).not.toHaveBeenCalled();
    });

    it("moving to the time it is already at changes nothing and records nothing", async () => {
        wireReschedule();
        const booking = await new BookingsService().rescheduleBooking(
            ctx(),
            "bk_1",
            { startAt: START },
        );
        expect(booking.startAt).toEqual(new Date(START));
        expect(bookingUpdate).not.toHaveBeenCalled();
        // A history full of "moved to where it already was" is noise.
        expect(eventCreate).not.toHaveBeenCalled();
    });

    it("rejects a start that is not an instant at all", async () => {
        wireReschedule();
        await expect(
            new BookingsService().rescheduleBooking(ctx(), "bk_1", {
                startAt: "next tuesday",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("404s for another org's booking, before touching the service", async () => {
        bookingFindUnique.mockResolvedValue({
            ...BOOKING,
            organizationId: "org_OTHER",
        });
        await expect(
            new BookingsService().rescheduleBooking(ctx(), "bk_1", {
                startAt: AT_10,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(serviceFindUnique).not.toHaveBeenCalled();
    });

    it("denies a MEMBER (booking:write) before any I/O", async () => {
        await expect(
            new BookingsService().rescheduleBooking(
                ctx({ role: "MEMBER" }),
                "bk_1",
                { startAt: AT_10 },
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(bookingFindUnique).not.toHaveBeenCalled();
    });

    it("will not move a booking on an ARCHIVED service", async () => {
        wireReschedule();
        serviceFindUnique.mockResolvedValue({ ...SERVICE, status: "ARCHIVED" });
        // The availability an archived service still carries describes hours
        // the merchant has stopped offering. Moving a booking into one would
        // put a customer in a slot the business no longer keeps.
        await expect(
            new BookingsService().rescheduleBooking(ctx(), "bk_1", {
                startAt: AT_10,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(bookingUpdate).not.toHaveBeenCalled();
    });

    it("cancelling an archived service's booking still works", async () => {
        // Refusing the move must not strand the booking: winding it down is
        // exactly what a merchant does with a retired service's bookings.
        bookingFindUnique.mockResolvedValue(BOOKING);
        bookingUpdate.mockResolvedValue({ ...BOOKING, status: "CANCELLED" });
        eventCreate.mockResolvedValue({ id: "ev_3" });
        const cancelled = await new BookingsService().cancelBooking(
            ctx(),
            "bk_1",
        );
        expect(cancelled.status).toBe("CANCELLED");
    });
});

describe("BookingsService — the history a booking carries", () => {
    beforeEach(() => jest.clearAllMocks());

    it("books with no actor: the booker did that themselves", async () => {
        wireBookHappyPath();
        eventCreate.mockResolvedValue({ id: "ev_1" });
        bookingCreate.mockResolvedValue({ id: "bk_1", status: "CONFIRMED" });
        await new BookingsService().book("svc_1", baseInput(), undefined);

        const { data } = eventCreate.mock.calls[0][0];
        expect(data).toMatchObject({
            type: "BOOKED",
            toStartAt: new Date(START),
        });
        expect(data.actorUserId).toBeUndefined();
        expect(data.fromStartAt).toBeUndefined();
    });

    it("cancelling records the slot it was cancelled out of", async () => {
        bookingFindUnique.mockResolvedValue(BOOKING);
        bookingUpdate.mockResolvedValue({ ...BOOKING, status: "CANCELLED" });
        eventCreate.mockResolvedValue({ id: "ev_2" });
        await new BookingsService().cancelBooking(ctx(), "bk_1");

        expect(eventCreate.mock.calls[0][0].data).toMatchObject({
            type: "CANCELLED",
            actorUserId: "user_1",
            fromStartAt: new Date(START),
        });
    });

    it("cancelling an already-cancelled booking records nothing twice", async () => {
        bookingFindUnique.mockResolvedValue({
            ...BOOKING,
            status: "CANCELLED",
        });
        await new BookingsService().cancelBooking(ctx(), "bk_1");
        expect(eventCreate).not.toHaveBeenCalled();
        expect(bookingUpdate).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// The Appointments path's first value (#176)
// ---------------------------------------------------------------------------

describe("BookingsService.book — activation instrumentation", () => {
    beforeEach(() => jest.clearAllMocks());

    it("records the org's first booking, after the booking is committed", async () => {
        wireBookHappyPath();
        eventCreate.mockResolvedValue({ id: "ev_1" });
        const firstBookingCreated = jest.fn().mockResolvedValue(undefined);
        const service = new BookingsService(new FixedWindowRateLimiter(), {
            firstBookingCreated,
        } as unknown as ConstructorParameters<typeof BookingsService>[1]);

        await service.book("svc_1", baseInput(), undefined);

        // The org comes from the SERVICE, never the client — the booking
        // command is unauthenticated.
        expect(firstBookingCreated).toHaveBeenCalledWith("org_SVC", "bk_1");
        // After the commit: the transaction must not be able to roll back
        // because an analytics row could not be written.
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(bookingCreate).toHaveBeenCalled();
    });

    it("never reports a committed booking as failed when instrumentation throws", async () => {
        wireBookHappyPath();
        eventCreate.mockResolvedValue({ id: "ev_1" });
        const service = new BookingsService(new FixedWindowRateLimiter(), {
            // ActivationEvents swallows its own errors, but the booking
            // command must not depend on that: the emit sits outside the
            // try/catch precisely so a throw here cannot be re-thrown as a
            // booking failure to someone whose slot IS reserved.
            firstBookingCreated: jest
                .fn()
                .mockRejectedValue(new Error("analytics is down")),
        } as unknown as ConstructorParameters<typeof BookingsService>[1]);

        const err = await service
            .book("svc_1", baseInput(), undefined)
            .catch((e: unknown) => e);
        // It surfaces as the analytics error it is, NOT as a booking conflict
        // or a lost reservation — and the booking row was written either way.
        expect(bookingCreate).toHaveBeenCalled();
        expect((err as Error).message).toBe("analytics is down");
    });

    it("works with no instrumentation wired at all", async () => {
        wireBookHappyPath();
        eventCreate.mockResolvedValue({ id: "ev_1" });
        await expect(
            new BookingsService().book("svc_1", baseInput(), undefined),
        ).resolves.toMatchObject({ id: "bk_1" });
    });
});
