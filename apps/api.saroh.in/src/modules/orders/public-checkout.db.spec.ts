/**
 * The site's bag and checkout end to end against a real Postgres (round-2
 * G13), through the HTTP routes with the real session guard and the signed
 * relay: options, the quote priced from listings, the signed-in start that
 * makes an unpaid online order and its intent, the success webhook that
 * holds its units and makes it a paid order, the last unit lost to another
 * payment (refused and refunded), the abandoned checkout closed after a day
 * (and a late payment refunded), and the refusals — no provider, a paused
 * storefront, a fourth open checkout, a session from another site.
 *
 * The provider and the webhook verifier are the network-free fakes; only
 * the credential key is added to the env. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => {
    const actual = jest.requireActual<typeof import("../../env")>("../../env");
    return {
        ...actual,
        env: {
            ...actual.env,
            PAYMENTS_ENC_KEY:
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
    };
});

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";
import { createHmac } from "node:crypto";

import { isRlsTestMode } from "../../../test/rls-mode";

import { giveBusinessDetails } from "../../../test/business-details";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { validationPipeOptions } from "../../common/validation";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { DiscountsService } from "../discounts/discounts.service";
import { recordRedemptionInTx } from "../discounts/redemption";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import {
    SEND_REFUND_TYPE,
    SendRefundHandler,
} from "../payments/send-refund.handler";
import {
    SiteCodeAlerts,
    SiteCodeDelivery,
} from "../site-accounts/code-delivery";
import { CUSTOMER_SESSION_HEADER } from "../site-accounts/customer-session.guard";
import { SiteAccountsModule } from "../site-accounts/site-accounts.module";
import { signSiteRelay, SITE_RELAY_HEADER } from "../site-accounts/site-relay";
import { siteRelaySecret } from "../site-accounts/site-secrets";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { priceBag } from "./checkout-bag";
import type { SiteAccount } from "./checkout-order";
import { createCheckoutOrder } from "./checkout-order";
import type { CheckoutStartDto } from "./checkout.dto";
import { CloseAbandonedCheckoutHandler } from "./close-abandoned-checkout.handler";
import {
    CHECKOUT_NOT_COMPLETED,
    CHECKOUT_REPLACED,
    CHECKOUT_SOLD_OUT,
    CLOSE_ABANDONED_CHECKOUT_TYPE,
} from "./online-checkout";
import { realOrderWhere } from "./open-orders";
import { PublicCheckoutController } from "./public-checkout.controller";
import {
    CHECKOUT_OPEN_ALREADY,
    PublicCheckoutService,
} from "./public-checkout.service";

const WEBHOOK_SECRET = "whsec_g13_checkout";
const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const closer = new CloseAbandonedCheckoutHandler();
const sender = new SendRefundHandler(payments);

const sent: { to: string; code: string }[] = [];
let app: INestApplication;
let url: string;

beforeAll(async () => {
    await prisma.featureFlag.upsert({
        where: { key: "SITE_SHOP" },
        create: { key: "SITE_SHOP", enabledByDefault: false },
        update: { enabledByDefault: false },
    });
    const moduleRef = await Test.createTestingModule({
        imports: [SiteAccountsModule],
        controllers: [PublicCheckoutController],
        providers: [
            {
                provide: PublicCheckoutService,
                // Generous: these tests read and start many times from one
                // address.
                useValue: new PublicCheckoutService(
                    payments,
                    new FixedWindowRateLimiter(1_000),
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
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
});

afterAll(async () => {
    await app?.close();
});

interface Shop {
    organizationId: string;
    storeId: string;
    siteId: string;
    host: string;
    productId: string;
    listingId: string;
}

/**
 * A business whose published site sells from "Online": Sourdough at 250.00,
 * counting stock with `onHand` on the shelf, Pick-up and Local delivery
 * (60.00), and Razorpay connected unless asked otherwise.
 */
async function shop(
    over: { onHand?: number; provider?: boolean; paused?: boolean } = {},
): Promise<Shop> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `g13-${next()}` },
    });
    await giveBusinessDetails(org.id);
    await prisma.featureFlagOverride.create({
        data: { flagKey: "SITE_SHOP", organizationId: org.id, enabled: true },
    });
    const store = await prisma.store.create({
        data: {
            name: "Online",
            slug: `g13-store-${next()}`,
            organizationId: org.id,
        },
    });
    await prisma.storeSettings.create({
        data: {
            storeId: store.id,
            currency: "INR",
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
            collectionEnabled: true,
            // Pick-up is offered from a place customers visit, with its
            // address (UX-025).
            kind: "SHOP",
            address: "12 Hill Road, Bandra",
            localDeliveryFee: "60.00",
            pausedAt: over.paused ? new Date() : null,
        },
    });
    const product = await prisma.product.create({
        data: {
            organizationId: org.id,
            name: "Sourdough",
            slug: `sourdough-${next()}`,
            price: "250.00",
            currency: "INR",
            status: "PUBLISHED",
            stockTracked: true,
        },
    });
    const listing = await prisma.productListing.create({
        data: {
            organizationId: org.id,
            storeId: store.id,
            productId: product.id,
        },
    });
    await prisma.stockLevel.create({
        data: {
            organizationId: org.id,
            storeId: store.id,
            productId: product.id,
            variantId: null,
            onHand: over.onHand ?? 10,
            promised: 0,
            lowStockAlert: 0,
        },
    });
    const subdomain = `g13x${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Rye & Co.",
            slug: `g13-site-${next()}`,
            subdomain,
            storefrontId: store.id,
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
    if (over.provider !== false) {
        await payments.connectProvider(
            { organizationId: org.id, userId: "u_owner", role: "OWNER" },
            {
                provider: "RAZORPAY",
                publicKey: "rzp_test_G13",
                keyId: "rzp_test_G13",
                keySecret: "rzp_secret",
                webhookSecret: WEBHOOK_SECRET,
            },
        );
    }
    return {
        organizationId: org.id,
        storeId: store.id,
        siteId: site.id,
        host: `${subdomain}.saroh.app`,
        productId: product.id,
        listingId: listing.id,
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
            { address: "203.0.113.13", host: input.host },
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
async function signIn(host: string, who = `buyer-${next()}@example.in`) {
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
    return { email: who, token: verified.body.token as string };
}

function start(
    s: Shop,
    token: string,
    over: Record<string, unknown> = {},
    host = s.host,
) {
    return call("POST", `/public/sites/${s.siteId}/checkout`, {
        host,
        token,
        body: {
            lines: [{ listingId: s.listingId, quantity: 2 }],
            fulfilment: "PICKUP",
            key: `key-${next()}`.replace(/[^A-Za-z0-9_-]/g, "_"),
            ...over,
        },
    });
}

function quote(s: Shop, body: Record<string, unknown>) {
    return call("POST", `/public/sites/${s.siteId}/checkout/quote`, {
        host: s.host,
        body,
    });
}

let eventSeq = 0;
/** A signed success webhook for the fake verifier; each call is new. */
async function paid(organizationId: string, providerIntentId: string) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_g13_${tag}_${eventSeq}`,
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId,
            providerPaymentRef: `pay_g13_${eventSeq}`,
        }),
    );
    return webhooks.handle("razorpay", organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

function errorOf(body: Record<string, unknown>) {
    return body.error as { message: string; details?: { reason?: string } };
}

const payment = (body: Record<string, unknown>) =>
    body.payment as {
        paymentIntentId: string;
        providerIntentId: string;
        amountCents: number;
        publicKey: string | null;
    };

describe("the site's checkout options and quote (G13)", () => {
    it("offers the storefront's ways and fees when a provider can take the payment", async () => {
        const s = await shop();
        const res = await call(
            "GET",
            `/public/sites/${s.siteId}/checkout/options`,
            { host: s.host },
        );
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            canOrder: true,
            storefront: { name: "Online" },
            currency: "INR",
            // How the customer can pay: online here; offline is off (R30).
            payments: { online: true, onHandover: false },
            ways: [
                { type: "PICKUP", label: "Pick-up", fee: null },
                {
                    type: "LOCAL_DELIVERY",
                    label: "Local delivery",
                    fee: "60.00",
                },
            ],
            // Where a pick-up is collected (UX-025).
            pickup: { address: "12 Hill Road, Bandra", hours: null },
        });
    });

    it("offers no Pick-up from a place with no address (UX-025)", async () => {
        const s = await shop();
        await prisma.storeSettings.update({
            where: { storeId: s.storeId },
            data: { kind: "ONLINE" },
        });
        const res = await call(
            "GET",
            `/public/sites/${s.siteId}/checkout/options`,
            { host: s.host },
        );
        expect(res.status).toBe(200);
        expect(res.body.ways.map((w: { type: string }) => w.type)).toEqual([
            "LOCAL_DELIVERY",
        ]);
        expect(res.body.pickup).toBeNull();
    });

    it("prices the bag from listings, and shows a changed price before paying", async () => {
        const s = await shop();
        const body = {
            lines: [{ listingId: s.listingId, quantity: 2 }],
            fulfilment: "LOCAL_DELIVERY",
        };
        const first = await quote(s, body);
        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({
            subtotal: "500.00",
            delivery: "60.00",
            total: "560.00",
            ready: true,
        });
        await prisma.product.update({
            where: { id: s.productId },
            data: { price: "300.00" },
        });
        const again = await quote(s, body);
        expect(again.body).toMatchObject({
            subtotal: "600.00",
            total: "660.00",
        });
    });

    it("refuses a bag that names a price or an amount", async () => {
        const s = await shop();
        const res = await quote(s, {
            lines: [{ listingId: s.listingId, quantity: 1, price: "1.00" }],
            total: "1.00",
        });
        expect(res.status).toBe(400);
    });

    it("never prices another business's listing on this site", async () => {
        const [a, b] = [await shop(), await shop()];
        const res = await quote(a, {
            lines: [{ listingId: b.listingId, quantity: 1 }],
        });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ total: "0.00", ready: false });
        expect(
            (res.body.lines as { state: string }[]).map((l) => l.state),
        ).toEqual(["gone"]);
    });

    it("404s while the shop is off for the business", async () => {
        const s = await shop();
        await prisma.featureFlagOverride.deleteMany({
            where: { organizationId: s.organizationId },
        });
        const res = await call(
            "GET",
            `/public/sites/${s.siteId}/checkout/options`,
            { host: s.host },
        );
        expect(res.status).toBe(404);
    });
});

describe("starting a checkout and paying (G13)", () => {
    it("makes an unpaid online order holding nothing, absent from Orders, until the payment holds it", async () => {
        const s = await shop({ onHand: 5 });
        const { email, token } = await signIn(s.host);

        const res = await start(s, token, {
            fulfilment: "LOCAL_DELIVERY",
            address: {
                line1: "12 Hill Road",
                city: "Mumbai",
                state: "Maharashtra",
                postalCode: "400050",
            },
        });
        expect(res.status).toBe(201);
        const orderId = res.body.orderId as string;
        expect(res.body).toMatchObject({ total: "560.00", currency: "INR" });
        // The amount charged is the order's total, and nothing else.
        expect(payment(res.body)).toMatchObject({
            amountCents: 56000,
            publicKey: "rzp_test_G13",
        });

        const order = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
            include: { items: true, customer: true },
        });
        expect(order).toMatchObject({
            status: "PENDING",
            paymentStatus: "UNPAID",
            placedOnline: true,
            paidAt: null,
            fulfilment: "LOCAL_DELIVERY",
            deliveryLine1: "12 Hill Road",
        });
        expect(order.shipping.toString()).toBe("60");
        expect(order.customer.email).toBe(email);
        expect(order.items).toEqual([
            expect.objectContaining({
                quantity: 2,
                heldQuantity: 0,
                stockRow: null,
            }),
        ]);
        // Nothing promised; no invoice; not in Orders.
        const shelf = await prisma.stockLevel.findFirstOrThrow({
            where: { productId: s.productId },
        });
        expect(shelf.promised).toBe(0);
        expect(await prisma.invoice.count({ where: { orderId } })).toBe(0);
        expect(
            await prisma.order.count({
                where: { id: orderId, ...realOrderWhere() },
            }),
        ).toBe(0);
        // Linked to the account's contact, by the site, by no one on the team.
        const account = await prisma.customerAccount.findFirstOrThrow({
            where: { email },
        });
        expect(
            await prisma.customerIdentityLink.findMany({
                where: { customerId: order.customerId },
                select: { contactId: true, reason: true, linkedByUserId: true },
            }),
        ).toEqual([
            {
                contactId: account.contactId,
                reason: "SITE_ACCOUNT",
                linkedByUserId: null,
            },
        ]);
        // The order names the account that placed it (A7).
        expect(
            (
                await prisma.order.findUniqueOrThrow({
                    where: { id: orderId },
                    select: { customerAccountId: true },
                })
            ).customerAccountId,
        ).toBe(account.id);
        // Its close is written, a day out.
        const job = await prisma.job.findFirstOrThrow({
            where: {
                type: CLOSE_ABANDONED_CHECKOUT_TYPE,
                payload: { equals: { orderId } },
            },
        });
        expect(job.runAt.getTime() - Date.now()).toBeGreaterThan(
            23 * 60 * 60 * 1000,
        );

        // The payment arrives: the units hold, and it is an order now.
        expect(
            await paid(s.organizationId, payment(res.body).providerIntentId),
        ).toEqual({ status: "processed", changed: true });
        const after = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
            include: { items: true },
        });
        expect(after.paymentStatus).toBe("PAID");
        expect(after.paidAt).not.toBeNull();
        expect(after.items[0]?.heldQuantity).toBe(2);
        expect(
            (
                await prisma.stockLevel.findFirstOrThrow({
                    where: { productId: s.productId },
                })
            ).promised,
        ).toBe(2);
        expect(await prisma.invoice.count({ where: { orderId } })).toBe(1);
        expect(
            await prisma.order.count({
                where: { id: orderId, ...realOrderWhere() },
            }),
        ).toBe(1);

        const standing = await call(
            "GET",
            `/public/sites/${s.siteId}/checkout/orders/${orderId}`,
            { host: s.host, token },
        );
        expect(standing.body).toMatchObject({
            state: "placed",
            total: "560.00",
        });

        // A repeat of the webhook changes nothing.
        await paid(s.organizationId, payment(res.body).providerIntentId);
        expect(await prisma.invoice.count({ where: { orderId } })).toBe(1);
    });

    it("returns the same order and intent for the same key", async () => {
        const s = await shop();
        const { token } = await signIn(s.host);
        const key = `same_${next()}`.replace(/[^A-Za-z0-9_-]/g, "_");
        const one = await start(s, token, { key });
        const two = await start(s, token, { key });
        expect(two.status).toBe(201);
        expect(two.body.orderId).toBe(one.body.orderId);
        expect(payment(two.body).paymentIntentId).toBe(
            payment(one.body).paymentIntentId,
        );
        expect(
            await prisma.order.count({ where: { storeId: s.storeId } }),
        ).toBe(1);
        expect(
            await prisma.paymentIntent.count({
                where: { orderId: one.body.orderId as string },
            }),
        ).toBe(1);
    });

    it("says online payment is down when the stored keys won't open, and a retry pays once they do", async () => {
        // A seeded business holds placeholder keys that don't open under
        // the server's key: a bare 500 before, with the order already made.
        const s = await shop();
        const row = await prisma.merchantPaymentProvider.findUniqueOrThrow({
            where: {
                organizationId_provider: {
                    organizationId: s.organizationId,
                    provider: "RAZORPAY",
                },
            },
        });
        await prisma.merchantPaymentProvider.update({
            where: { id: row.id },
            data: { credentialsAuthTag: "AAA=" },
        });
        const { token } = await signIn(s.host);
        const key = `unreadable_${next()}`.replace(/[^A-Za-z0-9_-]/g, "_");

        const res = await start(s, token, { key });

        expect(res.status).toBe(503);
        expect(errorOf(res.body)).toMatchObject({
            message:
                "The business can't take payment online right now. Please try again later, or pay them another way.",
            details: { reason: "provider-unavailable" },
        });
        // The checkout waits unpaid, as one nobody paid for: nothing was
        // charged, no intent exists, Orders leaves it out, and its close
        // is queued.
        const order = await prisma.order.findFirstOrThrow({
            where: { storeId: s.storeId },
            select: { id: true, status: true, paymentStatus: true },
        });
        expect(order).toMatchObject({
            status: "PENDING",
            paymentStatus: "UNPAID",
        });
        expect(
            await prisma.paymentIntent.count({ where: { orderId: order.id } }),
        ).toBe(0);
        expect(
            await prisma.job.count({
                where: {
                    type: CLOSE_ABANDONED_CHECKOUT_TYPE,
                    payload: { equals: { orderId: order.id } },
                },
            }),
        ).toBe(1);

        // The keys are fixed; the same bag's retry pays the same order.
        await prisma.merchantPaymentProvider.update({
            where: { id: row.id },
            data: { credentialsAuthTag: row.credentialsAuthTag },
        });
        const again = await start(s, token, { key });
        expect(again.status).toBe(201);
        expect(again.body.orderId).toBe(order.id);
    });

    it("refuses to start with no provider, or a paused storefront, and makes nothing", async () => {
        for (const s of [
            await shop({ provider: false }),
            await shop({ paused: true }),
        ]) {
            const options = await call(
                "GET",
                `/public/sites/${s.siteId}/checkout/options`,
                { host: s.host },
            );
            expect(options.body).toMatchObject({ canOrder: false, ways: [] });
            const { token } = await signIn(s.host);
            const res = await start(s, token);
            expect(res.status).toBe(403);
            expect(
                await prisma.order.count({ where: { storeId: s.storeId } }),
            ).toBe(0);
        }
    });

    it("refuses a bag that changed since it was priced", async () => {
        const s = await shop({ onHand: 1 });
        const { token } = await signIn(s.host);
        const res = await start(s, token); // two asked, one left
        expect(res.status).toBe(409);
        expect(errorOf(res.body).details?.reason).toBe("bag-changed");
        expect(
            await prisma.order.count({ where: { storeId: s.storeId } }),
        ).toBe(0);
    });

    it("closes the account's older unpaid checkouts here when a new one starts", async () => {
        const s = await shop();
        const { token } = await signIn(s.host);
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) {
            const res = await start(s, token);
            expect(res.status).toBe(201);
            ids.push(res.body.orderId as string);
        }
        const orders = await prisma.order.findMany({
            where: { id: { in: ids } },
            include: { events: true },
        });
        const byId = new Map(orders.map((o) => [o.id, o]));
        // Only the newest is still waiting for its payment.
        expect(ids.map((id) => byId.get(id)?.status)).toEqual([
            "CANCELLED",
            "CANCELLED",
            "CANCELLED",
            "PENDING",
        ]);
        expect(byId.get(ids[0])?.events.map((e) => e.note)).toEqual([
            CHECKOUT_REPLACED,
        ]);
    });

    it("two starts at once with different bags leave one checkout waiting", async () => {
        const s = await shop();
        const { token } = await signIn(s.host);
        const [a, b] = await Promise.all([start(s, token), start(s, token)]);
        expect([a.status, b.status]).toEqual([201, 201]);
        const waiting = await prisma.order.count({
            where: { storeId: s.storeId, status: "PENDING" },
        });
        expect(waiting).toBe(1);
        expect(
            await prisma.customer.count({ where: { storeId: s.storeId } }),
        ).toBe(1);
    });

    it("says a fourth open checkout, across the business's storefronts, must wait", async () => {
        const s = await shop();
        const { token, email } = await signIn(s.host);
        // Three waiting at another storefront of the business, under the
        // same email in another case.
        const other = await prisma.store.create({
            data: {
                name: "Market",
                slug: `g13-market-${next()}`,
                organizationId: s.organizationId,
            },
        });
        const elsewhere = await prisma.customer.create({
            data: {
                storeId: other.id,
                organizationId: s.organizationId,
                email: email.toUpperCase(),
            },
        });
        for (let i = 0; i < 3; i++) {
            await prisma.order.create({
                data: {
                    storeId: other.id,
                    organizationId: s.organizationId,
                    orderId: `ORD-M${i}`,
                    customerId: elsewhere.id,
                    currency: "INR",
                    subtotal: "250.00",
                    total: "250.00",
                    placedOnline: true,
                },
            });
        }
        const fourth = await start(s, token);
        expect(fourth.status).toBe(429);
        expect(errorOf(fourth.body).message).toBe(CHECKOUT_OPEN_ALREADY);
        expect(
            await prisma.order.count({ where: { storeId: s.storeId } }),
        ).toBe(0);
    });

    it("uses the store customer staff made for the email, whatever its case", async () => {
        const s = await shop();
        const { token, email } = await signIn(s.host);
        const made = await prisma.customer.create({
            data: {
                storeId: s.storeId,
                organizationId: s.organizationId,
                email: email.toUpperCase(),
            },
        });
        const res = await start(s, token);
        expect(res.status).toBe(201);
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: res.body.orderId as string },
        });
        expect(order.customerId).toBe(made.id);
        expect(
            await prisma.customer.count({ where: { storeId: s.storeId } }),
        ).toBe(1);
    });

    it("names the account's unnamed contact from the delivery, and keeps a name it has", async () => {
        const s = await shop();
        const delivery = (name: string) => ({
            fulfilment: "LOCAL_DELIVERY",
            address: {
                name,
                line1: "14, 2nd Cross",
                city: "Bengaluru",
                state: "Karnataka",
                postalCode: "560038",
            },
        });
        const { email, token } = await signIn(s.host);
        const contactOf = async () =>
            (
                await prisma.customerAccount.findFirstOrThrow({
                    where: { organizationId: s.organizationId, email },
                    select: { contact: true },
                })
            ).contact;
        expect(await contactOf()).toMatchObject({
            firstName: null,
            lastName: null,
        });

        const first = await start(s, token, delivery("Kavya Iyer"));
        expect(first.status).toBe(201);
        expect(await contactOf()).toMatchObject({
            firstName: "Kavya",
            lastName: "Iyer",
        });
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: first.body.orderId as string },
            include: { customer: true },
        });
        expect(order.customer).toMatchObject({
            firstName: "Kavya",
            lastName: "Iyer",
        });

        // A later delivery to someone else doesn't rename the account.
        const gift = await start(s, token, delivery("Arjun Rao"));
        expect(gift.status).toBe(201);
        expect(await contactOf()).toMatchObject({
            firstName: "Kavya",
            lastName: "Iyer",
        });
    });

    it("fills the account's contact's phone from the delivery when it has none, and keeps one it has (UX-049)", async () => {
        const s = await shop();
        const delivery = (phone: string) => ({
            fulfilment: "LOCAL_DELIVERY",
            address: {
                name: "Kavya Iyer",
                phone,
                line1: "14, 2nd Cross",
                city: "Bengaluru",
                state: "Karnataka",
                postalCode: "560038",
            },
        });
        const { email, token } = await signIn(s.host);
        const contactOf = async () =>
            (
                await prisma.customerAccount.findFirstOrThrow({
                    where: { organizationId: s.organizationId, email },
                    select: { contact: true },
                })
            ).contact;
        expect((await contactOf()).phone ?? null).toBeNull();

        const first = await start(s, token, delivery("9811122233"));
        expect(first.status).toBe(201);
        expect((await contactOf()).phone).toBe("9811122233");

        // A later delivery to another number never replaces it.
        const gift = await start(s, token, delivery("9800000001"));
        expect(gift.status).toBe(201);
        expect((await contactOf()).phone).toBe("9811122233");
    });

    it("refuses a session from site A on site B's host, or naming site B", async () => {
        const [a, b] = [await shop(), await shop()];
        const { token } = await signIn(a.host);
        // A's session, relayed from B's host.
        expect((await start(b, token, {}, b.host)).status).toBe(401);
        // A's session on A's host, naming B's site.
        expect(
            (
                await call("POST", `/public/sites/${b.siteId}/checkout`, {
                    host: a.host,
                    token,
                    body: {
                        lines: [{ listingId: b.listingId, quantity: 1 }],
                        fulfilment: "PICKUP",
                        key: "cross_site_key",
                    },
                })
            ).status,
        ).toBe(401);
        expect(
            await prisma.order.count({ where: { storeId: b.storeId } }),
        ).toBe(0);
    });
});

describe("a payment that can't hold (G13)", () => {
    it("holds the last unit for one payment and refunds the other automatically", async () => {
        const s = await shop({ onHand: 1 });
        const one = await signIn(s.host);
        const two = await signIn(s.host);
        const line = { lines: [{ listingId: s.listingId, quantity: 1 }] };
        const first = await start(s, one.token, line);
        const second = await start(s, two.token, line);
        expect([first.status, second.status]).toEqual([201, 201]);

        await paid(s.organizationId, payment(first.body).providerIntentId);
        const refundsBefore = fake.refundCalls.length;
        await paid(s.organizationId, payment(second.body).providerIntentId);

        const lost = await prisma.order.findUniqueOrThrow({
            where: { id: second.body.orderId as string },
            include: { events: true },
        });
        // Never a paid order: closed, but the customer's money came in and
        // is owed back, so staff find it in Orders.
        expect(lost).toMatchObject({
            status: "CANCELLED",
            paymentStatus: "UNPAID",
        });
        expect(lost.events.map((e) => e.note)).toContain(CHECKOUT_SOLD_OUT);
        expect(
            await prisma.order.count({
                where: { id: lost.id, ...realOrderWhere() },
            }),
        ).toBe(1);
        const refund = await prisma.paymentRefund.findFirstOrThrow({
            where: { paymentIntentId: payment(second.body).paymentIntentId },
        });
        expect(refund.amountCents).toBe(25000);
        expect(
            await prisma.invoice.count({ where: { orderId: lost.id } }),
        ).toBe(0);

        // Not sent inline: a job, written with the refusal, sends it.
        expect(fake.refundCalls.length).toBe(refundsBefore);
        const job = await prisma.job.findFirstOrThrow({
            where: {
                type: SEND_REFUND_TYPE,
                payload: { equals: { refundId: refund.id } },
            },
        });
        const standingNow = () =>
            call(
                "GET",
                `/public/sites/${s.siteId}/checkout/orders/${lost.id}`,
                { host: s.host, token: two.token },
            );
        // Owed, not yet "on its way back".
        const waiting = await standingNow();
        expect(waiting.body).toMatchObject({ state: "refunding" });
        expect(waiting.body.message).not.toMatch(/on its way/i);

        // No answer from the provider: the job throws, so it is tried again.
        fake.failNextRefund("UNKNOWN");
        await expect(sender.handle(job as Job)).rejects.toThrow(
            "no answer from the provider",
        );
        expect((await standingNow()).body).toMatchObject({
            state: "refunding",
        });
        await sender.handle(job as Job);
        expect(fake.refundCalls.length).toBe(refundsBefore + 2);
        expect(
            (
                await prisma.paymentRefund.findUniqueOrThrow({
                    where: { id: refund.id },
                })
            ).providerRefundId,
        ).not.toBeNull();
        // A repeat sends nothing more.
        await sender.handle(job as Job);
        expect(fake.refundCalls.length).toBe(refundsBefore + 2);

        const standing = await standingNow();
        expect(standing.body).toMatchObject({ state: "refunded" });
        expect(standing.body.message).toMatch(/sold out/i);
        // The other customer's order is theirs alone to read.
        const peek = await call(
            "GET",
            `/public/sites/${s.siteId}/checkout/orders/${lost.id}`,
            { host: s.host, token: one.token },
        );
        expect(peek.status).toBe(404);

        const shelf = await prisma.stockLevel.findFirstOrThrow({
            where: { productId: s.productId },
        });
        expect(shelf.promised).toBe(1);
    });

    it("closes an abandoned checkout after a day, and refunds a payment that comes later", async () => {
        const s = await shop();
        const { token } = await signIn(s.host);
        const res = await start(s, token);
        const orderId = res.body.orderId as string;
        const job = await prisma.job.findFirstOrThrow({
            where: {
                type: CLOSE_ABANDONED_CHECKOUT_TYPE,
                payload: { equals: { orderId } },
            },
        });

        await closer.handle(job as Job);
        const closed = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
            include: { events: true },
        });
        expect(closed.status).toBe("CANCELLED");
        expect(closed.events).toEqual([
            expect.objectContaining({
                kind: "STATUS",
                actorUserId: null,
                note: CHECKOUT_NOT_COMPLETED,
            }),
        ]);
        // Run twice: nothing more.
        await closer.handle(job as Job);
        expect(await prisma.orderEvent.count({ where: { orderId } })).toBe(1);

        await paid(s.organizationId, payment(res.body).providerIntentId);
        const after = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
        });
        expect(after).toMatchObject({
            status: "CANCELLED",
            paymentStatus: "UNPAID",
        });
        expect(
            await prisma.paymentRefund.count({
                where: { paymentIntentId: payment(res.body).paymentIntentId },
            }),
        ).toBe(1);
        expect(
            (
                await prisma.stockLevel.findFirstOrThrow({
                    where: { productId: s.productId },
                })
            ).promised,
        ).toBe(0);
    });

    it("leaves a paid checkout alone when its close comes round", async () => {
        const s = await shop();
        const { token } = await signIn(s.host);
        const res = await start(s, token);
        const orderId = res.body.orderId as string;
        await paid(s.organizationId, payment(res.body).providerIntentId);
        const job = await prisma.job.findFirstOrThrow({
            where: {
                type: CLOSE_ABANDONED_CHECKOUT_TYPE,
                payload: { equals: { orderId } },
            },
        });
        await closer.handle(job as Job);
        expect(
            await prisma.order.findUniqueOrThrow({
                where: { id: orderId },
                select: { status: true, paymentStatus: true },
            }),
        ).toEqual({ status: "PENDING", paymentStatus: "PAID" });
    });
});

/**
 * Row-level security as its own guarantee (G13's integration scenario): the
 * policies as the migrations write them (USING and WITH CHECK), with
 * enforcement on and a role WITHOUT BYPASSRLS, in site A's business context.
 * Reads with no organization filter at all see only A's rows, the checkout's
 * own writes land in A, and a write naming another business is refused by
 * the database even when the app got the business wrong.
 */
(isRlsTestMode() ? describe.skip : describe)(
    "site checkout under row-level security (G13)",
    () => {
        const ROLE = "saroh_g13_rls_probe";
        const TABLES = [
            "Product",
            "ProductListing",
            "StockLevel",
            "Contact",
            "CustomerAccount",
            "Customer",
            "CustomerIdentityLink",
            "Order",
        ];

        beforeAll(async () => {
            await prisma.$executeRawUnsafe(`DO $$ BEGIN
                CREATE ROLE ${ROLE} NOLOGIN NOBYPASSRLS;
            EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
            await prisma.$executeRawUnsafe(
                `GRANT USAGE ON SCHEMA public TO ${ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROLE}`,
            );
            for (const table of TABLES) {
                await prisma.$executeRawUnsafe(
                    `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
                );
                await prisma.$executeRawUnsafe(
                    `DROP POLICY IF EXISTS "org_isolation" ON "${table}"`,
                );
                await prisma.$executeRawUnsafe(`CREATE POLICY "org_isolation" ON "${table}"
                USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
                       OR "organizationId" = current_setting('app.current_organization_id', true))
                WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
                       OR "organizationId" = current_setting('app.current_organization_id', true))`);
            }
        });

        afterAll(async () => {
            for (const table of TABLES) {
                await prisma.$executeRawUnsafe(
                    `DROP POLICY IF EXISTS "org_isolation" ON "${table}"`,
                );
                await prisma.$executeRawUnsafe(
                    `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
                );
            }
            await prisma.$executeRawUnsafe(
                `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                `REVOKE USAGE ON SCHEMA public FROM ${ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                // A role is cluster-wide: another test database still granting
                // to it (a parallel run, or one cut short) keeps it; that is fine.
                `DO $$ BEGIN DROP ROLE IF EXISTS ${ROLE};
                EXCEPTION WHEN dependent_objects_still_exist THEN NULL; END $$`,
            );
        });

        /** Run `fn` in one transaction as the probe role, in `orgId`'s context. */
        async function asProbe<T>(
            orgId: string,
            fn: () => Promise<T>,
        ): Promise<T> {
            const before = process.env.RLS_ENFORCEMENT;
            // eslint-disable-next-line no-restricted-properties -- the proxy reads this live
            process.env.RLS_ENFORCEMENT = "on";
            try {
                return await runInOrgContext(orgId, () =>
                    prisma.$transaction(async (tx) => {
                        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ROLE}`);
                        return fn();
                    }),
                );
            } finally {
                // eslint-disable-next-line no-restricted-properties -- restore what the test changed
                if (before === undefined) delete process.env.RLS_ENFORCEMENT;
                // eslint-disable-next-line no-restricted-properties -- restore what the test changed
                else process.env.RLS_ENFORCEMENT = before;
            }
        }

        /** Two shops, a signed-in buyer on each, and one checkout on B. */
        async function twoShops() {
            const [a, b] = [await shop(), await shop()];
            const buyerA = await signIn(a.host);
            const buyerB = await signIn(b.host);
            const onB = await start(b, buyerB.token);
            expect(onB.status).toBe(201);
            const account = await prisma.customerAccount.findFirstOrThrow({
                where: {
                    organizationId: a.organizationId,
                    email: buyerA.email,
                },
                select: { id: true, email: true, contactId: true },
            });
            const siteAccount: SiteAccount = {
                accountId: account.id,
                email: account.email,
                contactId: account.contactId,
                firstName: null,
                lastName: null,
            };
            return { a, b, siteAccount };
        }

        const scopeOf = (s: Shop, organizationId = s.organizationId) => ({
            organizationId,
            storefront: { id: s.storeId, name: "Online" },
        });

        const startDto = (s: Shop) =>
            ({
                lines: [{ listingId: s.listingId, quantity: 1 }],
                fulfilment: "PICKUP",
                key: `rls_${next()}`.replace(/[^A-Za-z0-9_-]/g, "_"),
            }) as CheckoutStartDto;

        const oneOf = (s: Shop) => [
            { listingId: s.listingId, variantId: null, quantity: 1 },
        ];

        it("site A's checkout reads none of site B's listings or customers, with no app filter at all", async () => {
            const { a, b } = await twoShops();

            const seen = await asProbe(a.organizationId, async () => ({
                listings: await prisma.productListing.findMany({
                    select: { id: true },
                }),
                products: await prisma.product.findMany({
                    select: { id: true },
                }),
                customers: await prisma.customer.findMany({
                    select: { organizationId: true },
                }),
                contacts: await prisma.contact.findMany({
                    select: { organizationId: true },
                }),
                orders: await prisma.order.findMany({
                    select: { organizationId: true },
                }),
                // B's listing, asked for by id on A's checkout.
                quoted: await priceBag(scopeOf(a), oneOf(b), null),
            }));

            const listings = seen.listings.map((l) => l.id);
            expect(listings).toContain(a.listingId);
            expect(listings).not.toContain(b.listingId);
            expect(seen.products.map((p) => p.id)).not.toContain(b.productId);
            expect(seen.contacts.length).toBeGreaterThan(0);
            for (const rows of [seen.customers, seen.contacts, seen.orders]) {
                expect(
                    rows.every((r) => r.organizationId === a.organizationId),
                ).toBe(true);
            }
            expect(seen.quoted.quote.ready).toBe(false);
            expect(seen.quoted.quote.lines.map((l) => l.state)).toEqual([
                "gone",
            ]);

            // B's rows are really there: only RLS kept them out.
            expect(
                await prisma.order.count({
                    where: { organizationId: b.organizationId },
                }),
            ).toBe(1);
        });

        it("writes the checkout's customer, link, order and close job in site A's business", async () => {
            const { a, b, siteAccount } = await twoShops();

            const orderId = await asProbe(a.organizationId, async () => {
                const { lines } = await priceBag(
                    scopeOf(a),
                    oneOf(a),
                    "PICKUP",
                );
                return createCheckoutOrder(scopeOf(a), siteAccount, {
                    lines,
                    type: "PICKUP",
                    shippingCents: 0,
                    currency: "INR",
                    dto: startDto(a),
                });
            });

            const order = await prisma.order.findUniqueOrThrow({
                where: { id: orderId },
                select: {
                    organizationId: true,
                    storeId: true,
                    placedOnline: true,
                    customer: { select: { id: true, organizationId: true } },
                },
            });
            expect(order).toMatchObject({
                organizationId: a.organizationId,
                storeId: a.storeId,
                placedOnline: true,
                customer: { organizationId: a.organizationId },
            });
            const link = await prisma.customerIdentityLink.findFirstOrThrow({
                where: { customerId: order.customer!.id },
                select: { organizationId: true, contactId: true },
            });
            expect(link).toEqual({
                organizationId: a.organizationId,
                contactId: siteAccount.contactId,
            });
            const job = await prisma.job.findFirstOrThrow({
                where: {
                    type: CLOSE_ABANDONED_CHECKOUT_TYPE,
                    payload: { equals: { orderId } },
                },
                select: { organizationId: true },
            });
            expect(job.organizationId).toBe(a.organizationId);
            // Nothing new in B: only B's own checkout is there.
            expect(
                await prisma.order.count({
                    where: { organizationId: b.organizationId },
                }),
            ).toBe(1);
        });

        it("refuses a checkout write naming another business, even when the app got the business wrong", async () => {
            const { a, b, siteAccount } = await twoShops();
            const customersBefore = await prisma.customer.count();

            // A's storefront and buyer, but B's business on the scope: the
            // database refuses the rows it would write under A's context.
            await expect(
                asProbe(a.organizationId, async () => {
                    const { lines } = await priceBag(
                        scopeOf(a),
                        oneOf(a),
                        "PICKUP",
                    );
                    return createCheckoutOrder(
                        scopeOf(a, b.organizationId),
                        siteAccount,
                        {
                            lines,
                            type: "PICKUP",
                            shippingCents: 0,
                            currency: "INR",
                            dto: startDto(a),
                        },
                    );
                }),
            ).rejects.toThrow(/row-level security/);

            // And a direct write of an order into B, from A's context.
            await expect(
                asProbe(a.organizationId, () =>
                    prisma.order.create({
                        data: {
                            organizationId: b.organizationId,
                            storeId: b.storeId,
                            orderId: `rls-${next()}`,
                            currency: "INR",
                            subtotal: "1.00",
                            tax: "0.00",
                            shipping: "0.00",
                            discount: "0.00",
                            total: "1.00",
                            placedOnline: true,
                        },
                    }),
                ),
            ).rejects.toThrow(/row-level security/);

            expect(await prisma.customer.count()).toBe(customersBefore);
            expect(
                await prisma.order.count({
                    where: {
                        organizationId: {
                            in: [a.organizationId, b.organizationId],
                        },
                    },
                }),
            ).toBe(1);
        });
    },
);

describe("a discount code at the site's checkout (DEC-104)", () => {
    const discounts = new DiscountsService();

    /** A code of the shop's business: 10% off everything unless said. */
    function code(s: Shop, over: Record<string, unknown> = {}) {
        return prisma.discount.create({
            data: {
                organizationId: s.organizationId,
                code: `C${seq}X${process.pid}`.toUpperCase(),
                kind: "PERCENTAGE",
                percentBps: 1000,
                appliesTo: "BUSINESS",
                ...over,
            },
        });
    }

    /** A use taken at the counter, through the counter's one writer. */
    async function counterUse(s: Shop, discountId: string, used: string) {
        const order = await prisma.order.create({
            data: {
                storeId: s.storeId,
                organizationId: s.organizationId,
                orderId: `CTR-${next()}`,
                currency: "INR",
                subtotal: "250.00",
                tax: "0.00",
                shipping: "0.00",
                discount: "25.00",
                total: "225.00",
            },
        });
        await prisma.$transaction((tx) =>
            recordRedemptionInTx(
                tx,
                {
                    discountId,
                    code: used,
                    kind: "PERCENTAGE",
                    percentBps: 1000,
                    ruleAmount: null,
                    usageLimit: null,
                    amountCents: 2_500,
                },
                order.id,
                s.organizationId,
                "INR",
            ),
        );
    }

    it("applies on the quote and the order, and the online payment asks for the discounted total", async () => {
        const s = await shop();
        const d = await code(s);

        const priced = await quote(s, {
            lines: [{ listingId: s.listingId, quantity: 2 }],
            fulfilment: "PICKUP",
            discountCode: d.code.toLowerCase(),
        });
        expect(priced.status).toBe(200);
        expect(priced.body).toMatchObject({
            subtotal: "500.00",
            discount: { code: d.code, applied: true, amount: "50.00" },
            total: "450.00",
        });

        const { token } = await signIn(s.host);
        const res = await start(s, token, { discountCode: d.code });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ total: "450.00" });
        expect(payment(res.body).amountCents).toBe(45_000);

        const order = await prisma.order.findUniqueOrThrow({
            where: { id: res.body.orderId as string },
            include: { discountRedemption: true },
        });
        expect(order.discount.toString()).toBe("50");
        expect(order.total.toString()).toBe("450");
        expect(order.discountRedemption).toMatchObject({
            discountId: d.id,
            code: d.code,
        });
    });

    it("refuses an ended or used-up code with its reason, and won't place it", async () => {
        const s = await shop();
        const ended = await code(s, { endsAt: new Date("2020-01-01") });

        const priced = await quote(s, {
            lines: [{ listingId: s.listingId, quantity: 2 }],
            fulfilment: "PICKUP",
            discountCode: ended.code,
        });
        expect(priced.body).toMatchObject({
            discount: {
                code: ended.code,
                applied: false,
                reason: "EXPIRED",
                message: `${ended.code} has ended.`,
            },
            total: "500.00",
        });

        const { token } = await signIn(s.host);
        const res = await start(s, token, { discountCode: ended.code });
        expect(res.status).toBe(409);
        expect(errorOf(res.body).details?.reason).toBe("bag-changed");
        expect(
            await prisma.order.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(0);
    });

    it("counts the counter's uses and the site's as one, against the code's limit", async () => {
        const s = await shop();
        const d = await code(s, { usageLimit: 2 });

        // One taken at the counter; the site takes the second.
        await counterUse(s, d.id, d.code);
        const { token } = await signIn(s.host);
        const res = await start(s, token, { discountCode: d.code });
        expect(res.status).toBe(201);

        // The limit is reached for both: the site's quote and the counter.
        const priced = await quote(s, {
            lines: [{ listingId: s.listingId, quantity: 1 }],
            fulfilment: "PICKUP",
            discountCode: d.code,
        });
        expect(priced.body).toMatchObject({
            discount: { applied: false, reason: "EXHAUSTED" },
        });
        await expect(
            runInOrgContext(s.organizationId, () =>
                discounts.checkForOrder(s.organizationId, d.code, {
                    storeId: s.storeId,
                    currency: "INR",
                    lines: [
                        {
                            productId: s.productId,
                            categoryId: null,
                            unitCents: 25_000,
                            quantity: 1,
                        },
                    ],
                }),
            ),
        ).resolves.toMatchObject({ ok: false, reason: "EXHAUSTED" });
    });

    it("gives the use back when the checkout is abandoned", async () => {
        const s = await shop();
        const d = await code(s, { usageLimit: 1 });
        const { token } = await signIn(s.host);
        const res = await start(s, token, { discountCode: d.code });
        const orderId = res.body.orderId as string;
        expect(
            await prisma.discountRedemption.count({ where: { orderId } }),
        ).toBe(1);

        const job = await prisma.job.findFirstOrThrow({
            where: {
                type: CLOSE_ABANDONED_CHECKOUT_TYPE,
                payload: { equals: { orderId } },
            },
        });
        await closer.handle(job as Job);

        expect(
            await prisma.discountRedemption.count({ where: { orderId } }),
        ).toBe(0);
        const priced = await quote(s, {
            lines: [{ listingId: s.listingId, quantity: 1 }],
            fulfilment: "PICKUP",
            discountCode: d.code,
        });
        expect(priced.body).toMatchObject({ discount: { applied: true } });
    });
});

describe("free delivery over an amount at the site's checkout", () => {
    const ADDRESS = {
        line1: "12 Hill Road",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400050",
    };

    /** The shop with "Free delivery over" set: Local delivery is 60.00. */
    async function freeOver(amount: string | null) {
        const s = await shop();
        await prisma.storeSettings.update({
            where: { storeId: s.storeId },
            data: { freeShippingThreshold: amount },
        });
        return s;
    }

    const bag = (s: Shop, quantity: number, over = {}) => ({
        lines: [{ listingId: s.listingId, quantity }],
        fulfilment: "LOCAL_DELIVERY",
        ...over,
    });

    it("charges below the amount and says how much more is needed", async () => {
        const s = await freeOver("1000.00");
        const res = await quote(s, bag(s, 3));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            subtotal: "750.00",
            delivery: "60.00",
            total: "810.00",
            freeDelivery: { over: "1000.00", short: "250.00" },
        });
    });

    it("is free at the amount: the quote, the order and its payment agree", async () => {
        const s = await freeOver("1000.00");
        const priced = await quote(s, bag(s, 4));
        expect(priced.body).toMatchObject({
            subtotal: "1000.00",
            delivery: "0.00",
            total: "1000.00",
            freeDelivery: { over: "1000.00", short: null },
        });
        expect(
            (priced.body.ways as { type: string; fee: string | null }[]).find(
                (w) => w.type === "LOCAL_DELIVERY",
            )?.fee,
        ).toBeNull();

        const { token } = await signIn(s.host);
        const res = await start(s, token, {
            ...bag(s, 4),
            address: ADDRESS,
        });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ total: "1000.00" });
        expect(payment(res.body).amountCents).toBe(100_000);
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: res.body.orderId as string },
        });
        expect(order.shipping.toString()).toBe("0");
        expect(order.total.toString()).toBe("1000");
    });

    it("still charges with no amount set", async () => {
        const s = await freeOver(null);
        const priced = await quote(s, bag(s, 8));
        expect(priced.body).toMatchObject({
            delivery: "60.00",
            total: "2060.00",
            freeDelivery: null,
        });
        const { token } = await signIn(s.host);
        const res = await start(s, token, {
            ...bag(s, 8),
            address: ADDRESS,
        });
        expect(res.status).toBe(201);
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: res.body.orderId as string },
        });
        expect(order.shipping.toString()).toBe("60");
    });

    it("leaves pick-up at nothing either way", async () => {
        const s = await freeOver("1000.00");
        const res = await quote(s, bag(s, 1, { fulfilment: "PICKUP" }));
        expect(res.body).toMatchObject({ delivery: "0.00", total: "250.00" });
    });

    it("judges the amount after a code: one that takes it under keeps the fee", async () => {
        const s = await freeOver("1000.00");
        const d = await prisma.discount.create({
            data: {
                organizationId: s.organizationId,
                code: `FREE${seq}X${process.pid}`.toUpperCase(),
                kind: "PERCENTAGE",
                percentBps: 1000,
                appliesTo: "BUSINESS",
            },
        });
        // 1000.00 less 10% is 900.00: under the amount.
        const priced = await quote(s, bag(s, 4, { discountCode: d.code }));
        expect(priced.body).toMatchObject({
            subtotal: "1000.00",
            discount: { applied: true, amount: "100.00" },
            delivery: "60.00",
            total: "960.00",
            freeDelivery: { short: "100.00" },
        });
        const { token } = await signIn(s.host);
        const res = await start(s, token, {
            ...bag(s, 4, { discountCode: d.code }),
            address: ADDRESS,
        });
        expect(res.status).toBe(201);
        expect(payment(res.body).amountCents).toBe(96_000);
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: res.body.orderId as string },
        });
        expect(order.shipping.toString()).toBe("60");
        expect(order.discount.toString()).toBe("100");
    });
});
