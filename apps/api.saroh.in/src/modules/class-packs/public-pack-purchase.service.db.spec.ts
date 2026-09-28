/**
 * Buying a class pack online end to end against a real Postgres (round-2
 * A11, R12; ADR-011), through the HTTP routes with the real session guard
 * and the signed relay: the packs on sale (never a draft or an archived
 * one), the signed-in start that makes a DRAFT pack invoice with the pack's
 * terms and its intent, the success webhook that numbers it and makes the
 * purchase, a webhook delivered twice, the merchant changing the pack while
 * the customer pays, the fourth open attempt, the draft discarded after a
 * day (and a late payment owed back), and the refusals — no provider, Class
 * packs off or not rolled out, a draft pack, another customer's payment.
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
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { validationPipeOptions } from "../../common/validation";
import { env } from "../../env";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { ReleaseHoldsHandler } from "../bookings/release-holds.handler";
import { InvoicesService } from "../invoices/invoices.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
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
import { AccountPacksController } from "./account-packs.controller";
import { ClassPacksService } from "./class-packs.service";
import { PACK_DRAFT_DISCARDED_REASON } from "./pack-checkout";
import {
    BUY_AT_DESK,
    PublicPackPurchaseService,
    TOO_MANY_OPEN_PACKS,
} from "./public-pack-purchase.service";

const WEBHOOK_SECRET = "whsec_a11_packs";
const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const packsDesk = new ClassPacksService(new InvoicesService());
const sweep = new ReleaseHoldsHandler();

const sent: { to: string; code: string }[] = [];
let app: INestApplication;
let url: string;
const originalSwitch = env.SITE_ACCOUNT_AREA;

beforeAll(async () => {
    await prisma.featureFlag.upsert({
        where: { key: "MODULE_CLASS_PACKS" },
        create: { key: "MODULE_CLASS_PACKS", enabledByDefault: false },
        update: {},
    });
    const moduleRef = await Test.createTestingModule({
        imports: [SiteAccountsModule],
        controllers: [AccountPacksController],
        providers: [
            {
                provide: PublicPackPurchaseService,
                // Generous: these tests start many times from one account.
                useValue: new PublicPackPurchaseService(
                    payments,
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

beforeEach(() => {
    env.SITE_ACCOUNT_AREA = "on";
});

afterAll(async () => {
    env.SITE_ACCOUNT_AREA = originalSwitch;
    await app?.close();
});

interface Studio {
    organizationId: string;
    host: string;
    packId: string;
}

/**
 * A studio whose published site sells a 10-class pack at 4,500.00 for 60
 * days: Class packs rolled out and on, and Razorpay connected — unless
 * asked otherwise.
 */
async function studio(
    over: {
        provider?: boolean;
        packsOn?: boolean;
        rolledOut?: boolean;
    } = {},
): Promise<Studio> {
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: `a11-${next()}` },
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: "MODULE_CLASS_PACKS",
            organizationId: org.id,
            enabled: over.rolledOut !== false,
        },
    });
    await prisma.organizationModule.create({
        data: {
            organizationId: org.id,
            moduleKey: "CLASS_PACKS",
            status: over.packsOn === false ? "DISABLED" : "ENABLED",
        },
    });
    const pack = await prisma.classPack.create({
        data: {
            organizationId: org.id,
            name: "10-class pack",
            credits: 10,
            validityDays: 60,
            price: "4500.00",
            currency: "INR",
            status: "ACTIVE",
        },
    });
    const subdomain = `a11x${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Pulse Fitness",
            slug: `a11-site-${next()}`,
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
    if (over.provider !== false) {
        await payments.connectProvider(
            { organizationId: org.id, userId: "u_owner", role: "OWNER" },
            {
                provider: "RAZORPAY",
                publicKey: "rzp_test_A11",
                keyId: "rzp_test_A11",
                keySecret: "rzp_secret",
                webhookSecret: WEBHOOK_SECRET,
            },
        );
    }
    return {
        organizationId: org.id,
        host: `${subdomain}.saroh.app`,
        packId: pack.id,
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
            { address: "203.0.113.11", host: input.host },
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a test reads the answer loosely
        body: (text ? JSON.parse(text) : null) as any,
    };
}

/** Sign in through the real routes: ask for a code, then trade it. */
async function signIn(host: string) {
    const who = `member-${next()}@example.in`;
    await call("POST", "/public/site-accounts/codes", {
        host,
        body: { email: who },
    });
    const code = sent.filter((s) => s.to === who).at(-1)?.code;
    const verified = await call("POST", "/public/site-accounts/sessions", {
        host,
        body: { email: who, code },
    });
    expect(verified.status).toBe(201);
    const account = await prisma.customerAccount.findFirstOrThrow({
        where: { email: who },
    });
    return { token: verified.body.token as string, account, email: who };
}

const PACKS = "/public/site-accounts/me/packs";

function buy(s: Studio, token: string, packId = s.packId, key?: string) {
    return call("POST", `${PACKS}/${packId}/buy`, {
        host: s.host,
        token,
        body: { idempotencyKey: key ?? `key-${next()}` },
    });
}

let eventSeq = 0;
/** A signed success webhook for the fake verifier; each call is new. */
async function paid(
    organizationId: string,
    providerIntentId: string,
    eventId = `evt_a11_${tag}_${++eventSeq}`,
) {
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: eventId,
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId,
            providerPaymentRef: `pay_${eventId}`,
        }),
    );
    return webhooks.handle("razorpay", organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

describe("the packs on sale", () => {
    it("lists published packs only, cheapest first, and says it can pay online", async () => {
        const s = await studio();
        await prisma.classPack.createMany({
            data: [
                {
                    organizationId: s.organizationId,
                    name: "Drop-in 5",
                    credits: 5,
                    validityDays: 30,
                    price: "2500.00",
                    currency: "INR",
                    status: "ACTIVE",
                },
                {
                    organizationId: s.organizationId,
                    name: "Secret draft",
                    credits: 20,
                    validityDays: 90,
                    price: "1.00",
                    currency: "INR",
                    status: "DRAFT",
                },
                {
                    organizationId: s.organizationId,
                    name: "Old pack",
                    credits: 8,
                    validityDays: 30,
                    price: "2.00",
                    currency: "INR",
                    status: "ARCHIVED",
                },
            ],
        });
        const { token } = await signIn(s.host);

        const list = await call("GET", PACKS, { host: s.host, token });

        expect(list.status).toBe(200);
        expect(list.body).toEqual({
            payOnline: true,
            packs: [
                expect.objectContaining({
                    name: "Drop-in 5",
                    price: "2500.00",
                }),
                {
                    ref: s.packId,
                    name: "10-class pack",
                    description: null,
                    credits: 10,
                    validityDays: 60,
                    price: "4500.00",
                    currency: "INR",
                },
            ],
        });
    });

    it("opens the Plan tab for a customer with no plan or pack of their own", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const me = await call("GET", "/public/site-accounts/me", {
            host: s.host,
            token,
        });
        expect(me.body.tabs.map((t: { key: string }) => t.key)).toContain(
            "plan",
        );
    });

    it("lists nothing while Class packs is off, or not rolled out (DEC-057)", async () => {
        for (const over of [{ packsOn: false }, { rolledOut: false }]) {
            const s = await studio(over);
            const { token } = await signIn(s.host);
            const list = await call("GET", PACKS, { host: s.host, token });
            expect(list.body).toEqual({ payOnline: false, packs: [] });
            expect((await buy(s, token)).status).toBe(404);
            const me = await call("GET", "/public/site-accounts/me", {
                host: s.host,
                token,
            });
            expect(
                me.body.tabs.map((t: { key: string }) => t.key),
            ).not.toContain("plan");
        }
    });

    it("says to buy at the desk, and starts nothing, with no provider", async () => {
        const s = await studio({ provider: false });
        const { token } = await signIn(s.host);

        const list = await call("GET", PACKS, { host: s.host, token });
        expect(list.body.payOnline).toBe(false);
        expect(list.body.packs).toHaveLength(1);

        const refused = await buy(s, token);
        expect(refused.status).toBe(409);
        expect(refused.body.error).toMatchObject({
            message: BUY_AT_DESK,
            details: { reason: "desk" },
        });
        expect(
            await prisma.invoice.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(0);
    });

    it("is behind the account area's switch and the session", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        expect((await call("GET", PACKS, { host: s.host })).status).toBe(401);
        env.SITE_ACCOUNT_AREA = "off";
        expect((await call("GET", PACKS, { host: s.host, token })).status).toBe(
            404,
        );
    });
});

describe("buying a pack", () => {
    it("pays for a draft with no number, and the webhook numbers it and makes the purchase", async () => {
        const s = await studio();
        const { token, account, email } = await signIn(s.host);

        const started = await buy(s, token, s.packId, "tab-1");
        expect(started.status).toBe(201);
        expect(started.body).toMatchObject({
            pack: { name: "10-class pack", credits: 10, validityDays: 60 },
            total: "4500.00",
            currency: "INR",
            payment: {
                provider: "RAZORPAY",
                amountCents: 450000,
                currency: "INR",
                publicKey: "rzp_test_A11",
            },
        });
        const ref = started.body.ref as string;

        const draft = await prisma.invoice.findUniqueOrThrow({
            where: { id: ref },
            include: { lines: true },
        });
        expect(draft).toMatchObject({
            status: "DRAFT",
            source: "PACK",
            number: null,
            contactId: account.contactId,
            billToEmail: email,
            total: expect.anything(),
            packTerms: {
                packId: s.packId,
                name: "10-class pack",
                credits: 10,
                validityDays: 60,
                price: "4500.00",
                currency: "INR",
            },
        });
        expect(draft.lines.map((l) => l.description)).toEqual([
            "10-class pack · 10 classes",
        ]);
        // Not the business's paper yet: the invoice list leaves it out.
        const list = await new InvoicesService().list(
            {
                organizationId: s.organizationId,
                userId: "u_owner",
                role: "OWNER",
            },
            {},
        );
        expect(list.map((i) => i.id)).not.toContain(ref);

        // The same key replays the same intent.
        const again = await buy(s, token, s.packId, "tab-1");
        expect(again.body.ref).toBe(ref);
        expect(again.body.payment.paymentIntentId).toBe(
            started.body.payment.paymentIntentId,
        );

        const waiting = await call("GET", `${PACKS}/payments/${ref}`, {
            host: s.host,
            token,
        });
        expect(waiting.body).toEqual({
            state: "paying",
            pack: { name: "10-class pack", credits: 10 },
            expiresAt: null,
        });

        expect(
            await paid(s.organizationId, started.body.payment.providerIntentId),
        ).toEqual({ status: "processed", changed: true });

        const invoice = await prisma.invoice.findUniqueOrThrow({
            where: { id: ref },
        });
        expect(invoice).toMatchObject({
            status: "PAID",
            number: expect.stringMatching(/\S/),
            paymentMethod: "ONLINE",
            packPurchaseId: expect.any(String),
        });
        const purchase = await prisma.packPurchase.findUniqueOrThrow({
            where: { id: invoice.packPurchaseId ?? "" },
        });
        expect(purchase).toMatchObject({
            packId: s.packId,
            contactId: account.contactId,
            credits: 10,
            currency: "INR",
            createdByUserId: null,
        });
        expect(purchase.price.toString()).toBe("4500");
        const days =
            (purchase.expiresAt.getTime() -
                (invoice.paidAt as Date).getTime()) /
            86_400_000;
        expect(days).toBe(60);

        const bought = await call("GET", `${PACKS}/payments/${ref}`, {
            host: s.host,
            token,
        });
        expect(bought.body).toEqual({
            state: "bought",
            pack: { name: "10-class pack", credits: 10 },
            expiresAt: purchase.expiresAt.toISOString(),
        });
        // The desk sees it as any sale, with its invoice.
        const desk = await packsDesk.listPurchases(
            {
                organizationId: s.organizationId,
                userId: "u_owner",
                role: "OWNER",
            },
            { packId: s.packId },
        );
        expect(desk).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: purchase.id, invoiceId: ref }),
            ]),
        );
    });

    it("a webhook delivered twice makes one purchase", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const started = await buy(s, token);
        const eventId = `evt_twice_${next()}`;
        await paid(
            s.organizationId,
            started.body.payment.providerIntentId,
            eventId,
        );
        expect(
            await paid(
                s.organizationId,
                started.body.payment.providerIntentId,
                eventId,
            ),
        ).toEqual({ status: "duplicate", changed: false });
        // Razorpay's second event for the same payment changes nothing.
        await paid(s.organizationId, started.body.payment.providerIntentId);
        expect(
            await prisma.packPurchase.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(1);
    });

    it("sells on the terms shown when paying started, though the merchant changed the pack", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const started = await buy(s, token);

        await prisma.classPack.update({
            where: { id: s.packId },
            data: {
                credits: 12,
                price: "6000.00",
                validityDays: 30,
                status: "ARCHIVED",
            },
        });
        await paid(s.organizationId, started.body.payment.providerIntentId);

        const purchase = await prisma.packPurchase.findFirstOrThrow({
            where: { organizationId: s.organizationId },
        });
        expect(purchase.credits).toBe(10);
        expect(purchase.price.toString()).toBe("4500");
    });

    it("starts again on the new terms when the pack changed before paying", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const first = await buy(s, token);
        await prisma.classPack.update({
            where: { id: s.packId },
            data: { price: "5000.00" },
        });

        const second = await buy(s, token);

        expect(second.body.ref).not.toBe(first.body.ref);
        expect(second.body.total).toBe("5000.00");
        const old = await prisma.invoice.findUniqueOrThrow({
            where: { id: first.body.ref },
        });
        expect(old.status).toBe("VOID");
        expect(old.number).toBeNull();
    });

    it("reuses a waiting draft for the same pack, and refuses a fourth pack", async () => {
        const s = await studio();
        const others = await Promise.all(
            ["Five", "Twenty", "Thirty"].map((name, i) =>
                prisma.classPack.create({
                    data: {
                        organizationId: s.organizationId,
                        name,
                        credits: 5 + i,
                        validityDays: 30,
                        price: `${1000 + i}.00`,
                        currency: "INR",
                        status: "ACTIVE",
                    },
                }),
            ),
        );
        const { token } = await signIn(s.host);

        const a = await buy(s, token);
        expect((await buy(s, token)).body.ref).toBe(a.body.ref);
        expect((await buy(s, token, others[0].id)).status).toBe(201);
        expect((await buy(s, token, others[1].id)).status).toBe(201);

        const fourth = await buy(s, token, others[2].id);
        expect(fourth.status).toBe(409);
        expect(fourth.body.error).toMatchObject({
            message: TOO_MANY_OPEN_PACKS,
            details: { reason: "too-many" },
        });
        expect(
            await prisma.invoice.count({
                where: { organizationId: s.organizationId, source: "PACK" },
            }),
        ).toBe(3);
    });

    it("refuses a draft pack, an archived pack and another business's pack as not found", async () => {
        const s = await studio();
        const elsewhere = await studio();
        const draft = await prisma.classPack.create({
            data: {
                organizationId: s.organizationId,
                name: "Not yet",
                credits: 4,
                validityDays: 30,
                price: "100.00",
                currency: "INR",
                status: "DRAFT",
            },
        });
        const archived = await prisma.classPack.create({
            data: {
                organizationId: s.organizationId,
                name: "Gone",
                credits: 4,
                validityDays: 30,
                price: "100.00",
                currency: "INR",
                status: "ARCHIVED",
            },
        });
        const { token } = await signIn(s.host);

        for (const id of [draft.id, archived.id, elsewhere.packId]) {
            expect((await buy(s, token, id)).status).toBe(404);
        }
        expect(
            await prisma.invoice.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(0);
    });

    it("takes no amount from the request", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const tampered = await call("POST", `${PACKS}/${s.packId}/buy`, {
            host: s.host,
            token,
            body: { idempotencyKey: "k", amount: 1 },
        });
        expect(tampered.status).toBe(400);
    });

    it("never shows another customer's payment", async () => {
        const s = await studio();
        const asha = await signIn(s.host);
        const ravi = await signIn(s.host);
        const started = await buy(s, asha.token);
        const peek = await call(
            "GET",
            `${PACKS}/payments/${started.body.ref}`,
            {
                host: s.host,
                token: ravi.token,
            },
        );
        expect(peek.status).toBe(404);
    });
});

describe("a pack payment nobody finishes", () => {
    it("is discarded after 24 hours, never numbered, and a late payment is owed back", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const started = await buy(s, token);
        const ref = started.body.ref as string;
        await prisma.invoice.update({
            where: { id: ref },
            data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
        });

        expect(await sweep.discardPackDrafts(new Date())).toBeGreaterThan(0);

        const voided = await prisma.invoice.findUniqueOrThrow({
            where: { id: ref },
        });
        expect(voided).toMatchObject({
            status: "VOID",
            number: null,
            voidReason: PACK_DRAFT_DISCARDED_REASON,
        });
        const standing = await call("GET", `${PACKS}/payments/${ref}`, {
            host: s.host,
            token,
        });
        expect(standing.body.state).toBe("closed");

        await paid(s.organizationId, started.body.payment.providerIntentId);
        expect(
            await prisma.packPurchase.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(0);
        const attempt = await prisma.paymentAttempt.findFirstOrThrow({
            where: {
                paymentIntent: { invoiceId: ref },
                status: "CAPTURED_NEEDS_REFUND",
            },
        });
        expect(attempt.rawResponse).toEqual({ invoiceStatus: "VOID" });
    });

    it("leaves a draft inside its 24 hours alone", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const started = await buy(s, token);
        await sweep.discardPackDrafts(new Date());
        const kept = await prisma.invoice.findUniqueOrThrow({
            where: { id: started.body.ref },
        });
        expect(kept.status).toBe("DRAFT");
    });
});
