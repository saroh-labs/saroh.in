/**
 * How people pay when they book, against a real Postgres (DEC-088, #821,
 * #822): the rule saved and read with the other booking rules, Both for a
 * business that never set it (with or without a rules row), and the
 * booking write refusing a way to pay the business doesn't allow — before
 * anything is held. And the merchant's read of why online can't be taken.
 *
 * Only the app env is stubbed; the provider is the network-free fake.
 * Runs in the integration project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { StaffService } from "../staff/staff.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";
import type { BookInput } from "./reservation";

const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const staff = new StaffService();
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);

let owner: OrganizationContext;
let checkUp: string;
let rootCanal: string;
let keySeq = 0;
let dayOut = 3;

/** A start a day further out each time, at 10:00 UTC, so none clash. */
function nextStart(): string {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d.toISOString();
}

function booking(pay: BookInput["pay"]): BookInput {
    keySeq += 1;
    return {
        startAt: nextStart(),
        bookerName: "Asha Rao",
        bookerEmail: `asha-${keySeq}@example.in`,
        idempotencyKey: `pay-way-${keySeq}`,
        ...(pay ? { pay } : {}),
    };
}

async function service(name: string, depositMode: string): Promise<string> {
    const made = await prisma.service.create({
        data: {
            organizationId: owner.organizationId,
            name,
            durationMinutes: 60,
            capacity: 1,
            priceCents: 80_000,
            currency: "INR",
            timezone: "UTC",
            depositMode,
            availabilityRules: {
                create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                    organizationId: owner.organizationId,
                    dayOfWeek,
                    startMinute: 9 * 60,
                    endMinute: 18 * 60,
                })),
            },
        },
    });
    return made.id;
}

async function setWay(bookingPayment: "ONLINE" | "DESK" | "BOTH") {
    await staff.updateBookingRules(owner, { bookingPayment });
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `pay-way-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `pay-way-${process.pid}@example.in` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    // Connecting a provider needs the details every invoice prints.
    await giveBusinessDetails(org.id);
    checkUp = await service("Check-up", "NONE");
    rootCanal = await service("Root canal", "PERCENT_50");
});

describe("the rule (DEC-088)", () => {
    it("reads Both with no rules row, and with a row that never set it", async () => {
        await expect(staff.getBookingRules(owner)).resolves.toMatchObject({
            bookingPayment: "BOTH",
        });
        await staff.updateBookingRules(owner, { freeCancelHours: 12 });
        const row = await prisma.bookingRules.findUniqueOrThrow({
            where: { organizationId: owner.organizationId },
        });
        expect(row.bookingPayment).toBe("BOTH");
        await expect(staff.getBookingRules(owner)).resolves.toMatchObject({
            freeCancelHours: 12,
            bookingPayment: "BOTH",
        });
    });

    it("saves and reads each way, leaving the other rules as they were", async () => {
        for (const way of ["ONLINE", "DESK", "BOTH"] as const) {
            await expect(
                staff.updateBookingRules(owner, { bookingPayment: way }),
            ).resolves.toMatchObject({
                bookingPayment: way,
                freeCancelHours: 12,
            });
            await expect(staff.getBookingRules(owner)).resolves.toMatchObject({
                bookingPayment: way,
            });
        }
    });
});

describe("the booking write refuses what the business doesn't allow (DEC-088)", () => {
    afterEach(() => setWay("BOTH"));

    it("no provider: says why online can't be taken", async () => {
        await expect(staff.getBookingPayment(owner)).resolves.toEqual({
            bookingPayment: "BOTH",
            onlineBlocker: "NO_PROVIDER",
        });
    });

    it("at the desk only: refuses pay now and books nothing", async () => {
        await setWay("DESK");
        const before = await prisma.booking.count({
            where: { organizationId: owner.organizationId },
        });
        await expect(
            publicBookings.bookOnline(checkUp, booking("NOW"), undefined),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            publicBookings.bookOnline(rootCanal, booking("DEPOSIT"), undefined),
        ).rejects.toMatchObject({
            response: {
                message:
                    "This business can't take the deposit online right now. Get in touch with them to book.",
            },
        });
        expect(
            await prisma.booking.count({
                where: { organizationId: owner.organizationId },
            }),
        ).toBe(before);
        const desk = await publicBookings.bookOnline(
            checkUp,
            booking("DESK"),
            undefined,
        );
        expect(desk.booking).toMatchObject({
            status: "CONFIRMED",
            paidWith: "DESK",
        });
    });

    it("online only: refuses the desk, and no way given", async () => {
        await setWay("ONLINE");
        for (const pay of ["DESK", undefined] as const) {
            await expect(
                publicBookings.bookOnline(checkUp, booking(pay), undefined),
            ).rejects.toMatchObject({
                response: {
                    message:
                        "This business takes payment online when you book. Pay now to book it.",
                    field: "pay",
                },
            });
        }
    });

    it("online only with a provider: pays now, holding the place", async () => {
        await payments.connectProvider(owner, {
            provider: "RAZORPAY",
            publicKey: "rzp_test_PayWay1",
            keyId: "rzp_test_PayWay1",
            keySecret: "rzp_secret",
            webhookSecret: "whsec_pay_way",
        });
        await setWay("ONLINE");
        await expect(staff.getBookingPayment(owner)).resolves.toEqual({
            bookingPayment: "ONLINE",
            onlineBlocker: null,
        });
        const out = await publicBookings.bookOnline(
            checkUp,
            booking("NOW"),
            undefined,
        );
        expect(out.booking.status).toBe("PENDING");
        expect(out.payToken).toEqual(expect.any(String));
    });
});
