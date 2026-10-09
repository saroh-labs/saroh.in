/**
 * The account's Orders and Track over HTTP against a real Postgres
 * (round-2 plan A, A7; ADR-011): which orders are the customer's (their
 * contact's identity links, and what the account placed signed in), never
 * an abandoned checkout, never another customer's; each order's steps from
 * its own fulfilment type; a treatment's visits; the receipt; and "This
 * isn't them" moving what the account's orders made.
 *
 * The app is built as main.ts builds it where it matters (the validation
 * pipe, `OrgRlsInterceptor` and the error envelope). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { env } from "../../env";
import { startTreatmentInTx } from "../bookings/visits";
import { AccountOrdersService } from "./account-orders.service";
import { AccountUnlinkService } from "./account-unlink.service";
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
let ownerId = "";
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
        .overrideProvider(EMAIL_CHANGED_SENDER)
        .useValue(() => Promise.resolve("sent"))
        .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    app.useGlobalInterceptors(new OrgRlsInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();

    for (const key of ["MODULE_APPOINTMENTS", "MODULE_COMMERCE"]) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: true },
            update: { enabledByDefault: true },
        });
    }
    ownerId = (
        await prisma.user.create({
            data: { email: `a7-owner-${tag}@example.com` },
        })
    ).id;
});

beforeEach(() => {
    env.SITE_ACCOUNT_AREA = "on";
});

afterAll(async () => {
    env.SITE_ACCOUNT_AREA = originalSwitch;
    await app?.close();
});

interface Shop {
    organizationId: string;
    host: string;
    storeId: string;
    productId: string;
}

/** A bakery with a published site, Sell on, a storefront and a product. */
async function shop(name = "Rye & Co."): Promise<Shop> {
    const org = await prisma.organization.create({
        data: { name, slug: `a7-${next()}` },
    });
    const subdomain = `a7x${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: `a7-site-${next()}`,
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
    await prisma.organizationModule.create({
        data: {
            organizationId: org.id,
            moduleKey: "COMMERCE",
            status: "ENABLED",
        },
    });
    const store = await prisma.store.create({
        data: {
            organizationId: org.id,
            name: "Rye shop",
            slug: `a7-store-${next()}`,
        },
    });
    const product = await prisma.product.create({
        data: {
            organizationId: org.id,
            storeId: store.id,
            name: "Sourdough",
            slug: `sourdough-${next()}`,
            price: "120",
        },
    });
    return {
        organizationId: org.id,
        host: `${subdomain}.saroh.app`,
        storeId: store.id,
        productId: product.id,
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
    };
}

async function storeCustomer(s: Shop, linkTo: string | null) {
    const customer = await prisma.customer.create({
        data: {
            organizationId: s.organizationId,
            storeId: s.storeId,
            email: `shopper-${next()}@example.in`,
        },
    });
    if (linkTo) {
        await prisma.customerIdentityLink.create({
            data: {
                organizationId: s.organizationId,
                contactId: linkTo,
                customerId: customer.id,
            },
        });
    }
    return customer;
}

type OrderInput = Partial<{
    orderId: string;
    customerAccountId: string | null;
    fulfilment: "PICKUP" | "SHIPPING" | "LOCAL_DELIVERY" | "DIGITAL";
    stage:
        | "NEW"
        | "PREPARING"
        | "READY"
        | "COLLECTED"
        | "HANDED_TO_COURIER"
        | "DELIVERED";
    status: string;
    paymentStatus: string;
    placedOnline: boolean;
    courierName: string | null;
    trackingNumber: string | null;
    createdAt: Date;
}>;

function order(s: Shop, customerId: string, input: OrderInput = {}) {
    return prisma.order.create({
        data: {
            organizationId: s.organizationId,
            storeId: s.storeId,
            customerId,
            orderId: input.orderId ?? `ORD-${next()}`,
            subtotal: "240",
            total: "240",
            currency: "INR",
            fulfilment: input.fulfilment ?? "PICKUP",
            stage: input.stage ?? "NEW",
            status: input.status ?? "PENDING",
            paymentStatus: input.paymentStatus ?? "PAID",
            placedOnline: input.placedOnline ?? false,
            customerAccountId: input.customerAccountId ?? null,
            courierName: input.courierName ?? null,
            trackingNumber: input.trackingNumber ?? null,
            notes: "STAFF NOTE: owes money",
            ...(input.createdAt ? { createdAt: input.createdAt } : {}),
            items: {
                create: {
                    productId: s.productId,
                    quantity: 2,
                    price: "120",
                },
            },
        },
    });
}

const ORDERS = "/public/site-accounts/me/orders";

interface Row {
    ref: string;
    number: string;
    status: string;
    open: boolean;
    fulfilment: string;
}

describe("the switch", () => {
    it("the orders routes are a 404 while SITE_ACCOUNT_AREA is off", async () => {
        const s = await shop();
        const { token } = await signIn(s.host);
        env.SITE_ACCOUNT_AREA = "off";
        for (const path of [ORDERS, `${ORDERS}/anything`]) {
            expect(
                (await call("GET", path, { host: s.host, token })).status,
            ).toBe(404);
        }
    });

    it("signed out is a 401", async () => {
        const s = await shop();
        expect((await call("GET", ORDERS, { host: s.host })).status).toBe(401);
    });
});

describe("Orders", () => {
    it("lists the customer's own orders newest first — by link and by account — never an abandoned checkout or someone else's", async () => {
        const s = await shop();
        const { token, account } = await signIn(s.host);
        const mine = await storeCustomer(s, account.contactId);
        // A store customer staff linked to someone else: an order the
        // account placed signed in on it is still the account's.
        const someoneElse = await prisma.contact.create({
            data: {
                organizationId: s.organizationId,
                email: `farah-${next()}@example.in`,
                firstName: "Farah",
            },
        });
        const theirs = await storeCustomer(s, someoneElse.id);

        const t = Date.now();
        const byLink = await order(s, mine.id, {
            orderId: "1019",
            stage: "READY",
            status: "PROCESSING",
            createdAt: new Date(t - 3 * 60_000),
        });
        const signedIn = await order(s, theirs.id, {
            orderId: "1020",
            customerAccountId: account.id,
            placedOnline: true,
            fulfilment: "SHIPPING",
            createdAt: new Date(t - 2 * 60_000),
        });
        // Someone else's order on that same store customer.
        await order(s, theirs.id, { orderId: "1021" });
        // An abandoned checkout of the account's: not an order yet.
        await order(s, mine.id, {
            orderId: "1022",
            customerAccountId: account.id,
            placedOnline: true,
            paymentStatus: "UNPAID",
            createdAt: new Date(t - 60_000),
        });

        const res = await call("GET", ORDERS, { host: s.host, token });
        expect(res.status).toBe(200);
        const rows = res.body as Row[];
        expect(rows.map((r) => r.number)).toEqual(["1020", "1019"]);
        expect(rows.map((r) => r.ref)).toEqual([signedIn.id, byLink.id]);
        expect(rows[1]).toMatchObject({
            status: "Ready",
            open: true,
            fulfilment: "Pick-up",
        });
        expect(rows[0]).toMatchObject({
            status: "New",
            fulfilment: "Shipping",
        });
        expect(JSON.stringify(res.body)).not.toContain("STAFF NOTE");

        // Me shows the Orders tab for a business that sells.
        const me = await call("GET", "/public/site-accounts/me", {
            host: s.host,
            token,
        });
        expect(
            (me.body as { tabs: { key: string }[] }).tabs.map((x) => x.key),
        ).toEqual(["home", "orders", "messages", "me"]);

        // Home's latest orders are the same orders.
        const home = await call("GET", "/public/site-accounts/me/home", {
            host: s.host,
            token,
        });
        const block = (home.body as { orders: { ok: boolean; value: Row[] } })
            .orders;
        expect(block.value.map((r) => r.number)).toEqual(["1020", "1019"]);
    });

    it("an order of another customer in the same business, or of another business, is a 404", async () => {
        const s = await shop();
        const other = await shop("Other bakery");
        const { token } = await signIn(s.host);
        const stranger = await prisma.contact.create({
            data: {
                organizationId: s.organizationId,
                email: `stranger-${next()}@example.in`,
            },
        });
        const theirs = await order(s, (await storeCustomer(s, stranger.id)).id);
        const elsewhere = await order(
            other,
            (await storeCustomer(other, null)).id,
        );

        for (const id of [theirs.id, elsewhere.id, "not-an-order"]) {
            const res = await call("GET", `${ORDERS}/${id}`, {
                host: s.host,
                token,
            });
            expect(res.status).toBe(404);
            expect(JSON.stringify(res.body)).not.toContain("STAFF NOTE");
        }
    });

    it("an abandoned checkout's Track is a 404", async () => {
        const s = await shop();
        const { token, account } = await signIn(s.host);
        const unpaid = await order(
            s,
            (await storeCustomer(s, account.contactId)).id,
            {
                customerAccountId: account.id,
                placedOnline: true,
                paymentStatus: "UNPAID",
            },
        );
        const res = await call("GET", `${ORDERS}/${unpaid.id}`, {
            host: s.host,
            token,
        });
        expect(res.status).toBe(404);
    });
});

describe("Track", () => {
    it("a Shipping order shows the courier and tracking number once they are recorded", async () => {
        const s = await shop();
        const { token, account } = await signIn(s.host);
        const customer = await storeCustomer(s, account.contactId);
        const shipped = await order(s, customer.id, {
            orderId: "1030",
            fulfilment: "SHIPPING",
            stage: "HANDED_TO_COURIER",
            status: "SHIPPED",
        });

        const before = await call("GET", `${ORDERS}/${shipped.id}`, {
            host: s.host,
            token,
        });
        expect(before.status).toBe(200);
        expect(before.body).toMatchObject({
            number: "1030",
            fulfilment: "Shipping",
            state: "open",
            status: "Handed to courier",
            courier: null,
        });

        await prisma.order.update({
            where: { id: shipped.id },
            data: { courierName: "Delhivery", trackingNumber: "DL12345" },
        });
        const after = await call("GET", `${ORDERS}/${shipped.id}`, {
            host: s.host,
            token,
        });
        const body = after.body as {
            courier: unknown;
            steps: { label: string; state: string; line: string }[];
        };
        expect(body.courier).toEqual({
            name: "Delhivery",
            trackingNumber: "DL12345",
            trackingUrl: null,
        });
        expect(body.steps.map((x) => [x.label, x.state])).toEqual([
            ["New", "done"],
            ["Preparing", "done"],
            ["Ready", "done"],
            ["Handed to courier", "now"],
            ["Delivered", "next"],
        ]);
        expect(body.steps[3].line).toBe("Now · Delhivery has it · DL12345");
        expect(JSON.stringify(after.body)).not.toContain("STAFF NOTE");
    });

    it("a refunded order shows every step it reached done and the refund line", async () => {
        const s = await shop();
        const { token, account } = await signIn(s.host);
        const customer = await storeCustomer(s, account.contactId);
        const refunded = await order(s, customer.id, {
            stage: "COLLECTED",
            status: "DELIVERED",
            paymentStatus: "REFUNDED",
        });

        const res = await call("GET", `${ORDERS}/${refunded.id}`, {
            host: s.host,
            token,
        });
        const body = res.body as {
            state: string;
            status: string;
            refund: string;
            steps: { label: string; state: string; line: string }[];
        };
        expect(body).toMatchObject({
            state: "refunded",
            status: "Refunded",
            refund: "Money back in 5–7 days",
        });
        expect(body.steps.every((x) => x.state === "done")).toBe(true);
        expect(body.steps.map((x) => x.label)).toEqual([
            "New",
            "Preparing",
            "Ready",
            "Collected",
            "Refunded",
        ]);
        expect(body.steps.at(-1)?.line).toBe("Money back in 5–7 days");

        const list = await call("GET", ORDERS, { host: s.host, token });
        expect((list.body as Row[])[0]).toMatchObject({
            status: "Refunded",
            open: false,
        });
    });

    it("carries the order's paid invoice as its receipt, which the receipt route serves", async () => {
        const s = await shop();
        const { token, account } = await signIn(s.host);
        const customer = await storeCustomer(s, account.contactId);
        const paid = await order(s, customer.id, {
            stage: "COLLECTED",
            status: "DELIVERED",
        });
        const invoice = await prisma.invoice.create({
            data: {
                organizationId: s.organizationId,
                orderId: paid.id,
                source: "ORDER",
                kind: "INVOICE",
                number: `INV-${next()}`,
                status: "PAID",
                currency: "INR",
                subtotal: "240",
                tax: "0",
                total: "240",
                issuedAt: new Date(),
                paidAt: new Date(),
                billToName: "Shopper",
                lines: {
                    create: {
                        organizationId: s.organizationId,
                        description: "Sourdough",
                        quantity: 2,
                        unitPrice: "120",
                        amount: "240",
                        position: 0,
                    },
                },
            },
        });

        const res = await call("GET", `${ORDERS}/${paid.id}`, {
            host: s.host,
            token,
        });
        expect((res.body as { receipt: string }).receipt).toBe(invoice.id);
        const receipt = await call(
            "GET",
            `/public/site-accounts/me/receipts/${invoice.id}`,
            { host: s.host, token },
        );
        expect(receipt.status).toBe(200);
        const receipts = await call(
            "GET",
            "/public/site-accounts/me/receipts",
            {
                host: s.host,
                token,
            },
        );
        expect((receipts.body as { ref: string }[]).map((r) => r.ref)).toEqual([
            invoice.id,
        ]);

        // Someone else's order's invoice stays theirs.
        const other = await signIn(s.host);
        const notTheirs = await call(
            "GET",
            `/public/site-accounts/me/receipts/${invoice.id}`,
            { host: s.host, token: other.token },
        );
        expect(notTheirs.status).toBe(404);
    });

    it("a treatment booked signed in names the account, and its line is the service and its visits", async () => {
        const s = await shop("Kavi Dental");
        const { token, account, email } = await signIn(s.host);
        const service = await prisma.service.create({
            data: {
                organizationId: s.organizationId,
                name: "Root canal",
                durationMinutes: 60,
                capacity: 1,
                timezone: "Asia/Kolkata",
                visits: 3,
                priceCents: 900_000,
                currency: "INR",
            },
        });
        const startAt = new Date(Date.now() + 86_400_000);
        const booking = await prisma.booking.create({
            data: {
                organizationId: s.organizationId,
                serviceId: service.id,
                contactId: account.contactId,
                customerAccountId: account.id,
                startAt,
                endAt: new Date(startAt.getTime() + 60 * 60_000),
                timezone: "Asia/Kolkata",
                status: "CONFIRMED",
                snapshot: {},
                bookerEmail: email,
                bookerName: "Farah Khan",
                intakeNote: "STAFF NOTE: owes money",
            },
        });
        const { orderId } = await prisma.$transaction((tx) =>
            startTreatmentInTx(tx, { service, booking, storeId: s.storeId }),
        );
        const made = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
        });
        expect(made.customerAccountId).toBe(account.id);

        const res = await call("GET", `${ORDERS}/${orderId}`, {
            host: s.host,
            token,
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            fulfilment: "Booking, in person",
            status: "Booked",
            lines: [
                {
                    name: "Root canal",
                    quantity: 1,
                    kind: "service",
                    visits: [
                        {
                            number: 1,
                            startAt: startAt.toISOString(),
                            state: "booked",
                        },
                        { number: 2, startAt: null, state: "to-book" },
                        { number: 3, startAt: null, state: "to-book" },
                    ],
                },
            ],
        });
        expect(JSON.stringify(res.body)).not.toContain("STAFF NOTE");
    });
});

describe("'This isn't them' after ordering signed in", () => {
    it("moves the link the account's order made, counts the order, and the account still sees it", async () => {
        const s = await shop();
        const who = `farah-${next()}@example.in`;
        const farah = await prisma.contact.create({
            data: {
                organizationId: s.organizationId,
                email: who,
                firstName: "Farah",
                emailVerifiedAt: new Date(),
                emailVerifiedVia: "BOOKING_CONFIRMATION",
            },
        });
        const { token, account } = await signIn(s.host, who);
        expect(account.contactId).toBe(farah.id);

        // Staff's own order for Farah, on a link staff made: it stays.
        const staffCustomer = await storeCustomer(s, farah.id);
        await order(s, staffCustomer.id, { orderId: "1040" });
        // The account's checkout: a store customer linked by the site.
        const siteCustomer = await prisma.customer.create({
            data: {
                organizationId: s.organizationId,
                storeId: s.storeId,
                email: who,
            },
        });
        await prisma.customerIdentityLink.create({
            data: {
                organizationId: s.organizationId,
                contactId: farah.id,
                customerId: siteCustomer.id,
                reason: "SITE_ACCOUNT",
            },
        });
        const placed = await order(s, siteCustomer.id, {
            orderId: "1041",
            customerAccountId: account.id,
            placedOnline: true,
        });

        const ctx: OrganizationContext = {
            organizationId: s.organizationId,
            userId: ownerId,
            role: "OWNER",
        };
        const unlinking = new AccountUnlinkService();
        const preview = await unlinking.preview(ctx, farah.id);
        expect(preview.moves).toEqual([
            { key: "orders", count: 1, label: "1 order" },
        ]);
        expect(preview.sentence).toBe(
            "1 order they made online move with them.",
        );

        const result = await unlinking.unlink(ctx, farah.id);
        expect(result.moves).toEqual([
            { key: "orders", count: 1, label: "1 order" },
        ]);
        const links = await prisma.customerIdentityLink.findMany({
            where: { customerId: { in: [staffCustomer.id, siteCustomer.id] } },
            select: { customerId: true, contactId: true },
        });
        expect(links).toEqual(
            expect.arrayContaining([
                { customerId: staffCustomer.id, contactId: farah.id },
                { customerId: siteCustomer.id, contactId: result.contactId },
            ]),
        );

        // On its new contact, the account sees its own order, not Farah's.
        const list = await new AccountOrdersService().list({
            organizationId: s.organizationId,
            contactId: result.contactId,
            accountId: account.id,
        });
        expect(list.map((r) => r.ref)).toEqual([placed.id]);
        // The old session was ended by the unlink.
        expect(
            (await call("GET", ORDERS, { host: s.host, token })).status,
        ).toBe(401);
    });
});
