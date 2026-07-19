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
