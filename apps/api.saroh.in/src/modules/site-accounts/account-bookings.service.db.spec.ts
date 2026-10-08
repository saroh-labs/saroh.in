/**
 * The account's Bookings against a real Postgres (round-2 plan A, A6;
 * ADR-011): Coming up, Past and Cancelled; a customer moving a one-to-one
 * to a free time with the same person, and a class to another session with
 * its credit; cancelling with the free-cancel deadline fixed at booking
 * (DEC-051), the business's refund policy (DEC-058) and never more than was
 * received; a treatment's visits (E9); and never another customer's
 * booking. The workspace's history reads "by the customer" (no actor).
 *
 * Over HTTP where the guard and the answers' shape matter; on the service,
 * with a chosen `now`, where the clock does. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { validationPipeOptions } from "../../common/validation";
import { env } from "../../env";
import { startTreatmentInTx } from "../bookings/visits";
import type { PaymentsService } from "../payments/payments.service";
import { AccountBookingsTabController } from "./account-bookings-tab.controller";
import type {
    AccountBookingRow,
    AccountBookings,
    AccountCancelResult,
    AccountTimes,
    AccountTreatment,
} from "./account-bookings-view";
import { AccountBookingsService, TIME_WENT } from "./account-bookings.service";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CUSTOMER_SESSION_HEADER } from "./customer-session.guard";
import { EMAIL_CHANGED_SENDER } from "./email-change.service";
import { SiteAccountsModule } from "./site-accounts.module";
import { signSiteRelay, SITE_RELAY_HEADER } from "./site-relay";
import { siteRelaySecret } from "./site-secrets";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** `days` from today at `hour`:00 UTC. */
function dayAt(days: number, hour: number): Date {
    const d = new Date();
    d.setUTCHours(hour, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

const sent: { to: string; code: string }[] = [];
const refundsSent: string[] = [];
/** The provider takes every refund and says it is being confirmed. */
const payments = {
    sendAutomaticRefund: (_org: string, refundId: string) => {
        refundsSent.push(refundId);
        return Promise.resolve({ status: "PENDING", beingConfirmed: true });
    },
} as unknown as PaymentsService;
const service = new AccountBookingsService(payments);

let app: INestApplication;
let url: string;
const originalSwitch = env.SITE_ACCOUNT_AREA;

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        imports: [SiteAccountsModule],
        controllers: [AccountBookingsTabController],
        providers: [{ provide: AccountBookingsService, useValue: service }],
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
        .overrideProvider(EMAIL_CHANGED_SENDER)
        .useValue(() => Promise.resolve("sent"))
        .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    app.useGlobalInterceptors(new OrgRlsInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
});

beforeEach(() => {
    env.SITE_ACCOUNT_AREA = "on";
});

afterAll(async () => {
    env.SITE_ACCOUNT_AREA = originalSwitch;
    await app?.close();
});

interface Clinic {
    organizationId: string;
    host: string;
    storeId: string;
    checkUp: string;
    yoga: string;
    rootCanal: string;
    rao: string;
    mehta: string;
}

/**
 * Kavi Dental: a published site, a storefront, a check-up with Dr. Rao or
 * Dr. Mehta (every day 06:00–18:00 UTC), a yoga class at 07:00 and a
 * three-visit root canal. Free to cancel until 24 hours before.
 */
async function clinic(
    rules: { freeCancelHours?: number; refundInTimeCancels?: boolean } = {},
): Promise<Clinic> {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `a6-${next()}` },
    });
    const organizationId = org.id;
    await prisma.businessProfile.create({
        data: { organizationId, timezone: "UTC" },
    });
    await prisma.bookingRules.create({
        data: {
            organizationId,
            freeCancelHours: rules.freeCancelHours ?? 24,
            refundInTimeCancels: rules.refundInTimeCancels ?? true,
        },
    });
    const subdomain = `a6x${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId,
            name: "Kavi Dental",
            slug: `a6-site-${next()}`,
            subdomain,
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId,
            snapshot: { pages: [] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    await prisma.organizationModule.create({
        data: { organizationId, moduleKey: "COMMERCE", status: "ENABLED" },
    });
    const store = await prisma.store.create({
        data: { organizationId, name: "Clinic", slug: `a6-store-${next()}` },
    });
    const everyDay = (from: number, to: number) =>
        [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            organizationId,
            dayOfWeek,
            startMinute: from * 60,
            endMinute: to * 60,
        }));
    const make = (input: {
        name: string;
        capacity: number;
        from: number;
        to: number;
        visits?: number;
    }) =>
        prisma.service.create({
            data: {
                organizationId,
                name: input.name,
                durationMinutes: 60,
                capacity: input.capacity,
                timezone: "UTC",
                visits: input.visits ?? 1,
                priceCents: 80_000,
                currency: "INR",
                availabilityRules: {
                    create: everyDay(input.from, input.to),
                },
            },
        });
    const checkUp = await make({
        name: "Check-up",
        capacity: 1,
        from: 6,
        to: 18,
    });
    const yoga = await make({
        name: "Morning yoga",
        capacity: 5,
        from: 7,
        to: 8,
    });
    const rootCanal = await make({
        name: "Root canal",
        capacity: 1,
        from: 6,
        to: 18,
        visits: 3,
    });
    const person = async (name: string) => {
        const staff = await prisma.staffMember.create({
            data: { organizationId, name },
        });
        await prisma.staffHours.createMany({
            data: everyDay(6, 18).map((h) => ({ ...h, staffId: staff.id })),
        });
        for (const serviceId of [checkUp.id, rootCanal.id]) {
            await prisma.staffService.create({
                data: { organizationId, staffId: staff.id, serviceId },
            });
        }
        return staff.id;
    };
    return {
        organizationId,
        host: `${subdomain}.saroh.app`,
        storeId: store.id,
        checkUp: checkUp.id,
        yoga: yoga.id,
        rootCanal: rootCanal.id,
        rao: await person("Dr. Rao"),
        mehta: await person("Dr. Mehta"),
    };
}

async function call(
    method: string,
    path: string,
    input: { host?: string; token?: string; body?: unknown } = {},
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
        body: (text ? JSON.parse(text) : null) as unknown,
    };
}

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
    return {
        email: who,
        token: (verified.body as { token: string }).token,
        account,
        ctx: {
            organizationId: account.organizationId,
            contactId: account.contactId,
            accountId: account.id,
        },
    };
}

/** A booking made directly, as the booking page would have made it. */
async function booking(
    c: Clinic,
    contactId: string,
    input: {
        serviceId?: string;
        startAt: Date;
        staffId?: string | null;
        status?: string;
        outcome?: string | null;
        /** Hours before the start it stops being free to cancel. */
        freeHours?: number;
        paidWith?: string | null;
        holdExpiresAt?: Date | null;
    },
) {
    const startAt = input.startAt;
    return prisma.booking.create({
        data: {
            organizationId: c.organizationId,
            serviceId: input.serviceId ?? c.checkUp,
            contactId,
            startAt,
            endAt: new Date(startAt.getTime() + HOUR),
            timezone: "UTC",
            status: input.status ?? "CONFIRMED",
            outcome: input.outcome ?? null,
            staffId:
                input.staffId === undefined ? c.rao : (input.staffId ?? null),
            paidWith: input.paidWith ?? null,
            holdExpiresAt: input.holdExpiresAt ?? null,
            snapshot: { service: { priceCents: 80_000, currency: "INR" } },
            bookerEmail: "farah@example.in",
            bookerName: "Farah Khan",
            intakeNote: "STAFF NOTE: nervous patient",
            freeCancelUntil: new Date(
                startAt.getTime() - (input.freeHours ?? 24) * HOUR,
            ),
        },
    });
}

/** Money paid online for a booking: its paid invoice and the payment. */
async function paidOnline(c: Clinic, bookingId: string, cents: number) {
    const invoice = await prisma.invoice.create({
        data: {
            organizationId: c.organizationId,
            bookingId,
            source: "BOOKING",
            kind: "INVOICE",
            status: "PAID",
            currency: "INR",
            subtotal: String(cents / 100),
            total: String(cents / 100),
            issuedAt: new Date(),
            paidAt: new Date(),
        },
    });
    await prisma.paymentIntent.create({
        data: {
            organizationId: c.organizationId,
            invoiceId: invoice.id,
            provider: "RAZORPAY",
            providerIntentId: `order_${next()}`,
            amountCents: cents,
            currency: "INR",
            status: "SUCCEEDED",
        },
    });
}

/** A pack with a credit spent on the booking. */
async function paidWithPack(c: Clinic, contactId: string, bookingId: string) {
    const pack = await prisma.classPack.create({
        data: {
            organizationId: c.organizationId,
            name: "10 classes",
            credits: 10,
            validityDays: 90,
            price: "5000",
            currency: "INR",
        },
    });
    const purchase = await prisma.packPurchase.create({
        data: {
            organizationId: c.organizationId,
            packId: pack.id,
            contactId,
            credits: 10,
            price: "5000",
            currency: "INR",
            expiresAt: new Date(Date.now() + 90 * DAY),
        },
    });
    await prisma.booking.update({
        where: { id: bookingId },
        data: { paidWith: "PACK" },
    });
    return prisma.packRedemption.create({
        data: {
            organizationId: c.organizationId,
            purchaseId: purchase.id,
            bookingId,
        },
    });
}

const errorOf = (body: unknown) =>
    (body as { error: { message: string; details?: { reason?: string } } })
        .error;

describe("the account's Bookings (A6)", () => {
    it("lists Coming up, Past and Cancelled — never a let-go hold, never another customer's, never staff notes", async () => {
        const c = await clinic();
        const me = await signIn(c.host);
        const other = await signIn(c.host);
        const soon = await booking(c, me.account.contactId, {
            startAt: dayAt(3, 10),
        });
        const later = await booking(c, me.account.contactId, {
            serviceId: c.yoga,
            staffId: null,
            startAt: dayAt(5, 7),
        });
        const done = await booking(c, me.account.contactId, {
            startAt: dayAt(-3, 10),
            outcome: "ATTENDED",
        });
        const missed = await booking(c, me.account.contactId, {
            startAt: dayAt(-5, 10),
            outcome: "NO_SHOW",
        });
        const cancelled = await booking(c, me.account.contactId, {
            startAt: dayAt(4, 12),
            status: "CANCELLED",
        });
        // A pay-now hold let go was never a booking.
        await booking(c, me.account.contactId, {
            startAt: dayAt(4, 14),
            status: "CANCELLED",
            holdExpiresAt: new Date(),
        });
        await booking(c, other.account.contactId, { startAt: dayAt(3, 12) });

        const res = await call("GET", "/public/site-accounts/me/bookings", {
            host: c.host,
            token: me.token,
        });
        expect(res.status).toBe(200);
        const body = res.body as AccountBookings;
        expect(body.comingUp.map((r) => r.ref)).toEqual([soon.id, later.id]);
        expect(body.past.map((r) => [r.ref, r.state])).toEqual([
            [done.id, "attended"],
            [missed.id, "missed"],
        ]);
        expect(body.cancelled.map((r) => [r.ref, r.state])).toEqual([
            [cancelled.id, "cancelled"],
        ]);
        expect(body.comingUp[0]).toMatchObject({
            service: "Check-up",
            serviceRef: c.checkUp,
            staff: "Dr. Rao",
            state: "booked",
            kind: "one",
            visit: null,
            move: "sheet",
            cancel: {
                late: false,
                freeUntil: new Date(
                    soon.startAt.getTime() - 24 * HOUR,
                ).toISOString(),
                money: "none",
                credit: null,
            },
        });
        // A class moves on the booking page.
        expect(body.comingUp[1]).toMatchObject({ kind: "class", move: "page" });
        // Nothing to do with what is over.
        expect(body.past[0]).toMatchObject({ move: null, cancel: null });
        const text = JSON.stringify(body);
        expect(text).not.toContain("STAFF NOTE");
        expect(text).not.toContain("farah@example.in");
    });

    it("moves a check-up to a free time with the same person; the history says by the customer, and the deadline stays", async () => {
        const c = await clinic();
        const me = await signIn(c.host);
        const b = await booking(c, me.account.contactId, {
            startAt: dayAt(3, 10),
        });

        const times = await call(
            "GET",
            `/public/site-accounts/me/bookings/${b.id}/times`,
            { host: c.host, token: me.token },
        );
        expect(times.status).toBe(200);
        const offered = times.body as AccountTimes;
        expect(offered).toMatchObject({
            service: "Check-up",
            staff: "Dr. Rao",
            timezone: "UTC",
        });
        expect(offered.times.length).toBeGreaterThan(0);
        expect(offered.times).not.toContain(b.startAt.toISOString());
        // Every free time, as the booking page offers them (UX-055), in order.
        expect([...offered.times].sort()).toEqual(offered.times);
        const target = dayAt(4, 11).toISOString();

        const moved = await call(
            "POST",
            `/public/site-accounts/me/bookings/${b.id}/move`,
            { host: c.host, token: me.token, body: { startAt: target } },
        );
        expect(moved.status).toBe(200);
        expect(moved.body as AccountBookingRow).toMatchObject({
            ref: b.id,
            startAt: target,
            staff: "Dr. Rao",
        });
        const row = await prisma.booking.findUniqueOrThrow({
            where: { id: b.id },
        });
        expect(row.startAt.toISOString()).toBe(target);
        expect(row.staffId).toBe(c.rao);
        // The deadline fixed at booking never moves (DEC-051).
        expect(row.freeCancelUntil).toEqual(b.freeCancelUntil);
        const event = await prisma.bookingEvent.findFirstOrThrow({
            where: { bookingId: b.id, type: "RESCHEDULED" },
        });
        expect(event).toMatchObject({
            actorUserId: null,
            fromStartAt: b.startAt,
            toStartAt: new Date(target),
        });
    });

    it("refuses a move inside the late window with the sentence, and a time that just went", async () => {
        const c = await clinic({ freeCancelHours: 48 });
        const me = await signIn(c.host);
        const other = await signIn(c.host);
        const late = await booking(c, me.account.contactId, {
            startAt: dayAt(1, 10),
            freeHours: 48,
        });
        for (const [method, path, body] of [
            ["GET", `/public/site-accounts/me/bookings/${late.id}/times`],
            [
                "POST",
                `/public/site-accounts/me/bookings/${late.id}/move`,
                { startAt: dayAt(6, 10).toISOString() },
            ],
        ] as const) {
            const res = await call(method, path, {
                host: c.host,
                token: me.token,
                body,
            });
            expect(res.status).toBe(409);
            expect(errorOf(res.body)).toMatchObject({
                message: "Call Kavi Dental to change this.",
                details: { reason: "late" },
            });
        }
        // The list says so up front.
        const list = await service.list(me.ctx);
        expect(list.comingUp[0]).toMatchObject({
            move: "call",
            cancel: { late: true },
        });

        // Dr. Rao's 11:00 went to someone else meanwhile.
        const mine = await booking(c, me.account.contactId, {
            startAt: dayAt(5, 10),
        });
        await booking(c, other.account.contactId, { startAt: dayAt(6, 11) });
        const res = await call(
            "POST",
            `/public/site-accounts/me/bookings/${mine.id}/move`,
            {
                host: c.host,
                token: me.token,
                body: { startAt: dayAt(6, 11).toISOString() },
            },
        );
        expect(res.status).toBe(409);
        expect(errorOf(res.body)).toMatchObject({
            message: TIME_WENT,
            details: { reason: "slot-taken" },
        });
        const still = await prisma.booking.findUniqueOrThrow({
            where: { id: mine.id },
        });
        expect(still.startAt).toEqual(mine.startAt);
    });

    it("another customer's booking is a 404 — to read, time, move or cancel", async () => {
        const c = await clinic();
        const me = await signIn(c.host);
        const other = await signIn(c.host);
        const theirs = await booking(c, other.account.contactId, {
            startAt: dayAt(3, 10),
        });
        const base = `/public/site-accounts/me/bookings/${theirs.id}`;
        for (const [method, path, body] of [
            ["GET", base],
            ["GET", `${base}/times`],
            ["POST", `${base}/move`, { startAt: dayAt(4, 10).toISOString() }],
            ["POST", `${base}/cancel`],
        ] as const) {
            const res = await call(method, path, {
                host: c.host,
                token: me.token,
                body,
            });
            expect(res.status).toBe(404);
        }
        const row = await prisma.booking.findUniqueOrThrow({
            where: { id: theirs.id },
        });
        expect(row).toMatchObject({
            status: "CONFIRMED",
            startAt: theirs.startAt,
        });
    });

    it("is a 404 while the account area is switched off", async () => {
        const c = await clinic();
        const me = await signIn(c.host);
        env.SITE_ACCOUNT_AREA = "off";
        const res = await call("GET", "/public/site-accounts/me/bookings", {
            host: c.host,
            token: me.token,
        });
        expect(res.status).toBe(404);
    });

    it("a cancel before the deadline gives the pack's class back; after it, the class is kept and the cancel is late", async () => {
        const c = await clinic();
        const me = await signIn(c.host);
        const early = await booking(c, me.account.contactId, {
            serviceId: c.yoga,
            staffId: null,
            startAt: dayAt(4, 7),
        });
        await paidWithPack(c, me.account.contactId, early.id);
        const lateOne = await booking(c, me.account.contactId, {
            serviceId: c.yoga,
            staffId: null,
            startAt: dayAt(5, 7),
        });
        await paidWithPack(c, me.account.contactId, lateOne.id);

        const listed = await service.list(me.ctx);
        expect(
            listed.comingUp.find((r) => r.ref === early.id)?.cancel,
        ).toMatchObject({ late: false, credit: "back", money: "none" });

        const res = await call(
            "POST",
            `/public/site-accounts/me/bookings/${early.id}/cancel`,
            { host: c.host, token: me.token },
        );
        expect(res.status).toBe(200);
        expect(res.body as AccountCancelResult).toMatchObject({
            booking: {
                ref: early.id,
                state: "cancelled",
                cancelledLate: false,
            },
            refund: null,
            kept: null,
            order: false,
        });
        const back = await prisma.packRedemption.findUniqueOrThrow({
            where: { bookingId: early.id },
        });
        expect(back.reversedAt).not.toBeNull();
        const event = await prisma.bookingEvent.findFirstOrThrow({
            where: { bookingId: early.id, type: "CANCELLED" },
        });
        expect(event.actorUserId).toBeNull();

        // Inside the window: the class stays spent, and it says late.
        const now = new Date(lateOne.startAt.getTime() - 2 * HOUR);
        const out = await service.cancel(me.ctx, lateOne.id, now);
        expect(out.booking).toMatchObject({
            state: "cancelled",
            cancelledLate: true,
        });
        const kept = await prisma.packRedemption.findUniqueOrThrow({
            where: { bookingId: lateOne.id },
        });
        expect(kept.reversedAt).toBeNull();

        // Cancelling again changes nothing.
        const again = await service.cancel(me.ctx, lateOne.id, now);
        expect(again).toMatchObject({ refund: null, kept: null });
    });

    it("moved a week out, then cancelled inside the original window: late, and the deposit is kept", async () => {
        const c = await clinic();
        const me = await signIn(c.host);
        const b = await booking(c, me.account.contactId, {
            startAt: dayAt(3, 10),
        });
        await paidOnline(c, b.id, 40_000);

        // Moved a week further out while it was still free to.
        const moveNow = new Date(b.startAt.getTime() - 48 * HOUR);
        await service.move(me.ctx, b.id, dayAt(10, 10).toISOString(), moveNow);
        const moved = await prisma.booking.findUniqueOrThrow({
            where: { id: b.id },
        });
        expect(moved.freeCancelUntil).toEqual(b.freeCancelUntil);

        // Cancelled straight after the original deadline: late, and kept.
        const cancelNow = new Date((b.freeCancelUntil?.getTime() ?? 0) + HOUR);
        const out = await service.cancel(me.ctx, b.id, cancelNow);
        expect(out).toMatchObject({
            booking: { cancelledLate: true },
            refund: null,
            kept: { amount: "400.00", currency: "INR" },
        });
        expect(
            await prisma.paymentRefund.count({
                where: { organizationId: c.organizationId },
            }),
        ).toBe(0);
    });

    it("a cancel in time refunds what was paid online once; a business that doesn't refund keeps it", async () => {
        const c = await clinic();
        const me = await signIn(c.host);
        const b = await booking(c, me.account.contactId, {
            startAt: dayAt(4, 10),
        });
        await paidOnline(c, b.id, 40_000);
        const [row] = (await service.list(me.ctx)).comingUp;
        expect(row?.cancel).toMatchObject({ late: false, money: "refund" });

        const out = await service.cancel(me.ctx, b.id);
        expect(out.refund).toEqual({
            amount: "400.00",
            currency: "INR",
            status: "CONFIRMING",
        });
        const refunds = await prisma.paymentRefund.findMany({
            where: { organizationId: c.organizationId },
        });
        expect(refunds).toHaveLength(1);
        expect(refunds[0]).toMatchObject({
            amountCents: 40_000,
            status: "PENDING",
        });
        expect(refundsSent).toContain(refunds[0]!.id);
        // A second press refunds nothing more.
        await service.cancel(me.ctx, b.id);
        expect(
            await prisma.paymentRefund.count({
                where: { organizationId: c.organizationId },
            }),
        ).toBe(1);

        // The business's policy says not to refund on its own (E30).
        const strict = await clinic({ refundInTimeCancels: false });
        const you = await signIn(strict.host);
        const s = await booking(strict, you.account.contactId, {
            startAt: dayAt(4, 10),
        });
        await paidOnline(strict, s.id, 40_000);
        const [listed] = (await service.list(you.ctx)).comingUp;
        expect(listed?.cancel).toMatchObject({ money: "kept-policy" });
        const kept = await service.cancel(you.ctx, s.id);
        expect(kept).toMatchObject({
            refund: null,
            kept: { amount: "400.00", currency: "INR" },
        });
    });

    it("moves a class to another session, and its pack's class moves with it", async () => {
        const c = await clinic();
        const me = await signIn(c.host);
        const b = await booking(c, me.account.contactId, {
            serviceId: c.yoga,
            staffId: null,
            startAt: dayAt(4, 7),
        });
        const redemption = await paidWithPack(c, me.account.contactId, b.id);
        const res = await call(
            "POST",
            `/public/site-accounts/me/bookings/${b.id}/move`,
            {
                host: c.host,
                token: me.token,
                body: { startAt: dayAt(6, 7).toISOString() },
            },
        );
        expect(res.status).toBe(200);
        const still = await prisma.packRedemption.findUniqueOrThrow({
            where: { id: redemption.id },
        });
        expect(still).toMatchObject({ bookingId: b.id, reversedAt: null });
        // A time the class doesn't run is refused.
        const off = await call(
            "POST",
            `/public/site-accounts/me/bookings/${b.id}/move`,
            {
                host: c.host,
                token: me.token,
                body: { startAt: dayAt(6, 9).toISOString() },
            },
        );
        expect(off.status).toBe(400);
    });
});

describe("a treatment's visits in the account (A6, E9)", () => {
    async function treatment(c: Clinic, contactId: string, accountId: string) {
        const svc = await prisma.service.findUniqueOrThrow({
            where: { id: c.rootCanal },
        });
        const first = await prisma.booking.create({
            data: {
                organizationId: c.organizationId,
                serviceId: c.rootCanal,
                contactId,
                customerAccountId: accountId,
                staffId: c.mehta,
                startAt: dayAt(-7, 10),
                endAt: dayAt(-7, 11),
                timezone: "UTC",
                status: "CONFIRMED",
                outcome: "ATTENDED",
                snapshot: {},
                bookerEmail: "farah@example.in",
                bookerName: "Farah Khan",
            },
        });
        const { orderId } = await prisma.$transaction((tx) =>
            startTreatmentInTx(tx, {
                service: svc,
                booking: first,
                storeId: c.storeId,
            }),
        );
        await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: "PAID" },
        });
        return orderId;
    }

    it("shows Visit N of M, books the next visit with the last visit's person, and cancelling a visit never refunds", async () => {
        const c = await clinic();
        const me = await signIn(c.host);
        const orderId = await treatment(c, me.account.contactId, me.account.id);

        const before = await service.list(me.ctx);
        expect(before.treatments).toHaveLength(1);
        expect(before.treatments[0]).toMatchObject({
            ref: orderId,
            name: "Root canal",
            paid: true,
            done: 1,
            bookNext: 2,
        });
        expect(before.treatments[0]!.visits.map((v) => v.state)).toEqual([
            "done",
            "to-book",
            "to-book",
        ]);

        const times = await call(
            "GET",
            `/public/site-accounts/me/treatments/${orderId}/times`,
            { host: c.host, token: me.token },
        );
        expect(times.status).toBe(200);
        expect(times.body).toMatchObject({ visit: 2, staff: "Dr. Mehta" });

        const at = dayAt(5, 10).toISOString();
        const booked = await call(
            "POST",
            `/public/site-accounts/me/treatments/${orderId}/visits`,
            { host: c.host, token: me.token, body: { startAt: at } },
        );
        expect(booked.status).toBe(201);
        const t = booked.body as AccountTreatment;
        expect(t.visits[1]).toMatchObject({ state: "booked", startAt: at });
        // One visit waiting at a time.
        expect(t.bookNext).toBeNull();
        const visit = await prisma.booking.findFirstOrThrow({
            where: { orderId, visitNumber: 2 },
        });
        expect(visit).toMatchObject({
            contactId: me.account.contactId,
            customerAccountId: me.account.id,
            staffId: c.mehta,
        });
        const again = await call(
            "POST",
            `/public/site-accounts/me/treatments/${orderId}/visits`,
            {
                host: c.host,
                token: me.token,
                body: { startAt: dayAt(6, 10).toISOString() },
            },
        );
        expect(again.status).toBe(409);

        const list = await service.list(me.ctx);
        expect(list.comingUp[0]).toMatchObject({
            ref: visit.id,
            visit: { number: 2, of: 3 },
            cancel: { money: "order" },
        });

        const out = await service.cancel(me.ctx, visit.id);
        expect(out).toMatchObject({ refund: null, kept: null, order: true });
        expect(
            await prisma.paymentRefund.count({
                where: { organizationId: c.organizationId },
            }),
        ).toBe(0);
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
        });
        expect(order.status).not.toBe("CANCELLED");
        // Its number is free to book again.
        expect((await service.list(me.ctx)).treatments[0]?.bookNext).toBe(2);
    });

    it("a visit of a refunded treatment can't be moved, and another customer's treatment is a 404", async () => {
        const c = await clinic();
        const me = await signIn(c.host);
        const other = await signIn(c.host);
        const orderId = await treatment(c, me.account.contactId, me.account.id);
        const visit = await prisma.booking.create({
            data: {
                organizationId: c.organizationId,
                serviceId: c.rootCanal,
                contactId: me.account.contactId,
                staffId: c.mehta,
                startAt: dayAt(5, 10),
                endAt: dayAt(5, 11),
                timezone: "UTC",
                status: "CONFIRMED",
                snapshot: {},
                orderId,
                visitNumber: 2,
            },
        });
        await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: "REFUNDED" },
        });
        const [row] = (await service.list(me.ctx)).comingUp;
        expect(row).toMatchObject({ ref: visit.id, move: null });
        const res = await call(
            "POST",
            `/public/site-accounts/me/bookings/${visit.id}/move`,
            {
                host: c.host,
                token: me.token,
                body: { startAt: dayAt(6, 10).toISOString() },
            },
        );
        expect(res.status).toBe(409);
        expect(errorOf(res.body).message).toBe(
            "This treatment was refunded, so no more visits can be booked.",
        );

        const theirs = await call(
            "GET",
            `/public/site-accounts/me/treatments/${orderId}/times`,
            { host: c.host, token: other.token },
        );
        expect(theirs.status).toBe(404);
    });
});
