// DB-free unit tests for the customer's booking page (U19): the page's read,
// its two weeks of days, pay now (a hold and its draft invoice) and pay at
// the desk. @saroh/database is mocked; `$transaction` runs its callback on the
// same mocked client, so the hold and its invoice are asserted in one
// transaction.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        organization: { findUnique: jest.fn().mockResolvedValue(null) },
        service: { findUnique: jest.fn(), findMany: jest.fn() },
        site: { findFirst: jest.fn() },
        booking: {
            findUnique: jest.fn(),
            findUniqueOrThrow: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn().mockResolvedValue(0),
        },
        contact: { upsert: jest.fn() },
        bookingEvent: { create: jest.fn() },
        job: { create: jest.fn() },
        invoice: {
            create: jest.fn().mockResolvedValue({ id: "inv_1" }),
            findUnique: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        invoiceLine: { createMany: jest.fn() },
        organizationModule: { findFirst: jest.fn().mockResolvedValue(null) },
        merchantPaymentProvider: { findFirst: jest.fn() },
        courseSession: { findMany: jest.fn().mockResolvedValue([]) },
        staffService: { findMany: jest.fn().mockResolvedValue([]) },
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
    HttpException,
    NotFoundException,
    ValidationPipe,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { validationPipeOptions } from "../../common/validation";
import { hashPayToken } from "../invoices/pay-token";
import type { BookInput } from "./bookings.service";
import { BookingsService } from "./bookings.service";
import { BookServiceDto } from "./dto";
import { FixedWindowRateLimiter } from "./rate-limiter";

const db = prisma as unknown as {
    [
        K in
            | "service"
            | "site"
            | "booking"
            | "contact"
            | "bookingEvent"
            | "job"
            | "invoice"
            | "invoiceLine"
            | "organizationModule"
            | "merchantPaymentProvider"
            | "staffService"
            | "bookingRules"
            | "staffHours"
            | "staffExtraHours"
            | "staffTimeOff"
    ]: Record<string, jest.Mock>;
};

// Fri 18 Sep 2026, 09:30 UTC — the design's "now".
const NOW = new Date("2026-09-18T09:30:00.000Z");

/** Mon–Fri 09:00–12:00 in UTC. */
const WEEKDAYS = [1, 2, 3, 4, 5].map((dayOfWeek, i) => ({
    id: `r${i}`,
    organizationId: "org_1",
    serviceId: "svc_1",
    dayOfWeek,
    startMinute: 540,
    endMinute: 720,
}));

function service(over: Record<string, unknown> = {}) {
    return {
        id: "svc_1",
        organizationId: "org_1",
        siteId: null,
        name: "Personal training",
        description: null,
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        capacity: 1,
        priceCents: 80_000,
        currency: "INR",
        gstRate: null,
        sacCode: null,
        timezone: "UTC",
        status: "ACTIVE",
        deletedAt: null,
        locationType: "IN_PERSON",
        meetingUrl: null,
        availabilityRules: WEEKDAYS,
        ...over,
    };
}

function input(over: Partial<BookInput> = {}): BookInput {
    return {
        // Mon 21 Sep, 10:00.
        startAt: "2026-09-21T10:00:00.000Z",
        bookerName: "Asha Rao",
        bookerEmail: "asha@example.in",
        idempotencyKey: "key_1",
        ...over,
    };
}

function created(over: Record<string, unknown> = {}) {
    return {
        id: "bk_1",
        organizationId: "org_1",
        serviceId: "svc_1",
        contactId: "c_1",
        status: "CONFIRMED",
        holdExpiresAt: null,
        startAt: new Date("2026-09-21T10:00:00.000Z"),
        endAt: new Date("2026-09-21T11:00:00.000Z"),
        bookerName: "Asha Rao",
        bookerEmail: "asha@example.in",
        snapshot: { service: { name: "Personal training" } },
        ...over,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    db.service.findUnique.mockResolvedValue(service());
    db.booking.findUnique.mockResolvedValue(null);
    db.booking.findMany.mockResolvedValue([]);
    db.booking.count.mockResolvedValue(0);
    db.contact.upsert.mockResolvedValue({ id: "c_1" });
    db.booking.create.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
            Promise.resolve(created({ ...args.data, id: "bk_1" })),
    );
    db.invoice.create.mockResolvedValue({ id: "inv_1" });
    db.invoice.updateMany.mockResolvedValue({ count: 1 });
    db.organizationModule.findFirst.mockResolvedValue(null);
    db.merchantPaymentProvider.findFirst.mockResolvedValue({ id: "mpp_1" });
    db.staffService.findMany.mockResolvedValue([]);
    db.bookingRules.findUnique.mockResolvedValue(null);
    db.staffHours.findMany.mockResolvedValue([]);
    db.staffExtraHours.findMany.mockResolvedValue([]);
    db.staffTimeOff.findMany.mockResolvedValue([]);
});

describe("pay now (U19)", () => {
    it("holds the place for 15 minutes with a draft invoice at the service's price", async () => {
        const out = await new BookingsService().bookOnline(
            "svc_1",
            input({ pay: "NOW" }),
            "iphash",
            NOW,
        );

        const data = db.booking.create.mock.calls[0][0].data;
        expect(data.status).toBe("PENDING");
        expect(data.holdExpiresAt.toISOString()).toBe(
            "2026-09-18T09:45:00.000Z",
        );
        // Paid with nothing yet: the webhook says PAID when the money is in.
        expect(data.paidWith ?? null).toBeNull();

        const invoice = db.invoice.create.mock.calls[0][0].data;
        expect(invoice).toMatchObject({
            status: "DRAFT",
            source: "BOOKING",
            bookingId: "bk_1",
            contactId: "c_1",
            currency: "INR",
        });
        expect(String(invoice.total)).toBe("800.00");
        expect(out.payToken).toEqual(expect.any(String));
        expect(invoice.payTokenHash).toBe(hashPayToken(out.payToken ?? ""));
        // Hold and invoice in the one serializable transaction.
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("refuses pay now for a service with no price, holding nothing", async () => {
        db.service.findUnique.mockResolvedValue(service({ priceCents: null }));
        await expect(
            new BookingsService().bookOnline(
                "svc_1",
                input({ pay: "NOW" }),
                "iphash",
                NOW,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(db.booking.create).not.toHaveBeenCalled();
    });

    it("refuses pay now when the business has no provider connected", async () => {
        db.merchantPaymentProvider.findFirst.mockResolvedValue(null);
        await expect(
            new BookingsService().bookOnline(
                "svc_1",
                input({ pay: "NOW" }),
                "iphash",
                NOW,
            ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(db.booking.create).not.toHaveBeenCalled();
    });

    it("hands a replayed hold a fresh token, to the same booker only", async () => {
        db.booking.findUnique.mockResolvedValue(
            created({
                status: "PENDING",
                holdExpiresAt: new Date(NOW.getTime() + 10 * 60_000),
            }),
        );
        const svc = new BookingsService();
        const out = await svc.bookOnline(
            "svc_1",
            input({ pay: "NOW" }),
            "iphash",
            NOW,
        );
        expect(db.booking.create).not.toHaveBeenCalled();
        expect(out.payToken).toEqual(expect.any(String));
        expect(db.invoice.updateMany.mock.calls[0][0].data).toEqual({
            payTokenHash: hashPayToken(out.payToken ?? ""),
        });

        await expect(
            svc.bookOnline(
                "svc_1",
                input({ pay: "NOW", bookerEmail: "someone@else.in" }),
                "iphash",
                NOW,
            ),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("is rate-limited like any public booking", async () => {
        const svc = new BookingsService(new FixedWindowRateLimiter(1));
        await svc.bookOnline("svc_1", input({ pay: "DESK" }), "iphash", NOW);
        await expect(
            svc.bookOnline(
                "svc_1",
                input({ pay: "DESK", idempotencyKey: "key_2" }),
                "iphash",
                NOW,
            ),
        ).rejects.toBeInstanceOf(HttpException);
    });

    it("never takes an amount from the booker", async () => {
        const pipe = new ValidationPipe(validationPipeOptions);
        await expect(
            pipe.transform(
                {
                    startAt: "2026-09-21T10:00:00.000Z",
                    bookerEmail: "asha@example.in",
                    pay: "NOW",
                    amount: 1,
                },
                { type: "body", metatype: BookServiceDto },
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            pipe.transform(
                {
                    startAt: "2026-09-21T10:00:00.000Z",
                    bookerEmail: "asha@example.in",
                    pay: "LATER",
                },
                { type: "body", metatype: BookServiceDto },
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe("pay at the desk (U19)", () => {
    it("books it confirmed, paid at the desk, with no invoice", async () => {
        const out = await new BookingsService().bookOnline(
            "svc_1",
            input({ pay: "DESK" }),
            "iphash",
            NOW,
        );
        const data = db.booking.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ status: "CONFIRMED", paidWith: "DESK" });
        expect(data.holdExpiresAt).toBeNull();
        expect(db.invoice.create).not.toHaveBeenCalled();
        expect(out.payToken).toBeNull();
    });

    it("counts a live hold as a taken place", async () => {
        db.booking.count.mockResolvedValue(1);
        await expect(
            new BookingsService().bookOnline(
                "svc_1",
                input({ pay: "DESK" }),
                "iphash",
                NOW,
            ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(db.booking.count.mock.calls[0][0].where).toMatchObject({
            OR: [
                { status: "CONFIRMED" },
                { status: "PENDING", holdExpiresAt: { gt: expect.any(Date) } },
            ],
        });
    });
});

describe("the next two weeks (U19)", () => {
    it("lists a one-to-one's free starts per day, with Closed days and a Full one", async () => {
        // Mon 21 Sep 09:00–12:00 is fully taken; a live hold counts.
        db.booking.findMany.mockResolvedValue([
            {
                startAt: new Date("2026-09-21T09:00:00.000Z"),
                endAt: new Date("2026-09-21T12:00:00.000Z"),
            },
        ]);
        const out = await new BookingsService().publicDays("svc_1", NOW);

        expect(out.kind).toBe("one");
        expect(out.timezone).toBe("UTC");
        expect(out.days).toHaveLength(14);
        expect(out.days[0]!.date).toBe("2026-09-18");
        // Today: 09:00 has started, 10:00 and 11:00 are left.
        expect(out.days[0]!.starts.map((s) => s.startAt)).toEqual([
            "2026-09-18T10:00:00.000Z",
            "2026-09-18T11:00:00.000Z",
        ]);
        // Sat and Sun: no hours, so Closed.
        expect(out.days[1]).toMatchObject({ date: "2026-09-19", open: false });
        expect(out.days[2]).toMatchObject({ date: "2026-09-20", open: false });
        // Mon: open, and nothing free — Full.
        expect(out.days[3]).toMatchObject({
            date: "2026-09-21",
            open: true,
            starts: [],
        });
        expect(out.days[4]!.starts).toHaveLength(3);
        // What fills the time is read through the hold rule.
        expect(db.booking.findMany.mock.calls[0][0].where).toMatchObject({
            OR: [
                { status: "CONFIRMED" },
                { status: "PENDING", holdExpiresAt: { gt: expect.any(Date) } },
            ],
        });
    });

    it("keeps to the latest-booking and book-ahead rules", async () => {
        db.bookingRules.findUnique.mockResolvedValue({
            bookAheadDays: 5,
            latestBookingMinutes: 120,
            freeCancelHours: 12,
        });
        const out = await new BookingsService().publicDays("svc_1", NOW);
        // 10:00 and 11:00 are both inside the two hours: nothing today, and
        // the day still reads open (Full), not Closed.
        expect(out.days[0]).toMatchObject({ open: true, starts: [] });
        // Wed 23 Sep 09:00 is within 5 days; Thu 24 Sep is past it.
        expect(out.days[5]!.open).toBe(true);
        expect(out.days[6]).toMatchObject({
            date: "2026-09-24",
            open: false,
            starts: [],
        });
    });

    it("lists every class session with its places left, full ones too", async () => {
        db.service.findUnique.mockResolvedValue(
            service({ capacity: 12, name: "HIIT" }),
        );
        db.staffService.findMany.mockResolvedValue([
            { staff: { id: "staff_neha", name: "Neha" } },
        ]);
        db.booking.findMany.mockResolvedValue([
            ...Array.from({ length: 12 }, () => ({
                startAt: new Date("2026-09-18T10:00:00.000Z"),
                endAt: new Date("2026-09-18T11:00:00.000Z"),
            })),
            ...Array.from({ length: 10 }, () => ({
                startAt: new Date("2026-09-18T11:00:00.000Z"),
                endAt: new Date("2026-09-18T12:00:00.000Z"),
            })),
        ]);
        const out = await new BookingsService().publicDays("svc_1", NOW);

        expect(out.kind).toBe("class");
        expect(out.days[0]!.starts).toEqual([
            {
                startAt: "2026-09-18T10:00:00.000Z",
                endAt: "2026-09-18T11:00:00.000Z",
                staffId: "staff_neha",
                staffName: "Neha",
                placesLeft: 0,
            },
            {
                startAt: "2026-09-18T11:00:00.000Z",
                endAt: "2026-09-18T12:00:00.000Z",
                staffId: "staff_neha",
                staffName: "Neha",
                placesLeft: 2,
            },
        ]);
    });

    it("names who is free, and never says who is off or why", async () => {
        db.service.findUnique.mockResolvedValue(
            service({ availabilityRules: [] }),
        );
        db.staffService.findMany.mockResolvedValue([
            { staff: { id: "staff_karan", name: "Karan Mehta" } },
        ]);
        // Karan works Mon 06:00–09:00 and is off all of Mon 21 Sep.
        db.staffHours.findMany.mockResolvedValue([
            {
                staffId: "staff_karan",
                dayOfWeek: 1,
                startMinute: 360,
                endMinute: 540,
            },
        ]);
        db.staffTimeOff.findMany.mockResolvedValue([
            {
                staffId: "staff_karan",
                startAt: new Date("2026-09-21T00:00:00.000Z"),
                endAt: new Date("2026-09-22T00:00:00.000Z"),
            },
        ]);
        const out = await new BookingsService().publicDays("svc_1", NOW);

        // Mon 21 Sep: he works Mondays, so the day is open — and Full.
        expect(out.days[3]).toMatchObject({ open: true, starts: [] });
        // Mon 28 Sep: three starts, with him.
        expect(out.days[10]!.starts).toHaveLength(3);
        expect(out.days[10]!.starts[0]).toMatchObject({
            staffId: "staff_karan",
            staffName: "Karan Mehta",
        });
        expect(JSON.stringify(out)).not.toMatch(/timeOff|reason|off/i);
    });
});

describe("the booking page's read (U19)", () => {
    it("is a 404 for a site that is not published", async () => {
        db.site.findFirst.mockResolvedValue(null);
        await expect(
            new BookingsService().publicBookingPage("site_x"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("offers the business's services, who takes them by name, and its rules", async () => {
        db.site.findFirst.mockResolvedValue({
            organizationId: "org_1",
            organization: { name: "Pulse Fitness" },
        });
        db.service.findMany.mockResolvedValue([
            {
                id: "svc_1",
                name: "Personal training",
                description: null,
                durationMinutes: 60,
                capacity: 1,
                priceCents: 80_000,
                currency: "INR",
                locationType: "IN_PERSON",
                staffServices: [
                    { staff: { name: "Vikram" } },
                    { staff: { name: "Karan Mehta" } },
                ],
            },
            {
                id: "svc_2",
                name: "HIIT",
                description: null,
                durationMinutes: 45,
                capacity: 12,
                priceCents: 50_000,
                currency: "INR",
                locationType: "IN_PERSON",
                staffServices: [],
            },
        ]);
        db.bookingRules.findUnique.mockResolvedValue({
            bookAheadDays: 21,
            latestBookingMinutes: 120,
            freeCancelHours: 12,
        });
        const page = await new BookingsService().publicBookingPage("site_1");

        expect(page).toMatchObject({
            businessName: "Pulse Fitness",
            open: true,
            payOnline: true,
            rules: {
                bookAheadDays: 21,
                latestBookingMinutes: 120,
                freeCancelHours: 12,
            },
        });
        expect(page.services[0]).toMatchObject({
            kind: "one",
            staff: ["Karan Mehta", "Vikram"],
        });
        expect(page.services[1]).toMatchObject({ kind: "class", capacity: 12 });
        // Only services of this site or of no site.
        expect(db.service.findMany.mock.calls[0][0].where).toMatchObject({
            organizationId: "org_1",
            status: "ACTIVE",
            OR: [{ siteId: null }, { siteId: "site_1" }],
        });
        expect(JSON.stringify(page)).not.toMatch(/org_1/);
    });

    it("offers no pay now when Payments is switched off", async () => {
        db.site.findFirst.mockResolvedValue({
            organizationId: "org_1",
            organization: { name: "Pulse Fitness" },
        });
        db.service.findMany.mockResolvedValue([]);
        db.organizationModule.findFirst.mockImplementation(
            (args: { where: { moduleKey: string } }) =>
                Promise.resolve(
                    args.where.moduleKey === "PAYMENTS" ? { id: "m" } : null,
                ),
        );
        const page = await new BookingsService().publicBookingPage("site_1");
        expect(page.payOnline).toBe(false);
    });
});

describe("a hold, by its token (U19)", () => {
    it("reads HELD while it lasts, RELEASED after", async () => {
        const hold = created({
            status: "PENDING",
            holdExpiresAt: new Date(NOW.getTime() + 60_000),
        });
        db.invoice.findUnique.mockResolvedValue({
            source: "BOOKING",
            booking: hold,
        });
        const svc = new BookingsService();
        expect((await svc.publicHold("tok", "ip", NOW)).state).toBe("HELD");
        expect(
            (
                await svc.publicHold(
                    "tok",
                    "ip",
                    new Date(NOW.getTime() + 2 * 60_000),
                )
            ).state,
        ).toBe("RELEASED");
        expect(db.invoice.findUnique.mock.calls[0][0].where).toEqual({
            payTokenHash: hashPayToken("tok"),
        });
    });

    it("is a 404 for a token that is not a booking's", async () => {
        db.invoice.findUnique.mockResolvedValue({
            source: "MANUAL",
            booking: null,
        });
        await expect(
            new BookingsService().publicHold("tok", "ip", NOW),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lets a hold go when its booker asks", async () => {
        const hold = created({
            status: "PENDING",
            holdExpiresAt: new Date(NOW.getTime() + 60_000),
        });
        db.invoice.findUnique.mockResolvedValue({
            source: "BOOKING",
            booking: hold,
        });
        db.booking.findUnique.mockResolvedValue({
            ...hold,
            organizationId: "org_1",
        });
        db.booking.findUniqueOrThrow.mockResolvedValue({
            ...hold,
            status: "CANCELLED",
        });
        const out = await new BookingsService().releasePublicHold(
            "tok",
            "ip",
            NOW,
        );
        expect(db.booking.update.mock.calls[0][0].data).toMatchObject({
            status: "CANCELLED",
        });
        expect(db.invoice.updateMany.mock.calls[0][0].data).toMatchObject({
            status: "VOID",
            payTokenHash: null,
        });
        expect(out.state).toBe("RELEASED");
    });
});
