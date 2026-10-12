/**
 * The rest of what a customer sees in their account, over HTTP against a
 * real Postgres (DEC-142; ADR-011): what changed since they were last here,
 * their open invoices and "Pay now", their places in a class's line, their
 * courses, and whether the business may email them — each only the
 * signed-in customer's own, and all of it dark until `SITE_ACCOUNT_AREA=on`.
 *
 * The app is built as main.ts builds it where it matters (the validation
 * pipe, `OrgRlsInterceptor` and the error envelope). Open invoices are
 * served by `SubscriptionsModule`, so their read and their pay link are
 * asked of the service here, in the business's RLS context. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import type { INestApplication } from "@nestjs/common";
import { NotFoundException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, runInOrgContext } from "@saroh/database";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { validationPipeOptions } from "../../common/validation";
import { env } from "../../env";
import type { InvoicesService } from "../invoices/invoices.service";
import { ACCOUNT_CONSENT_SOURCE } from "./account-details-reads";
import { CUSTOMER_NOTES_OPEN } from "./account-home.service";
import { AccountInvoicesService } from "./account-invoices.controller";
import { VISIT_GAP_MS } from "./account-visit";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CUSTOMER_SESSION_HEADER } from "./customer-session.guard";
import { EMAIL_CHANGED_SENDER } from "./email-change.service";
import { SiteAccountsModule } from "./site-accounts.module";
import { signSiteRelay, SITE_RELAY_HEADER } from "./site-relay";
import { siteRelaySecret } from "./site-secrets";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const sent: { to: string; code: string }[] = [];
let app: INestApplication;
let url: string;
const originalSwitch = env.SITE_ACCOUNT_AREA;

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        imports: [SiteAccountsModule],
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
        .overrideProvider(CUSTOMER_NOTES_OPEN)
        .useValue(true)
        .overrideProvider(EMAIL_CHANGED_SENDER)
        .useValue(() => Promise.resolve("sent"))
        .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    app.useGlobalInterceptors(new OrgRlsInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();

    // Saroh has rolled Appointments and Sell out (DEC-057); each business
    // below turns on its own.
    for (const key of ["MODULE_APPOINTMENTS", "MODULE_COMMERCE"]) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: true },
            update: { enabledByDefault: true },
        });
    }
});

beforeEach(() => {
    env.SITE_ACCOUNT_AREA = "on";
});

afterAll(async () => {
    env.SITE_ACCOUNT_AREA = originalSwitch;
    await app?.close();
});

interface Business {
    organizationId: string;
    host: string;
    siteId: string;
    /** A one-to-one. */
    serviceId: string;
    /** A class of eight. */
    classId: string;
}

/** A business with a published site, a one-to-one service and a class. */
async function business(
    name: string,
    modules: ("APPOINTMENTS" | "COMMERCE")[],
): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name, slug: `d142-${next()}` },
    });
    const subdomain = `d142x${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: `d142-site-${next()}`,
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
    for (const moduleKey of modules) {
        await prisma.organizationModule.create({
            data: { organizationId: org.id, moduleKey, status: "ENABLED" },
        });
    }
    const service = await prisma.service.create({
        data: {
            organizationId: org.id,
            name: "Check-up",
            durationMinutes: 30,
            capacity: 1,
            timezone: "Asia/Kolkata",
        },
    });
    const group = await prisma.service.create({
        data: {
            organizationId: org.id,
            name: "Morning flow",
            durationMinutes: 60,
            capacity: 8,
            timezone: "Asia/Kolkata",
        },
    });
    return {
        organizationId: org.id,
        host: `${subdomain}.saroh.app`,
        siteId: site.id,
        serviceId: service.id,
        classId: group.id,
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
        body: (text ? JSON.parse(text) : null) as Record<string, unknown>,
    };
}

/** Sign in through the real routes: ask for a code, then trade it. */
async function signIn(host: string, who = `person-${next()}@example.com`) {
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

const ME = "/public/site-accounts/me";
const DAY = 86_400_000;

/** Another person of the same business. */
function someoneElse(organizationId: string) {
    return prisma.contact.create({
        data: {
            organizationId,
            email: `other-${next()}@example.com`,
            firstName: "Other",
            lastName: "Attendee",
        },
    });
}

function invoice(
    organizationId: string,
    contactId: string,
    number: string,
    over: {
        status?: string;
        issuedAt?: Date;
        dueAt?: Date | null;
        kind?: string;
    } = {},
) {
    const status = over.status ?? "ISSUED";
    return prisma.invoice.create({
        data: {
            organizationId,
            contactId,
            number: status === "DRAFT" ? null : number,
            status,
            kind: over.kind ?? "INVOICE",
            currency: "INR",
            subtotal: "2500",
            tax: "0",
            total: "2500",
            issuedAt: status === "DRAFT" ? null : (over.issuedAt ?? new Date()),
            dueAt: over.dueAt ?? null,
            paidAt: status === "PAID" ? new Date() : null,
            billToName: "Farah Khan",
            paymentNote: "STAFF NOTE: owes money",
            lines: {
                create: {
                    organizationId,
                    position: 0,
                    description: "Unlimited, October",
                    quantity: 1,
                    unitPrice: "2500",
                    amount: "2500",
                },
            },
        },
    });
}

function booking(
    biz: Business,
    contactId: string,
    startAt: Date,
    over: { status?: string; serviceId?: string; outcome?: string } = {},
) {
    return prisma.booking.create({
        data: {
            organizationId: biz.organizationId,
            serviceId: over.serviceId ?? biz.serviceId,
            contactId,
            startAt,
            endAt: new Date(startAt.getTime() + 30 * 60_000),
            timezone: "Asia/Kolkata",
            status: over.status ?? "CONFIRMED",
            outcome: over.outcome ?? null,
            snapshot: {},
            bookerName: "Other Attendee",
            intakeNote: "STAFF NOTE",
        },
    });
}

/** The customer was last on Home `ago` before now, and has been away since. */
async function lastHere(accountId: string, ago: number): Promise<Date> {
    const at = new Date(Date.now() - ago);
    await prisma.customerAccount.update({
        where: { id: accountId },
        data: { lastVisitAt: at, previousVisitAt: null },
    });
    return at;
}

describe("the switch", () => {
    it("every new account route is a 404 while SITE_ACCOUNT_AREA is off", async () => {
        const biz = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { token } = await signIn(biz.host);
        env.SITE_ACCOUNT_AREA = "off";
        for (const path of ["waitlist", "courses", "notifications"]) {
            const res = await call("GET", `${ME}/${path}`, {
                host: biz.host,
                token,
            });
            expect(res.status).toBe(404);
        }
        const write = await call("PATCH", `${ME}/notifications`, {
            host: biz.host,
            token,
            body: { email: false },
        });
        expect(write.status).toBe(404);
    });

    it("each needs a session on this very site", async () => {
        const one = await business("Kavi Dental", ["APPOINTMENTS"]);
        const two = await business("Pulse Fitness", ["APPOINTMENTS"]);
        const { token } = await signIn(one.host);
        for (const path of ["waitlist", "courses", "notifications"]) {
            expect(
                (await call("GET", `${ME}/${path}`, { host: one.host })).status,
            ).toBe(401);
            expect(
                (await call("GET", `${ME}/${path}`, { host: two.host, token }))
                    .status,
            ).toBe(401);
        }
    });
});

describe("since you were last here", () => {
    it("a first visit says nothing changed, and marks the visit", async () => {
        const biz = await business("Rye & Co.", ["COMMERCE"]);
        const { token, account } = await signIn(biz.host);
        const res = await call("GET", `${ME}/home`, { host: biz.host, token });
        expect(res.status).toBe(200);
        expect(res.body.changes).toEqual({ ok: true, value: [] });
        expect(res.body.since).toBeNull();
        const after = await prisma.customerAccount.findUniqueOrThrow({
            where: { id: account.id },
        });
        expect(after.lastVisitAt).not.toBeNull();
        expect(after.previousVisitAt).toBeNull();
    });

    it("says what the business did while they were away, and keeps saying it through the visit", async () => {
        const biz = await business("Pulse Fitness", [
            "APPOINTMENTS",
            "COMMERCE",
        ]);
        const { token, account } = await signIn(biz.host);
        const staff = await prisma.user.create({
            data: { email: `d142-staff-${next()}@example.com` },
        });
        const other = await someoneElse(biz.organizationId);
        const away = await lastHere(account.id, 3 * DAY);
        const before = new Date(away.getTime() - DAY);
        const during = new Date(away.getTime() + DAY);

        // An order of theirs the kitchen moved to Ready while they were away.
        const store = await prisma.store.create({
            data: {
                organizationId: biz.organizationId,
                name: "Pulse shop",
                slug: `d142-store-${next()}`,
            },
        });
        const order = (number: string, accountId: string | null) =>
            prisma.order.create({
                data: {
                    organizationId: biz.organizationId,
                    storeId: store.id,
                    customerAccountId: accountId,
                    orderId: number,
                    subtotal: "240",
                    total: "240",
                    currency: "INR",
                    stage: "READY",
                },
            });
        const mine = await order("1019", account.id);
        const theirs = await order("1020", null);
        const old = await order("1018", account.id);
        const step = (orderId: string, createdAt: Date, undone = false) =>
            prisma.orderEvent.create({
                data: {
                    organizationId: biz.organizationId,
                    orderId,
                    kind: "STAGE",
                    actorUserId: staff.id,
                    fromStage: "PREPARING",
                    toStage: "READY",
                    note: "STAFF NOTE: owes money",
                    createdAt,
                    undoneAt: undone ? createdAt : null,
                },
            });
        await step(mine.id, during);
        // Two steps of one order are one line: where it is now.
        await step(mine.id, new Date(during.getTime() + 60_000));
        await step(theirs.id, during);
        // Before they were last here: not news.
        await step(old.id, before);

        // A booking the business moved, one it cancelled, and one the
        // customer cancelled themselves.
        const moved = await booking(
            biz,
            account.contactId,
            new Date(Date.now() + 4 * DAY),
        );
        const cancelled = await booking(
            biz,
            account.contactId,
            new Date(Date.now() + 5 * DAY),
            { status: "CANCELLED" },
        );
        const own = await booking(
            biz,
            account.contactId,
            new Date(Date.now() + 6 * DAY),
            { status: "CANCELLED" },
        );
        const notMine = await booking(
            biz,
            other.id,
            new Date(Date.now() + 4 * DAY),
        );
        const event = (
            bookingId: string,
            type: string,
            actorUserId: string | null,
        ) =>
            prisma.bookingEvent.create({
                data: {
                    organizationId: biz.organizationId,
                    bookingId,
                    type,
                    actorUserId,
                    fromStartAt: new Date(Date.now() + 2 * DAY),
                    toStartAt:
                        type === "RESCHEDULED"
                            ? new Date(Date.now() + 4 * DAY)
                            : null,
                    createdAt: during,
                },
            });
        await event(moved.id, "RESCHEDULED", staff.id);
        await event(cancelled.id, "CANCELLED", staff.id);
        await event(own.id, "CANCELLED", null);
        await event(notMine.id, "RESCHEDULED", staff.id);

        // The team wrote twice; Saroh's own notice is not a "message".
        const thread = await prisma.customerThread.create({
            data: {
                organizationId: biz.organizationId,
                contactId: account.contactId,
                lastMessageAt: during,
            },
        });
        for (const [author, body] of [
            ["STAFF", "Your order is ready when you are."],
            ["STAFF", "We close at six today."],
            ["SYSTEM", "Order #1019 is ready."],
        ] as const) {
            await prisma.customerThreadMessage.create({
                data: {
                    organizationId: biz.organizationId,
                    threadId: thread.id,
                    author,
                    body,
                    authorUserId: author === "STAFF" ? staff.id : null,
                    createdAt: during,
                },
            });
        }

        // An invoice issued to them since, and one issued to someone else.
        const bill = await invoice(
            biz.organizationId,
            account.contactId,
            "PF-0007",
            { issuedAt: during },
        );
        await invoice(biz.organizationId, other.id, "PF-0008", {
            issuedAt: during,
        });

        const res = await call("GET", `${ME}/home`, { host: biz.host, token });
        expect(res.status).toBe(200);
        expect(res.body.since).toBe(away.toISOString());
        const changes = (
            res.body.changes as { ok: true; value: Record<string, unknown>[] }
        ).value;
        expect(changes).toHaveLength(5);
        expect(changes).toEqual(
            expect.arrayContaining([
                {
                    kind: "order",
                    ref: mine.id,
                    number: "1019",
                    status: "Ready",
                    at: new Date(during.getTime() + 60_000).toISOString(),
                },
                {
                    kind: "booking-moved",
                    ref: moved.id,
                    service: "Check-up",
                    startAt: moved.startAt.toISOString(),
                    timezone: "Asia/Kolkata",
                    at: during.toISOString(),
                },
                expect.objectContaining({
                    kind: "booking-cancelled",
                    ref: cancelled.id,
                }),
                { kind: "messages", count: 2, at: during.toISOString() },
                {
                    kind: "invoice",
                    ref: bill.id,
                    number: "PF-0007",
                    total: "2500.00",
                    currency: "INR",
                    at: during.toISOString(),
                },
            ]),
        );
        // Never another customer's, the customer's own doing, a staff
        // member, a staff note or an internal id.
        // An order that didn't move is on Home's orders, but is not news.
        expect(JSON.stringify(changes)).not.toContain(old.id);
        const text = JSON.stringify(res.body);
        for (const never of [
            theirs.id,
            notMine.id,
            own.id,
            staff.id,
            "STAFF NOTE",
            "Other Attendee",
            "We close at six",
            biz.organizationId,
            account.contactId,
        ]) {
            expect(text).not.toContain(never);
        }

        // A refresh a moment later is the same visit: the same changes.
        const again = await call("GET", `${ME}/home`, {
            host: biz.host,
            token,
        });
        expect(again.body.since).toBe(away.toISOString());
        expect((again.body.changes as { value: unknown[] }).value).toHaveLength(
            5,
        );

        // Away and back again: that visit is now the one counted from.
        await prisma.customerAccount.update({
            where: { id: account.id },
            data: { lastVisitAt: new Date(Date.now() - VISIT_GAP_MS - 1_000) },
        });
        const later = await call("GET", `${ME}/home`, {
            host: biz.host,
            token,
        });
        expect((later.body.changes as { value: unknown[] }).value).toEqual([]);
    });

    it("a message they have opened is no longer news", async () => {
        const biz = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { token, account } = await signIn(biz.host);
        const away = await lastHere(account.id, 2 * DAY);
        const written = new Date(away.getTime() + 60 * 60_000);
        const thread = await prisma.customerThread.create({
            data: {
                organizationId: biz.organizationId,
                contactId: account.contactId,
                lastMessageAt: written,
                // Opened after it was written.
                customerReadAt: new Date(written.getTime() + 60_000),
            },
        });
        await prisma.customerThreadMessage.create({
            data: {
                organizationId: biz.organizationId,
                threadId: thread.id,
                author: "STAFF",
                body: "See you on Friday.",
                createdAt: written,
            },
        });
        const res = await call("GET", `${ME}/home`, { host: biz.host, token });
        expect(res.body.changes).toEqual({ ok: true, value: [] });
    });
});

describe("an account staff haven't linked yet (DEC-049)", () => {
    it("Home says so when the business already held the email unverified, and not otherwise", async () => {
        const biz = await business("Kavi Dental", ["APPOINTMENTS"]);
        const who = `known-${next()}@example.com`;
        // Staff typed this address for a customer; nobody has proven it.
        await prisma.contact.create({
            data: {
                organizationId: biz.organizationId,
                email: who,
                firstName: "Farah",
            },
        });
        const known = await signIn(biz.host, who);
        const fresh = await signIn(biz.host);

        const pending = await call("GET", `${ME}/home`, {
            host: biz.host,
            token: known.token,
        });
        expect(pending.body.linkPending).toBe(true);
        // Nothing of the other record is opened to them.
        expect(JSON.stringify(pending.body)).not.toContain("Farah");

        const plain = await call("GET", `${ME}/home`, {
            host: biz.host,
            token: fresh.token,
        });
        expect(plain.body.linkPending).toBe(false);
    });
});

describe("a class's line", () => {
    it("lists where they wait and a place held for them, never anyone else's", async () => {
        const biz = await business("Pulse Fitness", ["APPOINTMENTS"]);
        const { token, account } = await signIn(biz.host);
        const other = await someoneElse(biz.organizationId);
        const soon = new Date(Date.now() + 2 * DAY);
        const later = new Date(Date.now() + 3 * DAY);
        const past = new Date(Date.now() - DAY);
        const entry = (
            contactId: string,
            startAt: Date,
            position: number,
            over: { status?: string; offeredUntil?: Date } = {},
        ) =>
            prisma.classWaitlistEntry.create({
                data: {
                    organizationId: biz.organizationId,
                    serviceId: biz.classId,
                    startAt,
                    endAt: new Date(startAt.getTime() + 60 * 60_000),
                    contactId,
                    position,
                    status: (over.status ?? "WAITING") as never,
                    offeredUntil: over.offeredUntil ?? null,
                },
            });
        // Someone is ahead of them for the first class.
        await entry(other.id, soon, 1);
        await entry(account.contactId, soon, 2);
        // A place is held for them in the second.
        const until = new Date(Date.now() + 60 * 60_000);
        await entry(account.contactId, later, 1, {
            status: "OFFERED",
            offeredUntil: until,
        });
        // A class that has started, and a line they left: neither shows.
        await entry(account.contactId, past, 1);
        await entry(account.contactId, new Date(Date.now() + 4 * DAY), 1, {
            status: "LEFT",
        });

        const res = await call("GET", `${ME}/waitlist`, {
            host: biz.host,
            token,
        });
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            {
                service: "Morning flow",
                serviceRef: biz.classId,
                startAt: soon.toISOString(),
                timezone: "Asia/Kolkata",
                status: "WAITING",
                placeInLine: 2,
                offeredUntil: null,
            },
            {
                service: "Morning flow",
                serviceRef: biz.classId,
                startAt: later.toISOString(),
                timezone: "Asia/Kolkata",
                status: "OFFERED",
                placeInLine: null,
                offeredUntil: until.toISOString(),
            },
        ]);
        const text = JSON.stringify(res.body);
        expect(text).not.toContain("Other");
        expect(text).not.toContain(other.id);

        // Home carries the same list.
        const home = await call("GET", `${ME}/home`, { host: biz.host, token });
        expect(home.body.waitlist).toEqual({ ok: true, value: res.body });

        // Someone with no place sees none.
        const stranger = await signIn(biz.host);
        const none = await call("GET", `${ME}/waitlist`, {
            host: biz.host,
            token: stranger.token,
        });
        expect(none.body).toEqual([]);
    });
});

describe("courses", () => {
    it("shows their own seat: the course, its dates and their sessions", async () => {
        const biz = await business("Clay Room", ["APPOINTMENTS"]);
        const { token, account } = await signIn(biz.host);
        const other = await someoneElse(biz.organizationId);
        const first = new Date(Date.now() - 7 * DAY);
        const second = new Date(Date.now() + 7 * DAY);
        const third = new Date(Date.now() + 14 * DAY);
        const course = await prisma.course.create({
            data: {
                organizationId: biz.organizationId,
                serviceId: biz.classId,
                name: "Pottery, three weeks",
                price: "6000",
                currency: "INR",
                seats: 8,
                status: "OPEN",
                sessions: {
                    create: [first, second, third].map((startAt) => ({
                        organizationId: biz.organizationId,
                        startAt,
                        endAt: new Date(startAt.getTime() + 60 * 60_000),
                    })),
                },
            },
        });
        const seat = (contactId: string, status = "ACTIVE") =>
            prisma.courseEnrollment.create({
                data: {
                    organizationId: biz.organizationId,
                    courseId: course.id,
                    contactId,
                    price: "6000",
                    currency: "INR",
                    status,
                },
            });
        const mine = await seat(account.contactId);
        const theirs = await seat(other.id);
        const session = (
            enrolmentId: string,
            contactId: string,
            startAt: Date,
            outcome?: string,
        ) =>
            prisma.booking.create({
                data: {
                    organizationId: biz.organizationId,
                    serviceId: biz.classId,
                    contactId,
                    courseEnrollmentId: enrolmentId,
                    startAt,
                    endAt: new Date(startAt.getTime() + 60 * 60_000),
                    timezone: "Asia/Kolkata",
                    status: "CONFIRMED",
                    outcome: outcome ?? null,
                    snapshot: {},
                },
            });
        await session(mine.id, account.contactId, first, "ATTENDED");
        await session(mine.id, account.contactId, second);
        await session(mine.id, account.contactId, third);
        await session(theirs.id, other.id, first, "NO_SHOW");

        const res = await call("GET", `${ME}/courses`, {
            host: biz.host,
            token,
        });
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            {
                ref: mine.id,
                name: "Pottery, three weeks",
                firstAt: first.toISOString(),
                lastAt: third.toISOString(),
                timezone: "Asia/Kolkata",
                sessions: 3,
                attended: 1,
                missed: 0,
                left: 2,
                nextAt: second.toISOString(),
            },
        ]);
        expect(JSON.stringify(res.body)).not.toContain(theirs.id);

        // Someone with no seat sees none; a cancelled seat is not listed.
        const stranger = await signIn(biz.host);
        await seat(stranger.account.contactId, "CANCELLED");
        const none = await call("GET", `${ME}/courses`, {
            host: biz.host,
            token: stranger.token,
        });
        expect(none.body).toEqual([]);
    });
});

describe("whether the business may email them", () => {
    it("is yes until they say no, and their choice is the consent every send checks", async () => {
        const biz = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { token, account } = await signIn(biz.host);
        const other = await someoneElse(biz.organizationId);
        const path = `${ME}/notifications`;

        const start = await call("GET", path, { host: biz.host, token });
        expect(start.status).toBe(200);
        expect(start.body).toEqual({ email: true });

        const off = await call("PATCH", path, {
            host: biz.host,
            token,
            body: { email: false },
        });
        expect(off.status).toBe(200);
        expect(off.body).toEqual({ email: false });
        const row = await prisma.consent.findUniqueOrThrow({
            where: {
                contactId_channel: {
                    contactId: account.contactId,
                    channel: "EMAIL",
                },
            },
        });
        expect(row).toMatchObject({
            organizationId: biz.organizationId,
            status: "REVOKED",
            source: ACCOUNT_CONSENT_SOURCE,
        });
        // Nobody else's consent is touched.
        expect(
            await prisma.consent.count({ where: { contactId: other.id } }),
        ).toBe(0);

        const on = await call("PATCH", path, {
            host: biz.host,
            token,
            body: { email: true },
        });
        expect(on.body).toEqual({ email: true });
        expect(
            (await call("GET", path, { host: biz.host, token })).body,
        ).toEqual({ email: true });
    });

    it("takes a boolean and nothing else: no other channel, no other contact", async () => {
        const biz = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { token } = await signIn(biz.host);
        for (const body of [
            { email: "no" },
            { whatsapp: false },
            { email: false, contactId: "someone-else" },
            { email: false, channel: "WHATSAPP" },
        ]) {
            const refused = await call("PATCH", `${ME}/notifications`, {
                host: biz.host,
                token,
                body,
            });
            expect(refused.status).toBe(400);
        }
    });
});

describe("invoices to pay", () => {
    const madeLinks: string[] = [];
    const invoices = new AccountInvoicesService({
        payLinkForCustomer: (_tx: unknown, _org: string, id: string) => {
            madeLinks.push(id);
            return Promise.resolve({ token: `token-for-${id}` });
        },
    } as unknown as InvoicesService);

    beforeEach(() => {
        madeLinks.length = 0;
    });

    it("lists their open invoices, the one due soonest first, and on Home", async () => {
        const biz = await business("Pulse Fitness", ["APPOINTMENTS"]);
        const { token, account } = await signIn(biz.host);
        const other = await someoneElse(biz.organizationId);
        const org = biz.organizationId;
        const overdue = await invoice(org, account.contactId, "PF-0001", {
            dueAt: new Date(Date.now() - DAY),
        });
        const due = await invoice(org, account.contactId, "PF-0002", {
            dueAt: new Date(Date.now() + 5 * DAY),
        });
        // Paid, draft, a credit note and someone else's: none is theirs to pay.
        await invoice(org, account.contactId, "PF-0003", { status: "PAID" });
        await invoice(org, account.contactId, "", { status: "DRAFT" });
        await invoice(org, account.contactId, "CN-0001", {
            kind: "CREDIT_NOTE",
        });
        const theirs = await invoice(org, other.id, "PF-0004");

        const ctx = {
            organizationId: org,
            contactId: account.contactId,
            accountId: account.id,
        };
        const list = await runInOrgContext(org, () => invoices.list(ctx));
        expect(list).toEqual([
            {
                ref: overdue.id,
                number: "PF-0001",
                what: "Unlimited, October",
                issuedAt: overdue.issuedAt?.toISOString(),
                dueAt: overdue.dueAt?.toISOString(),
                overdue: true,
                total: "2500.00",
                currency: "INR",
                billOfSupply: false,
                // Not GST-registered: no GST words.
                gst: null,
                // No provider is connected: paid with the business directly.
                pay: "direct",
            },
            expect.objectContaining({
                ref: due.id,
                number: "PF-0002",
                overdue: false,
                pay: "direct",
            }),
        ]);
        const text = JSON.stringify(list);
        expect(text).not.toContain(theirs.id);
        expect(text).not.toContain("STAFF NOTE");

        const home = await call("GET", `${ME}/home`, { host: biz.host, token });
        expect(home.body.invoicesDue).toEqual({
            ok: true,
            value: JSON.parse(JSON.stringify(list)),
        });
    });

    it("another customer's invoice, a paid one and one that isn't there are a 404 for Pay now", async () => {
        const biz = await business("Pulse Fitness", ["APPOINTMENTS"]);
        const elsewhere = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { account } = await signIn(biz.host);
        const other = await someoneElse(biz.organizationId);
        const org = biz.organizationId;
        const theirs = await invoice(org, other.id, "PF-0010");
        const paid = await invoice(org, account.contactId, "PF-0011", {
            status: "PAID",
        });
        const stranger = await prisma.contact.create({
            data: {
                organizationId: elsewhere.organizationId,
                email: `far-${next()}@example.com`,
            },
        });
        const foreign = await invoice(
            elsewhere.organizationId,
            stranger.id,
            "KD-0001",
        );
        const ctx = {
            organizationId: org,
            contactId: account.contactId,
            accountId: account.id,
        };
        for (const ref of [theirs.id, paid.id, foreign.id, "nope"]) {
            await expect(
                runInOrgContext(org, () => invoices.payLink(ctx, ref)),
            ).rejects.toBeInstanceOf(NotFoundException);
        }
        // No link was made for any of them.
        expect(madeLinks).toEqual([]);
    });
});
