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
        bookingEvent: { create: jest.fn().mockResolvedValue({ id: "ev_1" }) },
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
        // The class waitlist (A12): nobody in line, no place held.
        classWaitlistEntry: {
            count: jest.fn().mockResolvedValue(0),
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        staffService: { findMany: jest.fn().mockResolvedValue([]) },
        bookingRules: { findUnique: jest.fn().mockResolvedValue(null) },
        staffHours: { findMany: jest.fn().mockResolvedValue([]) },
        staffExtraHours: { findMany: jest.fn().mockResolvedValue([]) },
        staffTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
        businessClosure: { findMany: jest.fn().mockResolvedValue([]) },
        // No walk-in storefront: opening hours cut nothing (DEC-087).
        store: { findMany: jest.fn().mockResolvedValue([]) },
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

import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import { validationPipeOptions } from "../../common/validation";
import { planMeter } from "../billing/metering.service";
import { hashPayToken } from "../invoices/pay-token";
import { BookServiceDto } from "./dto";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";
import type { BookInput } from "./reservation";

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
        visits: 1,
        depositMode: "NONE",
        showOnBookingPage: true,
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
        const out = await new PublicBookingsService().bookOnline(
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
            new PublicBookingsService().bookOnline(
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
            new PublicBookingsService().bookOnline(
                "svc_1",
                input({ pay: "NOW" }),
                "iphash",
                NOW,
            ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(db.booking.create).not.toHaveBeenCalled();
    });

    it("counts only a provider whose checkout can open: not a Razorpay one missing its public key id (DEC-054)", async () => {
        await new PublicBookingsService().bookOnline(
            "svc_1",
            input({ pay: "NOW" }),
            "iphash",
            NOW,
        );
        expect(db.merchantPaymentProvider.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    status: "CONNECTED",
                    OR: [
                        { provider: { not: "RAZORPAY" } },
                        {
                            AND: [
                                { publicKey: { not: null } },
                                { publicKey: { not: "" } },
                            ],
                        },
                    ],
                }),
            }),
        );
    });

    it("hands a replayed hold a fresh token, to the same booker only", async () => {
        db.booking.findUnique.mockResolvedValue(
            created({
                status: "PENDING",
                holdExpiresAt: new Date(NOW.getTime() + 10 * 60_000),
            }),
        );
        const svc = new PublicBookingsService();
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
        const svc = new PublicBookingsService(new FixedWindowRateLimiter(1));
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

describe("a deposit at booking (E8)", () => {
    const half = () => service({ depositMode: "PERCENT_50" });

    it("holds the place with a draft invoice for the deposit, worked out on the server", async () => {
        db.service.findUnique.mockResolvedValue(half());
        await new PublicBookingsService().bookOnline(
            "svc_1",
            input({ pay: "DEPOSIT" }),
            "iphash",
            NOW,
        );
        const data = db.booking.create.mock.calls[0][0].data;
        expect(data.status).toBe("PENDING");
        // The snapshot says only the deposit was asked for: ₹400 of ₹800.
        expect(data.snapshot).toMatchObject({
            service: { priceCents: 80_000, depositMode: "PERCENT_50" },
            deposit: { cents: 40_000 },
        });
        const invoice = db.invoice.create.mock.calls[0][0].data;
        expect(String(invoice.total)).toBe("400.00");
        const line = db.invoiceLine.createMany.mock.calls[0]?.[0]?.data?.[0];
        expect(line?.description).toMatch(/^Deposit for Personal training · /);
    });

    it("pays the whole price now when asked, with no deposit in the snapshot", async () => {
        db.service.findUnique.mockResolvedValue(half());
        await new PublicBookingsService().bookOnline(
            "svc_1",
            input({ pay: "NOW" }),
            "iphash",
            NOW,
        );
        const data = db.booking.create.mock.calls[0][0].data;
        expect(data.snapshot.deposit).toBeUndefined();
        expect(String(db.invoice.create.mock.calls[0][0].data.total)).toBe(
            "800.00",
        );
    });

    it("never books a deposit service to pay at the desk while online can take it, holding nothing", async () => {
        db.service.findUnique.mockResolvedValue(half());
        for (const pay of ["DESK", undefined] as const) {
            await expect(
                new PublicBookingsService().bookOnline(
                    "svc_1",
                    input({ pay }),
                    "iphash",
                    NOW,
                ),
            ).rejects.toMatchObject({
                response: {
                    message:
                        "This takes a deposit when you book. Pay the deposit or the full price online.",
                    field: "pay",
                },
            });
        }
        expect(db.booking.create).not.toHaveBeenCalled();
    });

    it("a full-price deposit is paying now", async () => {
        db.service.findUnique.mockResolvedValue(
            service({ depositMode: "FULL" }),
        );
        await new PublicBookingsService().bookOnline(
            "svc_1",
            input({ pay: "DEPOSIT" }),
            "iphash",
            NOW,
        );
        const data = db.booking.create.mock.calls[0][0].data;
        expect(data.snapshot.deposit).toBeUndefined();
        expect(String(db.invoice.create.mock.calls[0][0].data.total)).toBe(
            "800.00",
        );
    });

    it("refuses a deposit for a service that takes none", async () => {
        await expect(
            new PublicBookingsService().bookOnline(
                "svc_1",
                input({ pay: "DEPOSIT" }),
                "iphash",
                NOW,
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(db.booking.create).not.toHaveBeenCalled();
    });

    it("no provider connected: the deposit isn't taken online, the desk is the way (DEC-089)", async () => {
        db.service.findUnique.mockResolvedValue(half());
        db.merchantPaymentProvider.findFirst.mockResolvedValue(null);
        await expect(
            new PublicBookingsService().bookOnline(
                "svc_1",
                input({ pay: "DEPOSIT" }),
                "iphash",
                NOW,
            ),
        ).rejects.toMatchObject({
            response: {
                message:
                    "This business isn't taking payment online right now. Book it to pay at the desk.",
            },
        });
        expect(db.booking.create).not.toHaveBeenCalled();
    });

    it.each([["DESK" as const], [undefined]])(
        "no provider connected: books a deposit service to pay at the desk (DEC-089), pay %s",
        async (pay) => {
            db.service.findUnique.mockResolvedValue(half());
            db.merchantPaymentProvider.findFirst.mockResolvedValue(null);
            const out = await new PublicBookingsService().bookOnline(
                "svc_1",
                input({ pay }),
                "iphash",
                NOW,
            );
            const data = db.booking.create.mock.calls[0][0].data;
            expect(data).toMatchObject({
                status: "CONFIRMED",
                paidWith: "DESK",
            });
            expect(data.snapshot.deposit).toBeUndefined();
            expect(db.invoice.create).not.toHaveBeenCalled();
            expect(out.payToken).toBeNull();
        },
    );

    it("on a plan without online payments: a deposit service books to pay at the desk, a provider connected or not (R28, DEC-089)", async () => {
        jest.spyOn(planMeter, "enforcedRow").mockImplementation(
            (_org: string, moduleId: string) =>
                Promise.resolve(
                    moduleId === "payments" || moduleId === "subscriptions"
                        ? fakePaymentsRow("free", moduleId)
                        : null,
                ),
        );
        db.service.findUnique.mockResolvedValue(half());
        const out = await new PublicBookingsService().bookOnline(
            "svc_1",
            input({ pay: "DESK" }),
            "iphash",
            NOW,
        );
        const data = db.booking.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ status: "CONFIRMED", paidWith: "DESK" });
        expect(db.invoice.create).not.toHaveBeenCalled();
        expect(out.payToken).toBeNull();
        jest.restoreAllMocks();
    });

    it("fixes the free-cancel deadline when the booking is made", async () => {
        db.bookingRules.findUnique.mockResolvedValue({
            bookAheadDays: null,
            latestBookingMinutes: null,
            freeCancelHours: 24,
        });
        await new PublicBookingsService().bookOnline(
            "svc_1",
            input({ pay: "DESK" }),
            "iphash",
            NOW,
        );
        const data = db.booking.create.mock.calls[0][0].data;
        // Mon 21 Sep 10:00, less 24 hours.
        expect(data.freeCancelUntil.toISOString()).toBe(
            "2026-09-20T10:00:00.000Z",
        );
    });

    it("no free-cancel rule: no deadline, judged later by the start", async () => {
        await new PublicBookingsService().bookOnline(
            "svc_1",
            input({ pay: "DESK" }),
            "iphash",
            NOW,
        );
        expect(db.booking.create.mock.calls[0][0].data.freeCancelUntil).toBe(
            null,
        );
    });

    it("replays a deposit hold to the same request only", async () => {
        db.service.findUnique.mockResolvedValue(half());
        db.booking.findUnique.mockResolvedValue(
            created({
                status: "PENDING",
                holdExpiresAt: new Date(NOW.getTime() + 10 * 60_000),
                snapshot: {
                    service: { name: "Personal training" },
                    deposit: { cents: 40_000 },
                },
            }),
        );
        const svc = new PublicBookingsService();
        const out = await svc.bookOnline(
            "svc_1",
            input({ pay: "DEPOSIT" }),
            "iphash",
            NOW,
        );
        expect(out.payToken).toEqual(expect.any(String));
        await expect(
            svc.bookOnline("svc_1", input({ pay: "NOW" }), "iphash", NOW),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("the page serves each service's deposit, worked out on the server", async () => {
        db.site.findFirst.mockResolvedValue({
            organizationId: "org_1",
            organization: { name: "Kavi Dental" },
        });
        db.service.findMany.mockResolvedValue([
            {
                id: "svc_1",
                name: "Root canal",
                description: null,
                durationMinutes: 60,
                capacity: 1,
                priceCents: 450_000,
                currency: "INR",
                locationType: "IN_PERSON",
                depositMode: "PERCENT_25",
                staffServices: [],
            },
            {
                id: "svc_2",
                name: "Check-up",
                description: null,
                durationMinutes: 30,
                capacity: 1,
                priceCents: 80_000,
                currency: "INR",
                locationType: "IN_PERSON",
                depositMode: "NONE",
                staffServices: [],
            },
        ]);
        const page = await new PublicBookingsService().publicBookingPage(
            "site_1",
        );
        expect(page.services.map((s) => s.depositCents)).toEqual([
            112_500,
            null,
        ]);
    });
});

describe("how people pay when they book (DEC-088)", () => {
    const rules = (bookingPayment: string) => ({
        bookAheadDays: null,
        latestBookingMinutes: null,
        freeCancelHours: null,
        refundInTimeCancels: true,
        bookingPayment,
    });
    const book = (over: Partial<BookInput>) =>
        new PublicBookingsService().bookOnline(
            "svc_1",
            input(over),
            "iphash",
            NOW,
        );

    it("Both, the default, takes pay now and the desk as before", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("BOTH"));
        await book({ pay: "DESK" });
        await book({ pay: "NOW", idempotencyKey: "key_2" });
        expect(db.booking.create).toHaveBeenCalledTimes(2);
    });

    it("at the desk only: refuses pay now, holding nothing", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("DESK"));
        await expect(book({ pay: "NOW" })).rejects.toMatchObject({
            status: 409,
            response: {
                message:
                    "This business takes payment at the desk. Book it to pay at the desk.",
                field: "pay",
            },
        });
        expect(db.booking.create).not.toHaveBeenCalled();
        expect(db.invoice.create).not.toHaveBeenCalled();
    });

    it("at the desk only: a deposit isn't taken online, and the desk books it (DEC-089)", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("DESK"));
        db.service.findUnique.mockResolvedValue(
            service({ depositMode: "PERCENT_50" }),
        );
        await expect(book({ pay: "DEPOSIT" })).rejects.toMatchObject({
            status: 409,
            response: {
                message:
                    "This business takes payment at the desk. Book it to pay at the desk.",
            },
        });
        expect(db.booking.create).not.toHaveBeenCalled();
        await book({ pay: "DESK", idempotencyKey: "key_2" });
        expect(db.booking.create.mock.calls[0][0].data).toMatchObject({
            status: "CONFIRMED",
            paidWith: "DESK",
        });
        expect(db.invoice.create).not.toHaveBeenCalled();
    });

    it("Both with a provider: a deposit service is still never at the desk", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("BOTH"));
        db.service.findUnique.mockResolvedValue(
            service({ depositMode: "PERCENT_50" }),
        );
        await expect(book({ pay: "DESK" })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(db.booking.create).not.toHaveBeenCalled();
    });

    it("online only with no provider: a deposit service can't be booked, the desk refused too", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("ONLINE"));
        db.merchantPaymentProvider.findFirst.mockResolvedValue(null);
        db.service.findUnique.mockResolvedValue(
            service({ depositMode: "PERCENT_50" }),
        );
        await expect(book({ pay: "DEPOSIT" })).rejects.toMatchObject({
            response: {
                message:
                    "This business can't take the deposit online right now. Get in touch with them to book.",
            },
        });
        for (const pay of ["DESK", undefined] as const) {
            await expect(book({ pay })).rejects.toMatchObject({
                response: { field: "pay" },
            });
        }
        expect(db.booking.create).not.toHaveBeenCalled();
    });

    it("at the desk only: books it at the desk", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("DESK"));
        await book({ pay: "DESK" });
        expect(db.booking.create.mock.calls[0][0].data).toMatchObject({
            status: "CONFIRMED",
            paidWith: "DESK",
        });
    });

    it("online only: refuses the desk, and no way given, for a priced service", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("ONLINE"));
        for (const pay of ["DESK", undefined] as const) {
            await expect(book({ pay })).rejects.toMatchObject({
                status: 409,
                response: {
                    message:
                        "This business takes payment online when you book. Pay now to book it.",
                    field: "pay",
                },
            });
        }
        expect(db.booking.create).not.toHaveBeenCalled();
    });

    it("online only: a service with no price books with nothing to pay", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("ONLINE"));
        db.service.findUnique.mockResolvedValue(service({ priceCents: null }));
        await book({ pay: "DESK" });
        expect(db.booking.create).toHaveBeenCalledTimes(1);
    });

    it("online only: pays now", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("ONLINE"));
        const out = await book({ pay: "NOW" });
        expect(out.payToken).toEqual(expect.any(String));
    });

    it("online only with no provider: says get in touch, not the desk", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("ONLINE"));
        db.merchantPaymentProvider.findFirst.mockResolvedValue(null);
        await expect(book({ pay: "NOW" })).rejects.toMatchObject({
            response: {
                message:
                    "This business can't take payment online right now. Get in touch with them to book.",
            },
        });
        expect(db.booking.create).not.toHaveBeenCalled();
    });

    it.each([
        ["BOTH", true],
        ["ONLINE", true],
        ["DESK", false],
    ])(
        "the page offers pay now only when the business allows it: %s",
        async (way, payOnline) => {
            db.bookingRules.findUnique.mockResolvedValue(rules(way));
            db.site.findFirst.mockResolvedValue({
                organizationId: "org_1",
                organization: { name: "Kavi Dental" },
            });
            db.service.findMany.mockResolvedValue([]);
            const page = await new PublicBookingsService().publicBookingPage(
                "site_1",
            );
            expect(page.payOnline).toBe(payOnline);
            expect(page.rules.bookingPayment).toBe(way);
        },
    );

    it("the page never offers pay now without a provider, whatever the rule", async () => {
        db.bookingRules.findUnique.mockResolvedValue(rules("ONLINE"));
        db.merchantPaymentProvider.findFirst.mockResolvedValue(null);
        db.site.findFirst.mockResolvedValue({
            organizationId: "org_1",
            organization: { name: "Kavi Dental" },
        });
        db.service.findMany.mockResolvedValue([]);
        const page = await new PublicBookingsService().publicBookingPage(
            "site_1",
        );
        expect(page.payOnline).toBe(false);
    });
});

describe("pay at the desk (U19)", () => {
    it("books it confirmed, paid at the desk, with no invoice", async () => {
        const out = await new PublicBookingsService().bookOnline(
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
            new PublicBookingsService().bookOnline(
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
        const out = await new PublicBookingsService().publicDays("svc_1", NOW);

        expect(out.kind).toBe("one");
        expect(out.timezone).toBe("UTC");
        expect(out.days).toHaveLength(14);
        expect(out.days[0]!.date).toBe("2026-09-18");
        // Today: 09:00 and 09:30 have started; 10:00, 10:30 and 11:00 are
        // left — the half hours of a one-to-one (DEC-052).
        expect(out.days[0]!.starts.map((s) => s.startAt)).toEqual([
            "2026-09-18T10:00:00.000Z",
            "2026-09-18T10:30:00.000Z",
            "2026-09-18T11:00:00.000Z",
        ]);
        // Sat and Sun: the service has no hours, so no times — but the
        // business isn't closed: it has no opening hours or closure to say
        // so, and the page reads "No times", not "Closed" (UX-054).
        expect(out.days[1]).toMatchObject({
            date: "2026-09-19",
            open: false,
            closed: false,
        });
        expect(out.days[2]).toMatchObject({
            date: "2026-09-20",
            open: false,
            closed: false,
        });
        // Mon: open, and nothing free — Full.
        expect(out.days[3]).toMatchObject({
            date: "2026-09-21",
            open: true,
            starts: [],
        });
        expect(out.days[4]!.starts).toHaveLength(5); // 09:00, 09:30 … 11:00
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
        const out = await new PublicBookingsService().publicDays("svc_1", NOW);
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
        const out = await new PublicBookingsService().publicDays("svc_1", NOW);

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
        const out = await new PublicBookingsService().publicDays("svc_1", NOW);

        // Mon 21 Sep: he works Mondays, so the day is open — and Full.
        expect(out.days[3]).toMatchObject({ open: true, starts: [] });
        // Mon 28 Sep: 06:00, 06:30 … 08:00, with him.
        expect(out.days[10]!.starts).toHaveLength(5);
        expect(out.days[10]!.starts[0]).toMatchObject({
            staffId: "staff_karan",
            staffName: "Karan Mehta",
        });
        expect(JSON.stringify(out)).not.toMatch(/timeOff|reason|off/i);
    });
});

describe("the next two weeks in opening hours (DEC-087)", () => {
    const storeFindMany = prisma.store.findMany as jest.Mock;
    // The shop opens 10:00–18:00 every day; the service's hours are 09:00–12:00.
    beforeEach(() =>
        storeFindMany.mockResolvedValue([
            {
                settings: {
                    openingHours: [
                        "MON",
                        "TUE",
                        "WED",
                        "THU",
                        "FRI",
                        "SAT",
                        "SUN",
                    ].map((day) => ({
                        day,
                        open: "10:00",
                        close: "18:00",
                        closed: false,
                    })),
                },
            },
        ]),
    );
    afterEach(() => storeFindMany.mockResolvedValue([]));

    const monday = (out: { days: { starts: unknown[] }[] }) =>
        out.days[3]!.starts as { startAt: string; only?: string }[];

    it("offers an in-person service only once the shop is open", async () => {
        const out = await new PublicBookingsService().publicDays("svc_1", NOW);
        expect(monday(out).map((s) => s.startAt.slice(11, 16))).toEqual([
            "10:00",
            "10:30",
            "11:00",
        ]);
        expect(monday(out).every((s) => s.only === undefined)).toBe(true);
    });

    it("offers an online service its own hours, uncut", async () => {
        db.service.findUnique.mockResolvedValue(
            service({ locationType: "ONLINE" }),
        );
        const out = await new PublicBookingsService().publicDays("svc_1", NOW);
        expect(monday(out)).toHaveLength(5);
        expect(storeFindMany).not.toHaveBeenCalled();
    });

    it("lists either way's early starts as online only", async () => {
        db.service.findUnique.mockResolvedValue(
            service({ locationType: "EITHER" }),
        );
        const out = await new PublicBookingsService().publicDays("svc_1", NOW);
        expect(
            monday(out).map((s) => [s.startAt.slice(11, 16), s.only ?? null]),
        ).toEqual([
            ["09:00", "ONLINE"],
            ["09:30", "ONLINE"],
            ["10:00", null],
            ["10:30", null],
            ["11:00", null],
        ]);
    });
});

describe("the booking page's read (U19)", () => {
    it("says online booking is paused before the form at the monthly cap (DEC-095)", async () => {
        db.site.findFirst.mockResolvedValue({
            organizationId: "org_1",
            organization: { name: "Pulse Fitness" },
        });
        db.service.findMany.mockResolvedValue([]);
        const room = jest
            .spyOn(planMeter, "hasRoom")
            .mockResolvedValueOnce(false);
        const page = await new PublicBookingsService().publicBookingPage(
            "site_1",
        );
        expect(room).toHaveBeenCalledWith("org_1", "bookings");
        expect(page.paused).toBe(true);
        // A plan that can't be read never pauses the page.
        room.mockRejectedValueOnce(new Error("catalogue down"));
        await expect(
            new PublicBookingsService().publicBookingPage("site_1"),
        ).resolves.toMatchObject({ paused: false });
        room.mockRestore();
    });

    it("is a 404 for a site that is not published", async () => {
        db.site.findFirst.mockResolvedValue(null);
        await expect(
            new PublicBookingsService().publicBookingPage("site_x"),
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
        const page = await new PublicBookingsService().publicBookingPage(
            "site_1",
        );

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
        const [offered, withTimes] = db.service.findMany.mock.calls[0][0].where
            .AND as unknown[];
        expect(offered).toMatchObject({
            organizationId: "org_1",
            status: "ACTIVE",
            // A service hidden from the booking page is left out (E1).
            showOnBookingPage: true,
            OR: [{ siteId: null }, { siteId: "site_1" }],
        });
        // …and one with no times to offer (UX-024): no hours of its own,
        // and no one to take it (a class's instructor gives no hours).
        expect(withTimes).toEqual({
            OR: [
                { availabilityRules: { some: {} } },
                {
                    capacity: 1,
                    staffServices: { some: { staff: { status: "ACTIVE" } } },
                },
            ],
        });
        // Not paused: online booking has room (DEC-095).
        expect(page.paused).toBe(false);
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
        const page = await new PublicBookingsService().publicBookingPage(
            "site_1",
        );
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
        const svc = new PublicBookingsService();
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
            new PublicBookingsService().publicHold("tok", "ip", NOW),
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
        const out = await new PublicBookingsService().releasePublicHold(
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

describe("the hold limits (#508)", () => {
    const at = (ms: number) => new Date(NOW.getTime() + ms);

    beforeEach(() => {
        db.invoice.findUnique.mockResolvedValue({
            source: "BOOKING",
            booking: created({
                status: "PENDING",
                holdExpiresAt: new Date(NOW.getTime() + 15 * 60_000),
            }),
        });
    });

    it("lets five people on one network poll every four seconds", async () => {
        const svc = new PublicBookingsService();
        const tokens = ["t1", "t2", "t3", "t4", "t5"];
        // A minute of polling: 15 reads each, 75 in all.
        for (let ms = 0; ms < 60_000; ms += 4_000) {
            for (const token of tokens) {
                await expect(
                    svc.publicHold(token, "office", at(ms)),
                ).resolves.toMatchObject({ state: "HELD" });
            }
        }
    });

    it("stops one token polled too often, and only that token", async () => {
        const svc = new PublicBookingsService();
        for (let i = 0; i < 40; i++) {
            await svc.publicHold("greedy", "office", at(i));
        }
        await expect(
            svc.publicHold("greedy", "office", at(41)),
        ).rejects.toMatchObject({ status: 429 });
        await expect(
            svc.releasePublicHold("greedy", "office", at(42)),
        ).rejects.toMatchObject({ status: 429 });
        // Someone else paying from the same network is not held up.
        await expect(
            svc.publicHold("patient", "office", at(43)),
        ).resolves.toMatchObject({ state: "HELD" });
    });

    it("stops one address sending many tokens, made-up ones too, at its ceiling", async () => {
        const svc = new PublicBookingsService();
        // Each made-up token is a 404, but it still counts.
        db.invoice.findUnique.mockResolvedValue(null);
        for (let i = 0; i < 150; i++) {
            await expect(
                svc.publicHold(`made_up_${i}`, "scraper", at(i)),
            ).rejects.toBeInstanceOf(NotFoundException);
        }
        // A token never seen before: its own count would be 1.
        await expect(
            svc.publicHold("made_up_new", "scraper", at(151)),
        ).rejects.toMatchObject({ status: 429 });
        expect(db.invoice.findUnique).toHaveBeenCalledTimes(150);
        // Another address is untouched.
        await expect(
            svc.publicHold("made_up_new", "elsewhere", at(152)),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("opens again once the minute has passed", async () => {
        const svc = new PublicBookingsService();
        for (let i = 0; i < 40; i++) {
            await svc.publicHold("greedy", "office", at(i));
        }
        await expect(
            svc.publicHold("greedy", "office", at(61_000)),
        ).resolves.toMatchObject({ state: "HELD" });
    });
});
