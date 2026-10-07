/**
 * Booking as a signed-in customer, over HTTP against a real Postgres (round-2
 * plan A, A9; ADR-011): sign in through the relay, book on the business's
 * site, and the booking lands on the account's contact with the account on
 * it. The same person can't hold one session twice; a token from another
 * site or another business's service gets nowhere; and "This isn't them"
 * moves a booking the account made (the `unlink-plan.ts` mover).
 *
 * The app is built as main.ts builds it where it matters (the validation
 * pipe, `OrgRlsInterceptor` and the error envelope). Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { validationPipeOptions } from "../../common/validation";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { isReservedContactEmail } from "../contacts/contact-email";
import { AccountBookingsController } from "./account-bookings.controller";
import { AccountUnlinkService } from "./account-unlink.service";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CUSTOMER_SESSION_HEADER } from "./customer-session.guard";
import { SiteAccountsModule } from "./site-accounts.module";
import { signSiteRelay, SITE_RELAY_HEADER } from "./site-relay";
import { siteRelaySecret } from "./site-secrets";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

/** Mondays: one-to-ones 06:00–09:00 UTC, and a class at 07:00. */
const MONDAY = 1;

function nextMonday(hour: number, weeksOut = 1): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(hour);
    return d;
}

const sent: { to: string; code: string }[] = [];
let app: INestApplication;
let url: string;

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        imports: [SiteAccountsModule],
        controllers: [AccountBookingsController],
        providers: [
            {
                provide: PublicBookingsService,
                // Generous: these tests book many times from one address.
                useValue: new PublicBookingsService(
                    new FixedWindowRateLimiter(1_000),
                ),
            },
        ],
    })
        .overrideProvider(SiteCodeDelivery)
        .useFactory({
            factory: (alerts: SiteCodeAlerts) =>
                new SiteCodeDelivery(
                    alerts,
                    (to, details) => {
                        sent.push({ to, code: details.code });
                        return Promise.resolve("sent");
                    },
                    [0, 0],
                ),
            inject: [SiteCodeAlerts],
        })
        .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    app.useGlobalInterceptors(new OrgRlsInterceptor());
    // The error envelope the site's server reads (`{ error: { details } }`).
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
});

afterAll(async () => {
    await app?.close();
});

interface Business {
    organizationId: string;
    host: string;
    siteId: string;
    oneToOne: string;
    yoga: string;
}

/** A business with a published site, a one-to-one and a class. */
async function business(name = "Kavi Dental"): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name, slug: `a9-${next()}` },
    });
    const subdomain = `a9x${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: `a9-site-${next()}`,
            subdomain,
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            snapshot: { pages: [] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    const service = (input: {
        name: string;
        capacity: number;
        from: number;
        to: number;
        minutes: number;
    }) =>
        prisma.service.create({
            data: {
                organizationId: org.id,
                name: input.name,
                durationMinutes: input.minutes,
                capacity: input.capacity,
                timezone: "UTC",
                availabilityRules: {
                    create: {
                        organizationId: org.id,
                        dayOfWeek: MONDAY,
                        startMinute: input.from * 60,
                        endMinute: input.to * 60,
                    },
                },
            },
        });
    const oneToOne = await service({
        name: "Check-up",
        capacity: 1,
        from: 6,
        to: 9,
        minutes: 60,
    });
    const yoga = await service({
        name: "Morning yoga",
        capacity: 5,
        from: 7,
        to: 8,
        minutes: 60,
    });
    return {
        organizationId: org.id,
        host: `${subdomain}.saroh.app`,
        siteId: site.id,
        oneToOne: oneToOne.id,
        yoga: yoga.id,
    };
}

async function call(
    method: string,
    path: string,
    input: { host?: string; token?: string; body?: unknown },
) {
    const headers: Record<string, string> = { accept: "application/json" };
    if (input.host) {
        headers[SITE_RELAY_HEADER] = signSiteRelay(
            { address: "203.0.113.9", host: input.host },
            siteRelaySecret(),
        );
    }
    if (input.token) headers[CUSTOMER_SESSION_HEADER] = input.token;
    if (input.body) headers["content-type"] = "application/json";
    const res = await fetch(`${url}${path}`, {
        method,
        headers,
        body: input.body ? JSON.stringify(input.body) : undefined,
    });
    const text = await res.text();
    return {
        status: res.status,
        body: (text ? JSON.parse(text) : null) as Record<string, unknown>,
    };
}

/** Sign in through the real routes: ask for a code, then trade it. */
async function signIn(host: string, who = `person-${next()}@example.in`) {
    const asked = await call("POST", "/public/site-accounts/codes", {
        host,
        body: { email: who },
    });
    expect(asked.status).toBe(202);
    const code = sent.filter((s) => s.to === who).at(-1)?.code;
    const verified = await call("POST", "/public/site-accounts/sessions", {
        host,
        body: { email: who, code },
    });
    expect(verified.status).toBe(201);
    const account = await prisma.customerAccount.findFirstOrThrow({
        where: { email: who },
    });
    return { email: who, token: verified.body.token as string, account };
}

function book(
    biz: Business,
    token: string,
    body: Record<string, unknown>,
    host = biz.host,
) {
    return call("POST", "/public/site-accounts/bookings", {
        host,
        token,
        body: { idempotencyKey: `key-${next()}`, pay: "DESK", ...body },
    });
}

function errorOf(body: Record<string, unknown>) {
    return body.error as {
        message: string;
        details?: { reason?: string };
    };
}

describe("booking signed in on the business's site", () => {
    it("books on the account's contact, names the account, and fills in a name the contact lacked", async () => {
        const biz = await business();
        const { email, token, account } = await signIn(biz.host);
        const at = nextMonday(6);

        const res = await book(biz, token, {
            serviceId: biz.oneToOne,
            startAt: at.toISOString(),
            bookerName: "Farah Khan",
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            state: "CONFIRMED",
            serviceName: "Check-up",
            startAt: at.toISOString(),
            payToken: null,
        });
        const booking = await prisma.booking.findFirstOrThrow({
            where: { serviceId: biz.oneToOne },
        });
        expect(booking).toMatchObject({
            contactId: account.contactId,
            customerAccountId: account.id,
            bookerEmail: email,
            bookerName: "Farah Khan",
            paidWith: "DESK",
            status: "CONFIRMED",
        });
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: account.contactId },
        });
        expect(contact).toMatchObject({
            firstName: "Farah",
            lastName: "Khan",
        });
        // No second contact was found or made by the email.
        expect(
            await prisma.contact.count({
                where: { organizationId: biz.organizationId },
            }),
        ).toBe(1);
    });

    it("keeps the name the contact already has, whatever the page sent", async () => {
        const biz = await business();
        const { token, account } = await signIn(biz.host);
        await prisma.contact.update({
            where: { id: account.contactId },
            data: { firstName: "Asha", lastName: "Rao", phone: "+91 98450" },
        });

        const res = await book(biz, token, {
            serviceId: biz.oneToOne,
            startAt: nextMonday(7).toISOString(),
            bookerName: "Someone Else",
        });

        expect(res.status).toBe(201);
        const booking = await prisma.booking.findFirstOrThrow({
            where: { serviceId: biz.oneToOne },
        });
        expect(booking.bookerName).toBe("Asha Rao");
        expect(booking.bookerPhone).toBe("+91 98450");
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: account.contactId },
        });
        expect(contact.firstName).toBe("Asha");
    });

    it("books a separate contact on its own record, with the verified email on the booking", async () => {
        const biz = await business();
        const who = `farah-${next()}@example.in`;
        // Staff typed this email: unverified, so sign-in makes a separate
        // contact with a placeholder email (DEC-049).
        const farah = await prisma.contact.create({
            data: {
                organizationId: biz.organizationId,
                email: who,
                firstName: "Farah",
            },
        });
        const { token, account } = await signIn(biz.host, who);
        expect(account.contactId).not.toBe(farah.id);

        const res = await book(biz, token, {
            serviceId: biz.oneToOne,
            startAt: nextMonday(8).toISOString(),
        });

        expect(res.status).toBe(201);
        const booking = await prisma.booking.findFirstOrThrow({
            where: { serviceId: biz.oneToOne },
        });
        expect(booking.contactId).toBe(account.contactId);
        expect(booking.bookerEmail).toBe(who);
        const separate = await prisma.contact.findUniqueOrThrow({
            where: { id: account.contactId },
        });
        expect(isReservedContactEmail(separate.email)).toBe(true);
        expect(
            await prisma.booking.count({ where: { contactId: farah.id } }),
        ).toBe(0);
    });

    it("refuses the same person twice in one class: 409 'You're already booked for this.'", async () => {
        const biz = await business();
        const { token } = await signIn(biz.host);
        const at = nextMonday(7).toISOString();

        const first = await book(biz, token, {
            serviceId: biz.yoga,
            startAt: at,
        });
        expect(first.status).toBe(201);
        const again = await book(biz, token, {
            serviceId: biz.yoga,
            startAt: at,
        });

        expect(again.status).toBe(409);
        expect(errorOf(again.body)).toMatchObject({
            message: "You're already booked for this.",
            details: { reason: "already-booked" },
        });
        expect(
            await prisma.booking.count({ where: { serviceId: biz.yoga } }),
        ).toBe(1);
    });

    it("counts a booking staff made for the same contact, and not a cancelled one", async () => {
        const biz = await business();
        const { token, account } = await signIn(biz.host);
        const at = nextMonday(7);
        const byStaff = await prisma.booking.create({
            data: {
                organizationId: biz.organizationId,
                serviceId: biz.yoga,
                contactId: account.contactId,
                startAt: at,
                endAt: new Date(at.getTime() + 3_600_000),
                timezone: "UTC",
                snapshot: {},
            },
        });

        const refused = await book(biz, token, {
            serviceId: biz.yoga,
            startAt: at.toISOString(),
        });
        expect(refused.status).toBe(409);

        await prisma.booking.update({
            where: { id: byStaff.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        const booked = await book(biz, token, {
            serviceId: biz.yoga,
            startAt: at.toISOString(),
        });
        expect(booked.status).toBe(201);
    });

    it("lets two different people into the same class", async () => {
        const biz = await business();
        const a = await signIn(biz.host);
        const b = await signIn(biz.host);
        const at = nextMonday(7).toISOString();

        expect(
            (await book(biz, a.token, { serviceId: biz.yoga, startAt: at }))
                .status,
        ).toBe(201);
        expect(
            (await book(biz, b.token, { serviceId: biz.yoga, startAt: at }))
                .status,
        ).toBe(201);
    });

    it("two tabs racing for one class: one booking, and the other is told they're booked", async () => {
        const biz = await business();
        const { token } = await signIn(biz.host);
        const at = nextMonday(7).toISOString();

        const results = await Promise.all([
            book(biz, token, { serviceId: biz.yoga, startAt: at }),
            book(biz, token, { serviceId: biz.yoga, startAt: at }),
        ]);

        expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
        const refused = results.find((r) => r.status === 409)!;
        expect(errorOf(refused.body).details?.reason).toBe("already-booked");
        expect(
            await prisma.booking.count({ where: { serviceId: biz.yoga } }),
        ).toBe(1);
    });

    it("answers a retry with the same key with the booking it made", async () => {
        const biz = await business();
        const { token } = await signIn(biz.host);
        const body = {
            serviceId: biz.oneToOne,
            startAt: nextMonday(6).toISOString(),
            idempotencyKey: `retry-${next()}`,
        };

        const first = await book(biz, token, body);
        const retry = await book(biz, token, body);

        expect(first.status).toBe(201);
        expect(retry.status).toBe(201);
        expect(retry.body.reference).toBe(first.body.reference);
        expect(
            await prisma.booking.count({ where: { serviceId: biz.oneToOne } }),
        ).toBe(1);
    });

    /** A live, unpaid pay-now hold on the account's contact (U19). */
    function holdFor(
        biz: Business,
        contactId: string,
        at: Date,
        customerAccountId: string | null,
    ) {
        return prisma.booking.create({
            data: {
                organizationId: biz.organizationId,
                serviceId: biz.oneToOne,
                contactId,
                customerAccountId,
                startAt: at,
                endAt: new Date(at.getTime() + 3_600_000),
                timezone: "UTC",
                snapshot: {},
                status: "PENDING",
                holdExpiresAt: new Date(Date.now() + 10 * 60_000),
            },
        });
    }

    it("booking again over their own unpaid hold lets the hold go and books it (K-2)", async () => {
        const biz = await business();
        const { token, account } = await signIn(biz.host);
        const at = nextMonday(6);
        const hold = await holdFor(biz, account.contactId, at, account.id);

        // A one-to-one of one place: the hold would otherwise fill it.
        const res = await book(biz, token, {
            serviceId: biz.oneToOne,
            startAt: at.toISOString(),
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ state: "CONFIRMED" });
        await expect(
            prisma.booking.findUniqueOrThrow({ where: { id: hold.id } }),
        ).resolves.toMatchObject({ status: "CANCELLED" });
        expect(
            await prisma.booking.count({
                where: { serviceId: biz.oneToOne, status: "CONFIRMED" },
            }),
        ).toBe(1);
    });

    it("a hold on their contact made without the account still reads as already booked (K-2)", async () => {
        const biz = await business();
        const { token, account } = await signIn(biz.host);
        const at = nextMonday(7);
        const hold = await holdFor(biz, account.contactId, at, null);

        const res = await book(biz, token, {
            serviceId: biz.oneToOne,
            startAt: at.toISOString(),
        });

        expect(res.status).toBe(409);
        expect(errorOf(res.body).details?.reason).toBe("already-booked");
        await expect(
            prisma.booking.findUniqueOrThrow({ where: { id: hold.id } }),
        ).resolves.toMatchObject({ status: "PENDING" });
    });

    it("someone else's unpaid hold is left alone: the time is gone (K-2)", async () => {
        const biz = await business();
        const a = await signIn(biz.host);
        const b = await signIn(biz.host);
        const at = nextMonday(8);
        const hold = await holdFor(biz, a.account.contactId, at, a.account.id);

        const res = await book(biz, b.token, {
            serviceId: biz.oneToOne,
            startAt: at.toISOString(),
        });

        expect(res.status).toBe(409);
        expect(errorOf(res.body).details?.reason).not.toBe("already-booked");
        await expect(
            prisma.booking.findUniqueOrThrow({ where: { id: hold.id } }),
        ).resolves.toMatchObject({ status: "PENDING" });
    });

    it("a slot someone else took is the time gone, not 'already booked'", async () => {
        const biz = await business();
        const a = await signIn(biz.host);
        const b = await signIn(biz.host);
        const at = nextMonday(6).toISOString();

        await book(biz, a.token, { serviceId: biz.oneToOne, startAt: at });
        const taken = await book(biz, b.token, {
            serviceId: biz.oneToOne,
            startAt: at,
        });

        expect(taken.status).toBe(409);
        expect(errorOf(taken.body).details?.reason).not.toBe("already-booked");
    });
});

describe("who may book signed in", () => {
    it("refuses a call with no session, and one with no relay", async () => {
        const biz = await business();
        const body = {
            serviceId: biz.oneToOne,
            startAt: nextMonday(6).toISOString(),
            pay: "DESK",
        };
        const noSession = await call("POST", "/public/site-accounts/bookings", {
            host: biz.host,
            body,
        });
        expect(noSession.status).toBe(401);

        const { token } = await signIn(biz.host);
        const noRelay = await call("POST", "/public/site-accounts/bookings", {
            token,
            body,
        });
        expect(noRelay.status).toBe(401);
        expect(
            await prisma.booking.count({ where: { serviceId: biz.oneToOne } }),
        ).toBe(0);
    });

    it("refuses a token from another site: 401", async () => {
        const kavi = await business("Kavi Dental");
        const pulse = await business("Pulse Fitness");
        const { token } = await signIn(kavi.host);

        const res = await book(
            pulse,
            token,
            { serviceId: pulse.oneToOne, startAt: nextMonday(6).toISOString() },
            pulse.host,
        );

        expect(res.status).toBe(401);
        expect(
            await prisma.booking.count({
                where: { serviceId: pulse.oneToOne },
            }),
        ).toBe(0);
    });

    it("treats another business's service as missing: 404", async () => {
        const kavi = await business("Kavi Dental");
        const pulse = await business("Pulse Fitness");
        const { token } = await signIn(kavi.host);

        const res = await book(kavi, token, {
            serviceId: pulse.oneToOne,
            startAt: nextMonday(6).toISOString(),
        });

        expect(res.status).toBe(404);
        expect(
            await prisma.booking.count({
                where: { serviceId: pulse.oneToOne },
            }),
        ).toBe(0);
    });

    it("keeps a phone they gave on the booking, and gives it to a record that has none (UX-049)", async () => {
        const biz = await business();
        const { token, account } = await signIn(biz.host);
        const res = await book(biz, token, {
            serviceId: biz.oneToOne,
            startAt: nextMonday(8).toISOString(),
            bookerPhone: "+91 98450 12345",
        });
        expect(res.status).toBe(201);
        const booking = await prisma.booking.findFirstOrThrow({
            where: { serviceId: biz.oneToOne },
        });
        expect(booking).toMatchObject({
            bookerPhone: "+91 98450 12345",
            bookedOnline: true,
        });
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: account.contactId },
        });
        expect(contact.phone).toBe("+91 98450 12345");

        // A record that has a phone keeps it.
        await prisma.contact.update({
            where: { id: account.contactId },
            data: { phone: "+91 80 0000 0000" },
        });
        const again = await book(biz, token, {
            serviceId: biz.oneToOne,
            startAt: nextMonday(9).toISOString(),
            bookerPhone: "+91 70000 00000",
        });
        expect(again.status).toBe(201);
        expect(
            (
                await prisma.contact.findUniqueOrThrow({
                    where: { id: account.contactId },
                })
            ).phone,
        ).toBe("+91 80 0000 0000");
    });

    it("refuses a phone that isn't one: 400", async () => {
        const biz = await business();
        const { token } = await signIn(biz.host);
        const res = await book(biz, token, {
            serviceId: biz.oneToOne,
            startAt: nextMonday(6).toISOString(),
            bookerPhone: "call me maybe",
        });
        expect(res.status).toBe(400);
    });

    it("takes no email or business from the body: 400", async () => {
        const biz = await business();
        const { token } = await signIn(biz.host);

        const res = await book(biz, token, {
            serviceId: biz.oneToOne,
            startAt: nextMonday(6).toISOString(),
            bookerEmail: "someone-else@example.in",
        });

        expect(res.status).toBe(400);
    });
});

describe("a class credit online, over HTTP (A10)", () => {
    /** A 5-class pack for the business's class, sold to this contact. */
    async function packFor(biz: Business, contactId: string, credits = 5) {
        const pack = await prisma.classPack.create({
            data: {
                organizationId: biz.organizationId,
                name: `${credits} classes`,
                credits,
                validityDays: 90,
                price: "2000",
                currency: "INR",
                services: {
                    create: {
                        organizationId: biz.organizationId,
                        serviceId: biz.yoga,
                    },
                },
            },
        });
        return prisma.packPurchase.create({
            data: {
                organizationId: biz.organizationId,
                packId: pack.id,
                contactId,
                credits,
                price: "2000",
                currency: "INR",
                expiresAt: new Date(Date.now() + 90 * 86_400_000),
            },
        });
    }

    function creditRead(biz: Business, token: string, startAt: Date) {
        const q = new URLSearchParams({
            serviceId: biz.yoga,
            startAt: startAt.toISOString(),
        });
        return call("GET", `/public/site-accounts/bookings/credit?${q}`, {
            host: biz.host,
            token,
        });
    }

    it("offers the pack, and books the class with it: 201, paid with the pack", async () => {
        const biz = await business("Pulse Fitness");
        const { token, account } = await signIn(biz.host);
        const purchase = await packFor(biz, account.contactId);
        const at = nextMonday(7);

        const offered = await creditRead(biz, token, at);
        expect(offered.status).toBe(200);
        expect(offered.body.credit).toMatchObject({
            kind: "PACK",
            id: purchase.id,
            name: "5 classes",
            left: 5,
        });

        const res = await book(biz, token, {
            serviceId: biz.yoga,
            startAt: at.toISOString(),
            pay: "CREDIT",
            packPurchaseId: purchase.id,
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ state: "CONFIRMED", payToken: null });
        const booking = await prisma.booking.findFirstOrThrow({
            where: { serviceId: biz.yoga, customerAccountId: account.id },
            include: { packRedemption: true },
        });
        expect(booking.paidWith).toBe("PACK");
        expect(booking.packRedemption?.purchaseId).toBe(purchase.id);
        expect((await creditRead(biz, token, at)).body.credit).toMatchObject({
            left: 4,
        });
    });

    it("answers someone else's pack with a 404 the page reads as credit-gone", async () => {
        const biz = await business("Pulse Fitness");
        const other = await signIn(biz.host);
        const purchase = await packFor(biz, other.account.contactId);
        const { token } = await signIn(biz.host);

        const res = await book(biz, token, {
            serviceId: biz.yoga,
            startAt: nextMonday(7).toISOString(),
            pay: "CREDIT",
            packPurchaseId: purchase.id,
        });

        expect(res.status).toBe(404);
        expect(errorOf(res.body).details?.reason).toBe("credit-gone");
    });

    it("reads no credit without a session, and none for another business's service", async () => {
        const kavi = await business("Kavi Dental");
        const pulse = await business("Pulse Fitness");
        const { token } = await signIn(kavi.host);

        const q = new URLSearchParams({
            serviceId: pulse.yoga,
            startAt: nextMonday(7).toISOString(),
        });
        const noSession = await call(
            "GET",
            `/public/site-accounts/bookings/credit?${q}`,
            { host: kavi.host },
        );
        expect(noSession.status).toBe(401);
        const elsewhere = await call(
            "GET",
            `/public/site-accounts/bookings/credit?${q}`,
            { host: kavi.host, token },
        );
        expect(elsewhere.status).toBe(404);
    });
});

describe("'This isn't them' after booking signed in", () => {
    it("moves the booking the account made, and leaves the one staff made", async () => {
        const biz = await business();
        const owner = await prisma.user.create({
            data: { email: `a9-owner-${next()}@example.com` },
        });
        const who = `farah-${next()}@example.in`;
        // Verified by an earlier code, so the sign-in links to Farah.
        const farah = await prisma.contact.create({
            data: {
                organizationId: biz.organizationId,
                email: who,
                firstName: "Farah",
                emailVerifiedAt: new Date(Date.now() - 86_400_000),
                emailVerifiedVia: "SIGN_IN_CODE",
            },
        });
        const at = nextMonday(7);
        const byStaff = await prisma.booking.create({
            data: {
                organizationId: biz.organizationId,
                serviceId: biz.yoga,
                contactId: farah.id,
                startAt: nextMonday(7, 2),
                endAt: new Date(nextMonday(7, 2).getTime() + 3_600_000),
                timezone: "UTC",
                snapshot: {},
            },
        });
        const { token, account } = await signIn(biz.host, who);
        expect(account.contactId).toBe(farah.id);
        const booked = await book(biz, token, {
            serviceId: biz.yoga,
            startAt: at.toISOString(),
        });
        expect(booked.status).toBe(201);

        const unlinking = new AccountUnlinkService();
        const ctx = {
            organizationId: biz.organizationId,
            userId: owner.id,
            role: "OWNER" as const,
        };
        const preview = await unlinking.preview(ctx, farah.id);
        expect(preview.sentence).toBe(
            "1 booking they made online move with them.",
        );
        const result = await unlinking.unlink(ctx, farah.id);

        const online = await prisma.booking.findFirstOrThrow({
            where: { customerAccountId: account.id },
        });
        expect(online.contactId).toBe(result.contactId);
        expect(
            (
                await prisma.booking.findUniqueOrThrow({
                    where: { id: byStaff.id },
                })
            ).contactId,
        ).toBe(farah.id);
        expect(result.moves).toEqual([
            { key: "bookings", count: 1, label: "1 booking" },
        ]);
    });

    it("moves the invoice billing that booking, and its credit note, so Spent follows (review C-1)", async () => {
        const biz = await business();
        const owner = await prisma.user.create({
            data: { email: `a9-owner-${next()}@example.com` },
        });
        const who = `zoya-${next()}@example.in`;
        const zoya = await prisma.contact.create({
            data: {
                organizationId: biz.organizationId,
                email: who,
                firstName: "Zoya",
                emailVerifiedAt: new Date(Date.now() - 86_400_000),
                emailVerifiedVia: "SIGN_IN_CODE",
            },
        });
        const byStaff = await prisma.booking.create({
            data: {
                organizationId: biz.organizationId,
                serviceId: biz.yoga,
                contactId: zoya.id,
                startAt: nextMonday(7, 2),
                endAt: new Date(nextMonday(7, 2).getTime() + 3_600_000),
                timezone: "UTC",
                snapshot: {},
            },
        });
        const { token, account } = await signIn(biz.host, who);
        const booked = await book(biz, token, {
            serviceId: biz.yoga,
            startAt: nextMonday(7).toISOString(),
        });
        expect(booked.status).toBe(201);
        const online = await prisma.booking.findFirstOrThrow({
            where: { customerAccountId: account.id },
        });

        const invoice = (data: Record<string, unknown>) =>
            prisma.invoice.create({
                data: {
                    organizationId: biz.organizationId,
                    contactId: zoya.id,
                    status: "PAID",
                    currency: "INR",
                    subtotal: "500",
                    total: "500",
                    ...data,
                },
            });
        const paid = await invoice({ bookingId: online.id, source: "BOOKING" });
        const credit = await invoice({
            kind: "CREDIT_NOTE",
            relatedInvoiceId: paid.id,
            status: "ISSUED",
            subtotal: "100",
            total: "100",
        });
        const staffs = await invoice({ bookingId: byStaff.id });
        const handWritten = await invoice({});

        const unlinking = new AccountUnlinkService();
        const ctx = {
            organizationId: biz.organizationId,
            userId: owner.id,
            role: "OWNER" as const,
        };
        const preview = await unlinking.preview(ctx, zoya.id);
        expect(preview.sentence).toBe(
            "1 booking and 2 invoices they made online move with them.",
        );
        const result = await unlinking.unlink(ctx, zoya.id);
        expect(result.moves).toEqual([
            { key: "bookings", count: 1, label: "1 booking" },
            { key: "invoices", count: 2, label: "2 invoices" },
        ]);

        const contactOf = async (id: string) =>
            (await prisma.invoice.findUniqueOrThrow({ where: { id } }))
                .contactId;
        expect(await contactOf(paid.id)).toBe(result.contactId);
        expect(await contactOf(credit.id)).toBe(result.contactId);
        expect(await contactOf(staffs.id)).toBe(zoya.id);
        expect(await contactOf(handWritten.id)).toBe(zoya.id);
    });
});
