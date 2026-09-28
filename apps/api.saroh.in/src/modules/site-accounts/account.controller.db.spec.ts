/**
 * The customer account area over HTTP against a real Postgres (round-2 plan
 * A, A5; ADR-011): Me and its tabs, Home's blocks, the customer's details,
 * receipts and health notes — each only the signed-in customer's own, and
 * all of it dark until `SITE_ACCOUNT_AREA=on`.
 *
 * The app is built as main.ts builds it where it matters (the validation
 * pipe, `OrgRlsInterceptor` and the error envelope). Runs in the integration
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
import {
    AccountHomeService,
    CUSTOMER_NOTES_OPEN,
} from "./account-home.service";
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
        // Health notes open, as they will be once C12 ships; the module's
        // own default (closed) is pinned in site-accounts.module.spec.ts.
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
    serviceId: string;
}

/** A business with a published site and a one-to-one service. */
async function business(
    name: string,
    modules: ("APPOINTMENTS" | "COMMERCE")[],
): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name, slug: `a5-${next()}` },
    });
    const subdomain = `a5x${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: `a5-site-${next()}`,
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
    return {
        organizationId: org.id,
        host: `${subdomain}.saroh.app`,
        siteId: site.id,
        serviceId: service.id,
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

const ME = "/public/site-accounts/me";

describe("the switch", () => {
    it("every account route is a 404 while SITE_ACCOUNT_AREA is off", async () => {
        const biz = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { token } = await signIn(biz.host);
        env.SITE_ACCOUNT_AREA = "off";
        for (const path of [ME, `${ME}/home`, `${ME}/receipts`]) {
            const res = await call("GET", path, { host: biz.host, token });
            expect(res.status).toBe(404);
        }
        env.SITE_ACCOUNT_AREA = undefined;
        expect((await call("GET", ME, { host: biz.host, token })).status).toBe(
            404,
        );
        // Sign-in itself is not behind it.
        expect(
            (
                await call("GET", "/public/site-accounts/session", {
                    host: biz.host,
                    token,
                })
            ).status,
        ).toBe(200);
    });
});

describe("Me", () => {
    it("a clinic's customer sees Appointments offered; a bakery's sees Orders and no Appointments", async () => {
        const clinic = await business("Kavi Dental", ["APPOINTMENTS"]);
        const bakery = await business("Rye & Co.", ["COMMERCE"]);
        const atClinic = await signIn(clinic.host);
        const atBakery = await signIn(bakery.host);

        const c = await call("GET", ME, {
            host: clinic.host,
            token: atClinic.token,
        });
        expect(c.status).toBe(200);
        expect(c.body).toEqual({
            name: null,
            email: atClinic.email,
            phone: null,
            businessName: "Kavi Dental",
            // Only Home and Me have shipped (A5); A6 adds Appointments.
            tabs: [
                { key: "home", label: "Home" },
                { key: "me", label: "Me" },
            ],
            offers: { appointments: true, orders: false, plans: false },
            bookingsLabel: "Appointments",
            healthNotes: true,
        });

        const b = await call("GET", ME, {
            host: bakery.host,
            token: atBakery.token,
        });
        expect(b.body.offers).toEqual({
            appointments: false,
            orders: true,
            plans: false,
        });
    });

    it("a module Saroh hasn't rolled out is not offered, even when the business has it on", async () => {
        const clinic = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { token } = await signIn(clinic.host);
        await prisma.featureFlagOverride.create({
            data: {
                flagKey: "MODULE_APPOINTMENTS",
                organizationId: clinic.organizationId,
                enabled: false,
            },
        });
        const res = await call("GET", ME, { host: clinic.host, token });
        expect(res.body.offers).toMatchObject({ appointments: false });
    });

    it("changes the name and the phone, and refuses an email or a bad phone", async () => {
        const biz = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { token, account } = await signIn(biz.host);

        const saved = await call("PATCH", ME, {
            host: biz.host,
            token,
            body: { name: "  Farah   Khan ", phone: "+91 98765 43210" },
        });
        expect(saved.status).toBe(200);
        expect(saved.body).toMatchObject({
            name: "Farah Khan",
            phone: "+91 98765 43210",
        });
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: account.contactId },
        });
        expect(contact).toMatchObject({
            firstName: "Farah",
            lastName: "Khan",
            phone: "+91 98765 43210",
        });

        const cleared = await call("PATCH", ME, {
            host: biz.host,
            token,
            body: { phone: "" },
        });
        expect(cleared.body).toMatchObject({ phone: null });

        for (const body of [
            { phone: "call me" },
            { email: "new@example.in" },
            { name: "" },
            { contactId: "someone-else" },
        ]) {
            const refused = await call("PATCH", ME, {
                host: biz.host,
                token,
                body,
            });
            expect(refused.status).toBe(400);
        }
    });

    it("needs a session on this very site", async () => {
        const one = await business("Kavi Dental", ["APPOINTMENTS"]);
        const two = await business("Pulse Fitness", ["APPOINTMENTS"]);
        const { token } = await signIn(one.host);
        expect((await call("GET", ME, { host: one.host })).status).toBe(401);
        expect((await call("GET", ME, { host: two.host, token })).status).toBe(
            401,
        );
        expect((await call("GET", ME, { token })).status).toBe(401);
    });
});

describe("Home", () => {
    it("shows the customer's own next booking, classes left, latest orders and plan", async () => {
        const biz = await business("Pulse Fitness", [
            "APPOINTMENTS",
            "COMMERCE",
        ]);
        const { token, account } = await signIn(biz.host);
        const other = await prisma.contact.create({
            data: {
                organizationId: biz.organizationId,
                email: `other-${next()}@example.in`,
                firstName: "Other",
            },
        });
        const soon = new Date(Date.now() + 2 * 86_400_000);
        const later = new Date(Date.now() + 5 * 86_400_000);
        const booking = (
            contactId: string,
            startAt: Date,
            status = "CONFIRMED",
        ) =>
            prisma.booking.create({
                data: {
                    organizationId: biz.organizationId,
                    serviceId: biz.serviceId,
                    contactId,
                    startAt,
                    endAt: new Date(startAt.getTime() + 30 * 60_000),
                    timezone: "Asia/Kolkata",
                    status,
                    snapshot: {},
                    bookerName: "Other Attendee",
                    intakeNote: "STAFF NOTE",
                },
            });
        // Someone else's is sooner; a cancelled one of theirs is sooner too.
        await booking(other.id, new Date(Date.now() + 86_400_000));
        await booking(account.contactId, soon, "CANCELLED");
        const mine = await booking(account.contactId, later);

        const pack = await prisma.classPack.create({
            data: {
                organizationId: biz.organizationId,
                name: "10 classes",
                credits: 10,
                price: "4000",
                currency: "INR",
                validityDays: 90,
            },
        });
        await prisma.packPurchase.create({
            data: {
                organizationId: biz.organizationId,
                packId: pack.id,
                contactId: account.contactId,
                credits: 10,
                price: "4000",
                currency: "INR",
                expiresAt: new Date(Date.now() + 60 * 86_400_000),
            },
        });

        const store = await prisma.store.create({
            data: {
                organizationId: biz.organizationId,
                name: "Pulse shop",
                slug: `a5-store-${next()}`,
            },
        });
        const customer = await prisma.customer.create({
            data: {
                organizationId: biz.organizationId,
                storeId: store.id,
                email: `shopper-${next()}@example.in`,
            },
        });
        await prisma.customerIdentityLink.create({
            data: {
                organizationId: biz.organizationId,
                contactId: account.contactId,
                customerId: customer.id,
            },
        });
        const product = await prisma.product.create({
            data: {
                organizationId: biz.organizationId,
                storeId: store.id,
                name: "Protein bar",
                slug: `bar-${next()}`,
                price: "120",
            },
        });
        await prisma.order.create({
            data: {
                organizationId: biz.organizationId,
                storeId: store.id,
                customerId: customer.id,
                orderId: "1019",
                subtotal: "240",
                total: "240",
                currency: "INR",
                stage: "READY",
                items: {
                    create: {
                        productId: product.id,
                        quantity: 2,
                        price: "120",
                    },
                },
            },
        });

        const plan = await prisma.subscriptionPlan.create({
            data: {
                organizationId: biz.organizationId,
                name: "Unlimited",
                price: "2500",
                currency: "INR",
                interval: "MONTH",
            },
        });
        const periodEnd = new Date(Date.now() + 20 * 86_400_000);
        await prisma.customerSubscription.create({
            data: {
                organizationId: biz.organizationId,
                planId: plan.id,
                contactId: account.contactId,
                price: "2500",
                currency: "INR",
                interval: "MONTH",
                timezone: "Asia/Kolkata",
                anchorAt: new Date(),
                currentPeriodStart: new Date(),
                currentPeriodEnd: periodEnd,
            },
        });

        const res = await call("GET", `${ME}/home`, { host: biz.host, token });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            nextBooking: {
                ok: true,
                value: {
                    ref: mine.id,
                    service: "Check-up",
                    startAt: later.toISOString(),
                    endAt: new Date(
                        later.getTime() + 30 * 60_000,
                    ).toISOString(),
                    timezone: "Asia/Kolkata",
                    staff: null,
                    online: null,
                },
            },
            classes: {
                ok: true,
                value: {
                    membership: null,
                    packs: [
                        expect.objectContaining({
                            name: "10 classes",
                            credits: 10,
                            left: 10,
                        }),
                    ],
                },
            },
            orders: {
                ok: true,
                value: [
                    expect.objectContaining({
                        number: "1019",
                        total: "240.00",
                        open: true,
                        status: "Ready",
                        items: [{ name: "Protein bar", quantity: 2 }],
                    }),
                ],
            },
            plan: {
                ok: true,
                value: expect.objectContaining({
                    name: "Unlimited",
                    price: "2500.00",
                    status: "ACTIVE",
                    renewsAt: periodEnd.toISOString(),
                }),
            },
        });
        const text = JSON.stringify(res.body);
        expect(text).not.toContain("Other Attendee");
        expect(text).not.toContain("STAFF NOTE");
        expect(text).not.toContain(biz.organizationId);
        expect(text).not.toContain(account.contactId);
    });

    it("a block whose read fails says so, never zero", async () => {
        const biz = await business("Rye & Co.", ["COMMERCE"]);
        const { token } = await signIn(biz.host);
        const failing = jest
            .spyOn(AccountHomeService.prototype, "latestOrders")
            .mockRejectedValueOnce(new Error("database went away"));
        try {
            const res = await call("GET", `${ME}/home`, {
                host: biz.host,
                token,
            });
            expect(res.status).toBe(200);
            expect(res.body.orders).toEqual({ ok: false });
            // A bakery takes no bookings: no block at all, not an empty one.
            expect(res.body.nextBooking).toBeNull();
            expect(res.body.plan).toEqual({ ok: true, value: null });
            expect(res.body.classes).toEqual({ ok: true, value: null });
        } finally {
            failing.mockRestore();
        }
    });
});

describe("receipts", () => {
    async function invoice(
        organizationId: string,
        contactId: string,
        number: string,
        status: string,
    ) {
        return prisma.invoice.create({
            data: {
                organizationId,
                contactId,
                number: status === "DRAFT" ? null : number,
                status,
                currency: "INR",
                subtotal: "12000",
                tax: "0",
                total: "12000",
                issuedAt: status === "DRAFT" ? null : new Date(),
                paidAt: status === "PAID" ? new Date() : null,
                billToName: "Farah Khan",
                lines: {
                    create: {
                        organizationId,
                        position: 0,
                        description: "Root canal",
                        quantity: 1,
                        unitPrice: "12000",
                        amount: "12000",
                    },
                },
            },
        });
    }

    it("lists the customer's paid invoices, and opens only their own", async () => {
        const biz = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { token, account } = await signIn(biz.host);
        const other = await prisma.contact.create({
            data: {
                organizationId: biz.organizationId,
                email: `other-${next()}@example.in`,
            },
        });
        const paid = await invoice(
            biz.organizationId,
            account.contactId,
            "KD-0001",
            "PAID",
        );
        await invoice(
            biz.organizationId,
            account.contactId,
            "KD-0002",
            "ISSUED",
        );
        await invoice(biz.organizationId, account.contactId, "", "DRAFT");
        const theirs = await invoice(
            biz.organizationId,
            other.id,
            "KD-0003",
            "PAID",
        );

        const list = await call("GET", `${ME}/receipts`, {
            host: biz.host,
            token,
        });
        expect(list.status).toBe(200);
        expect(list.body).toEqual([
            expect.objectContaining({
                ref: paid.id,
                number: "KD-0001",
                total: "12000.00",
            }),
        ]);

        const one = await call("GET", `${ME}/receipts/${paid.id}`, {
            host: biz.host,
            token,
        });
        expect(one.status).toBe(200);
        expect(one.body).toMatchObject({
            businessName: "Kavi Dental",
            number: "KD-0001",
            status: "PAID",
            total: "12000.00",
            lines: [expect.objectContaining({ description: "Root canal" })],
        });

        const notMine = await call("GET", `${ME}/receipts/${theirs.id}`, {
            host: biz.host,
            token,
        });
        expect(notMine.status).toBe(404);
    });
});

describe("health notes", () => {
    it("a note arrives as a sensitive suggestion from the customer, and lists as sent", async () => {
        const biz = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { token, account } = await signIn(biz.host);
        // A staff entry on the same record is never shown to the customer.
        await prisma.contactAttention.create({
            data: {
                organizationId: biz.organizationId,
                contactId: account.contactId,
                kind: "MEDICAL",
                label: "Anxious patient",
                detail: "staff wording",
            },
        });

        const added = await call("POST", `${ME}/notes`, {
            host: biz.host,
            token,
            body: { text: "I started taking blood thinners" },
        });
        expect(added.status).toBe(201);
        expect(added.body).toMatchObject({
            text: "I started taking blood thinners",
            state: "SENT",
        });
        const row = await prisma.contactAttention.findFirstOrThrow({
            where: { contactId: account.contactId, source: "CUSTOMER" },
        });
        expect(row).toMatchObject({
            status: "SUGGESTED",
            sensitive: true,
            kind: "OTHER",
            label: "I started taking blood thinners",
            createdByUserId: null,
        });

        const list = await call("GET", `${ME}/notes`, {
            host: biz.host,
            token,
        });
        expect(list.body).toEqual([
            expect.objectContaining({
                text: "I started taking blood thinners",
                state: "SENT",
            }),
        ]);
        expect(JSON.stringify(list.body)).not.toContain("staff wording");
    });

    it("refuses an empty note and an eleventh one waiting", async () => {
        const biz = await business("Kavi Dental", ["APPOINTMENTS"]);
        const { token } = await signIn(biz.host);
        const empty = await call("POST", `${ME}/notes`, {
            host: biz.host,
            token,
            body: { text: "   " },
        });
        expect(empty.status).toBe(400);
        for (let i = 0; i < 10; i += 1) {
            const ok = await call("POST", `${ME}/notes`, {
                host: biz.host,
                token,
                body: { text: `Note ${i}` },
            });
            expect(ok.status).toBe(201);
        }
        const eleventh = await call("POST", `${ME}/notes`, {
            host: biz.host,
            token,
            body: { text: "One more" },
        });
        expect(eleventh.status).toBe(409);
    });
});
