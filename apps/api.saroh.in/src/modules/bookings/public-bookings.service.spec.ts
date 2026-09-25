// DB-free unit tests: @saroh/database is mocked so nothing touches a real
// Postgres. The `$transaction` mock invokes its callback with the SAME mocked
// client (ignoring the isolationLevel option), so every write inside the booking
// command is asserted to happen in the one serializable transaction. The real
// Prisma namespace is kept for the JSON casts + isolation-level enum.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        // The lifecycle gate: no row means "not closed" (organization-lifecycle.gate.ts).
        organization: { findUnique: jest.fn().mockResolvedValue(null) },
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
        contact: { upsert: jest.fn(), findUnique: jest.fn() },
        customerSubscription: { findFirst: jest.fn() },
        invoice: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        bookingEvent: { create: jest.fn() },
        job: { create: jest.fn() },
        site: { findUnique: jest.fn() },
        organizationModule: { findFirst: jest.fn() },
        courseSession: { findMany: jest.fn().mockResolvedValue([]) },
        course: { findFirst: jest.fn().mockResolvedValue(null) },
        packRedemption: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            findFirst: jest.fn().mockResolvedValue(null),
        },
        // Staff (U3): nobody takes a service and there are no booking rules
        // unless a test says so — every business before staff existed.
        staffService: { findMany: jest.fn().mockResolvedValue([]) },
        staffMember: { findMany: jest.fn().mockResolvedValue([]) },
        bookingRules: { findUnique: jest.fn().mockResolvedValue(null) },
        staffHours: { findMany: jest.fn().mockResolvedValue([]) },
        staffExtraHours: { findMany: jest.fn().mockResolvedValue([]) },
        staffTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
        businessProfile: {
            findUnique: jest.fn().mockResolvedValue({ timezone: "UTC" }),
        },
        $queryRaw: jest.fn(),
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
    GoneException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { toPublicBooking } from "./public-booking-page";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";
import type { BookInput } from "./reservation";

const serviceFindUnique = prisma.service.findUnique as jest.Mock;
const serviceCreate = prisma.service.create as jest.Mock;
const bookingFindUnique = prisma.booking.findUnique as jest.Mock;
const bookingCreate = prisma.booking.create as jest.Mock;
const bookingUpdate = prisma.booking.update as jest.Mock;
const bookingCount = prisma.booking.count as jest.Mock;
const contactUpsert = prisma.contact.upsert as jest.Mock;
const contactFindUnique = prisma.contact.findUnique as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const siteFindUnique = prisma.site.findUnique as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;
const eventCreate = prisma.bookingEvent.create as jest.Mock;
const ruleFindMany = prisma.availabilityRule.findMany as jest.Mock;
const bookingFindMany = prisma.booking.findMany as jest.Mock;
const moduleFindFirst = prisma.organizationModule.findFirst as jest.Mock;

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
    moduleFindFirst.mockResolvedValue(null);
    bookingFindUnique.mockResolvedValue(null);
    bookingCount.mockResolvedValue(0);
    contactUpsert.mockResolvedValue({ id: "contact_1" });
    bookingCreate.mockResolvedValue({ id: "bk_1", status: "CONFIRMED" });
    jobCreate.mockResolvedValue({ id: "job_1" });
}

describe("PublicBookingsService.book — capacity-one reservation", () => {
    beforeEach(() => jest.clearAllMocks());

    it("creates a Contact, CONFIRMED Booking and booking.notify Job in one serializable tx", async () => {
        const service = new PublicBookingsService();
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

        // The in-tx capacity re-count targets the places taken in this slot:
        // confirmed bookings and pay-now holds still inside their time (U19).
        expect(bookingCount.mock.calls[0][0].where).toMatchObject({
            serviceId: "svc_1",
            OR: [
                { status: "CONFIRMED" },
                { status: "PENDING", holdExpiresAt: { gt: expect.any(Date) } },
            ],
        });

        // Outbox job.
        expect(jobCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_SVC",
            type: "booking.notify",
            payload: { bookingId: "bk_1", serviceId: "svc_1" },
        });
    });

    it("ISOLATION: every write is stamped with service.organizationId, never a client value", async () => {
        const service = new PublicBookingsService();
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
        const service = new PublicBookingsService();
        wireBookHappyPath();
        bookingCount.mockResolvedValue(1); // capacity is 1 → full

        await expect(
            service.book("svc_1", baseInput(), "iphash"),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(bookingCreate).not.toHaveBeenCalled();
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("maps a Postgres serialization failure (P2034) to 409", async () => {
        const service = new PublicBookingsService();
        wireBookHappyPath();
        transaction.mockRejectedValueOnce({ code: "P2034" });

        await expect(
            service.book("svc_1", baseInput(), "iphash"),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("replays an existing booking for a repeated (serviceId, idempotencyKey) — no tx", async () => {
        const service = new PublicBookingsService();
        serviceFindUnique.mockResolvedValue({
            ...SERVICE,
            availabilityRules: RULES,
        });
        const prev = { id: "bk_prev", bookerEmail: "jane@example.com" };
        bookingFindUnique.mockResolvedValue(prev);

        const res = await service.book(
            "svc_1",
            baseInput({ idempotencyKey: "idem_1" }),
            "iphash",
        );

        expect(res).toEqual(prev);
        expect(transaction).not.toHaveBeenCalled();
        expect(bookingCreate).not.toHaveBeenCalled();
    });

    it("replays a key only to the booker who made it", async () => {
        const service = new PublicBookingsService();
        serviceFindUnique.mockResolvedValue({
            ...SERVICE,
            availabilityRules: RULES,
        });
        bookingFindUnique.mockResolvedValue({
            id: "bk_prev",
            bookerEmail: "someone.else@example.com",
        });
        await expect(
            service.book(
                "svc_1",
                baseInput({ idempotencyKey: "idem_1" }),
                "iphash",
            ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(bookingCreate).not.toHaveBeenCalled();
    });

    it("counts a replay against the rate limit, so keys cannot be probed freely", async () => {
        const service = new PublicBookingsService(
            new FixedWindowRateLimiter(1, 60_000),
        );
        serviceFindUnique.mockResolvedValue({
            ...SERVICE,
            availabilityRules: RULES,
        });
        bookingFindUnique.mockResolvedValue({
            id: "bk_prev",
            bookerEmail: "jane@example.com",
        });
        const input = baseInput({ idempotencyKey: "idem_1" });
        await service.book("svc_1", input, "same_ip");
        await expect(
            service.book("svc_1", input, "same_ip"),
        ).rejects.toMatchObject({ status: 429 });
    });

    it("backstops an idempotency race: catches P2002 and replays the winner", async () => {
        const service = new PublicBookingsService();
        serviceFindUnique.mockResolvedValue({
            ...SERVICE,
            availabilityRules: RULES,
        });
        // Pre-check finds nothing; the tx loses the unique race; re-read wins
        // — replayed only to the same booker, like any replay.
        bookingFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
            id: "bk_win",
            bookerEmail: "jane@example.com",
        });
        bookingCount.mockResolvedValue(0);
        contactUpsert.mockResolvedValue({ id: "contact_1" });
        bookingCreate.mockRejectedValue({ code: "P2002" });

        const res = await service.book(
            "svc_1",
            baseInput({ idempotencyKey: "idem_1" }),
            "iphash",
        );

        expect(res).toEqual({
            id: "bk_win",
            bookerEmail: "jane@example.com",
        });
    });

    it("400s an off-grid startAt (not an aligned slot) — no tx", async () => {
        const service = new PublicBookingsService();
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
        const service = new PublicBookingsService();

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
        const service = new PublicBookingsService(
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

describe("PublicBookingsService — public booking follows the Appointments module", () => {
    beforeEach(() => jest.clearAllMocks());

    const FROM = "2026-07-20T00:00:00.000Z";
    const TO = "2026-07-21T00:00:00.000Z";
    const OFF_MESSAGE = "This business isn't taking online bookings right now";

    function wireAvailability() {
        serviceFindUnique.mockResolvedValue({
            ...SERVICE,
            availabilityRules: RULES,
        });
        moduleFindFirst.mockResolvedValue(null);
        bookingFindMany.mockResolvedValue([]);
    }

    it("asks for the organization's APPOINTMENTS row in any state but ENABLED", async () => {
        wireAvailability();

        await new PublicBookingsService().publicAvailability("svc_1", FROM, TO);

        expect(moduleFindFirst).toHaveBeenCalledWith({
            where: {
                organizationId: "org_SVC",
                moduleKey: "APPOINTMENTS",
                status: { not: "ENABLED" },
            },
            select: { id: true },
        });
    });

    it("410s availability when the org has switched Appointments off", async () => {
        wireAvailability();
        moduleFindFirst.mockResolvedValueOnce({ id: "om_1" });

        const attempt = new PublicBookingsService().publicAvailability(
            "svc_1",
            FROM,
            TO,
        );
        await expect(attempt).rejects.toBeInstanceOf(GoneException);
        await expect(attempt).rejects.toThrow(OFF_MESSAGE);
        expect(bookingFindMany).not.toHaveBeenCalled();
    });

    /*
     * "Switched off" is decided by the query, so pin the query: any
     * APPOINTMENTS row that is NOT ENABLED — DISABLED and ARCHIVED alike —
     * counts, and a missing row does not. (This used to be an it.each over
     * the two statuses whose mock answered the same for both, so it never
     * distinguished them.)
     */
    it("counts any APPOINTMENTS row that is not ENABLED as switched off", async () => {
        wireAvailability();
        moduleFindFirst.mockResolvedValueOnce(null);
        await new PublicBookingsService().publicAvailability("svc_1", FROM, TO);
        expect(moduleFindFirst.mock.calls[0][0].where).toMatchObject({
            moduleKey: "APPOINTMENTS",
            status: { not: "ENABLED" },
        });
    });

    it("410s a booking when Appointments is switched off, before any write", async () => {
        const service = new PublicBookingsService();
        wireBookHappyPath();
        moduleFindFirst.mockResolvedValueOnce({ id: "om_1" });

        await expect(
            service.book("svc_1", baseInput(), "iphash"),
        ).rejects.toThrow(OFF_MESSAGE);
        expect(transaction).not.toHaveBeenCalled();
        expect(bookingCreate).not.toHaveBeenCalled();
    });

    it("keeps booking open when the organization has no APPOINTMENTS row (or it is ENABLED)", async () => {
        const service = new PublicBookingsService();
        wireBookHappyPath();

        await expect(
            service.book("svc_1", baseInput(), "iphash"),
        ).resolves.toEqual({ id: "bk_1", status: "CONFIRMED" });

        wireAvailability();
        await expect(
            service.publicAvailability("svc_1", FROM, TO),
        ).resolves.toEqual(expect.any(Array));
    });

    it("still 404s a missing service without asking about the module", async () => {
        serviceFindUnique.mockResolvedValueOnce(null);

        await expect(
            new PublicBookingsService().publicAvailability("nope", FROM, TO),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(moduleFindFirst).not.toHaveBeenCalled();
    });
});

describe("PublicBookingsService.book — activation instrumentation", () => {
    beforeEach(() => jest.clearAllMocks());

    it("records the org's first booking, after the booking is committed", async () => {
        wireBookHappyPath();
        eventCreate.mockResolvedValue({ id: "ev_1" });
        const firstBookingCreated = jest.fn().mockResolvedValue(undefined);
        const service = new PublicBookingsService(
            new FixedWindowRateLimiter(),
            {
                firstBookingCreated,
            } as unknown as ConstructorParameters<
                typeof PublicBookingsService
            >[1],
        );

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
        const service = new PublicBookingsService(
            new FixedWindowRateLimiter(),
            {
                // ActivationEvents swallows its own errors, but the booking
                // command must not depend on that: the emit sits outside the
                // try/catch precisely so a throw here cannot be re-thrown as a
                // booking failure to someone whose slot IS reserved.
                firstBookingCreated: jest
                    .fn()
                    .mockRejectedValue(new Error("analytics is down")),
            } as unknown as ConstructorParameters<
                typeof PublicBookingsService
            >[1],
        );

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
            new PublicBookingsService().book("svc_1", baseInput(), undefined),
        ).resolves.toMatchObject({ id: "bk_1" });
    });
});

// ---------------------------------------------------------------------------
// How the appointment went (#241)
// ---------------------------------------------------------------------------

describe("PublicBookingsService.publicServices — the website's services list (#255)", () => {
    beforeEach(() => jest.clearAllMocks());
    const serviceFindMany = prisma.service.findMany as jest.Mock;

    const row = (id: string) => ({
        id,
        name: `Service ${id}`,
        description: null,
        durationMinutes: 30,
        priceCents: 2500,
        currency: "GBP",
    });

    it("returns services in the merchant's order and drops unknown ids", async () => {
        serviceFindMany.mockResolvedValue([row("b"), row("a")]);
        const result = await new PublicBookingsService().publicServices([
            "a",
            "gone",
            "b",
        ]);
        expect(result.map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("asks only for active, undeleted services whose Appointments is not disabled", async () => {
        serviceFindMany.mockResolvedValue([]);
        await new PublicBookingsService().publicServices(["a"]);
        const { where, select } = serviceFindMany.mock.calls[0][0];
        expect(where).toMatchObject({
            id: { in: ["a"] },
            deletedAt: null,
            status: "ACTIVE",
            organization: {
                organizationModules: {
                    none: {
                        moduleKey: "APPOINTMENTS",
                        status: { not: "ENABLED" },
                    },
                },
            },
        });
        // Nothing internal leaves: no org, site, capacity or buffers.
        expect(Object.keys(select).sort()).toEqual([
            "currency",
            "description",
            "durationMinutes",
            "id",
            "name",
            "priceCents",
        ]);
    });

    it("does not query for an empty list", async () => {
        expect(await new PublicBookingsService().publicServices([])).toEqual(
            [],
        );
        expect(serviceFindMany).not.toHaveBeenCalled();
    });
});

describe("toPublicBooking — what a booker is answered with", () => {
    const booking = {
        id: "bk_1",
        organizationId: "org_SVC",
        contactId: "contact_1",
        ipHash: "iphash",
        startAt: new Date(START),
        endAt: new Date("2026-07-20T10:00:00.000Z"),
        status: "CONFIRMED",
        snapshot: {
            service: {
                name: "Evening yoga",
                locationType: "ONLINE",
                meetingUrl: "https://meet.example.com/yoga",
            },
        },
    };

    it("is the booker's own booking and nothing internal", () => {
        expect(toPublicBooking(booking)).toEqual({
            reference: "bk_1",
            startAt: START,
            endAt: "2026-07-20T10:00:00.000Z",
            serviceName: "Evening yoga",
            online: true,
            meetingUrl: "https://meet.example.com/yoga",
        });
    });

    it("reads the link frozen at booking, not the service as it is now", () => {
        // The service's link has since changed; this booking keeps its own.
        const view = toPublicBooking(booking);
        expect(view.meetingUrl).toBe("https://meet.example.com/yoga");
    });

    it("has no link once the booking is cancelled", () => {
        expect(
            toPublicBooking({ ...booking, status: "CANCELLED" }),
        ).toMatchObject({ online: true, meetingUrl: null });
    });

    it("has no link for a PENDING pay-now hold — it has not paid yet", () => {
        // U19: the hold hasn't been paid for, so /book and /holds/:token must
        // not hand out the online meeting link before it is CONFIRMED.
        expect(
            toPublicBooking({ ...booking, status: "PENDING" }),
        ).toMatchObject({ online: true, meetingUrl: null });
    });

    it("has no link for an in-person booking, or one made before links existed", () => {
        expect(
            toPublicBooking({
                ...booking,
                snapshot: { service: { name: "Consult" } },
            }),
        ).toMatchObject({ online: false, meetingUrl: null });
    });
});
