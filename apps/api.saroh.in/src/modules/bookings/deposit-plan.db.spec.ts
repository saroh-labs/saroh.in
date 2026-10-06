/**
 * Deposits and the plan against a real Postgres (6 Oct 2026: "Online needs
 * a paid plan; Free takes money offline"; `deposit-plan.ts`). A deposit is
 * taken online, so setting one needs the plan's `payments` row — checked
 * where it is set, on the service — and never where the customer pays: a
 * service that keeps a stored deposit on a plan without online payments
 * books at the desk like one with none, and its deposit is kept for an
 * upgrade. The same whenever the business can't take money online for any
 * reason: Payments switched off, or no provider connected. With
 * `PLAN_ENFORCEMENT` off the plan changes nothing.
 *
 * The services run as the API builds them; `planMeter` reads the real
 * switch, turned on per business (an override). Catalogue rows are made up
 * (`fakePaymentsCatalog`). Runs in the integration project
 * (TEST_DATABASE_URL), plain and RLS.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBusinessDetails } from "../../../test/business-details";
import { fakePaymentsCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { MODULE_LOCKED } from "../billing/plan-limit-errors";
import { FlagKey } from "../feature-flags/flags";
import { encryptSecret } from "../payments/crypto";
import { BookingsService } from "./bookings.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";

const tag = `${process.pid}-${Date.now()}`;
const V = 840_000 + Math.floor(Math.random() * 9_000);
const MINUTE = 60_000;
let seq = 0;
const uniq = (p: string) => `${p}-${++seq}-${tag}`;

const bookings = new BookingsService();
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);

interface Business {
    orgId: string;
    owner: OrganizationContext;
}

async function planRow(planId: string) {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: V,
                interval: "month",
            },
        },
    });
}

/**
 * A business on `planId`@V, its owner, details, the switch and — unless
 * `provider` is false — a provider that can open the checkout.
 */
async function business(
    planId: string,
    enforce = true,
    provider = true,
): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: uniq("deposit-plan") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    await prisma.subscription.create({
        data: {
            organizationId: org.id,
            planId: (await planRow(planId)).id,
            status: "ACTIVE",
        },
    });
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.PLAN_ENFORCEMENT },
        create: { key: FlagKey.PLAN_ENFORCEMENT, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: FlagKey.PLAN_ENFORCEMENT,
            organizationId: org.id,
            enabled: enforce,
        },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    await giveBusinessDetails(org.id);
    if (!provider) {
        return {
            orgId: org.id,
            owner: { organizationId: org.id, userId: user.id, role: "OWNER" },
        };
    }
    // A provider that can open the checkout, so only the plan decides.
    const sealed = encryptSecret(
        JSON.stringify({ keyId: "rzp_test_Dep1", keySecret: "dep-secret" }),
    );
    await prisma.merchantPaymentProvider.create({
        data: {
            organizationId: org.id,
            provider: "RAZORPAY",
            status: "CONNECTED",
            publicKey: "rzp_test_Dep1",
            encryptedCredentials: sealed.ciphertext,
            credentialsIv: sealed.iv,
            credentialsAuthTag: sealed.authTag,
        },
    });
    return {
        orgId: org.id,
        owner: { organizationId: org.id, userId: user.id, role: "OWNER" },
    };
}

/** A priced service, open every day 09:00–18:00 UTC, stored as given. */
async function rootCanal(
    b: Business,
    depositMode: "NONE" | "PERCENT_50" = "NONE",
): Promise<string> {
    return (
        await prisma.service.create({
            data: {
                organizationId: b.orgId,
                name: "Root canal",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 80_000,
                currency: "INR",
                timezone: "UTC",
                depositMode,
                availabilityRules: {
                    create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                        organizationId: b.orgId,
                        dayOfWeek,
                        startMinute: 9 * 60,
                        endMinute: 18 * 60,
                    })),
                },
            },
        })
    ).id;
}

/** Three days out, 10:00 UTC: inside the hours. */
function start(): string {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 3);
    return d.toISOString();
}

function book(serviceId: string, pay: "DESK" | "DEPOSIT" | "NOW") {
    return publicBookings.bookOnline(
        serviceId,
        {
            startAt: start(),
            bookerName: "Meera Iyer",
            bookerEmail: `${uniq("meera")}@example.in`,
            idempotencyKey: uniq("key"),
            pay,
        },
        "ip_1",
    );
}

async function locked(p: Promise<unknown>) {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
        details: { code: MODULE_LOCKED, moduleId: "payments" },
    });
}

beforeAll(async () => {
    const catalog = fakePaymentsCatalog();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog,
        goLiveAt: new Date(Date.now() - 24 * 60 * MINUTE),
        policy: "keep",
        planRows: planRows(catalog, V),
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("setting a deposit needs online payments on the plan (DB)", () => {
    it("refuses one on a plan without them, at create and at update", async () => {
        const b = await business("free");

        await locked(
            bookings.createService(b.owner, {
                name: "Root canal",
                durationMinutes: 60,
                timezone: "UTC",
                priceCents: 80_000,
                currency: "INR",
                depositMode: "PERCENT_50",
            }),
        );
        const id = await rootCanal(b);
        await locked(
            bookings.updateService(b.owner, id, { depositMode: "FULL" }),
        );
        expect(
            (await prisma.service.findUniqueOrThrow({ where: { id } }))
                .depositMode,
        ).toBe("NONE");
    });

    it("always takes a deposit off, and keeps one a downgraded service has", async () => {
        const b = await business("free");
        const id = await rootCanal(b, "PERCENT_50");

        // Editing anything else, or saving the deposit it has, goes on.
        await expect(
            bookings.updateService(b.owner, id, {
                name: "Root canal, first visit",
                depositMode: "PERCENT_50",
            }),
        ).resolves.toMatchObject({ depositMode: "PERCENT_50" });
        await expect(
            bookings.updateService(b.owner, id, { depositMode: "NONE" }),
        ).resolves.toMatchObject({ depositMode: "NONE" });
    });

    it("sets one on a plan with them, and with PLAN_ENFORCEMENT off", async () => {
        for (const b of [
            await business("grow"),
            await business("free", false),
        ]) {
            const id = await rootCanal(b);
            await expect(
                bookings.updateService(b.owner, id, {
                    depositMode: "PERCENT_50",
                }),
            ).resolves.toMatchObject({
                depositMode: "PERCENT_50",
                depositCents: 40_000,
            });
        }
    });
});

describe("a stored deposit never makes a service unbookable (DB)", () => {
    it("books at the desk on a plan without online payments, keeping the deposit", async () => {
        const b = await business("free");
        const id = await rootCanal(b, "PERCENT_50");

        // Online can't take it: the deposit is paid at the desk instead.
        await expect(book(id, "DEPOSIT")).rejects.toThrow(
            "Book it to pay at the desk",
        );
        const { booking, payToken } = await book(id, "DESK");
        expect(payToken).toBeNull();
        const row = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(row).toMatchObject({ status: "CONFIRMED", paidWith: "DESK" });
        // Paid at the desk (DEC-089): nothing was taken online.
        expect(
            await prisma.invoice.count({ where: { bookingId: booking.id } }),
        ).toBe(0);
        // The service keeps its deposit: it returns on an upgrade.
        expect(
            (await prisma.service.findUniqueOrThrow({ where: { id } }))
                .depositMode,
        ).toBe("PERCENT_50");
    });

    it("takes the deposit online as before on a plan with online payments", async () => {
        const b = await business("grow");
        const id = await rootCanal(b, "PERCENT_50");

        await expect(book(id, "DESK")).rejects.toBeInstanceOf(
            BadRequestException,
        );
        const { booking, payToken } = await book(id, "DEPOSIT");
        expect(payToken).toEqual(expect.any(String));
        const row = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(row.status).toBe("PENDING");
        expect(row.snapshot).toMatchObject({ deposit: { cents: 40_000 } });
    });
});

describe("a stored deposit when money can't be taken online for another reason (DB)", () => {
    /** Book it at the desk; the deposit is refused, and the row keeps it. */
    async function booksAtTheDesk(b: Business) {
        const id = await rootCanal(b, "PERCENT_50");

        // Online can't take it: the deposit is paid at the desk instead.
        await expect(book(id, "DEPOSIT")).rejects.toThrow(
            "Book it to pay at the desk",
        );
        const { booking, payToken } = await book(id, "DESK");
        expect(payToken).toBeNull();
        const row = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(row).toMatchObject({ status: "CONFIRMED", paidWith: "DESK" });
        // Paid at the desk (DEC-089): nothing was taken online.
        expect(
            (await prisma.service.findUniqueOrThrow({ where: { id } }))
                .depositMode,
        ).toBe("PERCENT_50");
    }

    it("books at the desk on a plan with online payments when Payments is switched off", async () => {
        const b = await business("grow");
        await prisma.organizationModule.create({
            data: {
                organizationId: b.orgId,
                moduleKey: "PAYMENTS",
                status: "DISABLED",
            },
        });
        await booksAtTheDesk(b);
    });

    it("books at the desk on a plan with online payments when no provider is connected", async () => {
        await booksAtTheDesk(await business("grow", true, false));
    });
});
